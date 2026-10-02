/**
 * Tests du moteur. Exécution : npm test
 */
import assert from "node:assert/strict";
import { runBacktest, maxDrawdown } from "../lib/engine/backtest";
import { decide, sma } from "../lib/engine/strategies";
import type { Bar } from "../lib/market/types";

let reussis = 0;
function test(nom: string, fn: () => void) {
  try {
    fn();
    reussis++;
    console.log(`  ✓ ${nom}`);
  } catch (e) {
    console.error(`  ✗ ${nom}\n    ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

function serie(closes: number[]): Bar[] {
  return closes.map((c, i) => ({
    day: `2025-01-${String(i + 1).padStart(2, "0")}`,
    open: c,
    high: c * 1.01,
    low: c * 0.99,
    close: c,
  }));
}

console.log("\nAnti-triche avec le futur");

test("modifier le futur ne change aucune décision passée", () => {
  // Deux séries identiques jusqu'au jour 40, puis radicalement différentes.
  const debut = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 3) * 10);
  const calme = [...debut, ...Array.from({ length: 40 }, () => 100)];
  const explosif = [...debut, ...Array.from({ length: 40 }, (_, i) => 100 + i * 50)];

  const a = runBacktest(serie(calme), "sma_cross", { fast: 5, slow: 10 }, 1000);
  const b = runBacktest(serie(explosif), "sma_cross", { fast: 5, slow: 10 }, 1000);

  const avant = (r: typeof a) => r.trades.filter((t) => t.day <= "2025-01-40");
  assert.deepEqual(
    avant(a),
    avant(b),
    "les ordres passés avant le point de divergence devraient être identiques",
  );
});

test("une flambée au dernier jour n'est pas anticipée", () => {
  // Prix plat puis x10 le tout dernier jour : la stratégie ne peut pas
  // l'avoir vu venir, donc elle ne doit pas être investie avant.
  const bars = serie([...Array.from({ length: 60 }, () => 100), 1000]);
  const r = runBacktest(bars, "sma_cross", { fast: 5, slow: 10 }, 1000);
  assert.ok(
    r.returnPct < 50,
    `gain de ${r.returnPct.toFixed(1)} % : la hausse finale a été anticipée`,
  );
});

test("decide() ne reçoit jamais la bougie du jour d'exécution", () => {
  const bars = serie(Array.from({ length: 30 }, (_, i) => 100 + i));
  for (let i = 0; i < bars.length; i++) {
    const history = bars.slice(0, i);
    assert.ok(
      history.every((b) => b.day < bars[i].day),
      `au jour ${i}, l'historique contient une date >= au jour d'exécution`,
    );
  }
  assert.equal(decide("sma_cross", [], { fast: 5, slow: 10 }), "flat");
});

console.log("\nCalculs");

test("moyenne mobile", () => {
  assert.equal(sma([1, 2, 3, 4], 2), 3.5);
  assert.equal(sma([1, 2], 5), null);
});

test("pire chute", () => {
  assert.equal(maxDrawdown([100, 50]), -50);
  assert.equal(maxDrawdown([100, 110, 120]), 0);
  assert.ok(Math.abs(maxDrawdown([100, 200, 100, 300]) - -50) < 1e-9);
});

test("frais de 0,1 % prélevés à l'achat", () => {
  const bars = serie([100, 100, 100]);
  const r = runBacktest(bars, "buy_and_hold", { fast: 5, slow: 10 }, 1000);
  assert.equal(r.orderCount, 1);
  assert.ok(Math.abs(r.totalFees - 1) < 1e-9, `frais attendus 1 €, obtenus ${r.totalFees}`);
  // 1000 € - 1 € de frais = 999 € investis, prix stable → valeur finale 999 €.
  assert.ok(Math.abs(r.finalValue - 999) < 1e-9, `valeur finale ${r.finalValue}`);
});

test("acheter et garder suit le marché", () => {
  const bars = serie([100, 100, 200]);
  const r = runBacktest(bars, "buy_and_hold", { fast: 5, slow: 10 }, 1000);
  // Achat à l'ouverture du jour 2 (100), clôture finale à 200 → environ x2.
  assert.ok(r.returnPct > 90 && r.returnPct < 100, `gain ${r.returnPct.toFixed(2)} %`);
});

test("aucun ordre si l'historique est trop court", () => {
  const r = runBacktest(serie([100, 101]), "sma_cross", { fast: 20, slow: 50 }, 1000);
  assert.equal(r.orderCount, 0);
});

console.log(`\n${reussis} test(s) réussi(s)\n`);
