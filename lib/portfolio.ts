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

async function ensure() {
  await query(
    `INSERT INTO owner_portfolio (id, cash, start_capital) VALUES (1, $1, $1)
     ON CONFLICT (id) DO NOTHING`,
    [START_CAPITAL],
  );
}

export async function getPortfolio(): Promise<Portfolio> {
  await ensure();

  const row = await queryOne<{ cash: number; start_capital: number }>(
    "SELECT cash, start_capital FROM owner_portfolio WHERE id = 1",
  );
  if (!row) throw new Error("Portefeuille introuvable.");

  const held = await query<{ asset: string; quantity: number }>(
    "SELECT asset, quantity FROM owner_positions WHERE quantity > 0",
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

async function quantityOf(asset: string): Promise<number> {
  const row = await queryOne<{ quantity: number }>(
    "SELECT quantity FROM owner_positions WHERE asset = $1",
    [asset],
  );
  return row ? Number(row.quantity) : 0;
}

/** Achat simulé pour un montant en euros. */
export async function buy(
  asset: AssetId,
  amount: number,
  source = "manuel",
): Promise<void> {
  if (!ASSET_IDS.includes(asset)) throw new Error("Actif inconnu.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Montant invalide.");

  await ensure();
  const row = await queryOne<{ cash: number }>(
    "SELECT cash FROM owner_portfolio WHERE id = 1",
  );
  if (!row || amount > Number(row.cash) + 1e-9) throw new Error("Liquidités insuffisantes.");

  const { price } = await getLastPrice(asset);
  const fee = amount * FEE_RATE;
  const quantity = (amount - fee) / price;

  // Débit, position et trace dans une seule transaction : soit tout passe,
  // soit rien, pour ne jamais laisser un portefeuille incohérent.
  await transaction([
    {
      text: "UPDATE owner_portfolio SET cash = cash - $1 WHERE id = 1",
      params: [amount],
    },
    {
      text: `INSERT INTO owner_positions (asset, quantity) VALUES ($1, $2)
             ON CONFLICT (asset) DO UPDATE SET quantity = owner_positions.quantity + EXCLUDED.quantity`,
      params: [asset, quantity],
    },
    {
      text: `INSERT INTO owner_orders (asset, side, quantity, price, fee, source)
             VALUES ($1, 'buy', $2, $3, $4, $5)`,
      params: [asset, quantity, price, fee, source],
    },
  ]);
}

/** Vente simulée d'une quantité d'actif. */
export async function sell(
  asset: AssetId,
  quantity: number,
  source = "manuel",
): Promise<void> {
  if (!ASSET_IDS.includes(asset)) throw new Error("Actif inconnu.");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantité invalide.");

  const detenu = await quantityOf(asset);
  if (quantity > detenu + 1e-12) throw new Error("Quantité supérieure à ce que tu détiens.");

  const { price } = await getLastPrice(asset);
  const brut = quantity * price;
  const fee = brut * FEE_RATE;

  await transaction([
    {
      text: "UPDATE owner_portfolio SET cash = cash + $1 WHERE id = 1",
      params: [brut - fee],
    },
    {
      text: "UPDATE owner_positions SET quantity = quantity - $1 WHERE asset = $2",
      params: [quantity, asset],
    },
    {
      text: `INSERT INTO owner_orders (asset, side, quantity, price, fee, source)
             VALUES ($1, 'sell', $2, $3, $4, $5)`,
      params: [asset, quantity, price, fee, source],
    },
  ]);
}

export async function getOrders(limit = 50): Promise<Order[]> {
  const rows = await query<Order & { created_at: string | Date }>(
    `SELECT id, asset, side, quantity, price, fee, source,
            to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
     FROM owner_orders ORDER BY id DESC LIMIT $1`,
    [limit],
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
export async function resetPortfolio(): Promise<void> {
  await transaction([
    { text: "UPDATE owner_portfolio SET cash = start_capital WHERE id = 1" },
    { text: "DELETE FROM owner_positions" },
    { text: "DELETE FROM owner_orders" },
    { text: "UPDATE owner_bot SET enabled = 0, stopped_reason = NULL WHERE id = 1" },
  ]);
}
