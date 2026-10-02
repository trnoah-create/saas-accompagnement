import type { Bar } from "../market/types";

export type StrategyId = "buy_and_hold" | "sma_cross";

export type StrategyParams = {
  fast: number;
  slow: number;
};

export const DEFAULT_PARAMS: StrategyParams = { fast: 20, slow: 50 };

export const STRATEGIES: { id: StrategyId; label: string; description: string }[] = [
  {
    id: "buy_and_hold",
    label: "Acheter et garder",
    description:
      "On achète tout au premier jour et on ne touche plus à rien. C'est la référence à battre.",
  },
  {
    id: "sma_cross",
    label: "Croisement de moyennes mobiles",
    description:
      "On achète quand la moyenne courte passe au-dessus de la longue, on vend quand elle repasse dessous.",
  },
];

/** Moyenne des `window` dernières valeurs, ou null si l'historique est trop court. */
export function sma(values: number[], window: number): number | null {
  if (window <= 0 || values.length < window) return null;
  let total = 0;
  for (let i = values.length - window; i < values.length; i++) total += values[i];
  return total / window;
}

/**
 * Décide de la position voulue pour le PROCHAIN jour.
 *
 * ⚠️ Règle anti-triche : `history` ne contient QUE les journées déjà
 * terminées. La bougie du jour d'exécution n'y figure jamais, donc une
 * décision ne peut pas s'appuyer sur un prix encore inconnu.
 *
 * Renvoie "long" (être investi) ou "flat" (être en liquide).
 */
export function decide(
  strategy: StrategyId,
  history: Bar[],
  params: StrategyParams,
): "long" | "flat" {
  if (strategy === "buy_and_hold") {
    // On veut être investi dès qu'on a au moins une journée derrière soi.
    return history.length > 0 ? "long" : "flat";
  }

  const closes = history.map((b) => b.close);
  const rapide = sma(closes, params.fast);
  const lente = sma(closes, params.slow);

  // Tant qu'on n'a pas assez d'historique, on reste en liquide.
  if (rapide === null || lente === null) return "flat";
  return rapide > lente ? "long" : "flat";
}
