/**
 * ─────────────────────────────────────────────────────────────────────
 *  RÉGLAGES DU BOT AUTOMATIQUE
 *
 *  Le bot est 100 % mécanique : il n'appelle AUCUNE intelligence
 *  artificielle et AUCUNE API payante. Son coût de fonctionnement est nul.
 *
 *  La règle tient en une phrase :
 *    • le prix passe AU-DESSUS de sa moyenne des 50 derniers jours → achat ;
 *    • il repasse EN DESSOUS → vente ;
 *    • et à tout moment, une position qui perd 5 % est vendue (stop loss).
 *
 *  Tout se règle ici, et nulle part ailleurs.
 * ─────────────────────────────────────────────────────────────────────
 */

export type ActifSuivi = {
  id: string;
  /**
   * Part maximale du portefeuille que cet actif peut représenter, en %.
   * Le bot n'achètera jamais au-delà.
   */
  poidsMaxPct: number;
  /** Mettre `false` suffit à désactiver l'actif : le bot l'ignore totalement. */
  actif: boolean;
};

export const botReglesConfig = {
  /** Capital fictif de départ, en euros. */
  capitalDepart: 100,

  /** Fuseau utilisé pour découper journées, semaines et mois. */
  fuseau: "Europe/Paris",

  /**
   * Actifs suivis. Le bot ne touche à rien d'autre.
   *
   * ⚠️ Pour désactiver Solana : passer `actif: false` sur sa ligne. Le bot
   * cesse immédiatement d'en acheter. Une position déjà ouverte reste
   * gérée (stop loss et vente compris) jusqu'à sa fermeture.
   */
  actifs: [
    { id: "BTC", poidsMaxPct: 25, actif: true },
    { id: "ETH", poidsMaxPct: 25, actif: true },
    { id: "SPY", poidsMaxPct: 25, actif: true },
    { id: "QQQ", poidsMaxPct: 25, actif: true },
    { id: "SOL", poidsMaxPct: 10, actif: true },
  ] as readonly ActifSuivi[],

  /** Nombre de jours de la moyenne mobile servant de référence. */
  moyenneMobileJours: 50,

  /** Profondeur d'historique téléchargée par actif. */
  historique: {
    /** Journées demandées : largement plus d'un an. */
    jours: 400,
    /** En dessous, on considère l'historique trop court et on le signale. */
    minimum: 250,
  },

  /** Taille des ordres, en euros. */
  ordres: {
    /** En dessous, on n'entre pas : la poussière ne sert à rien. */
    minEuros: 2,
    /** Nombre maximal d'ordres exécutés dans une journée. */
    maxParJour: 5,
  },

  /**
   * Quantité minimale négociable par actif.
   * Un ordre qui n'atteint pas ce seuil est refusé : mieux vaut ne rien
   * faire qu'exécuter une quantité irréaliste.
   */
  quantiteMinimale: {
    BTC: 0.0001,
    ETH: 0.001,
    SOL: 0.01,
    SPY: 0.001,
    QQQ: 0.001,
  } as Record<string, number>,

  /** Sortie de secours, en % du prix d'entrée. */
  sorties: {
    /** Vente obligatoire si la position perd plus que ça. */
    stopLossPct: 5,
  },

  /**
   * Pertes maximales, en EUROS (valeurs positives).
   *
   * ⚠️ Ces seuils sont écrits ici, dans le code : aucune variable
   * d'environnement ne peut les desserrer par accident.
   */
  pertes: {
    /** Signalé dans le compte rendu, sans blocage. */
    alerteJour: 1,
    /** LIMITE QUOTIDIENNE : atteinte, le bot s'arrête pour la journée. */
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

/** Actifs réellement suivis aujourd'hui (ceux dont `actif` vaut true). */
export function actifsActifs(): ActifSuivi[] {
  return botReglesConfig.actifs.filter((a) => a.actif);
}

/** Identifiants des actifs suivis. */
export function idsActifs(): string[] {
  return actifsActifs().map((a) => a.id);
}

/** Part maximale autorisée pour un actif, en %. 0 si l'actif est désactivé. */
export function poidsMaxPct(id: string): number {
  return botReglesConfig.actifs.find((a) => a.id === id && a.actif)?.poidsMaxPct ?? 0;
}

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
