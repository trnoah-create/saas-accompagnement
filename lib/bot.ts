import "server-only";
import { query, queryOne } from "./db";
import { getPrices, type AssetId } from "./market";
import { decide, type StrategyId } from "./engine/strategies";
import { buy, sell, getPortfolio } from "./portfolio";
import { euro } from "./format";

export type BotConfig = {
  asset: AssetId;
  strategy: StrategyId;
  fast: number;
  slow: number;
  max_loss_pct: number;
  enabled: number;
  stopped_reason: string | null;
};

const DEFAUT: BotConfig = {
  asset: "BTC",
  strategy: "sma_cross",
  fast: 20,
  slow: 50,
  max_loss_pct: 20,
  enabled: 0,
  stopped_reason: null,
};

export async function getBot(): Promise<BotConfig> {
  const row = await queryOne<BotConfig>(
    `SELECT asset, strategy, fast, slow, max_loss_pct, enabled, stopped_reason
     FROM owner_bot WHERE id = 1`,
  );
  if (!row) return DEFAUT;
  return {
    ...row,
    fast: Number(row.fast),
    slow: Number(row.slow),
    max_loss_pct: Number(row.max_loss_pct),
    enabled: Number(row.enabled),
  };
}

export async function saveBot(config: Partial<BotConfig>): Promise<void> {
  const actuel = await getBot();
  const c = { ...actuel, ...config };

  // Garde-fous : une moyenne courte doit rester plus courte que la longue.
  c.fast = Math.max(2, Math.min(200, Math.round(c.fast)));
  c.slow = Math.max(3, Math.min(400, Math.round(c.slow)));
  if (c.fast >= c.slow) c.fast = Math.max(2, c.slow - 1);
  c.max_loss_pct = Math.max(1, Math.min(90, c.max_loss_pct));

  await query(
    `INSERT INTO owner_bot (id, asset, strategy, fast, slow, max_loss_pct, enabled, stopped_reason)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       asset = EXCLUDED.asset, strategy = EXCLUDED.strategy, fast = EXCLUDED.fast,
       slow = EXCLUDED.slow, max_loss_pct = EXCLUDED.max_loss_pct,
       enabled = EXCLUDED.enabled, stopped_reason = EXCLUDED.stopped_reason`,
    [c.asset, c.strategy, c.fast, c.slow, c.max_loss_pct, c.enabled, c.stopped_reason],
  );
}

export type BotRun = {
  action: "achat" | "vente" | "aucune" | "arrêt";
  message: string;
};

/**
 * Fait tourner le bot une fois.
 *
 * Même règle anti-triche que le backtest : la décision n'utilise que les
 * journées déjà closes, jamais la bougie du jour en cours.
 */
export async function runBot(): Promise<BotRun> {
  const bot = await getBot();
  if (!bot.enabled) return { action: "aucune", message: "Le bot est à l'arrêt." };

  const portefeuille = await getPortfolio();

  // Stop de perte : on liquide et on coupe le bot.
  const seuil = portefeuille.startCapital * (1 - bot.max_loss_pct / 100);
  if (portefeuille.totalValue < seuil) {
    for (const p of portefeuille.positions) {
      await sell(p.asset as AssetId, p.quantity, "bot");
    }
    const raison = `Stop de perte atteint : la valeur est passée sous ${euro(seuil)} (-${bot.max_loss_pct} %). Positions liquidées, bot arrêté.`;
    await saveBot({ enabled: 0, stopped_reason: raison });
    return { action: "arrêt", message: raison };
  }

  const { bars } = await getPrices(bot.asset, 400);
  if (bars.length < 2) return { action: "aucune", message: "Pas assez de données." };

  // On exclut la dernière bougie : elle correspond au jour en cours.
  const history = bars.slice(0, -1);
  const voulu = decide(bot.strategy, history, { fast: bot.fast, slow: bot.slow });
  const detenu = portefeuille.positions.find((p) => p.asset === bot.asset);

  if (voulu === "long" && !detenu && portefeuille.cash > 1) {
    await buy(bot.asset, portefeuille.cash, "bot");
    return { action: "achat", message: `Signal d'achat : tout le liquide investi en ${bot.asset}.` };
  }

  if (voulu === "flat" && detenu) {
    await sell(bot.asset, detenu.quantity, "bot");
    return { action: "vente", message: `Signal de vente : position ${bot.asset} soldée.` };
  }

  return {
    action: "aucune",
    message: voulu === "long" ? "Signal : rester investi." : "Signal : rester en liquide.",
  };
}
