/**
 * Interface « courtier ».
 *
 * ⚠️ Un seul courtier existe : la simulation. Aucun code de ce dépôt ne
 * parle à un vrai courtier, ne détient d'identifiants bancaires et ne peut
 * engager d'argent réel. L'interface sert à rendre cette frontière
 * explicite et vérifiable, pas à préparer un branchement automatique.
 */
import type { AssetId } from "../market/assets";

export type Sens = "buy" | "sell";

/** Ordre demandé, avant toute vérification. */
export type OrdreDemande = {
  asset: AssetId;
  side: Sens;
  /** Quantité d'actif. */
  quantity: number;
  /** Justification, reprise dans le compte rendu. */
  reason: string;
};

export type OrdreExecute = {
  asset: string;
  side: Sens;
  quantity: number;
  price: number;
  fee: number;
  reason: string;
};

export type OrdreRefuse = {
  asset: string;
  side: string;
  quantity: number;
  reason: string;
  /** Pourquoi l'ordre a été refusé. */
  motifRefus: string;
};

export type EtatCompte = {
  cash: number;
  startCapital: number;
  positions: { asset: string; quantity: number; price: number; value: number }[];
  totalValue: number;
};

export interface Courtier {
  /** Nom affiché dans l'interface et les comptes rendus. */
  readonly nom: string;
  /** true signifierait de l'argent réel. Toujours false ici. */
  readonly reel: false;

  etat(): Promise<EtatCompte>;
  passerOrdre(ordre: OrdreDemande): Promise<OrdreExecute>;
}
