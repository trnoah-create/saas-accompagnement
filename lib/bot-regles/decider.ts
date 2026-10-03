/**
 * Décisions du bot à règles fixes.
 *
 * Fonction pure : aucune base, aucun réseau, aucun appel payant. Tout est
 * mécanique, donc entièrement testable.
 *
 * Ordre des règles pour chaque actif détenu :
 *   1. stop loss   — vente obligatoire si le prix casse le seuil bas ;
 *   2. take profit — vente si l'objectif de gain est atteint ;
 *   3. croisement  — vente si la moyenne courte repasse sous la longue.
 * Puis, pour les actifs non détenus : achat si la moyenne courte est
 * au-dessus de la longue.
 */
import { botReglesConfig, fraisBot, prixAchatBot, prixVenteBot } from "../../config/bot-regles";
import { decide } from "../engine/strategies";
import type { Bar } from "../market/types";

export type PositionBot = {
  asset: string;
  quantity: number;
  prixEntree: number;
};

export type OrdreBot = {
  asset: string;
  side: "buy" | "sell";
  /** Montant de marché engagé, en euros. */
  montant: number;
  raison: string;
};

export type RefusBot = {
  asset: string;
  side: string;
  montant: number;
  raison: string;
  motifRefus: string;
};

export type EtatBot = {
  cash: number;
  positions: PositionBot[];
};

/** Historique par actif, du plus ancien au plus récent, aujourd'hui INCLUS. */
export type Historiques = Record<string, Bar[]>;

export type Prix = Record<string, number>;

export type Plan = { ordres: OrdreBot[]; refus: RefusBot[]; signaux: Record<string, string> };

/**
 * Seule partie de la configuration dont ce module a besoin. Typage
 * volontairement souple : on doit pouvoir passer une variante en test.
 */
export type ReglesBot = {
  readonly actifs: readonly string[];
  readonly strategie: { readonly courte: number; readonly longue: number };
  readonly ordres: {
    readonly cible: number;
    readonly minEuros: number;
    readonly maxEuros: number;
    readonly maxParJour: number;
  };
  readonly quantiteMinimale: Readonly<Record<string, number>>;
  readonly sorties: { readonly stopLossPct: number; readonly takeProfitPct: number };
  readonly couts: { readonly fraisPct: number; readonly ecartPct: number };
};

const euros = (n: number) => `${n.toFixed(2)} €`;
const pct = (n: number) => `${n.toFixed(2)} %`;

export function deciderOrdres(
  etat: EtatBot,
  historiques: Historiques,
  prix: Prix,
  config: ReglesBot = botReglesConfig,
): Plan {
  const ordres: OrdreBot[] = [];
  const refus: RefusBot[] = [];
  const signaux: Record<string, string> = {};

  let cash = etat.cash;
  const positions = new Map(etat.positions.map((p) => [p.asset, p]));

  for (const actif of config.actifs) {
    const bars = historiques[actif];
    const p = prix[actif];

    if (!bars || bars.length === 0 || !Number.isFinite(p) || p <= 0) {
      signaux[actif] = "prix ou historique indisponible";
      continue;
    }

    // Anti-triche : la décision n'utilise que les journées déjà closes.
    const historique = bars.slice(0, -1);
    const voulu = decide("sma_cross", historique, {
      fast: config.strategie.courte,
      slow: config.strategie.longue,
    });

    const position = positions.get(actif);

    if (position && position.quantity > 0) {
      const variation = ((p - position.prixEntree) / position.prixEntree) * 100;
      const seuilStop = -config.sorties.stopLossPct;
      const seuilGain = config.sorties.takeProfitPct;

      let raison: string | null = null;
      if (variation <= seuilStop) {
        raison = `Stop loss : ${pct(variation)} depuis l'achat, sous le seuil de ${pct(seuilStop)}.`;
      } else if (variation >= seuilGain) {
        raison = `Take profit : ${pct(variation)} depuis l'achat, objectif de ${pct(seuilGain)} atteint.`;
      } else if (voulu === "flat") {
        raison = `Croisement baissier : la moyenne ${config.strategie.courte} jours est repassée sous la moyenne ${config.strategie.longue} jours.`;
      }

      signaux[actif] = raison ?? `Conservé (${pct(variation)} depuis l'achat).`;

      if (raison) {
        const montant = position.quantity * prixVenteBot(p);
        if (ordres.length >= config.ordres.maxParJour) {
          refus.push({
            asset: actif,
            side: "sell",
            montant,
            raison,
            motifRefus: `Plafond de ${config.ordres.maxParJour} ordres par jour atteint.`,
          });
        } else {
          ordres.push({ asset: actif, side: "sell", montant, raison });
          cash += montant - fraisBot(montant);
          positions.delete(actif);
        }
      }
      continue;
    }

    // Pas de position : on n'entre que sur signal haussier.
    if (voulu !== "long") {
      signaux[actif] = `Hors marché : la moyenne ${config.strategie.courte} jours reste sous la moyenne ${config.strategie.longue} jours.`;
      continue;
    }

    signaux[actif] = `Croisement haussier : entrée possible.`;
    const raison = `Croisement haussier : la moyenne ${config.strategie.courte} jours est passée au-dessus de la moyenne ${config.strategie.longue} jours.`;

    if (ordres.length >= config.ordres.maxParJour) {
      refus.push({
        asset: actif,
        side: "buy",
        montant: config.ordres.cible,
        raison,
        motifRefus: `Plafond de ${config.ordres.maxParJour} ordres par jour atteint.`,
      });
      continue;
    }

    const prixAchat = prixAchatBot(p);
    const qteMin = config.quantiteMinimale[actif] ?? 0;
    // Montant minimal permettant d'atteindre la quantité négociable.
    const montantPourQteMin = qteMin * prixAchat;

    if (montantPourQteMin > config.ordres.maxEuros + 1e-9) {
      refus.push({
        asset: actif,
        side: "buy",
        montant: montantPourQteMin,
        raison,
        motifRefus: `Quantité minimale de ${qteMin} ${actif} = ${euros(montantPourQteMin)}, au-dessus du plafond de ${euros(config.ordres.maxEuros)} par ordre.`,
      });
      continue;
    }

    // On vise la cible, relevée si besoin pour atteindre la quantité minimale.
    let montant = Math.max(config.ordres.cible, montantPourQteMin);
    montant = Math.min(montant, config.ordres.maxEuros);

    const coutMax = montant + fraisBot(montant);
    if (coutMax > cash + 1e-9) {
      // On réduit à ce que le liquide permet, frais compris.
      montant = cash / (1 + config.couts.fraisPct / 100);
    }

    if (montant < config.ordres.minEuros - 1e-9) {
      refus.push({
        asset: actif,
        side: "buy",
        montant,
        raison,
        motifRefus: `Montant possible de ${euros(Math.max(montant, 0))}, en dessous du minimum de ${euros(config.ordres.minEuros)}.`,
      });
      continue;
    }

    if (montant < montantPourQteMin - 1e-9) {
      refus.push({
        asset: actif,
        side: "buy",
        montant,
        raison,
        motifRefus: `Liquidités insuffisantes pour la quantité minimale de ${qteMin} ${actif} (${euros(montantPourQteMin)} nécessaires).`,
      });
      continue;
    }

    ordres.push({ asset: actif, side: "buy", montant, raison });
    cash -= montant + fraisBot(montant);
    positions.set(actif, { asset: actif, quantity: montant / prixAchat, prixEntree: prixAchat });
  }

  return { ordres, refus, signaux };
}
