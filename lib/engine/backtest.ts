import { FEE_RATE } from "../constants";
import type { Bar } from "../market/types";
import { decide, type StrategyId, type StrategyParams } from "./strategies";

export type BacktestTrade = {
  day: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  fee: number;
};

export type BacktestResult = {
  startCapital: number;
  finalValue: number;
  /** Gain total en pourcentage. */
  returnPct: number;
  /** Pire chute depuis un sommet, en pourcentage (toujours ≤ 0). */
  maxDrawdownPct: number;
  orderCount: number;
  totalFees: number;
  trades: BacktestTrade[];
  /** Valeur du portefeuille jour par jour. */
  equity: { day: string; value: number }[];
};

/**
 * Rejoue une stratégie sur des prix passés.
 *
 * Déroulé d'une journée i :
 *   1. on décide à partir des journées 0 … i-1 UNIQUEMENT ;
 *   2. on exécute à l'OUVERTURE de la journée i ;
 *   3. on valorise le portefeuille à la CLÔTURE de la journée i.
 *
 * Décider la veille et exécuter à l'ouverture du lendemain est ce qui
 * garantit qu'aucune décision n'utilise un prix encore inconnu.
 */
export function runBacktest(
  bars: Bar[],
  strategy: StrategyId,
  params: StrategyParams,
  startCapital: number,
): BacktestResult {
  let cash = startCapital;
  let quantity = 0;
  const trades: BacktestTrade[] = [];
  const equity: { day: string; value: number }[] = [];

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    // Historique strictement antérieur : la bougie du jour est exclue.
    const history = bars.slice(0, i);
    const voulu = decide(strategy, history, params);
    const prixExec = bar.open;

    if (voulu === "long" && quantity === 0 && cash > 0) {
      const fee = cash * FEE_RATE;
      const investi = cash - fee;
      quantity = investi / prixExec;
      cash = 0;
      trades.push({ day: bar.day, side: "buy", price: prixExec, quantity, fee });
    } else if (voulu === "flat" && quantity > 0) {
      const brut = quantity * prixExec;
      const fee = brut * FEE_RATE;
      cash = brut - fee;
      trades.push({ day: bar.day, side: "sell", price: prixExec, quantity, fee });
      quantity = 0;
    }

    equity.push({ day: bar.day, value: cash + quantity * bar.close });
  }

  const finalValue = equity.at(-1)?.value ?? startCapital;

  return {
    startCapital,
    finalValue,
    returnPct: ((finalValue - startCapital) / startCapital) * 100,
    maxDrawdownPct: maxDrawdown(equity.map((e) => e.value)),
    orderCount: trades.length,
    totalFees: trades.reduce((s, t) => s + t.fee, 0),
    trades,
    equity,
  };
}

/** Pire chute depuis un sommet, en %. Renvoie une valeur négative ou 0. */
export function maxDrawdown(values: number[]): number {
  let sommet = -Infinity;
  let pire = 0;
  for (const v of values) {
    if (v > sommet) sommet = v;
    if (sommet > 0) {
      const chute = ((v - sommet) / sommet) * 100;
      if (chute < pire) pire = chute;
    }
  }
  return pire;
}
