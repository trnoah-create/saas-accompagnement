/**
 * Sources de prix — toutes gratuites et sans clé API.
 *
 * ⚠️ Aucune de ces adresses n'a pu être testée depuis l'environnement de
 * développement, dont le réseau sortant est fermé. Leur bon fonctionnement
 * se constate sur /diagnostic une fois le site déployé : la page indique
 * quelle source a répondu et, pour les autres, la cause exacte de l'échec.
 *
 * L'ordre compte : la première qui répond avec assez d'historique gagne.
 */
import type { Asset } from "./assets";
import type { Bar } from "./types";

export type Source = {
  id: string;
  label: string;
  /**
   * Adresses à appeler pour cet actif, dans l'ordre. Un tableau vide
   * signifie que la source ne couvre pas l'actif. Plusieurs adresses sont
   * nécessaires quand l'API limite le nombre de journées par appel
   * (Coinbase plafonne à 300) : les réponses sont ensuite fusionnées.
   */
  urls: (asset: Asset, days: number) => string[];
  parse: (texte: string, days: number) => Bar[];
  /** false = clôtures seulement, pas de vrai ouvert/haut/bas. */
  ohlc: boolean;
  /** En-têtes éventuels (aucun secret : ces API n'ont pas de clé). */
  headers?: Record<string, string>;
  /** Avertissement si l'instrument renvoyé diffère de celui demandé. */
  note?: string;
};

const jour = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const nombre = (v: unknown) => Number(v);

function valide(b: Bar): boolean {
  return (
    Boolean(b.day) &&
    [b.open, b.high, b.low, b.close].every((n) => Number.isFinite(n) && n > 0)
  );
}

/** Depuis une suite de clôtures seules : on reconstitue des bougies plates. */
function depuisClotures(points: { day: string; close: number }[]): Bar[] {
  return points
    .map((p) => ({ day: p.day, open: p.close, high: p.close, low: p.close, close: p.close }))
    .filter(valide);
}

// ─── Cryptomonnaies ──────────────────────────────────────────────────

const binance: Source = {
  id: "binance",
  label: "Binance",
  ohlc: true,
  urls: (a, days) =>
    a.symboles.binance
      ? [
          `https://api.binance.com/api/v3/klines?symbol=${a.symboles.binance}&interval=1d&limit=${Math.min(Math.max(days, 1), 1000)}`,
        ]
      : [],
  parse: (texte) => {
    const rows = JSON.parse(texte) as unknown[][];
    return rows
      .map((r) => ({
        day: jour(nombre(r[0])),
        open: nombre(r[1]),
        high: nombre(r[2]),
        low: nombre(r[3]),
        close: nombre(r[4]),
      }))
      .filter(valide);
  },
};

/** Coinbase ne renvoie jamais plus de 300 bougies par appel. */
const COINBASE_LOT = 300;
/** Garde-fou : jamais plus de 4 appels pour un même actif. */
const COINBASE_MAX_APPELS = 4;

const coinbase: Source = {
  id: "coinbase",
  label: "Coinbase Exchange",
  ohlc: true,
  urls: (a, days) => {
    if (!a.symboles.coinbase) return [];
    const base = `https://api.exchange.coinbase.com/products/${a.symboles.coinbase}/candles?granularity=86400`;

    // En dessous du plafond, la fenêtre par défaut (les 300 dernières
    // journées) suffit : un seul appel, sans paramètre de dates.
    if (days <= COINBASE_LOT) return [base];

    // Au-delà, on remonte le temps par tranches de 300 journées.
    const adresses: string[] = [];
    let fin = Date.now();
    let restant = days;
    while (restant > 0 && adresses.length < COINBASE_MAX_APPELS) {
      const tranche = Math.min(restant, COINBASE_LOT);
      const debut = fin - tranche * 86_400_000;
      adresses.push(
        `${base}&start=${new Date(debut).toISOString()}&end=${new Date(fin).toISOString()}`,
      );
      fin = debut - 86_400_000;
      restant -= tranche;
    }
    return adresses;
  },
  parse: (texte) => {
    // [ time, low, high, open, close, volume ], du plus récent au plus ancien.
    const rows = JSON.parse(texte) as number[][];
    return rows
      .map((r) => ({
        day: jour(nombre(r[0]) * 1000),
        low: nombre(r[1]),
        high: nombre(r[2]),
        open: nombre(r[3]),
        close: nombre(r[4]),
      }))
      .filter(valide)
      .reverse();
  },
};

const kraken: Source = {
  id: "kraken",
  label: "Kraken",
  ohlc: true,
  urls: (a) =>
    a.symboles.kraken
      ? [`https://api.kraken.com/0/public/OHLC?pair=${a.symboles.kraken}&interval=1440`]
      : [],
  parse: (texte) => {
    const json = JSON.parse(texte) as {
      error?: string[];
      result?: Record<string, unknown>;
    };
    if (json.error?.length) throw new Error(json.error.join(", "));
    if (!json.result) throw new Error("réponse sans résultat");

    // Kraken renomme les paires (XBTUSD → XXBTZUSD) : on prend la première
    // clé qui n'est pas le curseur "last".
    const cle = Object.keys(json.result).find((k) => k !== "last");
    if (!cle) throw new Error("aucune série dans la réponse");

    const rows = json.result[cle] as unknown[][];
    return rows
      .map((r) => ({
        day: jour(nombre(r[0]) * 1000),
        open: nombre(r[1]),
        high: nombre(r[2]),
        low: nombre(r[3]),
        close: nombre(r[4]),
      }))
      .filter(valide);
  },
};

