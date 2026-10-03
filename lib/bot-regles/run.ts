/**
 * Exécution quotidienne du bot — l'orchestration.
 *
 * Ce fichier est le seul endroit où les deux mondes se rencontrent :
 *   • les RÈGLES (decider.ts) : fonctions pures, elles décident ;
 *   • le COURTIER (lib/broker) : quatre opérations, il exécute.
 *
 * Aucun appel à une intelligence artificielle, aucune API payante.
 *
 * Enchaînement d'une journée :
 *   pause → solde et positions → prix et historiques → témoin →
 *   limites de perte → décision → exécution → compte rendu.
 */
import "server-only";
import { query, queryOne } from "../db";
import { botReglesConfig as cfg, fraisBot, idsActifs } from "../../config/bot-regles";
import { courtier, etatDuCompte, type EtatCompte, type OrdreExecute } from "../broker";
import { getPrices, type AssetId } from "../market";
import type { Bar } from "../market/types";
import {
  debutMois,
  debutSemaine,
  evaluerLimites,
  jourDeLExperience,
  jourLocal,
  type Pertes,
} from "../limites";
import { deciderOrdres, type Historiques, type Prix, type RefusBot } from "./decider";

export { jourDeLExperience };

export type StatutBot =
  | "ordres"
  | "aucun_ordre"
  | "en_pause"
  | "blocage_jour"
  | "pause_auto";

export type CompteBot = {
  day: string;
  statut: StatutBot;
  valeur: number | null;
  gain_jour_pct: number | null;
  valeur_temoin: number | null;
  temoin_gain_pct: number | null;
  resume: string;
  detail: {
    executes: OrdreExecute[];
    refuses: RefusBot[];
    signaux?: Record<string, string>;
    pertes?: Pertes;
    alerte?: string;
    jourDeLExperience?: number;
    /** Profondeur d'historique obtenue par actif, pour vérifier le « 1 an ». */
    historiques?: Record<string, number>;
  };
  erreur: string | null;
};

// ─── État du compte, vu à travers l'interface courtier ───────────────

/** Solde + positions + valeur totale, assemblés depuis le courtier. */
export async function etatBot(): Promise<EtatCompte> {
  return etatDuCompte(courtier());
}

// ─── Pause ───────────────────────────────────────────────────────────

export async function botEnPause(): Promise<boolean> {
  const r = await queryOne<{ paused: number }>("SELECT paused FROM bot_portfolio WHERE id = 1");
  return Number(r?.paused ?? 0) === 1;
}

export async function mettreBotEnPause(pause: boolean): Promise<void> {
  await query(
    `INSERT INTO bot_portfolio (id, cash, start_capital, paused) VALUES (1, $2, $2, $1)
     ON CONFLICT (id) DO UPDATE SET paused = $1`,
    [pause ? 1 : 0, cfg.capitalDepart],
  );
}

// ─── Valeurs quotidiennes ────────────────────────────────────────────

async function suivreValeur(jour: string, valeur: number) {
  await query(
    `INSERT INTO bot_equity (day, open_value, close_value) VALUES ($1, $2, $2)
     ON CONFLICT (day) DO UPDATE SET close_value = $2`,
    [jour, valeur],
  );

  const ouverture = async (depuis: string): Promise<number | null> => {
    const r = await queryOne<{ open_value: number }>(
      "SELECT open_value FROM bot_equity WHERE day >= $1 ORDER BY day ASC LIMIT 1",
      [depuis],
    );
    return r ? Number(r.open_value) : null;
  };

  return {
    jour: await ouverture(jour),
    semaine: await ouverture(debutSemaine(jour)),
    mois: await ouverture(debutMois(jour)),
  };
}

// ─── Témoin « acheter et garder » ────────────────────────────────────

async function valeurTemoin(prix: Prix): Promise<number> {
  const existantes = await query<{ asset: string; quantity: number }>(
    "SELECT asset, quantity FROM bot_benchmark",
  );

  if (existantes.length === 0) {
    const ids = idsActifs();
    if (ids.length === 0) return cfg.capitalDepart;

    const part = cfg.capitalDepart / ids.length;
    const investi = part - fraisBot(part);
    for (const a of ids) {
      const p = prix[a];
      if (!p) continue;
      await query(
        `INSERT INTO bot_benchmark (asset, quantity) VALUES ($1, $2)
         ON CONFLICT (asset) DO NOTHING`,
        [a, investi / p],
      );
    }
    return ids.reduce((t, a) => (prix[a] ? t + investi : t), 0);
  }

  return existantes.reduce((t, b) => t + Number(b.quantity) * (prix[b.asset] ?? 0), 0);
}

// ─── Compte rendu ────────────────────────────────────────────────────

