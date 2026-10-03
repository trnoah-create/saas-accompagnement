/**
 * Exécution quotidienne du bot à règles fixes.
 *
 * Aucun appel à une API payante : la décision est purement mécanique.
 * Enchaînement : état → durée de l'expérience → limites de perte →
 * décision → exécution via le courtier simulé → compte rendu.
 */
import "server-only";
import { query, queryOne } from "../db";
import { botReglesConfig as cfg, fraisBot } from "../../config/bot-regles";
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
import { etatBot, passerOrdreBot, COURTIER_REEL, type OrdreExecuteBot } from "./courtier";

export { jourDeLExperience };

export type StatutBot =
  | "ordres"
  | "aucun_ordre"
  | "en_pause"
  | "blocage_jour"
  | "pause_auto"
  | "termine";

export type CompteBot = {
  day: string;
  statut: StatutBot;
  valeur: number | null;
  gain_jour_pct: number | null;
  valeur_temoin: number | null;
  temoin_gain_pct: number | null;
  resume: string;
  detail: {
    executes: OrdreExecuteBot[];
    refuses: RefusBot[];
    signaux?: Record<string, string>;
    pertes?: Pertes;
    alerte?: string;
    jourDeLExperience?: number;
  };
  erreur: string | null;
};

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
    const part = cfg.capitalDepart / cfg.actifs.length;
    const investi = part - fraisBot(part);
    for (const a of cfg.actifs) {
      const p = prix[a];
      if (!p) continue;
      await query(
        `INSERT INTO bot_benchmark (asset, quantity) VALUES ($1, $2)
         ON CONFLICT (asset) DO NOTHING`,
        [a, investi / p],
      );
    }
    return cfg.actifs.reduce((t, a) => (prix[a] ? t + investi : t), 0);
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
  if (COURTIER_REEL) throw new Error("Courtier réel détecté : exécution refusée.");

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
    const c: CompteBot = { ...base, statut: "en_pause", resume: "Le bot est en pause : aucun ordre passé." };
    await enregistrer(c);
    return c;
  }

  const etat = await etatBot();
  const numeroJour = jourDeLExperience(etat.demarreLe, jour);

  // Prix et historiques des actifs suivis.
  const prix: Prix = {};
  const historiques: Historiques = {};
  for (const a of cfg.actifs) {
    const { bars } = await getPrices(a as AssetId, 200);
    historiques[a] = bars as Bar[];
    prix[a] = bars.at(-1)?.close ?? 0;
  }

  const temoin = await valeurTemoin(prix);
  const ouvertures = await suivreValeur(jour, etat.totalValue);

  const chiffres = (valeur: number) => ({
    valeur,
    gain_jour_pct:
      ouvertures.jour === null || ouvertures.jour === 0
        ? null
        : ((valeur - ouvertures.jour) / ouvertures.jour) * 100,
    valeur_temoin: temoin,
    temoin_gain_pct: ((temoin - cfg.capitalDepart) / cfg.capitalDepart) * 100,
  });

  // ── Fin de l'expérience ──
  if (numeroJour > cfg.dureeJours) {
    const c: CompteBot = {
      ...base,
      ...chiffres(etat.totalValue),
      statut: "termine",
      resume: `Expérience terminée : ${cfg.dureeJours} jours écoulés depuis le ${etat.demarreLe}. Le bot ne passe plus d'ordre.`,
      detail: { executes: [], refuses: [], jourDeLExperience: numeroJour },
    };
    await enregistrer(c);
    return c;
  }

  // ── Limites de perte ──
  const limites = evaluerLimites(etat.totalValue, ouvertures, cfg);

  if (limites.action === "pause") {
    await mettreBotEnPause(true);
    const c: CompteBot = {
      ...base,
      ...chiffres(etat.totalValue),
      statut: "pause_auto",
      resume: limites.motif,
      detail: { executes: [], refuses: [], pertes: limites.pertes, jourDeLExperience: numeroJour },
    };
    await enregistrer(c);
    return c;
  }

  if (limites.action === "bloquer_jour") {
    const c: CompteBot = {
      ...base,
      ...chiffres(etat.totalValue),
      statut: "blocage_jour",
      resume: limites.motif,
      detail: { executes: [], refuses: [], pertes: limites.pertes, jourDeLExperience: numeroJour },
    };
    await enregistrer(c);
    return c;
  }

  const alerte = limites.action === "alerte" ? limites.motif : undefined;

  // ── Décision mécanique, puis exécution ──
  const plan = deciderOrdres(
    { cash: etat.cash, positions: etat.positions },
    historiques,
    prix,
  );

  const executes: OrdreExecuteBot[] = [];
  const refuses: RefusBot[] = [...plan.refus];

  for (const o of plan.ordres) {
    try {
      executes.push(await passerOrdreBot({ ...o, raison: o.raison }));
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
  await suivreValeur(jour, apres.totalValue);

  const resume =
    executes.length === 0
      ? refuses.length > 0
        ? `Aucun ordre : ${refuses.length} refusé(s) par les règles.`
        : "Aucun signal aujourd'hui : le bot reste en place."
      : `${executes.length} ordre(s) passé(s)` +
        (refuses.length > 0 ? `, ${refuses.length} refusé(s).` : ".");

  const c: CompteBot = {
    ...base,
    ...chiffres(apres.totalValue),
    statut: executes.length > 0 ? "ordres" : "aucun_ordre",
    resume,
    detail: {
      executes,
      refuses,
      signaux: plan.signaux,
      pertes: limites.pertes,
      alerte,
      jourDeLExperience: numeroJour,
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