const coingecko: Source = {
  id: "coingecko",
  label: "CoinGecko",
  ohlc: true,
  urls: (a, days) => {
    if (!a.symboles.coingecko) return [];
    // Le palier gratuit n'accepte que certaines valeurs de `days`.
    const paliers = [1, 7, 14, 30, 90, 180, 365];
    const choisi = paliers.find((p) => p >= days) ?? 365;
    return [
      `https://api.coingecko.com/api/v3/coins/${a.symboles.coingecko}/ohlc?vs_currency=usd&days=${choisi}`,
    ];
  },
  parse: (texte) => {
    const rows = JSON.parse(texte) as number[][];
    return rows
      .map((r) => ({
        day: jour(nombre(r[0])),
        open: nombre(r[1]),
        high: nombre(r[2]),
        low: nombre(r[3]),
        close: nombre(r[4]),
      }))
      .filter(valide);
  },
};

// ─── Indices / ETF ───────────────────────────────────────────────────

const stooq: Source = {
  id: "stooq",
  label: "Stooq",
  ohlc: true,
  // Stooq renvoie tout l'historique disponible : rien à paginer.
  urls: (a) => (a.symboles.stooq ? [`https://stooq.com/q/d/l/?s=${a.symboles.stooq}&i=d`] : []),
  parse: (texte, days) => {
    const lignes = texte.trim().split("\n");
    if (lignes.length < 2 || !lignes[0].toLowerCase().startsWith("date")) {
      throw new Error("réponse inattendue (pas un CSV de cotations)");
    }
    return lignes
      .slice(1)
      .map((l) => {
        const [day, open, high, low, close] = l.split(",");
        return {
          day,
          open: nombre(open),
          high: nombre(high),
          low: nombre(low),
          close: nombre(close),
        };
      })
      .filter(valide)
      .slice(-days);
  },
};

const yahoo: Source = {
  id: "yahoo",
  label: "Yahoo Finance",
  ohlc: true,
  // Yahoo refuse les requêtes sans navigateur déclaré.
  headers: { "User-Agent": "Mozilla/5.0 (compatible; SimuTrade/1.0)" },
  urls: (a, days) => {
    if (!a.symboles.yahoo) return [];
    // Les Bourses ferment le week-end : il faut demander une plage
    // nettement plus large que le nombre de journées cotées voulues.
    const plage = days <= 250 ? "1y" : days <= 500 ? "2y" : days <= 1250 ? "5y" : "10y";
    return [
      `https://query1.finance.yahoo.com/v8/finance/chart/${a.symboles.yahoo}?range=${plage}&interval=1d`,
    ];
  },
  parse: (texte, days) => {
    const json = JSON.parse(texte) as {
      chart?: { error?: { description?: string }; result?: Record<string, unknown>[] };
    };
    if (json.chart?.error) throw new Error(json.chart.error.description ?? "erreur Yahoo");

    const r = json.chart?.result?.[0] as
      | {
          timestamp?: number[];
          indicators?: { quote?: { open?: number[]; high?: number[]; low?: number[]; close?: number[] }[] };
        }
      | undefined;
    const t = r?.timestamp;
    const q = r?.indicators?.quote?.[0];
    if (!t || !q) throw new Error("réponse sans cotations");

    return t
      .map((sec, i) => ({
        day: jour(sec * 1000),
        open: nombre(q.open?.[i]),
        high: nombre(q.high?.[i]),
        low: nombre(q.low?.[i]),
        close: nombre(q.close?.[i]),
      }))
      .filter(valide)
      .slice(-days);
  },
};

const fred: Source = {
  id: "fred",
  label: "FRED (indice de référence)",
  ohlc: false,
  note:
    "FRED publie l'indice de référence, pas l'ETF : le niveau de prix diffère, l'évolution est comparable. Clôtures uniquement.",
  urls: (a) =>
    a.symboles.fred
      ? [`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${a.symboles.fred}`]
      : [],
  parse: (texte, days) => {
    const lignes = texte.trim().split("\n");
    if (lignes.length < 2) throw new Error("CSV vide");
    const points = lignes
      .slice(1)
      .map((l) => {
        const [day, valeur] = l.split(",");
        return { day: day?.trim(), close: Number(valeur) };
      })
      // FRED marque les jours fériés par un point.
      .filter((p) => p.day && Number.isFinite(p.close) && p.close > 0);
    return depuisClotures(points as { day: string; close: number }[]).slice(-days);
  },
};

/** Ordre d'essai, par type d'actif. */
export const SOURCES_CRYPTO: Source[] = [binance, coinbase, kraken, coingecko];
export const SOURCES_INDICE: Source[] = [stooq, yahoo, fred];

/**
 * Ordre d'essai pour un actif donné.
 *
 * L'ordre de secours habituel est conservé ; un actif peut seulement
 * remonter une source en tête (`sourcesPrioritaires`), par exemple Solana
 * dont on veut la paire en euros de Coinbase.
 */
export function sourcesPour(asset: Asset): Source[] {
  const parDefaut = asset.kind === "crypto" ? SOURCES_CRYPTO : SOURCES_INDICE;
  const prioritaires = asset.sourcesPrioritaires;
  if (!prioritaires || prioritaires.length === 0) return parDefaut;

  const devant = prioritaires
    .map((id) => parDefaut.find((s) => s.id === id))
    .filter((s): s is Source => Boolean(s));

  return [...devant, ...parDefaut.filter((s) => !devant.includes(s))];
}