async function enregistrer(c: CompteBot): Promise<void> {
  await query(
    `INSERT INTO bot_reports
       (day, statut, valeur, gain_jour_pct, valeur_temoin, temoin_gain_pct, resume, detail, erreur)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (day) DO UPDATE SET
       statut = EXCLUDED.statut, valeur = EXCLUDED.valeur,
       gain_jour_pct = EXCLUDED.gain_jour_pct, valeur_temoin = EXCLUDED.valeur_temoin,
       temoin_gain_pct = EXCLUDED.temoin_gain_pct, resume = EXCLUDED.resume,
       detail = EXCLUDED.detail, erreur = EXCLUDED.erreur`,
    [
      c.day, c.statut, c.valeur, c.gain_jour_pct, c.valeur_temoin,
      c.temoin_gain_pct, c.resume, JSON.stringify(c.detail), c.erreur,
    ],
  );
}

// ─── Exécution d'une journée ─────────────────────────────────────────

export async function executerJourneeBot(maintenant = new Date()): Promise<CompteBot> {
  const broker = courtier();
  // Ceinture et bretelles : aucune exécution si un courtier réel apparaissait.
  if (broker.reel) throw new Error("Courtier réel détecté : exécution refusée.");

  const jour = jourLocal(maintenant, cfg.fuseau);
  const base: Omit<CompteBot, "statut" | "resume"> = {
    day: jour,
    valeur: null,
    gain_jour_pct: null,
    valeur_temoin: null,
    temoin_gain_pct: null,
    detail: { executes: [], refuses: [] },
    erreur: null,
  };

  if (await botEnPause()) {
    const c: CompteBot = {
      ...base,
      statut: "en_pause",
      resume: "Le bot est en pause : aucun ordre passé.",
    };
    await enregistrer(c);
    return c;
  }

  const etat = await etatBot();
  const numeroJour = jourDeLExperience(etat.depuisLe, jour);

  // Prix et historiques des actifs suivis (au moins un an de profondeur).
  const prix: Prix = {};
  const historiques: Historiques = {};
  const profondeurs: Record<string, number> = {};
  for (const a of idsActifs()) {
    const { bars } = await getPrices(a as AssetId, cfg.historique.jours, cfg.historique.minimum);
    historiques[a] = bars as Bar[];
    profondeurs[a] = bars.length;
    prix[a] = bars.at(-1)?.close ?? 0;
  }
  // Les positions encore ouvertes sur un actif désactivé doivent aussi
  // être valorisées, sinon le bot ne pourrait plus les vendre.
  for (const p of etat.positions) {
    if (prix[p.asset] !== undefined) continue;
    const { bars } = await getPrices(
      p.asset as AssetId,
      cfg.historique.jours,
      cfg.historique.minimum,
    );
    historiques[p.asset] = bars as Bar[];
    profondeurs[p.asset] = bars.length;
    prix[p.asset] = bars.at(-1)?.close ?? 0;
  }

  const temoin = await valeurTemoin(prix);
  const ouvertures = await suivreValeur(jour, etat.valeurTotale);

  const chiffres = (valeur: number) => ({
    valeur,
    gain_jour_pct:
      ouvertures.jour === null || ouvertures.jour === 0
        ? null
        : ((valeur - ouvertures.jour) / ouvertures.jour) * 100,
    valeur_temoin: temoin,
    temoin_gain_pct: ((temoin - cfg.capitalDepart) / cfg.capitalDepart) * 100,
  });

  // ── Limites de perte ──
  const limites = evaluerLimites(etat.valeurTotale, ouvertures, cfg);

  if (limites.action === "pause") {
    await mettreBotEnPause(true);
    const c: CompteBot = {
      ...base,
      ...chiffres(etat.valeurTotale),
      statut: "pause_auto",
      resume: limites.motif,
      detail: {
        executes: [],
        refuses: [],
        pertes: limites.pertes,
        jourDeLExperience: numeroJour,
        historiques: profondeurs,
      },
    };
    await enregistrer(c);
    return c;
  }

  if (limites.action === "bloquer_jour") {
    const c: CompteBot = {
      ...base,
      ...chiffres(etat.valeurTotale),
      statut: "blocage_jour",
      resume: limites.motif,
      detail: {
        executes: [],
        refuses: [],
        pertes: limites.pertes,
        jourDeLExperience: numeroJour,
        historiques: profondeurs,
      },
    };
    await enregistrer(c);
    return c;
  }

  const alerte = limites.action === "alerte" ? limites.motif : undefined;

  // ── Décision mécanique (règles pures), puis exécution (courtier) ──
  const plan = deciderOrdres(
    { cash: etat.cash, valeurTotale: etat.valeurTotale, positions: etat.positions },
    historiques,
    prix,
  );

  const executes: OrdreExecute[] = [];
  const refuses: RefusBot[] = [...plan.refus];

  for (const o of plan.ordres) {
    const demande = { asset: o.asset, montant: o.montant, raison: o.raison };
    try {
      executes.push(
        o.side === "buy" ? await broker.acheter(demande) : await broker.vendre(demande),
      );
    } catch (e) {
      refuses.push({
        asset: o.asset,
        side: o.side,
        montant: o.montant,
        raison: o.raison,
        motifRefus: `Refusé à l'exécution : ${(e as Error).message}`,
      });
    }
  }

  const apres = await etatBot();
  await suivreValeur(jour, apres.valeurTotale);

  const resume =
    executes.length === 0
      ? refuses.length > 0
        ? `Aucun ordre : ${refuses.length} refusé(s) par les règles.`
        : "Aucun signal aujourd'hui : le bot reste en place."
      : `${executes.length} ordre(s) passé(s)` +
        (refuses.length > 0 ? `, ${refuses.length} refusé(s).` : ".");

  const c: CompteBot = {
    ...base,
    ...chiffres(apres.valeurTotale),
    statut: executes.length > 0 ? "ordres" : "aucun_ordre",
    resume,
    detail: {
      executes,
      refuses,
      signaux: plan.signaux,
      pertes: limites.pertes,
      alerte,
      jourDeLExperience: numeroJour,
      historiques: profondeurs,
    },
  };
  await enregistrer(c);
  return c;
}

