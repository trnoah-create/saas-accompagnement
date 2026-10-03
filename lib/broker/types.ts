/**
 * ─────────────────────────────────────────────────────────────────────
 *  INTERFACE « COURTIER » — la frontière du projet
 *
 *  Quatre opérations, et rien d'autre :
 *     acheter · vendre · solde · positions
 *
 *  Les RÈGLES du bot (lib/bot-regles/decider.ts) ne connaissent pas cette
 *  interface : ce sont des fonctions pures qui reçoivent des chiffres et
 *  renvoient des intentions d'ordres. C'est l'orchestration (run.ts) qui
 *  traduit ces intentions en appels au courtier.
 *
 *  Conséquence pratique : brancher un vrai courtier plus tard = écrire une
 *  nouvelle implémentation de ces quatre méthodes. Aucune règle de trading
 *  n'a à être touchée.
 *
 *  ⚠️ Un seul courtier existe aujourd'hui : la simulation. Aucun code de
 *  ce dépôt ne parle à un vrai courtier, ne détient d'identifiants et ne
 *  peut engager d'argent réel.
 * ─────────────────────────────────────────────────────────────────────
 */

export type Sens = "buy" | "sell";

/** Ordre à exécuter, exprimé en montant de marché (euros). */
export type OrdreDemande = {
  asset: string;
  /** Montant de marché visé, en euros. */
  montant: number;
  /** Phrase expliquant la décision, conservée dans l'historique. */
  raison: string;
};

export type OrdreExecute = {
  asset: string;
  side: Sens;
  /** Montant de marché réellement engagé. */
  montant: number;
  /** Quantité d'actif effectivement échangée. */
  quantity: number;
  /** Prix réellement obtenu, écart achat/vente inclus. */
  price: number;
  /** Prix affiché au moment de l'ordre, avant écart. */
  prixMarche: number;
  fee: number;
  raison: string;
};

/** Liquidités disponibles et repères du compte. */
export type Solde = {
  /** Argent fictif non investi, en euros. */
  cash: number;
  /** Capital fictif confié au départ. */
  capitalDepart: number;
  /** Date d'ouverture du compte (AAAA-MM-JJ). */
  depuisLe: string;
};

/** Une position ouverte, valorisée au dernier prix connu. */
export type PositionCourtier = {
  asset: string;
  quantity: number;
  /** Prix d'achat moyen pondéré : base du stop loss. */
  prixEntree: number;
  /** Dernier prix de marché connu. */
  prix: number;
  /** quantity × prix. */
  valeur: number;
};

export interface Courtier {
  readonly nom: string;
  /** true signifierait de l'argent réel. Toujours false ici. */
  readonly reel: false;

  /** Liquidités disponibles. */
  solde(): Promise<Solde>;

  /** Positions ouvertes, valorisées au dernier prix connu. */
  positions(): Promise<PositionCourtier[]>;

  /** Achète pour `montant` euros de l'actif. */
  acheter(ordre: OrdreDemande): Promise<OrdreExecute>;

  /** Vend pour `montant` euros de l'actif, sans jamais descendre sous zéro. */
  vendre(ordre: OrdreDemande): Promise<OrdreExecute>;
}

/** Vue d'ensemble d'un compte : dérivée des quatre opérations, pas une 5ᵉ méthode. */
export type EtatCompte = Solde & {
  positions: PositionCourtier[];
  /** cash + valeur de toutes les positions. */
  valeurTotale: number;
};

/** Assemble `solde()` et `positions()` en une vue unique. */
export async function etatDuCompte(courtier: Courtier): Promise<EtatCompte> {
  const solde = await courtier.solde();
  const positions = await courtier.positions();
  const investi = positions.reduce((t, p) => t + p.valeur, 0);
  return { ...solde, positions, valeurTotale: solde.cash + investi };
}
