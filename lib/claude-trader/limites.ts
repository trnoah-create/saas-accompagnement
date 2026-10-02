/**
 * Limites de perte — appliquées par le code, jamais par le modèle.
 *
 * Fonctions pures : aucune base, aucun réseau, tout est testable.
 * Les pertes sont exprimées en EUROS, pas en pourcentage, et les journées
 * sont découpées de minuit à minuit à l'heure configurée (Paris).
 */
import { claudeTraderConfig } from "../../config/claude-trader";
import { euro as euros } from "../format";

// ─── Découpage du temps ──────────────────────────────────────────────

/** Date du jour au format AAAA-MM-JJ, dans le fuseau configuré. */
export function jourLocal(
  instant: Date = new Date(),
  fuseau: string = claudeTraderConfig.fuseau,
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
  | { action: "pause"; alerte: true; motif: string; pertes: Pertes };

export type Pertes = {
  /** Perte en euros (valeur positive = perte, 0 ou négatif = pas de perte). */
  jour: number | null;
  semaine: number | null;
  mois: number | null;
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
export function evaluerLimites(
  valeurActuelle: number,
  ouvertures: Ouvertures,
  config = claudeTraderConfig,
): Decision {
  const pertes: Pertes = {
    jour: perte(valeurActuelle, ouvertures.jour),
    semaine: perte(valeurActuelle, ouvertures.semaine),
    mois: perte(valeurActuelle, ouvertures.mois),
  };

  const seuils = config.pertes;

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
