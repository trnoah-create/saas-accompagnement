/**
 * Enchaînement des sources de prix.
 *
 * On essaie chaque source dans l'ordre et on note précisément ce qui s'est
 * passé pour chacune : code HTTP, message, délai dépassé, durée. Ces traces
 * alimentent la page /diagnostic.
 *
 * Deux exigences se superposent :
 *   • il faut assez d'historique (le bot calcule une moyenne sur 50 jours,
 *     donc une source qui ne renvoie que 30 journées ne convient pas) ;
 *   • il ne faut jamais échouer pour autant : si aucune source n'atteint le
 *     minimum souhaité, on garde la plus fournie plutôt que rien.
 */
import type { Asset } from "./assets";
import { sourcesPour, type Source } from "./sources";
import type { Bar, Tentative } from "./types";

const TIMEOUT_MS = 12_000;
/** En dessous, une réponse est inexploitable : on passe à la source suivante. */
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

/** Fusionne plusieurs pages : une seule bougie par journée, du plus ancien au plus récent. */
function fusionner(pages: Bar[][], days: number): Bar[] {
  const parJour = new Map<string, Bar>();
  for (const page of pages) for (const b of page) parJour.set(b.day, b);
  return [...parJour.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-days);
}

/** Un seul appel réseau, avec délai maximal. */
async function appeler(
  url: string,
  source: Source,
  fetchImpl: FetchLike,
): Promise<{ texte: string; status: number }> {
  const controller = new AbortController();
  const minuteur = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const reponse = await fetchImpl(url, {
      signal: controller.signal,
      headers: source.headers,
    });
    if (!reponse.ok) {
      const corps = resumeCorps(await reponse.text().catch(() => ""));
      const e = new Error(`HTTP ${reponse.status}${corps ? ` — ${corps}` : ""}`) as Error & {
        status: number;
      };
      e.status = reponse.status;
      throw e;
    }
    return { texte: await reponse.text(), status: reponse.status };
  } finally {
    clearTimeout(minuteur);
  }
}

async function essayer(
  source: Source,
  asset: Asset,
  days: number,
  fetchImpl: FetchLike,
): Promise<{ bars?: Bar[]; tentative: Tentative }> {
  const adresses = source.urls(asset, days);

  if (adresses.length === 0) {
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

  const hote = hoteDe(adresses[0]);
  const depart = Date.now();
  const pages: Bar[][] = [];
  let status: number | null = null;

  for (const url of adresses) {
    try {
      const r = await appeler(url, source, fetchImpl);
      status = r.status;
      pages.push(source.parse(r.texte, days));
    } catch (e) {
      // Une page manquante n'annule pas les précédentes : un historique
      // partiel vaut mieux que pas d'historique du tout.
      if (pages.length > 0) break;
      return {
        tentative: {
          source: source.label,
          hote,
          ok: false,
          status: (e as { status?: number }).status ?? null,
          message: messageErreur(e),
          ms: Date.now() - depart,
        },
      };
    }
  }

  const ms = Date.now() - depart;
  const bars = fusionner(pages, days);

  if (bars.length < MIN_BARS) {
    return {
      tentative: {
        source: source.label,
        hote,
        ok: false,
        status,
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
      status,
      message:
        `${bars.length} journées reçues` +
        (adresses.length > 1 ? ` (${adresses.length} appels)` : ""),
      ms,
    },
  };
}

/**
 * Essaie les sources dans l'ordre et renvoie la première qui fournit au
 * moins `minBars` journées. Si aucune n'y parvient, renvoie la réponse la
 * plus fournie obtenue. Lève une erreur enrichie des tentatives seulement
 * si rien n'a répondu du tout.
 */
export async function telecharger(
  asset: Asset,
  days: number,
  fetchImpl: FetchLike = fetchParDefaut,
  sources: Source[] = sourcesPour(asset),
  minBars = MIN_BARS,
): Promise<Recolte> {
  const tentatives: Tentative[] = [];
  let meilleure: Recolte | null = null;

  for (const source of sources) {
    const { bars, tentative } = await essayer(source, asset, days, fetchImpl);
    tentatives.push(tentative);

    if (!bars) continue;

    const recolte: Recolte = {
      bars,
      source: source.id,
      sourceLabel: source.label,
      ohlc: source.ohlc,
      note: source.note,
      tentatives,
    };

    // Assez d'historique : on s'arrête là, l'ordre de secours est respecté.
    if (bars.length >= minBars) return recolte;

    // Pas assez, mais mieux que rien : on garde la plus fournie et on
    // continue d'essayer les sources suivantes.
    if (!meilleure || bars.length > meilleure.bars.length) meilleure = recolte;
    tentative.ok = false;
    tentative.message = `${bars.length} journées reçues, moins que les ${minBars} attendues`;
  }

  if (meilleure) {
    return {
      ...meilleure,
      tentatives,
      note: [
        meilleure.note,
        `Historique court : ${meilleure.bars.length} journées au lieu des ${minBars} attendues.`,
      ]
        .filter(Boolean)
        .join(" "),
    };
  }

  const erreur = new Error(`aucune source n'a répondu pour ${asset.id}`) as Error & {
    tentatives: Tentative[];
  };
  erreur.tentatives = tentatives;
  throw erreur;
}

const fetchParDefaut: FetchLike = (url, init) =>
  fetch(url, { ...init, cache: "no-store" });
