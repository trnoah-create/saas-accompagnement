/**
 * Exécution quotidienne du mode « Claude trader ».
 *
 * Enchaînement : état du portefeuille → limites de perte → contexte de
 * marché → décision du modèle → validation contre le cadre → exécution via
 * le courtier simulé → compte rendu.
 *
 * Aucun ordre réel n'est possible : le seul courtier est la simulation.
 */
import "server-only";
import { query, queryOne } from "../db";
import { claudeTraderConfig as cfg, frais } from "../../config/claude-trader";
import { ASSETS, getLastPrice, type AssetId } from "../market";
import { courtier } from "../broker";
import type { OrdreExecute, OrdreRefuse } from "../broker";
import { demanderDecision, rassemblerContexte, type CompteRenduBref } from "./decide";
import { validerOrdres, type Prix } from "./valider";
import {
  debutMois,
  debutSemaine,
  evaluerLimites,
  jourLocal,
  type Pertes,
} from "../limites";

export type Statut =
  | "ordres"
  | "aucun_ordre"
  | "en_pause"
  | "blocage_jour"
  | "pause_auto"
  | "echec";

export type Compte = {
  day: string;
  statut: Statut;
  valeur: number | null;
  gain_jour_pct: number | null;
  valeur_temoin: number | null;
  temoin_gain_pct: number | null;
  resume: string;
  detail: {
    executes: OrdreExecute[];
    refuses: OrdreRefuse[];
    analyse?: string;
    pertes?: Pertes;
    alerte?: string;
  };
  erreur: string | null;
};

// ─── Pause ───────────────────────────────────────────────────────────

export async function enPause(): Promise<boolean> {
  const r = await queryOne<{ paused: number }>(
    "SELECT paused FROM claude_portfolio WHERE id = 1",
  );
  return Number(r?.paused ?? 0) === 1;
}

export async function mettreEnPause(pause: boolean): Promise<void> {
  await query(
    `INSERT INTO claude_portfolio (id, cash, start_capital, paused) VALUES (1, $2, $2, $1)
     ON CONFLICT (id) DO UPDATE SET paused = $1`,
    [pause ? 1 : 0, cfg.capitalDepart],
  );
}

// ─── Valeurs quotidiennes ────────────────────────────────────────────

