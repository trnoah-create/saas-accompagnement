/**
 * Interface « courtier ».
 *
 * ⚠️ Un seul courtier existe : la simulation. Aucun code de ce dépôt ne
 * parle à un vrai courtier, ne détient d'identifiants et ne peut engager
 * d'argent réel. L'interface rend cette frontière explicite et vérifiable.
 */

export type Sens = "buy" | "sell";

/** Ordre à exécuter, exprimé en montant de marché (euros). */
export type OrdreDemande = {
  asset: string;
  side: Sens;
  montant: number;
  reason: string;
};

export type OrdreExecute = {
  asset: string;
  side: Sens;
  /** Montant de marché engagé. */
  montant: number;
  /** Quantité d'actif effectivement échangée. */
  quantity: number;
  /** Prix réellement obtenu, écart achat/vente inclus. */
  price: number;
  /** Prix affiché au moment de l'ordre, avant écart. */
  prixMarche: number;
  fee: number;
  reason: string;
};

export type OrdreRefuse = {
  asset: string;
  side: string;
  montant: number;
  reason: string;
  motifRefus: string;
};

export type EtatCompte = {
  cash: number;
  startCapital: number;
  positions: { asset: string; quantity: number; price: number; value: number }[];
  totalValue: number;
};

export interface Courtier {
  readonly nom: string;
  /** true signifierait de l'argent réel. Toujours false ici. */
  readonly reel: false;

  etat(): Promise<EtatCompte>;
  passerOrdre(ordre: OrdreDemande): Promise<OrdreExecute>;
}
