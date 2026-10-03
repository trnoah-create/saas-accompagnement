/**
 * Limites de perte — écrites dans la configuration, appliquées par le code.
 *
 * Fonctions pures : aucune base, aucun réseau, tout est testable.
 * Les pertes sont exprimées en EUROS, pas en pourcentage, et les journées
 * sont découpées de minuit à minuit à l'heure configurée (Paris).
 */
import { euro as euros } from "./format";

/** Fuseau par défaut pour découper les journées. */
export const FUSEAU_PAR_DEFAUT = "Europe/Paris";

// ─── Découpage du temps ──────────────────────────────────────────────

/** Date du jour au format AAAA-MM-JJ, dans le fuseau configuré. */
export function jourLocal(
  instant: Date = new Date(),
  fuseau: string = FUSEAU_PAR_DEFAUT,
): string {
  // en-CA produit directement AAAA-MM-JJ.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: fuseau,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Lundi de la semaine contenant ce jour (semaine ISO). */
export function debutSemaine(jour: string): string {
  const d = new Date(`${jour}T00:00:00Z`);
  // getUTCDay : 0 = dimanche. On ramène au lundi précédent.
  const decalage = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - decalage);
  return d.toISOString().slice(0, 10);
}

/** Premier jour du mois contenant ce jour. */
export function debutMois(jour: string): string {
  return `${jour.slice(0, 7)}-01`;
}

/**
 * Numéro du jour dans une expérience à durée fixe : 1 le jour du
 * démarrage, 2 le lendemain, etc.
 */
export function jourDeLExperience(demarreLe: string, jour: string): number {
  const debut = Date.parse(`${demarreLe}T00:00:00Z`);
  const courant = Date.parse(`${jour}T00:00:00Z`);
  if (!Number.isFinite(debut) || !Number.isFinite(courant)) return 1;
  return Math.floor((courant - debut) / 86400000) + 1;
}

// ─── Évaluation des limites ──────────────────────────────────────────

export type Ouvertures = {
  /** Valeur du portefeuille à l'ouverture de la journée. */
  jour: number | null;
  /** Valeur à l'ouverture du premier jour de la semaine. */
  semaine: number | null;
  /** Valeur à l'ouverture du premier jour du mois. */
  mois: number | null;
};

export type Decision =
  | { action: "continuer"; alerte: false; pertes: Pertes }
  | { action: "alerte"; alerte: true; motif: string; pertes: Pertes }
  | { action: "bloquer_jour"; alerte: true; motif: string; pertes: Pertes }
  | { action: "pause"; alerte: true; motif: string; pertes: Pertes }
  /** Arrêt définitif : seule une réactivation manuelle le lève. */
  | { action: "arret_total"; alerte: true; motif: string; pertes: Pertes };

export type Pertes = {
  /** Perte en euros (valeur positive = perte, 0 ou négatif = pas de perte). */
  jour: number | null;
  semaine: number | null;
  mois: number | null;
  /** Perte depuis le capital de référence, en euros. */
  total: number | null;
};

function perte(valeur: number, ouverture: number | null): number | null {
  if (ouverture === null) return null;
  // Positif = on a perdu de l'argent.
  return ouverture - valeur;
}



/**
 * Décide si le mode peut échanger aujourd'hui.
 *
 * Ordre de priorité : pause mensuelle, puis hebdomadaire, puis blocage du
 * jour, puis simple alerte. La règle la plus grave l'emporte.
 */
/** Seule partie de la configuration dont ce module a besoin. */
export type SeuilsPertes = {
  readonly pertes: {
    readonly alerteJour: number;
    readonly blocageJour: number;
    readonly semaine: number;
    readonly mois: number;
    readonly plancherTotalPct: number;
  };
};

/**
 * @param capitalReference Capital servant de base au plancher total. Omis,
 *   le plancher n'est pas évalué.
 */
export function evaluerLimites(
  valeurActuelle: number,
  ouvertures: Ouvertures,
  config: SeuilsPertes,
  capitalReference?: number,
): Decision {
  const pertes: Pertes = {
    jour: perte(valeurActuelle, ouvertures.jour),
    semaine: perte(valeurActuelle, ouvertures.semaine),
    mois: perte(valeurActuelle, ouvertures.mois),
    total:
      capitalReference === undefined || capitalReference <= 0
        ? null
        : perte(valeurActuelle, capitalReference),
  };

  const seuils = config.pertes;

  // Le plancher total l'emporte sur tout le reste : c'est le garde-fou
  // ultime, et il est définitif.
  if (capitalReference !== undefined && capitalReference > 0) {
    const plancher = capitalReference * (seuils.plancherTotalPct / 100);
    if (valeurActuelle <= plancher) {
      return {
        action: "arret_total",
        alerte: true,
        motif:
          `Plancher total atteint : le portefeuille vaut ${euros(valeurActuelle)}, ` +
          `soit ${seuils.plancherTotalPct} % ou moins du capital de référence de ` +
          `${euros(capitalReference)} (plancher à ${euros(plancher)}). ` +
          `Le bot s'arrête définitivement et attend une réactivation manuelle.`,
        pertes,
      };
    }
  }

  if (pertes.mois !== null && pertes.mois >= seuils.mois) {
    return {
      action: "pause",
      alerte: true,
      motif: `Perte mensuelle de ${euros(pertes.mois)}, au-delà de la limite de ${euros(seuils.mois)}. Le mode se met en pause et attend une réactivation manuelle.`,
      pertes,
    };
  }

  if (pertes.semaine !== null && pertes.semaine >= seuils.semaine) {
    return {
      action: "pause",
      alerte: true,
      motif: `Perte hebdomadaire de ${euros(pertes.semaine)}, au-delà de la limite de ${euros(seuils.semaine)}. Le mode se met en pause et attend une réactivation manuelle.`,
      pertes,
    };
  }

  if (pertes.jour !== null && pertes.jour >= seuils.blocageJour) {
    return {
      action: "bloquer_jour",
      alerte: true,
      motif: `Perte du jour de ${euros(pertes.jour)}, au-delà de la limite de ${euros(seuils.blocageJour)}. Aucun ordre jusqu'à demain.`,
      pertes,
    };
  }

  if (pertes.jour !== null && pertes.jour >= seuils.alerteJour) {
    return {
      action: "alerte",
      alerte: true,
      motif: `Perte du jour de ${euros(pertes.jour)} : seuil d'alerte de ${euros(seuils.alerteJour)} franchi. Les échanges continuent, le blocage est à ${euros(seuils.blocageJour)}.`,
      pertes,
    };
  }

  return { action: "continuer", alerte: false, pertes };
}
