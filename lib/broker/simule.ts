/**
 * Courtier simulé — la SEULE implémentation existante de l'interface.
 *
 * ⚠️ Tout est fictif : aucun appel vers un courtier, aucun identifiant,
 * aucune donnée bancaire, aucun mouvement d'argent réel. Un ordre ne fait
 * que modifier des lignes dans la base du site.
 *
 * Le portefeuille du bot est entièrement séparé de ton portefeuille
 * manuel (tables `bot_*` contre `owner_*`).
 */
import "server-only";
import { query, queryOne, transaction } from "../db";
import {
  botReglesConfig,
  fraisBot,
  prixAchatBot,
  prixVenteBot,
} from "../../config/bot-regles";
import { getLastPrice, type AssetId } from "../market";
import type {
  Courtier,
  OrdreDemande,
  OrdreExecute,
  PositionCourtier,
  Solde,
} from "./types";

async function assurerCompte(): Promise<void> {
  await query(
    `INSERT INTO bot_portfolio (id, cash, start_capital) VALUES (1, $1, $1)
     ON CONFLICT (id) DO NOTHING`,
    [botReglesConfig.capitalDepart],
  );
}

/** Actifs sur lesquels le courtier accepte un ordre. */
function actifConnu(id: string): boolean {
  return botReglesConfig.actifs.some((a) => a.id === id);
}

export const courtierSimule: Courtier = {
  nom: "Simulation (argent fictif)",
  reel: false,

  async solde(): Promise<Solde> {
    await assurerCompte();

    const row = await queryOne<{ cash: number; start_capital: number; started_on: string }>(
      `SELECT cash, start_capital, to_char(started_on, 'YYYY-MM-DD') AS started_on
       FROM bot_portfolio WHERE id = 1`,
    );
    if (!row) throw new Error("Portefeuille du bot introuvable.");

    return {
      cash: Number(row.cash),
      capitalDepart: Number(row.start_capital),
      depuisLe: String(row.started_on),
    };
  },

  async positions(): Promise<PositionCourtier[]> {
    await assurerCompte();

    const detenu = await query<{ asset: string; quantity: number; prix_entree: number }>(
      "SELECT asset, quantity, prix_entree FROM bot_positions WHERE quantity > 0 ORDER BY asset",
    );

    const positions: PositionCourtier[] = [];
    for (const h of detenu) {
      const { price } = await getLastPrice(h.asset as AssetId);
      const quantity = Number(h.quantity);
      positions.push({
        asset: h.asset,
        quantity,
        prixEntree: Number(h.prix_entree),
        prix: price,
        valeur: quantity * price,
      });
    }
    return positions;
  },

  async acheter(ordre: OrdreDemande): Promise<OrdreExecute> {
    verifier(ordre);

    const { price: prixMarche } = await getLastPrice(ordre.asset as AssetId);
    const price = prixAchatBot(prixMarche);
    const fee = fraisBot(ordre.montant);
    const quantity = ordre.montant / price;
    const cout = ordre.montant + fee;

    const row = await queryOne<{ cash: number }>("SELECT cash FROM bot_portfolio WHERE id = 1");
    if (!row || cout > Number(row.cash) + 1e-9) throw new Error("Liquidités insuffisantes.");

    const qteMin = botReglesConfig.quantiteMinimale[ordre.asset] ?? 0;
    if (quantity < qteMin - 1e-12) {
      throw new Error(`Quantité sous le minimum négociable (${qteMin} ${ordre.asset}).`);
    }

    // Prix d'entrée moyen pondéré : c'est la base du stop loss.
    const existante = await queryOne<{ quantity: number; prix_entree: number }>(
      "SELECT quantity, prix_entree FROM bot_positions WHERE asset = $1",
      [ordre.asset],
    );
    const qAvant = existante ? Number(existante.quantity) : 0;
    const pAvant = existante ? Number(existante.prix_entree) : 0;
    const nouvelleQuantite = qAvant + quantity;
    const nouveauPrixEntree =
      nouvelleQuantite > 0 ? (qAvant * pAvant + quantity * price) / nouvelleQuantite : price;

    await transaction([
      { text: "UPDATE bot_portfolio SET cash = cash - $1 WHERE id = 1", params: [cout] },
      {
        text: `INSERT INTO bot_positions (asset, quantity, prix_entree) VALUES ($1, $2, $3)
               ON CONFLICT (asset) DO UPDATE SET quantity = $2, prix_entree = $3`,
        params: [ordre.asset, nouvelleQuantite, nouveauPrixEntree],
      },
      {
        text: `INSERT INTO bot_orders (asset, side, montant, quantity, price, fee, reason)
               VALUES ($1, 'buy', $2, $3, $4, $5, $6)`,
        params: [ordre.asset, ordre.montant, quantity, price, fee, ordre.raison],
      },
    ]);

    return {
      asset: ordre.asset,
      side: "buy",
      montant: ordre.montant,
      quantity,
      price,
      prixMarche,
      fee,
      raison: ordre.raison,
    };
  },

  async vendre(ordre: OrdreDemande): Promise<OrdreExecute> {
    verifier(ordre);

    const { price: prixMarche } = await getLastPrice(ordre.asset as AssetId);
    const price = prixVenteBot(prixMarche);

    const pos = await queryOne<{ quantity: number }>(
      "SELECT quantity FROM bot_positions WHERE asset = $1",
      [ordre.asset],
    );
    const detenu = pos ? Number(pos.quantity) : 0;
    // Pas de vente à découvert : on ne vend jamais ce qu'on n'a pas.
    if (detenu <= 0) throw new Error("Aucune position à vendre.");

    const quantity = Math.min(ordre.montant / price, detenu);
    const montantReel = quantity * price;
    const fee = fraisBot(montantReel);
    const reste = detenu - quantity;

    await transaction([
      {
        text: "UPDATE bot_portfolio SET cash = cash + $1 WHERE id = 1",
        params: [montantReel - fee],
      },
      reste > 1e-12
        ? {
            text: "UPDATE bot_positions SET quantity = $1 WHERE asset = $2",
            params: [reste, ordre.asset],
          }
        : { text: "DELETE FROM bot_positions WHERE asset = $1", params: [ordre.asset] },
      {
        text: `INSERT INTO bot_orders (asset, side, montant, quantity, price, fee, reason)
               VALUES ($1, 'sell', $2, $3, $4, $5, $6)`,
        params: [ordre.asset, montantReel, quantity, price, fee, ordre.raison],
      },
    ]);

    return {
      asset: ordre.asset,
      side: "sell",
      montant: montantReel,
      quantity,
      price,
      prixMarche,
      fee,
      raison: ordre.raison,
    };
  },
};

function verifier(ordre: OrdreDemande): void {
  if (!actifConnu(ordre.asset)) throw new Error("Actif hors périmètre du bot.");
  if (!Number.isFinite(ordre.montant) || ordre.montant <= 0) {
    throw new Error("Montant invalide.");
  }
}
