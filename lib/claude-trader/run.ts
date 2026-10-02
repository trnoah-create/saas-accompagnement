/**
 * Exécution quotidienne du mode « Claude trader ».
 *
 * Enchaînement : état du portefeuille → contexte de marché → décision du
 * modèle → validation → exécution via le courtier simulé → compte rendu.
 *
 * À aucun moment un ordre réel n'est passé : le seul courtier disponible
 * est la simulation (voir lib/broker/index.ts).
 */
import "server-only";
import { query, queryOne } from "../db";
import { CLAUDE_TRADER, START_CAPITAL, FEE_RATE } from "../constants";
import { ASSETS, getLastPrice, type AssetId } from "../market";
import { courtier } from "../broker";
import type { OrdreExecute, OrdreRefuse } from "../broker";
import { demanderDecision, rassemblerContexte } from "./decide";
import { perteJourDepassee, validerOrdres, type Prix } from "./valider";

export type Compte = {
  day: string;
  statut: "ordres" | "aucun_ordre" | "en_pause" | "stop_perte" | "echec";
  valeur: number | null;
  gain_jour_pct: number | null;
  valeur_temoin: number | null;
  temoin_gain_pct: number | null;
  resume: string;
  detail: { executes: OrdreExecute[]; refuses: OrdreRefuse[]; analyse?: string };
  erreur: string | null;
};

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
    [pause ? 1 : 0, START_CAPITAL],
  );
}

async function prixCourants(): Promise<Prix> {
  const prix: Prix = {};
  for (const a of ASSETS) {
    const { price } = await getLastPrice(a.id as AssetId);
    prix[a.id] = price;
  }
  return prix;
}

/**
 * Portefeuille témoin « acheter et garder » : au premier jour, le capital
 * est réparti également entre les quatre actifs, puis plus rien ne bouge.
 */
async function valeurTemoin(prix: Prix): Promise<number> {
  const existantes = await query<{ asset: string; quantity: number }>(
    "SELECT asset, quantity FROM claude_benchmark",
  );

  if (existantes.length === 0) {
    const part = START_CAPITAL / ASSETS.length;
    for (const a of ASSETS) {
      const p = prix[a.id];
      if (!p) continue;
      const quantite = (part - part * FEE_RATE) / p;
      await query(
        `INSERT INTO claude_benchmark (asset, quantity) VALUES ($1, $2)
         ON CONFLICT (asset) DO NOTHING`,
        [a.id, quantite],
      );
    }
    return ASSETS.reduce((total, a) => {
      const p = prix[a.id];
      if (!p) return total;
      return total + ((part - part * FEE_RATE) / p) * p;
    }, 0);
  }

  return existantes.reduce(
    (total, b) => total + Number(b.quantity) * (prix[b.asset] ?? 0),
    0,
  );
}

async function valeurVeille(): Promise<number | null> {
  const r = await queryOne<{ valeur: number }>(
    `SELECT valeur FROM claude_reports
     WHERE valeur IS NOT NULL AND day < CURRENT_DATE
     ORDER BY day DESC LIMIT 1`,
  );
  return r ? Number(r.valeur) : null;
}

async function enregistrer(c: Compte): Promise<void> {
  await query(
    `INSERT INTO claude_reports
       (day, statut, valeur, gain_jour_pct, valeur_temoin, temoin_gain_pct, resume, detail, erreur)
     VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (day) DO UPDATE SET
       statut = EXCLUDED.statut, valeur = EXCLUDED.valeur,
       gain_jour_pct = EXCLUDED.gain_jour_pct, valeur_temoin = EXCLUDED.valeur_temoin,
       temoin_gain_pct = EXCLUDED.temoin_gain_pct, resume = EXCLUDED.resume,
       detail = EXCLUDED.detail, erreur = EXCLUDED.erreur`,
    [
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

export async function executerJournee(): Promise<Compte> {
  const broker = courtier();

  // Ceinture et bretelles : si quelqu'un branchait un jour un courtier réel
  // sans le vouloir, on s'arrête ici plutôt que d'engager de l'argent.
  if (broker.reel) {
    throw new Error("Courtier réel détecté : exécution refusée.");
  }

  const base: Omit<Compte, "statut" | "resume"> = {
    day: new Date().toISOString().slice(0, 10),
    valeur: null,
    gain_jour_pct: null,
    valeur_temoin: null,
    temoin_gain_pct: null,
    detail: { executes: [], refuses: [] },
    erreur: null,
  };

  if (await enPause()) {
    const c: Compte = { ...base, statut: "en_pause", resume: "Le mode est en pause : aucun ordre passé." };
    await enregistrer(c);
    return c;
  }

  const prix = await prixCourants();
  const etatAvant = await broker.etat();
  const temoin = await valeurTemoin(prix);
  const veille = await valeurVeille();

  const chiffres = (valeur: number) => ({
    valeur,
    gain_jour_pct: veille === null ? null : ((valeur - veille) / veille) * 100,
    valeur_temoin: temoin,
    temoin_gain_pct: ((temoin - START_CAPITAL) / START_CAPITAL) * 100,
  });

  // Garde-fou de perte quotidienne.
  const perte = perteJourDepassee(etatAvant.totalValue, veille);
  if (perte.depassee) {
    const c: Compte = {
      ...base,
      ...chiffres(etatAvant.totalValue),
      statut: "stop_perte",
      resume: `Perte de ${perte.pct!.toFixed(2)} % depuis la veille : le plafond de ${CLAUDE_TRADER.maxPerteJourPct} % est atteint, aucun ordre n'est passé aujourd'hui.`,
    };
    await enregistrer(c);
    return c;
  }

  const marche = await rassemblerContexte();
  const decision = await demanderDecision(marche, etatAvant);

  // Échec d'appel ou réponse non conforme : AUCUN ordre.
  if (!decision.ok) {
    const c: Compte = {
      ...base,
      ...chiffres(etatAvant.totalValue),
      statut: "echec",
      resume: "Aucun ordre passé : la décision n'a pas pu être obtenue.",
      erreur: decision.erreur,
    };
    await enregistrer(c);
    return c;
  }

  const { acceptes, refuses } = validerOrdres(decision.decision, etatAvant, prix);

  const executes: OrdreExecute[] = [];
  const refusesFinaux = [...refuses];

  for (const o of acceptes) {
    try {
      executes.push(await broker.passerOrdre(o));
    } catch (e) {
      refusesFinaux.push({
        asset: o.asset,
        side: o.side,
        quantity: o.quantity,
        reason: o.reason,
        motifRefus: `Refusé à l'exécution : ${(e as Error).message}`,
      });
    }
  }

  const etatApres = await broker.etat();
  const resume =
    executes.length === 0
      ? "Aucun ordre passé aujourd'hui."
      : `${executes.length} ordre(s) passé(s).` +
        (refusesFinaux.length > 0 ? ` ${refusesFinaux.length} refusé(s).` : "");

  const c: Compte = {
    ...base,
    ...chiffres(etatApres.totalValue),
    statut: executes.length > 0 ? "ordres" : "aucun_ordre",
    resume,
    detail: { executes, refuses: refusesFinaux, analyse: decision.decision.analyse },
  };
  await enregistrer(c);
  return c;
}

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
    statut: r.statut as Compte["statut"],
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
