/**
 * Vérification des ordres proposés par le modèle, contre le cadre défini
 * dans config/claude-trader.ts.
 *
 * Fonction pure : aucune base, aucun réseau. Le modèle propose, ce fichier
 * décide. Tout ordre hors cadre est refusé avec un motif lisible, même si
 * le modèle insiste.
 */
import {
  claudeTraderConfig,
  frais,
  prixAchat,
  prixVente,
} from "../../config/claude-trader";
import { euro as euros } from "../format";
import type { Decision } from "./schema";

export type OrdreValide = {
  asset: string;
  side: "buy" | "sell";
  /** Montant de marché engagé, en euros. */
  montant: number;
  reason: string;
};

export type OrdreRefuse = {
  asset: string;
  side: string;
  montant: number;
  reason: string;
  motifRefus: string;
};

export type EtatValidation = {
  cash: number;
  totalValue: number;
  positions: { asset: string; quantity: number }[];
};

export type Prix = Record<string, number>;

export type Verdict = { acceptes: OrdreValide[]; refuses: OrdreRefuse[] };



/**
 * Les ordres sont examinés dans l'ordre proposé, en tenant compte des
 * effets des précédents : le même argent ne peut pas être engagé deux fois,
 * mais vendre puis racheter avec le produit reste possible.
 */
export function validerOrdres(
  decision: Decision,
  etat: EtatValidation,
  prix: Prix,
  config = claudeTraderConfig,
): Verdict {
  const acceptes: OrdreValide[] = [];
  const refuses: OrdreRefuse[] = [];

  let cash = etat.cash;
  const quantites = new Map<string, number>();
  for (const p of etat.positions) quantites.set(p.asset, p.quantity);

  const valeurTotale = () => {
    let total = cash;
    for (const [actif, q] of quantites) total += q * (prix[actif] ?? 0);
    return total;
  };

  for (const o of decision.ordres) {
    const refus = (motifRefus: string) =>
      refuses.push({
        asset: o.actif,
        side: o.sens,
        montant: o.montant,
        reason: o.justification,
        motifRefus,
      });

    if (acceptes.length >= config.ordres.maxParJour) {
      refus(`Plafond de ${config.ordres.maxParJour} ordres par jour déjà atteint.`);
      continue;
    }

    if (!config.actifsAutorises.includes(o.actif as never)) {
      refus(`Actif non autorisé : ${o.actif}.`);
      continue;
    }

    if (!Number.isFinite(o.montant) || o.montant <= 0) {
      refus("Montant invalide.");
      continue;
    }

    if (o.montant > config.ordres.montantMaxEuros + 1e-9) {
      refus(
        `Montant de ${euros(o.montant)} au-dessus du plafond de ${euros(config.ordres.montantMaxEuros)} par ordre.`,
      );
      continue;
    }

    if (o.montant < config.ordres.montantMinEuros - 1e-9) {
      refus(
        `Montant de ${euros(o.montant)} en dessous du minimum de ${euros(config.ordres.montantMinEuros)}.`,
      );
      continue;
    }

    const pm = prix[o.actif];
    if (!Number.isFinite(pm) || pm <= 0) {
      refus("Prix indisponible pour cet actif.");
      continue;
    }

    if (o.sens === "achat") {
      // Écart achat/vente : on paie un peu plus cher que le prix affiché.
      const p = prixAchat(pm);
      const cout = o.montant + frais(o.montant);

      // Pas d'effet de levier : jamais plus que le liquide disponible.
      if (cout > cash + 1e-9) {
        refus(
          `Liquidités insuffisantes : ${euros(cout)} nécessaires, ${euros(cash)} disponibles.`,
        );
        continue;
      }

      // Part maximale par actif, évaluée après l'ordre.
      const quantite = o.montant / p;
      const nouvelleQuantite = (quantites.get(o.actif) ?? 0) + quantite;
      const valeurApres = valeurTotale() - frais(o.montant);
      const partApres = ((nouvelleQuantite * pm) / valeurApres) * 100;

      if (partApres > config.ordres.partMaxParActifPct + 1e-9) {
        refus(
          `${o.actif} représenterait ${partApres.toFixed(1)} % du portefeuille, au-dessus de la limite de ${config.ordres.partMaxParActifPct} %.`,
        );
        continue;
      }

      cash -= cout;
      quantites.set(o.actif, nouvelleQuantite);
      acceptes.push({ asset: o.actif, side: "buy", montant: o.montant, reason: o.justification });
    } else {
      // Pas de vente à découvert : on ne vend que ce qu'on détient.
      const p = prixVente(pm);
      const possede = quantites.get(o.actif) ?? 0;
      const valeurPossedee = possede * p;

      if (possede <= 0) {
        refus(`Aucune position en ${o.actif} : la vente à découvert est interdite.`);
        continue;
      }

      if (o.montant > valeurPossedee + 1e-9) {
        refus(
          `Position insuffisante : ${euros(o.montant)} demandés, ${euros(valeurPossedee)} détenus en ${o.actif}.`,
        );
        continue;
      }

      const quantite = o.montant / p;
      cash += o.montant - frais(o.montant);
      quantites.set(o.actif, possede - quantite);
      acceptes.push({ asset: o.actif, side: "sell", montant: o.montant, reason: o.justification });
    }
  }

  return { acceptes, refuses };
}
