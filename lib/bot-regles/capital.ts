/**
 * Capital de référence, mois par mois.
 *
 * Le capital de référence est la base du plancher total (85 %). Sans
 * réinvestissement, il reste égal au capital de départ pour toujours.
 * Avec réinvestissement, il monte des gains de chaque mois clos.
 */
import "server-only";
import { query, queryOne } from "../db";
import { botReglesConfig as cfg } from "../../config/bot-regles";
import { calculerCapitalSuivant, moisDe } from "./reinvestissement";

export { moisDe };

export type MoisCapital = {
  /** AAAA-MM */
  mois: string;
  capitalReference: number;
  valeurDebut: number | null;
  valeurFin: number | null;
  gainReinvesti: number;
  /** true quand le mois est terminé et son gain arbitré. */
  cloture: boolean;
};

function versMois(r: Record<string, unknown>): MoisCapital {
  return {
    mois: String(r.mois),
    capitalReference: Number(r.capital_reference),
    valeurDebut: r.valeur_debut === null ? null : Number(r.valeur_debut),
    valeurFin: r.valeur_fin === null ? null : Number(r.valeur_fin),
    gainReinvesti: Number(r.gain_reinvesti ?? 0),
    cloture: Number(r.cloture ?? 0) === 1,
  };
}

/** Valeur de clôture du dernier jour enregistré d'un mois donné. */
async function valeurFinDeMois(mois: string): Promise<number | null> {
  const r = await queryOne<{ close_value: number }>(
    `SELECT close_value FROM bot_equity
     WHERE to_char(day, 'YYYY-MM') = $1 ORDER BY day DESC LIMIT 1`,
    [mois],
  );
  return r ? Number(r.close_value) : null;
}

/**
 * Garantit qu'une ligne existe pour le mois en cours, en clôturant le mois
 * précédent si besoin, et renvoie le capital de référence applicable.
 *
 * Si plusieurs mois ont été sautés (bot à l'arrêt), le gain est arbitré sur
 * l'ensemble de la période, en une seule fois.
 */
export async function capitalDuMois(
  jour: string,
  valeurActuelle: number,
  /** Surchargeable pour les tests ; par défaut, la configuration. */
  reinvestir: boolean = cfg.reinvestissement.actif,
): Promise<MoisCapital> {
  const mois = moisDe(jour);

  const existant = await queryOne<Record<string, unknown>>(
    "SELECT * FROM bot_capital WHERE mois = $1",
    [mois],
  );
  if (existant) return versMois(existant);

  const precedent = await queryOne<Record<string, unknown>>(
    "SELECT * FROM bot_capital WHERE mois < $1 ORDER BY mois DESC LIMIT 1",
    [mois],
  );

  // Premier mois de l'expérience.
  if (!precedent) {
    await query(
      `INSERT INTO bot_capital (mois, capital_reference, valeur_debut) VALUES ($1, $2, $3)
       ON CONFLICT (mois) DO NOTHING`,
      [mois, cfg.capitalDepart, valeurActuelle],
    );
    const cree = await queryOne<Record<string, unknown>>(
      "SELECT * FROM bot_capital WHERE mois = $1",
      [mois],
    );
    return cree
      ? versMois(cree)
      : {
          mois,
          capitalReference: cfg.capitalDepart,
          valeurDebut: valeurActuelle,
          valeurFin: null,
          gainReinvesti: 0,
          cloture: false,
        };
  }

  // Clôture du mois précédent, puis arbitrage du gain.
  const ancien = versMois(precedent);
  const valeurFin = (await valeurFinDeMois(ancien.mois)) ?? valeurActuelle;
  const { capital, gainReinvesti } = calculerCapitalSuivant(
    ancien.capitalReference,
    valeurFin,
    reinvestir,
  );

  await query(
    "UPDATE bot_capital SET valeur_fin = $1, gain_reinvesti = $2, cloture = 1 WHERE mois = $3",
    [valeurFin, gainReinvesti, ancien.mois],
  );
  await query(
    `INSERT INTO bot_capital (mois, capital_reference, valeur_debut) VALUES ($1, $2, $3)
     ON CONFLICT (mois) DO NOTHING`,
    [mois, capital, valeurActuelle],
  );

  return {
    mois,
    capitalReference: capital,
    valeurDebut: valeurActuelle,
    valeurFin: null,
    gainReinvesti: 0,
    cloture: false,
  };
}

/** Met à jour la valeur courante du mois en cours, pour l'affichage. */
export async function suivreValeurDuMois(jour: string, valeur: number): Promise<void> {
  await query("UPDATE bot_capital SET valeur_fin = $1 WHERE mois = $2", [valeur, moisDe(jour)]);
}

/** Historique mois par mois, du plus récent au plus ancien. */
export async function historiqueCapital(limite = 36): Promise<MoisCapital[]> {
  const rows = await query<Record<string, unknown>>(
    "SELECT * FROM bot_capital ORDER BY mois DESC LIMIT $1",
    [limite],
  );
  return rows.map(versMois);
}
