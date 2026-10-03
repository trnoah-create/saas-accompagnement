import "server-only";
import { baseConfiguree, query, urlBase } from "./db";
import { ASSETS, getPrices, MINIMUM_UN_AN, type AssetId, type Tentative } from "./market";
import { motDePasseConfigure } from "./session";
import { courtier } from "./broker";
import { botReglesConfig } from "../config/bot-regles";
import { etatExecutionBot, type EtatExecutionBot } from "./bot-regles/run";

export type EtatBase = {
  configuree: boolean;
  joignable: boolean;
  detail: string;
  hote: string | null;
};

export type EtatAcces = { configure: boolean; detail: string };

export function etatAcces(): EtatAcces {
  return motDePasseConfigure()
    ? {
        configure: true,
        detail: "La variable SITE_PASSWORD est bien définie : le site est protégé.",
      }
    : {
        configure: false,
        detail:
          "La variable SITE_PASSWORD est absente. Personne ne peut entrer, toi compris. Ajoute-la dans Vercel (Settings → Environment Variables), puis redéploie.",
      };
}

/**
 * État du bot automatique.
 *
 * Aucune clé d'API n'y figure : le bot est 100 % mécanique, il n'appelle
 * aucun service payant. Seuls comptent la tâche quotidienne (CRON_SECRET),
 * le courtier utilisé, et ce que le bot a réellement fait.
 */
export type EtatBotAuto = {
  /** La tâche quotidienne est-elle protégée (et donc utilisable) ? */
  cronSecret: boolean;
  courtierNom: string;
  courtierReel: boolean;
  /** Actifs suivis et part maximale autorisée pour chacun. */
  actifs: { id: string; poidsMaxPct: number; actif: boolean }[];
  moyenneMobileJours: number;
  stopLossPct: number;
  perteMaxJourEuros: number;
} & EtatExecutionBot;

export async function etatBotAuto(): Promise<EtatBotAuto> {
  const broker = courtier();
  const execution = await etatExecutionBot();

  return {
    cronSecret: Boolean(process.env.CRON_SECRET),
    courtierNom: broker.nom,
    courtierReel: broker.reel,
    actifs: botReglesConfig.actifs.map((a) => ({
      id: a.id,
      poidsMaxPct: a.poidsMaxPct,
      actif: a.actif,
    })),
    moyenneMobileJours: botReglesConfig.moyenneMobileJours,
    stopLossPct: botReglesConfig.sorties.stopLossPct,
    perteMaxJourEuros: botReglesConfig.pertes.blocageJour,
    ...execution,
  };
}

export type EtatActif = {
  id: string;
  label: string;
  source: string;
  sourceLabel: string;
  reel: boolean;
  note?: string;
  dernierPrix: number | null;
  derniereDate: string | null;
  jours: number;
  /** true si on a bien au moins un an d'historique. */
  unAnDHistorique: boolean;
  tentatives: Tentative[];
};

export async function etatBase(): Promise<EtatBase> {
  const url = urlBase();
  let hote: string | null = null;
  try {
    if (url) hote = new URL(url).hostname;
  } catch {
    hote = null;
  }

  if (!baseConfiguree()) {
    return {
      configuree: false,
      joignable: false,
      hote: null,
      detail:
        "Aucune variable DATABASE_URL trouvée. La base n'est pas encore connectée : les comptes et les ordres ne peuvent pas être enregistrés.",
    };
  }

  try {
    await query("SELECT 1");
    return { configuree: true, joignable: true, hote, detail: "Connexion établie." };
  } catch (e) {
    return {
      configuree: true,
      joignable: false,
      hote,
      detail: `La base est configurée mais ne répond pas : ${(e as Error).message}`,
    };
  }
}

export async function etatActifs(): Promise<EtatActif[]> {
  return Promise.all(
    ASSETS.map(async (a) => {
      try {
        // Profondeur habituelle, pas une tranche courte : la page doit
        // montrer l'historique réellement disponible.
        const serie = await getPrices(a.id as AssetId);
        const dernier = serie.bars.at(-1);
        return {
          id: a.id,
          label: a.label,
          source: serie.source,
          sourceLabel: serie.sourceLabel,
          reel: serie.source !== "demo",
          note: serie.note,
          dernierPrix: dernier?.close ?? null,
          derniereDate: dernier?.day ?? null,
          jours: serie.bars.length,
          unAnDHistorique: serie.bars.length >= MINIMUM_UN_AN,
          tentatives: serie.tentatives,
        };
      } catch (e) {
        return {
          id: a.id,
          label: a.label,
          source: "erreur",
          sourceLabel: `Erreur : ${(e as Error).message}`,
          reel: false,
          dernierPrix: null,
          derniereDate: null,
          jours: 0,
          unAnDHistorique: false,
          tentatives: [],
        };
      }
    }),
  );
}
