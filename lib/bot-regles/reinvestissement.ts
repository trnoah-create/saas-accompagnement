/**
 * Calcul du capital de référence d'un mois sur l'autre.
 *
 * Fonction pure : aucune base, aucun réseau. C'est la seule règle du
 * réinvestissement, et elle tient en trois lignes.
 *
 * Le capital de référence sert de base au PLANCHER TOTAL. Le réinvestir,
 * c'est donc remonter le plancher : les gains acquis sont verrouillés.
 *
 * Règle : les gains montent le capital de référence, les pertes ne le
 * baissent JAMAIS. Il ne peut que monter ou rester stable.
 */

export type CapitalSuivant = {
  /** Capital de référence du mois à venir. */
  capital: number;
  /** Part du gain réinvestie (0 si perte, ou si l'option est désactivée). */
  gainReinvesti: number;
};

export function calculerCapitalSuivant(
  capitalReference: number,
  valeurFinDeMois: number,
  reinvestir: boolean,
): CapitalSuivant {
  if (!reinvestir) return { capital: capitalReference, gainReinvesti: 0 };

  const gain = valeurFinDeMois - capitalReference;
  // Une perte ne touche pas au capital de référence.
  if (!Number.isFinite(gain) || gain <= 0) {
    return { capital: capitalReference, gainReinvesti: 0 };
  }

  return { capital: capitalReference + gain, gainReinvesti: gain };
}

/** Mois d'un jour AAAA-MM-JJ, au format AAAA-MM. */
export function moisDe(jour: string): string {
  return jour.slice(0, 7);
}
