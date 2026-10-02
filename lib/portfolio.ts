import "server-only";
import { query, queryOne, transaction } from "./db";
import { FEE_RATE, START_CAPITAL } from "./constants";
import { ASSET_IDS, getLastPrice, type AssetId } from "./market";

export type Position = { asset: string; quantity: number; price: number; value: number };

export type Portfolio = {
  cash: number;
  startCapital: number;
  positions: Position[];
  investedValue: number;
  totalValue: number;
  returnPct: number;
  priceSource: string;
};

export type Order = {
  id: number;
  asset: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  source: string;
  created_at: string;
};

async function ensure(userId: number) {
  await query(
    `INSERT INTO portfolios (user_id, cash, start_capital) VALUES ($1, $2, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, START_CAPITAL],
  );
}

export async function getPortfolio(userId: number): Promise<Portfolio> {
  await ensure(userId);

  const row = await queryOne<{ cash: number; start_capital: number }>(
    "SELECT cash, start_capital FROM portfolios WHERE user_id = $1",
    [userId],
  );
  if (!row) throw new Error("Portefeuille introuvable.");

  const held = await query<{ asset: string; quantity: number }>(
    "SELECT asset, quantity FROM positions WHERE user_id = $1 AND quantity > 0",
    [userId],
  );

  const positions: Position[] = [];
  let investedValue = 0;
  let source = "";

  for (const h of held) {
    const { price, source: s } = await getLastPrice(h.asset as AssetId);
    if (s === "demo") source = "demo";
    const value = Number(h.quantity) * price;
    investedValue += value;
    positions.push({ asset: h.asset, quantity: Number(h.quantity), price, value });
  }

  const cash = Number(row.cash);
  const startCapital = Number(row.start_capital);
  const totalValue = cash + investedValue;

  return {
    cash,
    startCapital,
    positions,
    investedValue,
    totalValue,
    returnPct: ((totalValue - startCapital) / startCapital) * 100,
    priceSource: source || "marché",
  };
}

async function quantityOf(userId: number, asset: string): Promise<number> {
  const row = await queryOne<{ quantity: number }>(
    "SELECT quantity FROM positions WHERE user_id = $1 AND asset = $2",
    [userId, asset],
  );
  return row ? Number(row.quantity) : 0;
}

/** Achat simulé pour un montant en euros. */
export async function buy(
  userId: number,
  asset: AssetId,
  amount: number,
  source = "manuel",
): Promise<void> {
  if (!ASSET_IDS.includes(asset)) throw new Error("Actif inconnu.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Montant invalide.");

  await ensure(userId);
  const row = await queryOne<{ cash: number }>(
    "SELECT cash FROM portfolios WHERE user_id = $1",
    [userId],
  );
  if (!row || amount > Number(row.cash) + 1e-9) throw new Error("Liquidités insuffisantes.");

  const { price } = await getLastPrice(asset);
  const fee = amount * FEE_RATE;
  const quantity = (amount - fee) / price;

  // Débit, position et trace dans une seule transaction : soit tout passe,
  // soit rien, pour ne jamais laisser un portefeuille incohérent.
  await transaction([
    {
      text: "UPDATE portfolios SET cash = cash - $1 WHERE user_id = $2",
      params: [amount, userId],
    },
    {
      text: `INSERT INTO positions (user_id, asset, quantity) VALUES ($1, $2, $3)
             ON CONFLICT (user_id, asset) DO UPDATE SET quantity = positions.quantity + EXCLUDED.quantity`,
      params: [userId, asset, quantity],
    },
    {
      text: `INSERT INTO orders (user_id, asset, side, quantity, price, fee, source)
             VALUES ($1, $2, 'buy', $3, $4, $5, $6)`,
      params: [userId, asset, quantity, price, fee, source],
    },
  ]);
}

/** Vente simulée d'une quantité d'actif. */
export async function sell(
  userId: number,
  asset: AssetId,
  quantity: number,
  source = "manuel",
): Promise<void> {
  if (!ASSET_IDS.includes(asset)) throw new Error("Actif inconnu.");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantité invalide.");

  const detenu = await quantityOf(userId, asset);
  if (quantity > detenu + 1e-12) throw new Error("Quantité supérieure à ce que tu détiens.");

  const { price } = await getLastPrice(asset);
  const brut = quantity * price;
  const fee = brut * FEE_RATE;

  await transaction([
    {
      text: "UPDATE portfolios SET cash = cash + $1 WHERE user_id = $2",
      params: [brut - fee, userId],
    },
    {
      text: "UPDATE positions SET quantity = quantity - $1 WHERE user_id = $2 AND asset = $3",
      params: [quantity, userId, asset],
    },
    {
      text: `INSERT INTO orders (user_id, asset, side, quantity, price, fee, source)
             VALUES ($1, $2, 'sell', $3, $4, $5, $6)`,
      params: [userId, asset, quantity, price, fee, source],
    },
  ]);
}

export async function getOrders(userId: number, limit = 50): Promise<Order[]> {
  const rows = await query<Order & { created_at: string | Date }>(
    `SELECT id, asset, side, quantity, price, fee, source,
            to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
     FROM orders WHERE user_id = $1 ORDER BY id DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map((o) => ({
    ...o,
    quantity: Number(o.quantity),
    price: Number(o.price),
    fee: Number(o.fee),
    created_at: String(o.created_at),
  }));
}

/** Remet le portefeuille à son état initial. */
export async function resetPortfolio(userId: number): Promise<void> {
  await transaction([
    { text: "UPDATE portfolios SET cash = start_capital WHERE user_id = $1", params: [userId] },
    { text: "DELETE FROM positions WHERE user_id = $1", params: [userId] },
    { text: "DELETE FROM orders WHERE user_id = $1", params: [userId] },
    {
      text: "UPDATE bots SET enabled = 0, stopped_reason = NULL WHERE user_id = $1",
      params: [userId],
    },
  ]);
}
