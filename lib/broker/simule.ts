/**
 * Courtier simulé — la SEULE implémentation existante.
 *
 * Tout est fictif : aucun appel vers un courtier, aucun identifiant, aucun
 * mouvement d'argent réel. Un ordre ne fait que modifier des lignes dans la
 * base du site. Les coûts (frais et écart achat/vente) viennent de
 * config/claude-trader.ts.
 */
import "server-only";
import { query, queryOne, transaction } from "../db";
import { claudeTraderConfig, frais, prixAchat, prixVente } from "../../config/claude-trader";
import { getLastPrice, type AssetId } from "../market";
import type { Courtier, EtatCompte, OrdreDemande, OrdreExecute } from "./types";

async function assurerCompte(): Promise<void> {
  await query(
    `INSERT INTO claude_portfolio (id, cash, start_capital) VALUES (1, $1, $1)
     ON CONFLICT (id) DO NOTHING`,
    [claudeTraderConfig.capitalDepart],
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
    if (!claudeTraderConfig.actifsAutorises.includes(ordre.asset as never)) {
      throw new Error("Actif non autorisé.");
    }
    if (!Number.isFinite(ordre.montant) || ordre.montant <= 0) {
      throw new Error("Montant invalide.");
    }

    const { price: prixMarche } = await getLastPrice(ordre.asset as AssetId);
    const fee = frais(ordre.montant);

    if (ordre.side === "buy") {
      // On achète un peu au-dessus du prix affiché.
      const price = prixAchat(prixMarche);
      const quantity = ordre.montant / price;
      const cout = ordre.montant + fee;

      const row = await queryOne<{ cash: number }>(
        "SELECT cash FROM claude_portfolio WHERE id = 1",
      );
      if (!row || cout > Number(row.cash) + 1e-9) {
        throw new Error("Liquidités insuffisantes.");
      }

      await transaction([
        { text: "UPDATE claude_portfolio SET cash = cash - $1 WHERE id = 1", params: [cout] },
        {
          text: `INSERT INTO claude_positions (asset, quantity) VALUES ($1, $2)
                 ON CONFLICT (asset) DO UPDATE SET quantity = claude_positions.quantity + EXCLUDED.quantity`,
          params: [ordre.asset, quantity],
        },
        {
          text: `INSERT INTO claude_orders (asset, side, quantity, price, fee, reason)
                 VALUES ($1, 'buy', $2, $3, $4, $5)`,
          params: [ordre.asset, quantity, price, fee, ordre.reason],
        },
      ]);

      return { ...ordre, side: "buy", quantity, price, prixMarche, fee };
    }

    // Vente : on vend un peu en dessous du prix affiché.
    const price = prixVente(prixMarche);
    const quantity = ordre.montant / price;

    const pos = await queryOne<{ quantity: number }>(
      "SELECT quantity FROM claude_positions WHERE asset = $1",
      [ordre.asset],
    );
    const detenu = pos ? Number(pos.quantity) : 0;
    // Pas de vente à découvert.
    if (quantity > detenu + 1e-12) {
      throw new Error("Quantité supérieure à la position détenue.");
    }

    await transaction([
      {
        text: "UPDATE claude_portfolio SET cash = cash + $1 WHERE id = 1",
        params: [ordre.montant - fee],
      },
      {
        text: "UPDATE claude_positions SET quantity = quantity - $1 WHERE asset = $2",
        params: [quantity, ordre.asset],
      },
      {
        text: `INSERT INTO claude_orders (asset, side, quantity, price, fee, reason)
               VALUES ($1, 'sell', $2, $3, $4, $5)`,
        params: [ordre.asset, quantity, price, fee, ordre.reason],
      },
    ]);

    return { ...ordre, side: "sell", quantity, price, prixMarche, fee };
  },
};
