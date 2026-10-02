/**
 * Courtier simulé — la SEULE implémentation existante.
 *
 * Tout est fictif : aucun appel réseau vers un courtier, aucun identifiant,
 * aucun mouvement d'argent réel. Les ordres ne font que modifier des lignes
 * dans la base de données du site.
 */
import "server-only";
import { query, queryOne, transaction } from "../db";
import { FEE_RATE, START_CAPITAL } from "../constants";
import { ASSET_IDS, getLastPrice, type AssetId } from "../market";
import type { Courtier, EtatCompte, OrdreDemande, OrdreExecute } from "./types";

async function assurerCompte(): Promise<void> {
  await query(
    `INSERT INTO claude_portfolio (id, cash, start_capital) VALUES (1, $1, $1)
     ON CONFLICT (id) DO NOTHING`,
    [START_CAPITAL],
  );
}

export const courtierSimule: Courtier = {
  nom: "Simulation (argent fictif)",
  reel: false,

  async etat(): Promise<EtatCompte> {
    await assurerCompte();

    const row = await queryOne<{ cash: number; start_capital: number }>(
      "SELECT cash, start_capital FROM claude_portfolio WHERE id = 1",
    );
    if (!row) throw new Error("Portefeuille Claude introuvable.");

    const detenu = await query<{ asset: string; quantity: number }>(
      "SELECT asset, quantity FROM claude_positions WHERE quantity > 0",
    );

    const positions = [];
    let investi = 0;
    for (const h of detenu) {
      const { price } = await getLastPrice(h.asset as AssetId);
      const value = Number(h.quantity) * price;
      investi += value;
      positions.push({ asset: h.asset, quantity: Number(h.quantity), price, value });
    }

    const cash = Number(row.cash);
    return {
      cash,
      startCapital: Number(row.start_capital),
      positions,
      totalValue: cash + investi,
    };
  },

  async passerOrdre(ordre: OrdreDemande): Promise<OrdreExecute> {
    if (!ASSET_IDS.includes(ordre.asset)) throw new Error("Actif inconnu.");
    if (!Number.isFinite(ordre.quantity) || ordre.quantity <= 0) {
      throw new Error("Quantité invalide.");
    }

    const { price } = await getLastPrice(ordre.asset);

    if (ordre.side === "buy") {
      const brut = ordre.quantity * price;
      const fee = brut * FEE_RATE;
      const cout = brut + fee;

      const row = await queryOne<{ cash: number }>(
        "SELECT cash FROM claude_portfolio WHERE id = 1",
      );
      if (!row || cout > Number(row.cash) + 1e-9) {
        throw new Error("Liquidités insuffisantes.");
      }

      await transaction([
        {
          text: "UPDATE claude_portfolio SET cash = cash - $1 WHERE id = 1",
          params: [cout],
        },
        {
          text: `INSERT INTO claude_positions (asset, quantity) VALUES ($1, $2)
                 ON CONFLICT (asset) DO UPDATE SET quantity = claude_positions.quantity + EXCLUDED.quantity`,
          params: [ordre.asset, ordre.quantity],
        },
        {
          text: `INSERT INTO claude_orders (asset, side, quantity, price, fee, reason)
                 VALUES ($1, 'buy', $2, $3, $4, $5)`,
          params: [ordre.asset, ordre.quantity, price, fee, ordre.reason],
        },
      ]);

      return { asset: ordre.asset, side: "buy", quantity: ordre.quantity, price, fee, reason: ordre.reason };
    }

    const pos = await queryOne<{ quantity: number }>(
      "SELECT quantity FROM claude_positions WHERE asset = $1",
      [ordre.asset],
    );
    const detenu = pos ? Number(pos.quantity) : 0;
    if (ordre.quantity > detenu + 1e-12) {
      throw new Error("Quantité supérieure à la position détenue.");
    }

    const brut = ordre.quantity * price;
    const fee = brut * FEE_RATE;

    await transaction([
      {
        text: "UPDATE claude_portfolio SET cash = cash + $1 WHERE id = 1",
        params: [brut - fee],
      },
      {
        text: "UPDATE claude_positions SET quantity = quantity - $1 WHERE asset = $2",
        params: [ordre.quantity, ordre.asset],
      },
      {
        text: `INSERT INTO claude_orders (asset, side, quantity, price, fee, reason)
               VALUES ($1, 'sell', $2, $3, $4, $5)`,
        params: [ordre.asset, ordre.quantity, price, fee, ordre.reason],
      },
    ]);

    return { asset: ordre.asset, side: "sell", quantity: ordre.quantity, price, fee, reason: ordre.reason };
  },
};
