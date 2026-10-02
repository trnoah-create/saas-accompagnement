import "server-only";
import { db } from "./db";
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
  /** "demo" si au moins un prix vient des données factices. */
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

function ensure(userId: number) {
  db().prepare(
    "INSERT OR IGNORE INTO portfolios (user_id, cash, start_capital) VALUES (?, ?, ?)",
  ).run(userId, START_CAPITAL, START_CAPITAL);
}

export async function getPortfolio(userId: number): Promise<Portfolio> {
  ensure(userId);
  const row = db()
    .prepare("SELECT cash, start_capital FROM portfolios WHERE user_id = ?")
    .get(userId) as { cash: number; start_capital: number };

  const held = db()
    .prepare("SELECT asset, quantity FROM positions WHERE user_id = ? AND quantity > 0")
    .all(userId) as { asset: string; quantity: number }[];

  const positions: Position[] = [];
  let investedValue = 0;
  let source = "";

  for (const h of held) {
    const { price, source: s } = await getLastPrice(h.asset as AssetId);
    if (s === "demo") source = "demo";
    const value = h.quantity * price;
    investedValue += value;
    positions.push({ asset: h.asset, quantity: h.quantity, price, value });
  }

  const totalValue = row.cash + investedValue;
  return {
    cash: row.cash,
    startCapital: row.start_capital,
    positions,
    investedValue,
    totalValue,
    returnPct: ((totalValue - row.start_capital) / row.start_capital) * 100,
    priceSource: source || "marché",
  };
}

function quantityOf(userId: number, asset: string): number {
  const row = db()
    .prepare("SELECT quantity FROM positions WHERE user_id = ? AND asset = ?")
    .get(userId, asset) as { quantity: number } | undefined;
  return row?.quantity ?? 0;
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

  ensure(userId);
  const { cash } = db()
    .prepare("SELECT cash FROM portfolios WHERE user_id = ?")
    .get(userId) as { cash: number };

  if (amount > cash + 1e-9) throw new Error("Liquidités insuffisantes.");

  const { price } = await getLastPrice(asset);
  const fee = amount * FEE_RATE;
  const quantity = (amount - fee) / price;

  db().transaction(() => {
    db().prepare("UPDATE portfolios SET cash = cash - ? WHERE user_id = ?").run(amount, userId);
    db().prepare(
      `INSERT INTO positions (user_id, asset, quantity) VALUES (?, ?, ?)
       ON CONFLICT(user_id, asset) DO UPDATE SET quantity = quantity + excluded.quantity`,
    ).run(userId, asset, quantity);
    db().prepare(
      `INSERT INTO orders (user_id, asset, side, quantity, price, fee, source)
       VALUES (?, ?, 'buy', ?, ?, ?, ?)`,
    ).run(userId, asset, quantity, price, fee, source);
  })();
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

  const detenu = quantityOf(userId, asset);
  if (quantity > detenu + 1e-12) throw new Error("Quantité supérieure à ce que tu détiens.");

  const { price } = await getLastPrice(asset);
  const brut = quantity * price;
  const fee = brut * FEE_RATE;

  db().transaction(() => {
    db().prepare("UPDATE portfolios SET cash = cash + ? WHERE user_id = ?")
      .run(brut - fee, userId);
    db().prepare("UPDATE positions SET quantity = quantity - ? WHERE user_id = ? AND asset = ?")
      .run(quantity, userId, asset);
    db().prepare(
      `INSERT INTO orders (user_id, asset, side, quantity, price, fee, source)
       VALUES (?, ?, 'sell', ?, ?, ?, ?)`,
    ).run(userId, asset, quantity, price, fee, source);
  })();
}

export function getOrders(userId: number, limit = 50): Order[] {
  return db()
    .prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT ?")
    .all(userId, limit) as Order[];
}

/** Remet le portefeuille à son état initial. */
export function resetPortfolio(userId: number) {
  db().transaction(() => {
    db().prepare("UPDATE portfolios SET cash = start_capital WHERE user_id = ?").run(userId);
    db().prepare("DELETE FROM positions WHERE user_id = ?").run(userId);
    db().prepare("DELETE FROM orders WHERE user_id = ?").run(userId);
    db().prepare("UPDATE bots SET enabled = 0, stopped_reason = NULL WHERE user_id = ?").run(userId);
  })();
}
