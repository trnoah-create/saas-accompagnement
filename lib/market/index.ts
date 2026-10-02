import "server-only";
import { query } from "../db";
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

async function readCache(asset: string, days: number): Promise<Bar[]> {
  try {
    return await readCacheOrThrow(asset, days);
  } catch {
    return []; // base indisponible : on se passe du cache.
  }
}

async function readCacheOrThrow(asset: string, days: number): Promise<Bar[]> {
  const rows = await query<Bar>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, open, high, low, close
     FROM price_bars WHERE asset = $1 ORDER BY day DESC LIMIT $2`,
    [asset, days],
  );
  return rows.map((b) => ({
    day: String(b.day),
    open: Number(b.open),
    high: Number(b.high),
    low: Number(b.low),
    close: Number(b.close),
  }));
}

async function cacheSource(asset: string): Promise<string | null> {
  try {
    const rows = await query<{ source: string }>(
      "SELECT source FROM price_bars WHERE asset = $1 LIMIT 1",
      [asset],
    );
    return rows[0]?.source ?? null;
  } catch {
    return null;
  }
}

async function writeCache(asset: string, bars: Bar[], source: string) {
  try {
    await writeCacheOrThrow(asset, bars, source);
  } catch (e) {
    console.warn("[marché] cache indisponible :", (e as Error).message);
  }
}

async function writeCacheOrThrow(asset: string, bars: Bar[], source: string) {
  // Insertion groupée : une seule requête plutôt qu'une par journée.
  const valeurs: string[] = [];
  const params: unknown[] = [];
  bars.forEach((b, i) => {
    const n = i * 7;
    valeurs.push(`($${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}, $${n + 5}, $${n + 6}, $${n + 7})`);
    params.push(asset, b.day, b.open, b.high, b.low, b.close, source);
  });

  // On découpe pour ne pas dépasser la limite de paramètres de Postgres.
  const LOT = 500;
  for (let i = 0; i < valeurs.length; i += LOT) {
    const tranche = valeurs.slice(i, i + LOT);
    const decalage = i * 7;
    const texte = tranche
      .map((_, j) => {
        const n = j * 7;
        return `($${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}, $${n + 5}, $${n + 6}, $${n + 7})`;
      })
      .join(", ");
    await query(
      `INSERT INTO price_bars (asset, day, open, high, low, close, source)
       VALUES ${texte}
       ON CONFLICT (asset, day) DO UPDATE SET
         open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
         close = EXCLUDED.close, source = EXCLUDED.source`,
      params.slice(decalage, decalage + tranche.length * 7),
    );
  }
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
  const cached = await readCache(assetId, days);
  const frais = Date.now() - recent < CACHE_TTL_MS;

  if (cached.length > 0 && frais) {
    return { asset: assetId, bars: cached.reverse(), source: (await cacheSource(assetId)) ?? "cache" };
  }

  try {
    const bars = await downloadBars(asset, days);
    await writeCache(assetId, bars, asset.provider);
    lastFetch.set(assetId, Date.now());
    return { asset: assetId, bars, source: asset.provider };
  } catch (error) {
    console.warn(`[marché] ${assetId} : téléchargement impossible —`, (error as Error).message);

    // On préfère un cache réel, même périmé, aux données inventées.
    if (cached.length > 0) {
      return { asset: assetId, bars: cached.reverse(), source: (await cacheSource(assetId)) ?? "cache" };
    }

    const bars = demoBars(assetId, days);
    await writeCache(assetId, bars, "demo");
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
