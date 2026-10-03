/**
 * ─────────────────────────────────────────────────────────────────────
 *  RÉGLAGES DU BOT À RÈGLES FIXES
 *
 *  Ce bot n'appelle AUCUNE API payante : il applique mécaniquement un
 *  croisement de moyennes mobiles. Son coût de fonctionnement est nul.
 *
 *  Tout est paramétrable ici.
 * ─────────────────────────────────────────────────────────────────────
 */

export const botReglesConfig = {
  /** Capital fictif de départ, en euros. */
  capitalDepart: 100,

  /** Durée de l'expérience. Passé ce délai, le bot s'arrête de lui-même. */
  dureeJours: 60,

  /** Fuseau utilisé pour découper journées, semaines et mois. */
  fuseau: "Europe/Paris",

  /** Actifs suivis. Le bot ne touche à rien d'autre. */
  actifs: ["BTC", "ETH"] as const,

  /** Croisement de moyennes mobiles. */
  strategie: {
    /** Moyenne courte, en jours. */
    courte: 20,
    /** Moyenne longue, en jours. */
    longue: 50,
  },

  /** Taille des ordres, en euros. */
  ordres: {
    /** Montant visé à chaque entrée. */
    cible: 6,
    /** Jamais moins que ça : en dessous, on n'entre pas. */
    minEuros: 3,
    /** Jamais plus que ça. */
    maxEuros: 9,
    /** Nombre maximal d'ordres exécutés dans une journée. */
    maxParJour: 4,
  },

  /**
   * Quantité minimale négociable par actif.
   * Un ordre qui n'atteint pas ce seuil est refusé : mieux vaut ne rien
   * faire qu'exécuter une quantité irréaliste.
   */
  quantiteMinimale: {
    BTC: 0.0001,
    ETH: 0.001,
  } as Record<string, number>,

  /** Sorties automatiques, en % du prix d'entrée. */
  sorties: {
    /** Vente obligatoire si le prix descend sous ce seuil. */
    stopLossPct: 2,
    /** Vente si le prix dépasse ce seuil. */
    takeProfitPct: 4,
  },

  /** Pertes maximales, en EUROS (valeurs positives). */
  pertes: {
    /** Signalé mais sans blocage. */
    alerteJour: 2,
    /** Au-delà, plus aucun ordre jusqu'au lendemain. */
    blocageJour: 3,
    /** Au-delà, pause jusqu'à réactivation manuelle. */
    semaine: 6,
    /** Idem sur le mois calendaire. */
    mois: 15,
  },

  /** Coûts simulés. */
  couts: {
    /** Frais prélevés sur chaque ordre, en % du montant. */
    fraisPct: 0.1,
    /** Écart achat/vente simulé, en % du prix, réparti de part et d'autre. */
    ecartPct: 0.1,
  },
} as const;

export type BotReglesConfig = typeof botReglesConfig;

/** Prix d'achat réel : un peu au-dessus du prix affiché. */
export function prixAchatBot(prixMarche: number): number {
  return prixMarche * (1 + botReglesConfig.couts.ecartPct / 100 / 2);
}

/** Prix de vente réel : un peu en dessous du prix affiché. */
export function prixVenteBot(prixMarche: number): number {
  return prixMarche * (1 - botReglesConfig.couts.ecartPct / 100 / 2);
}

export function fraisBot(montant: number): number {
  return montant * (botReglesConfig.couts.fraisPct / 100);
}
