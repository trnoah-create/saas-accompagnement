/**
 * ─────────────────────────────────────────────────────────────────────
 *  RÉGLAGES DU MODE « CLAUDE TRADER »
 *
 *  Tout le cadre est ici. Ces règles sont appliquées par le CODE, jamais
 *  par le modèle : même si Claude propose un ordre qui les dépasse, le
 *  code le refuse. Modifier ce fichier suffit à changer le cadre.
 * ─────────────────────────────────────────────────────────────────────
 */

export const claudeTraderConfig = {
  /** Capital fictif de départ, en euros. */
  capitalDepart: 100,

  /** Fuseau utilisé pour découper les journées, les semaines et les mois. */
  fuseau: "Europe/Paris",

  /** Pertes maximales, en EUROS (valeurs positives). */
  pertes: {
    /** Au-delà, la journée est signalée en alerte mais continue. */
    alerteJour: 2,
    /** Au-delà, plus aucun ordre jusqu'au lendemain. */
    blocageJour: 3,
    /** Au-delà, le mode se met en pause et attend une réactivation. */
    semaine: 6,
    /** Idem, sur le mois calendaire. */
    mois: 15,
  },

  /** Limites sur les ordres. */
  ordres: {
    /** Montant maximal engagé par ordre, en euros. */
    montantMaxEuros: 5,
    /** Nombre maximal d'ordres exécutés dans une journée. */
    maxParJour: 3,
    /** Part maximale d'un seul actif dans le portefeuille, en %. */
    partMaxParActifPct: 40,
    /** Montant minimal, pour éviter les ordres insignifiants. */
    montantMinEuros: 1,
  },

  /** Coûts simulés. */
  couts: {
    /** Frais prélevés sur chaque ordre, en % du montant. */
    fraisPct: 0.1,
    /**
     * Écart achat/vente simulé, en % du prix, réparti de part et d'autre :
     * on achète un peu plus cher et on vend un peu moins cher que le prix
     * affiché, comme sur un vrai marché.
     */
    ecartPct: 0.1,
  },

  /** Actifs autorisés. Aucun autre ne peut être négocié. */
  actifsAutorises: ["BTC", "ETH", "DOGE", "SPY"] as const,

  /** Interdits structurels, vérifiés par le code. */
  interdits: {
    /** Pas d'effet de levier : on n'engage jamais plus que le liquide. */
    effetDeLevier: false,
    /** Pas de vente à découvert : on ne vend que ce qu'on détient. */
    venteADecouvert: false,
  },

  /** Modèle interrogé chaque jour. */
  modele: "claude-opus-5-5",

  /** Nombre de comptes rendus passés transmis au modèle (il n'a pas de mémoire). */
  comptesRendusTransmis: 7,
} as const;

export type ClaudeTraderConfig = typeof claudeTraderConfig;

/** Prix d'achat réel : un peu au-dessus du prix affiché. */
export function prixAchat(prixMarche: number): number {
  return prixMarche * (1 + claudeTraderConfig.couts.ecartPct / 100 / 2);
}

/** Prix de vente réel : un peu en dessous du prix affiché. */
export function prixVente(prixMarche: number): number {
  return prixMarche * (1 - claudeTraderConfig.couts.ecartPct / 100 / 2);
}

/** Frais sur un montant. */
export function frais(montant: number): number {
  return montant * (claudeTraderConfig.couts.fraisPct / 100);
}
