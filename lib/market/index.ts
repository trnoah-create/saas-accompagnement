import "server-only";
import { db } from "../db";
import { getAsset, type AssetId } from "./assets";
import { downloadBars } from "./providers";
import { demoBars } from "./demo";
import type { Bar, PriceSeries } from "./types";

export * from "./assets";
export type { Bar, PriceSeries } from "./types";

const DEFAULT_DAYS = 400;
/** Durée de validité du cache : on ne retélécharge pas plus d'une fois par heure. */
const CACHE_TTL_MS = 3600_000;

const lastFetch = new Map<string, number>();

function readCache(asset: string, days: number): Bar[] {
  return db()
    .prepare(
      `SELECT day, open, high, low, close FROM price_bars
       WHERE asset = ? ORDER BY day DESC LIMIT ?`,
    )
    .all(asset, days) as Bar[];
}

function cacheSource(asset: string): string | null {
  const row = db()
    .prepare("SELECT source FROM price_bars WHERE asset = ? LIMIT 1")
    .get(asset) as { source: string } | undefined;
  return row?.source ?? null;
}

function writeCache(asset: string, bars: Bar[], source: string) {
  const stmt = db().prepare(
    `INSERT INTO price_bars (asset, day, open, high, low, close, source)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(asset, day) DO UPDATE SET
       open=excluded.open, high=excluded.high, low=excluded.low,
       close=excluded.close, source=excluded.source`,
  );
  const tx = db().transaction((rows: Bar[]) => {
    for (const b of rows) stmt.run(asset, b.day, b.open, b.high, b.low, b.close, source);
  });
  tx(bars);
}

/**
 * Prix journaliers d'un actif, du plus ancien au plus récent.
 *
 * Stratégie : cache en base → téléchargement réel → données de démo.
 * `source` indique toujours d'où viennent les prix affichés.
 */
export async function getPrices(
  assetId: AssetId,
  days: number = DEFAULT_DAYS,
): Promise<PriceSeries> {
  const asset = getAsset(assetId);
  if (!asset) throw new Error(`Actif inconnu : ${assetId}`);

  const recent = lastFetch.get(assetId) ?? 0;
  const cached = readCache(assetId, days);
  const frais = Date.now() - recent < CACHE_TTL_MS;

  if (cached.length > 0 && frais) {
    return { asset: assetId, bars: cached.reverse(), source: cacheSource(assetId) ?? "cache" };
  }

  try {
    const bars = await downloadBars(asset, days);
    writeCache(assetId, bars, asset.provider);
    lastFetch.set(assetId, Date.now());
    return { asset: assetId, bars, source: asset.provider };
  } catch (error) {
    console.warn(`[marché] ${assetId} : téléchargement impossible —`, (error as Error).message);

    // On préfère un cache réel, même périmé, aux données inventées.
    if (cached.length > 0) {
      return { asset: assetId, bars: cached.reverse(), source: cacheSource(assetId) ?? "cache" };
    }

    const bars = demoBars(assetId, days);
    writeCache(assetId, bars, "demo");
    lastFetch.set(assetId, Date.now());
    return { asset: assetId, bars, source: "demo" };
  }
}

/** Dernier prix connu d'un actif. */
export async function getLastPrice(assetId: AssetId): Promise<{ price: number; source: string }> {
  const serie = await getPrices(assetId, 5);
  const last = serie.bars.at(-1);
  if (!last) throw new Error(`Aucun prix pour ${assetId}`);
  return { price: last.close, source: serie.source };
}
