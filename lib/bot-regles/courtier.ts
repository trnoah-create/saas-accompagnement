/**
 * Courtier simulé du bot à règles fixes.
 *
 * ⚠️ Simulation uniquement. Aucun appel vers un vrai courtier, aucun
 * identifiant, aucune donnée bancaire : un ordre ne fait que modifier des
 * lignes dans la base du site.
 *
 * Portefeuille entièrement séparé de celui du mode « Claude trader » et de
 * ton portefeuille manuel.
 */
import "server-only";
import { query, queryOne, transaction } from "../db";
import { botReglesConfig, fraisBot, prixAchatBot, prixVenteBot } from "../../config/bot-regles";
import { getLastPrice, type AssetId } from "../market";
import type { PositionBot } from "./decider";

export type EtatCompteBot = {
  cash: number;
  startCapital: number;
  demarreLe: string;
  positions: (PositionBot & { price: number; value: number })[];
  totalValue: number;
};

export type OrdreExecuteBot = {
  asset: string;
  side: "buy" | "sell";
  montant: number;
  quantity: number;
  price: number;
  prixMarche: number;
  fee: number;
  raison: string;
};

/** true signifierait de l'argent réel. Toujours false : aucune autre implémentation n'existe. */
export const COURTIER_REEL = false;

async function assurerCompte(): Promise<void> {
  await query(
    `INSERT INTO bot_portfolio (id, cash, start_capital) VALUES (1, $1, $1)
     ON CONFLICT (id) DO NOTHING`,
    [botReglesConfig.capitalDepart],
  );
}

export async function etatBot(): Promise<EtatCompteBot> {
  await assurerCompte();

  const row = await queryOne<{ cash: number; start_capital: number; started_on: string }>(
    `SELECT cash, start_capital, to_char(started_on, 'YYYY-MM-DD') AS started_on
     FROM bot_portfolio WHERE id = 1`,
  );
  if (!row) throw new Error("Portefeuille du bot introuvable.");

  const detenu = await query<{ asset: string; quantity: number; prix_entree: number }>(
    "SELECT asset, quantity, prix_entree FROM bot_positions WHERE quantity > 0",
  );

  const positions = [];
  let investi = 0;
  for (const h of detenu) {
    const { price } = await getLastPrice(h.asset as AssetId);
    const quantity = Number(h.quantity);
    const value = quantity * price;
    investi += value;
    positions.push({
      asset: h.asset,
      quantity,
      prixEntree: Number(h.prix_entree),
      price,
      value,
    });
  }

  const cash = Number(row.cash);
  return {
    cash,
    startCapital: Number(row.start_capital),
    demarreLe: String(row.started_on),
    positions,
    totalValue: cash + investi,
  };
}

export async function passerOrdreBot(ordre: {
  asset: string;
  side: "buy" | "sell";
  montant: number;
  raison: string;
}): Promise<OrdreExecuteBot> {
  if (!botReglesConfig.actifs.includes(ordre.asset as never)) {
    throw new Error("Actif hors périmètre du bot.");
  }
  if (!Number.isFinite(ordre.montant) || ordre.montant <= 0) {
    throw new Error("Montant invalide.");
  }

  const { price: prixMarche } = await getLastPrice(ordre.asset as AssetId);
  const fee = fraisBot(ordre.montant);

  if (ordre.side === "buy") {
    const price = prixAchatBot(prixMarche);
    const quantity = ordre.montant / price;
    const cout = ordre.montant + fee;

    const row = await queryOne<{ cash: number }>("SELECT cash FROM bot_portfolio WHERE id = 1");
    if (!row || cout > Number(row.cash) + 1e-9) throw new Error("Liquidités insuffisantes.");

    const qteMin = botReglesConfig.quantiteMinimale[ordre.asset] ?? 0;
    if (quantity < qteMin - 1e-12) {
      throw new Error(`Quantité sous le minimum négociable (${qteMin} ${ordre.asset}).`);
    }

    // Prix d'entrée moyen pondéré : base du stop loss et du take profit.
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

    return { ...ordre, side: "buy", quantity, price, prixMarche, fee };
  }

  // Vente
  const price = prixVenteBot(prixMarche);
  const pos = await queryOne<{ quantity: number }>(
    "SELECT quantity FROM bot_positions WHERE asset = $1",
    [ordre.asset],
  );
  const detenu = pos ? Number(pos.quantity) : 0;
  const quantity = Math.min(ordre.montant / price, detenu);

  // Pas de vente à découvert.
  if (detenu <= 0) throw new Error("Aucune position à vendre.");

  const montantReel = quantity * price;
  const feeReel = fraisBot(montantReel);
  const reste = detenu - quantity;

  await transaction([
    {
      text: "UPDATE bot_portfolio SET cash = cash + $1 WHERE id = 1",
      params: [montantReel - feeReel],
    },
    reste > 1e-12
      ? { text: "UPDATE bot_positions SET quantity = $1 WHERE asset = $2", params: [reste, ordre.asset] }
      : { text: "DELETE FROM bot_positions WHERE asset = $1", params: [ordre.asset] },
    {
      text: `INSERT INTO bot_orders (asset, side, montant, quantity, price, fee, reason)
             VALUES ($1, 'sell', $2, $3, $4, $5, $6)`,
      params: [ordre.asset, montantReel, quantity, price, feeReel, ordre.raison],
    },
  ]);

  return { ...ordre, side: "sell", montant: montantReel, quantity, price, prixMarche, fee: feeReel };
}