// ─── Lecture pour l'interface ────────────────────────────────────────

export type LigneBot = CompteBot & { created_at: string };

export async function historiqueBot(limite = 90): Promise<LigneBot[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, statut, valeur, gain_jour_pct,
            valeur_temoin, temoin_gain_pct, resume, detail, erreur,
            to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
     FROM bot_reports ORDER BY day DESC LIMIT $1`,
    [limite],
  );

  return rows.map((r) => ({
    day: String(r.day),
    statut: r.statut as StatutBot,
    valeur: r.valeur === null ? null : Number(r.valeur),
    gain_jour_pct: r.gain_jour_pct === null ? null : Number(r.gain_jour_pct),
    valeur_temoin: r.valeur_temoin === null ? null : Number(r.valeur_temoin),
    temoin_gain_pct: r.temoin_gain_pct === null ? null : Number(r.temoin_gain_pct),
    resume: String(r.resume ?? ""),
    detail: parseDetail(r.detail),
    erreur: r.erreur === null ? null : String(r.erreur),
    created_at: String(r.created_at ?? ""),
  }));
}

function parseDetail(v: unknown): CompteBot["detail"] {
  if (typeof v === "object" && v !== null) return v as CompteBot["detail"];
  try {
    return JSON.parse(String(v ?? "{}")) as CompteBot["detail"];
  } catch {
    return { executes: [], refuses: [] };
  }
}

// ─── État du bot pour la page /diagnostic ────────────────────────────

export type EtatExecutionBot = {
  /** Date de la dernière journée exécutée, ou null si jamais lancé. */
  derniereExecution: string | null;
  /** Horodatage précis de cette exécution. */
  derniereExecutionLe: string | null;
  /** Statut de cette dernière journée. */
  dernierStatut: StatutBot | null;
  /** Résumé de cette dernière journée. */
  dernierResume: string | null;
  /** Nombre total d'ordres passés depuis le départ. */
  ordresPasses: number;
  /** Ordres passés lors de la dernière journée. */
  ordresDernierJour: number;
  /** Nombre de journées exécutées. */
  journeesExecutees: number;
  enPause: boolean;
};

export async function etatExecutionBot(): Promise<EtatExecutionBot> {
  const dernier = await queryOne<{
    day: string;
    statut: string;
    resume: string;
    created_at: string;
  }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, statut, resume,
            to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
     FROM bot_reports ORDER BY day DESC LIMIT 1`,
  );

  const total = await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM bot_orders");
  const journees = await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM bot_reports");
  const duJour = dernier
    ? await queryOne<{ n: number }>(
        "SELECT count(*)::int AS n FROM bot_orders WHERE day = $1",
        [dernier.day],
      )
    : undefined;

  return {
    derniereExecution: dernier ? String(dernier.day) : null,
    derniereExecutionLe: dernier ? String(dernier.created_at) : null,
    dernierStatut: dernier ? (dernier.statut as StatutBot) : null,
    dernierResume: dernier ? String(dernier.resume) : null,
    ordresPasses: Number(total?.n ?? 0),
    ordresDernierJour: Number(duJour?.n ?? 0),
    journeesExecutees: Number(journees?.n ?? 0),
    enPause: await botEnPause(),
  };
}
