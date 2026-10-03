/**
 * Les RÈGLES du bot — et seulement les règles.
 *
 * Fonction pure : aucune base, aucun réseau, aucun courtier, aucun appel
 * payant. On lui donne l'état du portefeuille, les historiques de prix et
 * les prix du jour ; elle renvoie la liste des ordres SOUHAITÉS. C'est
 * l'orchestration (run.ts) qui les fait exécuter par le courtier.
 *
 * Cette séparation est volontaire : les règles ci-dessous n'ont aucune
 * idée de l'existence d'un courtier, simulé ou réel.
 *
 * La règle, en clair :
 *   • le prix clôture AU-DESSUS de sa moyenne des 50 derniers jours → achat ;
 *   • il clôture EN DESSOUS → vente de la position ;
 *   • une position qui perd plus que le stop loss est vendue d'office,
 *     même si la moyenne mobile est toujours favorable.
 *
 * Ordre des vérifications pour un actif détenu :
 *   1. stop loss ;
 *   2. passage sous la moyenne mobile.
 */
import { botReglesConfig } from "../../config/bot-regles";
import { sma } from "../engine/strategies";
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
  /** cash + valeur des positions : base du calcul des plafonds. */
  valeurTotale: number;
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
  readonly actifs: readonly {
    readonly id: string;
    readonly poidsMaxPct: number;
    readonly actif: boolean;
  }[];
  readonly moyenneMobileJours: number;
  readonly ordres: { readonly minEuros: number; readonly maxParJour: number };
  readonly quantiteMinimale: Readonly<Record<string, number>>;
  readonly sorties: { readonly stopLossPct: number };
  readonly couts: { readonly fraisPct: number; readonly ecartPct: number };
};

const euros = (n: number) => `${n.toFixed(2)} €`;
const pct = (n: number) => `${n.toFixed(2)} %`;

/** Coûts calculés à partir de la configuration reçue, jamais d'une globale. */
function couts(config: ReglesBot) {
  return {
    achat: (p: number) => p * (1 + config.couts.ecartPct / 100 / 2),
    vente: (p: number) => p * (1 - config.couts.ecartPct / 100 / 2),
    frais: (m: number) => m * (config.couts.fraisPct / 100),
  };
}

/**
 * Signal d'un actif : sa dernière clôture connue face à sa moyenne mobile.
 *
 * ⚠️ Règle anti-triche : `bars` contient la journée en cours, on la retire.
 * La décision ne s'appuie donc que sur des journées déjà terminées, jamais
 * sur un prix que le bot n'aurait pas pu connaître.
 */
export function signalMoyenneMobile(
  bars: Bar[],
  jours: number,
): { position: "au-dessus" | "en-dessous"; moyenne: number; cloture: number } | null {
  const historique = bars.slice(0, -1);
  const closes = historique.map((b) => b.close);
  const moyenne = sma(closes, jours);
  const cloture = closes.at(-1);
  if (moyenne === null || cloture === undefined) return null;
  return { position: cloture > moyenne ? "au-dessus" : "en-dessous", moyenne, cloture };
}

