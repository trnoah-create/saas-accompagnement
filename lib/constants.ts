/** Capital fictif de départ, crédité à la création du compte. */
export const START_CAPITAL = 1000;

/** Frais appliqués à chaque ordre simulé : 0,1 %. */
export const FEE_RATE = 0.001;

/** Message affiché sur toutes les pages. */
export const DISCLAIMER =
  "Simulation, pas un conseil financier. Les performances passées ne garantissent rien.";

/** Mode « Claude trader » — garde-fous. */
export const CLAUDE_TRADER = {
  /** Part maximale de la valeur du portefeuille engageable sur un seul ordre. */
  maxOrdrePct: 25,
  /** Au-delà de cette perte depuis la veille, plus aucun ordre n'est passé. */
  maxPerteJourPct: 5,
  /** Nombre maximal d'ordres acceptés en une journée. */
  maxOrdresParJour: 6,
  /** Modèle utilisé pour la décision quotidienne. */
  modele: "claude-opus-5-5",
} as const;