/** Enregistre la valeur du jour et renvoie les valeurs d'ouverture. */
async function suivreValeur(jour: string, valeur: number) {
  await query(
    `INSERT INTO claude_equity (day, open_value, close_value) VALUES ($1, $2, $2)
     ON CONFLICT (day) DO UPDATE SET close_value = $2`,
    [jour, valeur],
  );

  const ouverture = async (depuis: string): Promise<number | null> => {
    const r = await queryOne<{ open_value: number }>(
      `SELECT open_value FROM claude_equity WHERE day >= $1 ORDER BY day ASC LIMIT 1`,
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

async function prixCourants(): Promise<Prix> {
  const prix: Prix = {};
  for (const a of ASSETS) {
    const { price } = await getLastPrice(a.id as AssetId);
    prix[a.id] = price;
  }
  return prix;
}

/**
 * Témoin figé au premier jour : le capital est réparti également entre les
 * quatre actifs, frais inclus, puis plus rien ne bouge.
 */
async function valeurTemoin(prix: Prix): Promise<number> {
  const existantes = await query<{ asset: string; quantity: number }>(
    "SELECT asset, quantity FROM claude_benchmark",
  );

  if (existantes.length === 0) {
    const part = cfg.capitalDepart / ASSETS.length;
    const investi = part - frais(part);
    for (const a of ASSETS) {
      const p = prix[a.id];
      if (!p) continue;
      await query(
        `INSERT INTO claude_benchmark (asset, quantity) VALUES ($1, $2)
         ON CONFLICT (asset) DO NOTHING`,
        [a.id, investi / p],
      );
    }
    return ASSETS.reduce((t, a) => (prix[a.id] ? t + investi : t), 0);
  }

  return existantes.reduce(
    (t, b) => t + Number(b.quantity) * (prix[b.asset] ?? 0),
    0,
  );
}

// ─── Comptes rendus ──────────────────────────────────────────────────

async function enregistrer(c: Compte): Promise<void> {
  await query(
    `INSERT INTO claude_reports
       (day, statut, valeur, gain_jour_pct, valeur_temoin, temoin_gain_pct, resume, detail, erreur)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (day) DO UPDATE SET
       statut = EXCLUDED.statut, valeur = EXCLUDED.valeur,
       gain_jour_pct = EXCLUDED.gain_jour_pct, valeur_temoin = EXCLUDED.valeur_temoin,
       temoin_gain_pct = EXCLUDED.temoin_gain_pct, resume = EXCLUDED.resume,
       detail = EXCLUDED.detail, erreur = EXCLUDED.erreur`,
    [
      c.day,
      c.statut,
      c.valeur,
      c.gain_jour_pct,
      c.valeur_temoin,
      c.temoin_gain_pct,
      c.resume,
      JSON.stringify(c.detail),
      c.erreur,
    ],
  );
}

async function derniersComptes(limite: number): Promise<CompteRenduBref[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, statut, resume, valeur
     FROM claude_reports ORDER BY day DESC LIMIT $1`,
    [limite],
  );
  return rows
    .map((r) => ({
      day: String(r.day),
      statut: String(r.statut),
      resume: String(r.resume ?? ""),
      valeur: r.valeur === null ? null : Number(r.valeur),
    }))
    .reverse();
}

// ─── Exécution d'une journée ─────────────────────────────────────────

export async function executerJournee(maintenant = new Date()): Promise<Compte> {
  const broker = courtier();

  // Ceinture et bretelles : si un courtier réel apparaissait un jour, on
  // s'arrête ici plutôt que d'engager de l'argent.
  if (broker.reel) throw new Error("Courtier réel détecté : exécution refusée.");

  const jour = jourLocal(maintenant);
  const base: Omit<Compte, "statut" | "resume"> = {
    day: jour,
    valeur: null,
    gain_jour_pct: null,
    valeur_temoin: null,
    temoin_gain_pct: null,
    detail: { executes: [], refuses: [] },
    erreur: null,
  };

  if (await enPause()) {
    const c: Compte = {
      ...base,
      statut: "en_pause",
      resume: "Le mode est en pause : aucun ordre passé.",
    };
    await enregistrer(c);
    return c;
  }

  const prix = await prixCourants();
  const etatAvant = await broker.etat();
  const temoin = await valeurTemoin(prix);
  const ouvertures = await suivreValeur(jour, etatAvant.totalValue);

  const chiffres = (valeur: number) => ({
    valeur,
    gain_jour_pct:
      ouvertures.jour === null || ouvertures.jour === 0
        ? null
        : ((valeur - ouvertures.jour) / ouvertures.jour) * 100,
    valeur_temoin: temoin,
    temoin_gain_pct: ((temoin - cfg.capitalDepart) / cfg.capitalDepart) * 100,
  });

  // ── Limites de perte, appliquées avant toute décision ──
  const limites = evaluerLimites(etatAvant.totalValue, ouvertures);

  if (limites.action === "pause") {
    await mettreEnPause(true);
    const c: Compte = {
      ...base,
      ...chiffres(etatAvant.totalValue),
      statut: "pause_auto",
      resume: limites.motif,
      detail: { executes: [], refuses: [], pertes: limites.pertes },
    };
    await enregistrer(c);
    return c;
  }

  if (limites.action === "bloquer_jour") {
    const c: Compte = {
      ...base,
      ...chiffres(etatAvant.totalValue),
      statut: "blocage_jour",
      resume: limites.motif,
      detail: { executes: [], refuses: [], pertes: limites.pertes },
    };
    await enregistrer(c);
    return c;
  }

  const alerte = limites.action === "alerte" ? limites.motif : undefined;

  // ── Décision ──
  const marche = await rassemblerContexte();
  const recents = await derniersComptes(cfg.comptesRendusTransmis);
  const decision = await demanderDecision(marche, etatAvant, recents);

  // Échec d'appel ou réponse non conforme : AUCUN ordre.
  if (!decision.ok) {
    const c: Compte = {
      ...base,
      ...chiffres(etatAvant.totalValue),
      statut: "echec",
      resume: "Aucun ordre passé : la décision n'a pas pu être obtenue.",
      detail: { executes: [], refuses: [], pertes: limites.pertes, alerte },
      erreur: decision.erreur,
    };
    await enregistrer(c);
    return c;
  }

  // ── Validation puis exécution ──
  const { acceptes, refuses } = validerOrdres(decision.decision, etatAvant, prix);
  const executes: OrdreExecute[] = [];
  const refusesFinaux: OrdreRefuse[] = [...refuses];

  for (const o of acceptes) {
    try {
      executes.push(await broker.passerOrdre(o));
    } catch (e) {
      refusesFinaux.push({
        asset: o.asset,
        side: o.side,
        montant: o.montant,
        reason: o.reason,
        motifRefus: `Refusé à l'exécution : ${(e as Error).message}`,
      });
    }
  }

  const etatApres = await broker.etat();
  await suivreValeur(jour, etatApres.totalValue);

  const resume =
    executes.length === 0
      ? refusesFinaux.length > 0
        ? `Aucun ordre passé : ${refusesFinaux.length} proposition(s) refusée(s) par le cadre.`
        : "Aucun ordre aujourd'hui."
      : `${executes.length} ordre(s) passé(s)` +
        (refusesFinaux.length > 0 ? `, ${refusesFinaux.length} refusé(s) par le cadre.` : ".");

  const c: Compte = {
    ...base,
    ...chiffres(etatApres.totalValue),
    statut: executes.length > 0 ? "ordres" : "aucun_ordre",
    resume,
    detail: {
      executes,
      refuses: refusesFinaux,
      analyse: decision.decision.analyse,
      pertes: limites.pertes,
      alerte,
    },
  };
  await enregistrer(c);
  return c;
}

// ─── Lecture pour l'interface ────────────────────────────────────────

export type CompteRenduLigne = Compte & { created_at: string };

export async function historique(limite = 60): Promise<CompteRenduLigne[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, statut, valeur, gain_jour_pct,
            valeur_temoin, temoin_gain_pct, resume, detail, erreur,
            to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
     FROM claude_reports ORDER BY day DESC LIMIT $1`,
    [limite],
  );

  return rows.map((r) => ({
    day: String(r.day),
    statut: r.statut as Statut,
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

function parseDetail(v: unknown): Compte["detail"] {
  if (typeof v === "object" && v !== null) return v as Compte["detail"];
  try {
    return JSON.parse(String(v ?? "{}")) as Compte["detail"];
  } catch {
    return { executes: [], refuses: [] };
  }
}