export function deciderOrdres(
  etat: EtatBot,
  historiques: Historiques,
  prix: Prix,
  config: ReglesBot = botReglesConfig,
): Plan {
  const ordres: OrdreBot[] = [];
  const refus: RefusBot[] = [];
  const signaux: Record<string, string> = {};
  const { achat, vente, frais } = couts(config);

  let cash = etat.cash;
  const positions = new Map(etat.positions.map((p) => [p.asset, p]));
  const jours = config.moyenneMobileJours;

  // La valeur totale sert de référence aux plafonds. Elle est figée au
  // début de la journée : les plafonds ne bougent pas au fil des ordres.
  const valeurTotale = etat.valeurTotale;

  // Actifs à examiner : ceux de la configuration, PLUS ceux qu'on détient
  // encore sans qu'ils y figurent (actif retiré de la liste). Sans cela,
  // une position orpheline ne serait plus jamais revendue.
  const aExaminer: ReglesBot["actifs"][number][] = [...config.actifs];
  for (const p of etat.positions) {
    if (aExaminer.some((a) => a.id === p.asset)) continue;
    aExaminer.push({ id: p.asset, poidsMaxPct: 0, actif: false });
  }

  for (const reglage of aExaminer) {
    const actif = reglage.id;
    const bars = historiques[actif];
    const p = prix[actif];

    if (!bars || bars.length === 0 || !Number.isFinite(p) || p <= 0) {
      signaux[actif] = "prix ou historique indisponible";
      continue;
    }

    const signal = signalMoyenneMobile(bars, jours);
    const position = positions.get(actif);

    if (!signal) {
      signaux[actif] =
        `historique trop court : ${Math.max(bars.length - 1, 0)} journées closes, ` +
        `il en faut ${jours} pour la moyenne mobile`;
      continue;
    }

    // ── Actif détenu : stop loss, puis moyenne mobile ──
    if (position && position.quantity > 0) {
      const variation = ((p - position.prixEntree) / position.prixEntree) * 100;
      const seuilStop = -config.sorties.stopLossPct;

      let raison: string | null = null;
      if (variation <= seuilStop) {
        raison = `Stop loss : ${pct(variation)} depuis l'achat, sous le seuil de ${pct(seuilStop)}.`;
      } else if (signal.position === "en-dessous") {
        raison = `Le prix (${signal.cloture.toFixed(2)}) est repassé sous sa moyenne ${jours} jours (${signal.moyenne.toFixed(2)}).`;
      }

      signaux[actif] = raison ?? `Conservé : prix au-dessus de sa moyenne ${jours} jours (${pct(variation)} depuis l'achat).`;

      if (raison) {
        const montant = position.quantity * vente(p);
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
          cash += montant - frais(montant);
          positions.delete(actif);
        }
      }
      continue;
    }

    // ── Actif non détenu ──

    // Un actif désactivé n'est plus acheté. Une position déjà ouverte
    // continue d'être gérée (cas traité juste au-dessus).
    if (!reglage.actif) {
      signaux[actif] = "actif désactivé dans la configuration : aucun achat.";
      continue;
    }

    // Un actif dont le plafond est nul ne peut rien recevoir.
    if (reglage.poidsMaxPct <= 0) {
      signaux[actif] = "plafond de 0 % : aucun achat possible.";
      continue;
    }

    if (signal.position !== "au-dessus") {
      signaux[actif] = `Hors marché : le prix (${signal.cloture.toFixed(2)}) reste sous sa moyenne ${jours} jours (${signal.moyenne.toFixed(2)}).`;
      continue;
    }

    const raison = `Le prix (${signal.cloture.toFixed(2)}) est passé au-dessus de sa moyenne ${jours} jours (${signal.moyenne.toFixed(2)}).`;
    signaux[actif] = `Signal d'achat : prix au-dessus de sa moyenne ${jours} jours.`;

    if (ordres.length >= config.ordres.maxParJour) {
      refus.push({
        asset: actif,
        side: "buy",
        montant: 0,
        raison,
        motifRefus: `Plafond de ${config.ordres.maxParJour} ordres par jour atteint.`,
      });
      continue;
    }

    // Plafond de concentration : au maximum X % du portefeuille sur cet actif.
    const plafond = valeurTotale * (reglage.poidsMaxPct / 100);
    const prixAchat = achat(p);
    const qteMin = config.quantiteMinimale[actif] ?? 0;
    const montantPourQteMin = qteMin * prixAchat;

    if (montantPourQteMin > plafond + 1e-9) {
      refus.push({
        asset: actif,
        side: "buy",
        montant: montantPourQteMin,
        raison,
        motifRefus: `Quantité minimale de ${qteMin} ${actif} = ${euros(montantPourQteMin)}, au-dessus du plafond de ${reglage.poidsMaxPct} % (${euros(plafond)}).`,
      });
      continue;
    }

    // On vise le plafond, borné par le liquide disponible frais compris.
    let montant = plafond;
    const coutMax = montant + frais(montant);
    if (coutMax > cash + 1e-9) montant = cash / (1 + config.couts.fraisPct / 100);

    if (montant < config.ordres.minEuros - 1e-9) {
      refus.push({
        asset: actif,
        side: "buy",
        montant: Math.max(montant, 0),
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
    cash -= montant + frais(montant);
    positions.set(actif, { asset: actif, quantity: montant / prixAchat, prixEntree: prixAchat });
  }

  return { ordres, refus, signaux };
}
