import "server-only";
import { query } from "../db";
import { getAsset, type AssetId } from "./assets";
import { telecharger } from "./providers";
import { demoBars } from "./demo";
import type { Bar, PriceSeries, Tentative } from "./types";

export * from "./assets";
export type { Bar, PriceSeries, Tentative } from "./types";

/**
 * Profondeur d'historique demandée par défaut.
 *
 * 400 journées cotées, c'est plus d'un an pour tous les actifs : les
 * cryptos cotent 7 jours sur 7, les Bourses environ 252 jours par an.
 */
export const JOURS_PAR_DEFAUT = 400;

/**
 * En dessous de ce nombre de journées, on considère ne pas avoir « au
 * moins un an » d'historique et on essaie la source suivante. 250 journées
 * cotées correspondent à une année de Bourse.
 */
export const MINIMUM_UN_AN = 250;

const CACHE_TTL_MS = 3600_000;

/**
 * Dernier téléchargement par actif : l'instant ET la profondeur demandée.
 *
 * La profondeur est indispensable. Sans elle, un appel à 30 journées
 * remplissait le cache avec 30 lignes, et toute demande ultérieure plus
 * profonde se contentait de ce cache « frais » — c'est exactement pourquoi
 * le S&P 500 restait bloqué à 30 journées.
 */
const dernierAppel = new Map<string, { instant: number; jours: number }>();
/** Dernières tentatives par actif, pour la page /diagnostic. */
const dernieresTentatives = new Map<string, Tentative[]>();

export function tentativesConnues(assetId: string): Tentative[] {
  return dernieresTentatives.get(assetId) ?? [];
}

// ─── Cache (simple optimisation : jamais bloquant) ───────────────────

async function lireCache(asset: string, days: number): Promise<Bar[]> {
  try {
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
  } catch {
    return [];
  }
}

async function sourceDuCache(asset: string): Promise<string | null> {
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

async function ecrireCache(asset: string, bars: Bar[], source: string) {
  try {
    const LOT = 500;
    for (let i = 0; i < bars.length; i += LOT) {
      const tranche = bars.slice(i, i + LOT);
      const params: unknown[] = [];
      const valeurs = tranche
        .map((b, j) => {
          params.push(asset, b.day, b.open, b.high, b.low, b.close, source);
          const n = j * 7;
          return `($${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}, $${n + 5}, $${n + 6}, $${n + 7})`;
        })
        .join(", ");
      await query(
        `INSERT INTO price_bars (asset, day, open, high, low, close, source)
         VALUES ${valeurs}
         ON CONFLICT (asset, day) DO UPDATE SET
           open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
           close = EXCLUDED.close, source = EXCLUDED.source`,
        params,
      );
    }
  } catch (e) {
    console.warn("[marché] cache indisponible :", (e as Error).message);
  }
}

// ─── Récupération des prix ───────────────────────────────────────────

/**
 * Prix journaliers d'un actif, du plus ancien au plus récent.
 *
 * Ordre : cache récent → sources réelles (dans l'ordre) → cache périmé →
 * prix inventés. Le champ `source` dit toujours d'où viennent les prix, et
 * vaut "demo" lorsqu'ils sont inventés.
 */
export async function getPrices(
  assetId: AssetId,
  days: number = JOURS_PAR_DEFAUT,
  minBars: number = Math.min(days, MINIMUM_UN_AN),
): Promise<PriceSeries> {
  const asset = getAsset(assetId);
  if (!asset) throw new Error(`Actif inconnu : ${assetId}`);

  const cache = await lireCache(assetId, days);
  const precedent = dernierAppel.get(assetId);
  // Le cache n'est réutilisable que s'il est récent ET aussi profond que
  // la demande : sinon on retélécharge pour compléter l'historique.
  const frais =
    precedent !== undefined &&
    Date.now() - precedent.instant < CACHE_TTL_MS &&
    precedent.jours >= days;

  if (cache.length > 0 && frais) {
    const src = (await sourceDuCache(assetId)) ?? "cache";
    return {
      asset: assetId,
      bars: cache.reverse(),
      source: src,
      sourceLabel: src === "demo" ? "Données inventées" : `${src} (en cache)`,
      ohlc: true,
      tentatives: tentativesConnues(assetId),
    };
  }

  try {
    const r = await telecharger(asset, days, undefined, undefined, minBars);
    dernieresTentatives.set(assetId, r.tentatives);
    dernierAppel.set(assetId, { instant: Date.now(), jours: days });
    await ecrireCache(assetId, r.bars, r.source);

    return {
      asset: assetId,
      bars: r.bars,
      source: r.source,
      sourceLabel: r.sourceLabel,
      ohlc: r.ohlc,
      note: r.note,
      tentatives: r.tentatives,
    };
  } catch (e) {
    const tentatives = (e as Error & { tentatives?: Tentative[] }).tentatives ?? [];
    dernieresTentatives.set(assetId, tentatives);
    console.warn(
      `[marché] ${assetId} : aucune source n'a répondu —`,
      tentatives.map((t) => `${t.source}: ${t.message}`).join(" | "),
    );

    // Un cache réel, même périmé, vaut mieux que des prix inventés.
    if (cache.length > 0) {
      const src = (await sourceDuCache(assetId)) ?? "cache";
      if (src !== "demo") {
        return {
          asset: assetId,
          bars: cache.reverse(),
          source: src,
          sourceLabel: `${src} (en cache, périmé)`,
          ohlc: true,
          tentatives,
        };
      }
    }

    const bars = demoBars(assetId, days);
    dernierAppel.set(assetId, { instant: Date.now(), jours: days });
    await ecrireCache(assetId, bars, "demo");

    return {
      asset: assetId,
      bars,
      source: "demo",
      sourceLabel: "Données inventées",
      ohlc: true,
      tentatives,
    };
  }
}

/**
 * Dernier prix connu d'un actif.
 *
 * On demande la profondeur habituelle, pas une tranche courte : tout le
 * site partage ainsi un seul cache profond, au lieu qu'un appel « juste le
 * dernier prix » vienne le tronquer.
 */
export async function getLastPrice(
  assetId: AssetId,
): Promise<{ price: number; source: string }> {
  const serie = await getPrices(assetId);
  const last = serie.bars.at(-1);
  if (!last) throw new Error(`Aucun prix pour ${assetId}`);
  return { price: last.close, source: serie.source };
}
