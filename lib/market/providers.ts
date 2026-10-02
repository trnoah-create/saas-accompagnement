/**
 * Enchaînement des sources de prix.
 *
 * On essaie chaque source dans l'ordre et on note précisément ce qui s'est
 * passé pour chacune : code HTTP, message, délai dépassé, durée. Ces traces
 * alimentent la page /diagnostic.
 */
import type { Asset } from "./assets";
import { sourcesPour, type Source } from "./sources";
import type { Bar, Tentative } from "./types";

const TIMEOUT_MS = 12_000;
const MIN_BARS = 10;

export type Recolte = {
  bars: Bar[];
  source: string;
  sourceLabel: string;
  ohlc: boolean;
  note?: string;
  tentatives: Tentative[];
};

/** Permet aux tests d'injecter des réponses sans réseau. */
export type FetchLike = (
  url: string,
  init: { signal: AbortSignal; headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

function hoteDe(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "adresse invalide";
  }
}

/** Message court et lisible, sans jamais recopier de secret. */
function messageErreur(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === "AbortError" || /abort/i.test(e.message)) {
      return `délai dépassé (${TIMEOUT_MS / 1000} s sans réponse)`;
    }
    if (/fetch failed|ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(e.message)) {
      return `connexion impossible (${e.message})`;
    }
    return e.message;
  }
  return String(e);
}

/** Un corps de réponse d'erreur peut être long : on le résume. */
function resumeCorps(corps: string): string {
  const propre = corps.replace(/\s+/g, " ").trim();
  if (!propre) return "";
  return propre.length > 160 ? `${propre.slice(0, 160)}…` : propre;
}

async function essayer(
  source: Source,
  asset: Asset,
  days: number,
  fetchImpl: FetchLike,
): Promise<{ bars?: Bar[]; tentative: Tentative }> {
  const url = source.url(asset, days);

  if (!url) {
    return {
      tentative: {
        source: source.label,
        hote: "—",
        ok: false,
        status: null,
        message: `ne couvre pas ${asset.id}`,
        ms: 0,
      },
    };
  }

  const hote = hoteDe(url);
  const depart = Date.now();
  const controller = new AbortController();
  const minuteur = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const reponse = await fetchImpl(url, {
      signal: controller.signal,
      headers: source.headers,
    });
    const ms = Date.now() - depart;

    if (!reponse.ok) {
      const corps = resumeCorps(await reponse.text().catch(() => ""));
      return {
        tentative: {
          source: source.label,
          hote,
          ok: false,
          status: reponse.status,
          message: `HTTP ${reponse.status}${corps ? ` — ${corps}` : ""}`,
          ms,
        },
      };
    }

    const bars = source.parse(await reponse.text(), days);

    if (bars.length < MIN_BARS) {
      return {
        tentative: {
          source: source.label,
          hote,
          ok: false,
          status: reponse.status,
          message: `seulement ${bars.length} journée(s) reçue(s), insuffisant`,
          ms,
        },
      };
    }

    return {
      bars,
      tentative: {
        source: source.label,
        hote,
        ok: true,
        status: reponse.status,
        message: `${bars.length} journées reçues`,
        ms,
      },
    };
  } catch (e) {
    return {
      tentative: {
        source: source.label,
        hote,
        ok: false,
        status: null,
        message: messageErreur(e),
        ms: Date.now() - depart,
      },
    };
  } finally {
    clearTimeout(minuteur);
  }
}

/**
 * Essaie les sources dans l'ordre et renvoie la première qui répond.
 * Lève une erreur enrichie des tentatives si toutes échouent.
 */
export async function telecharger(
  asset: Asset,
  days: number,
  fetchImpl: FetchLike = fetchParDefaut,
  sources: Source[] = sourcesPour(asset),
): Promise<Recolte> {
  const tentatives: Tentative[] = [];

  for (const source of sources) {
    const { bars, tentative } = await essayer(source, asset, days, fetchImpl);
    tentatives.push(tentative);

    if (bars) {
      return {
        bars,
        source: source.id,
        sourceLabel: source.label,
        ohlc: source.ohlc,
        note: source.note,
        tentatives,
      };
    }
  }

  const erreur = new Error(`aucune source n'a répondu pour ${asset.id}`) as Error & {
    tentatives: Tentative[];
  };
  erreur.tentatives = tentatives;
  throw erreur;
}

const fetchParDefaut: FetchLike = (url, init) =>
  fetch(url, { ...init, cache: "no-store" });
