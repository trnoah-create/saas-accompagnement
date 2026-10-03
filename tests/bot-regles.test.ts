/**
 * Tests du bot à règles fixes. Aucun réseau, aucune base, aucun appel payant.
 */
import assert from "node:assert/strict";
import { deciderOrdres, type Historiques } from "../lib/bot-regles/decider";
import { jourDeLExperience } from "../lib/limites";
import { botReglesConfig as cfg } from "../config/bot-regles";
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

/** Série de clôtures → bougies. */
function serie(closes: number[]): Bar[] {
  return closes.map((c, i) => {
    const d = new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    return { day: d, open: c, high: c * 1.01, low: c * 0.99, close: c };
  });
}

/** Historique produisant un croisement HAUSSIER (courte au-dessus de la longue). */
function haussier(prixFinal: number): Bar[] {
  const plat = Array.from({ length: 60 }, () => 100);
  const monte = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
  return serie([...plat, ...monte, prixFinal]);
}

/** Historique produisant un signal BAISSIER (courte sous la longue). */
function baissier(prixFinal: number): Bar[] {
  const plat = Array.from({ length: 60 }, () => 100);
  const baisse = Array.from({ length: 30 }, (_, i) => 100 - i * 2);
  return serie([...plat, ...baisse, prixFinal]);
}

const histo = (btc: Bar[], eth: Bar[]): Historiques => ({ BTC: btc, ETH: eth });

console.log("\nSignaux d'entrée et de sortie");

test("croisement haussier sans position → achat", () => {
  const p = deciderOrdres(
    { cash: 100, positions: [] },
    histo(haussier(160), baissier(50)),
    { BTC: 160, ETH: 50 },
  );
  const achats = p.ordres.filter((o) => o.side === "buy");
  assert.equal(achats.length, 1, JSON.stringify(p));
  assert.equal(achats[0].asset, "BTC");
  assert.match(achats[0].raison, /haussier/);
});

test("croisement baissier sans position → rien", () => {
  const p = deciderOrdres(
    { cash: 100, positions: [] },
    histo(baissier(50), baissier(50)),
    { BTC: 50, ETH: 50 },
  );
  assert.equal(p.ordres.length, 0);
});

test("croisement baissier avec position → vente", () => {
  const p = deciderOrdres(
    { cash: 0, positions: [{ asset: "BTC", quantity: 0.001, prixEntree: 50 }] },
    histo(baissier(50.5), baissier(50)),
    { BTC: 50.5, ETH: 50 },
  );
  assert.equal(p.ordres.length, 1);
  assert.equal(p.ordres[0].side, "sell");
  assert.match(p.ordres[0].raison, /baissier/);
});

console.log("\nStop loss et take profit");

test("stop loss : −2 % déclenche la vente", () => {
  // Entrée à 100, prix à 98 → exactement −2 %.
  const p = deciderOrdres(
    { cash: 0, positions: [{ asset: "BTC", quantity: 0.01, prixEntree: 100 }] },
    histo(haussier(98), baissier(50)),
    { BTC: 98, ETH: 50 },
  );
  assert.equal(p.ordres.length, 1);
  assert.equal(p.ordres[0].side, "sell");
  assert.match(p.ordres[0].raison, /Stop loss/);
});

test("stop loss : −1,9 % ne déclenche pas", () => {
  const p = deciderOrdres(
    { cash: 0, positions: [{ asset: "BTC", quantity: 0.01, prixEntree: 100 }] },
    histo(haussier(98.1), baissier(50)),
    { BTC: 98.1, ETH: 50 },
  );
  assert.equal(p.ordres.length, 0, JSON.stringify(p.ordres));
  assert.match(p.signaux.BTC, /Conservé/);
});

test("take profit : +4 % déclenche la vente", () => {
  const p = deciderOrdres(
    { cash: 0, positions: [{ asset: "BTC", quantity: 0.01, prixEntree: 100 }] },
    histo(haussier(104), baissier(50)),
    { BTC: 104, ETH: 50 },
  );
  assert.equal(p.ordres.length, 1);
  assert.match(p.ordres[0].raison, /Take profit/);
});

test("take profit : +3,9 % ne déclenche pas", () => {
  const p = deciderOrdres(
    { cash: 0, positions: [{ asset: "BTC", quantity: 0.01, prixEntree: 100 }] },
    histo(haussier(103.9), baissier(50)),
    { BTC: 103.9, ETH: 50 },
  );
  assert.equal(p.ordres.length, 0);
});

test("le stop loss prime sur le signal de tendance", () => {
  // Tendance haussière mais position en perte de 3 % : on sort quand même.
  const p = deciderOrdres(
    { cash: 0, positions: [{ asset: "BTC", quantity: 0.01, prixEntree: 100 }] },
    histo(haussier(97), baissier(50)),
    { BTC: 97, ETH: 50 },
  );
  assert.equal(p.ordres.length, 1);
  assert.match(p.ordres[0].raison, /Stop loss/);
});

console.log("\nTaille des ordres");

test("l'ordre vise le montant configuré", () => {
  const p = deciderOrdres(
    { cash: 100, positions: [] },
    histo(haussier(160), baissier(50)),
    { BTC: 160, ETH: 50 },
  );
  assert.ok(Math.abs(p.ordres[0].montant - cfg.ordres.cible) < 1e-9, `montant ${p.ordres[0].montant}`);
});

test("jamais au-dessus du maximum", () => {
  const p = deciderOrdres(
    { cash: 100, positions: [] },
    histo(haussier(160), baissier(50)),
    { BTC: 160, ETH: 50 },
  );
  for (const o of p.ordres.filter((x) => x.side === "buy")) {
    assert.ok(o.montant <= cfg.ordres.maxEuros + 1e-9, `montant ${o.montant}`);
  }
});

test("liquidités trop faibles → refus plutôt qu'ordre minuscule", () => {
  const p = deciderOrdres(
    { cash: 1, positions: [] },
    histo(haussier(160), baissier(50)),
    { BTC: 160, ETH: 50 },
  );
  assert.equal(p.ordres.length, 0);
  assert.match(p.refus[0].motifRefus, /minimum/);
});

console.log("\nQuantité minimale négociable");

test("le montant est relevé pour atteindre la quantité minimale de BTC", () => {
  // BTC à 70 000 € : 0,0001 BTC = 7 €, au-dessus de la cible de 6 €.
  const p = deciderOrdres(
    { cash: 100, positions: [] },
    histo(haussier(70_000), baissier(50)),
    { BTC: 70_000, ETH: 50 },
  );
  const achat = p.ordres.find((o) => o.asset === "BTC");
  assert.ok(achat, "aucun achat BTC");
  assert.ok(achat!.montant >= 7, `montant ${achat!.montant} : devrait couvrir 0,0001 BTC`);
  assert.ok(achat!.montant <= cfg.ordres.maxEuros + 1e-9);
});

test("si la quantité minimale coûte plus que le plafond, l'ordre est refusé", () => {
  // BTC à 200 000 € : 0,0001 BTC = 20 €, au-dessus du plafond de 9 €.
  const p = deciderOrdres(
    { cash: 100, positions: [] },
    histo(haussier(200_000), baissier(50)),
    { BTC: 200_000, ETH: 50 },
  );
  assert.equal(p.ordres.filter((o) => o.asset === "BTC").length, 0);
  const refus = p.refus.find((r) => r.asset === "BTC");
  assert.ok(refus, "refus attendu");
  assert.match(refus!.motifRefus, /Quantité minimale/);
});

test("liquidités insuffisantes pour la quantité minimale → refus explicite", () => {
  // BTC à 70 000 € : il faut 7 €, on n'a que 5 €.
  const p = deciderOrdres(
    { cash: 5, positions: [] },
    histo(haussier(70_000), baissier(50)),
    { BTC: 70_000, ETH: 50 },
  );
  assert.equal(p.ordres.length, 0);
  assert.match(p.refus[0].motifRefus, /quantité minimale|minimum/i);
});

console.log("\nGarde-fous");

test("le bot ne touche qu'aux actifs configurés", () => {
  const p = deciderOrdres(
    { cash: 100, positions: [] },
    { ...histo(haussier(160), haussier(160)), DOGE: haussier(1), SPY: haussier(600) },
    { BTC: 160, ETH: 160, DOGE: 1, SPY: 600 },
  );
  for (const o of p.ordres) {
    assert.ok(cfg.actifs.includes(o.asset as never), `actif hors périmètre : ${o.asset}`);
  }
});

test("le plafond d'ordres par jour est respecté", () => {
  const court = { ...cfg, ordres: { ...cfg.ordres, maxParJour: 1 } };
  const p = deciderOrdres(
    { cash: 100, positions: [] },
    histo(haussier(160), haussier(160)),
    { BTC: 160, ETH: 160 },
    court,
  );
  assert.equal(p.ordres.length, 1);
  assert.ok(p.refus.some((r) => /ordres par jour/.test(r.motifRefus)));
});

test("aucune vente à découvert : sans position, aucun ordre de vente", () => {
  const p = deciderOrdres(
    { cash: 100, positions: [] },
    histo(baissier(50), baissier(50)),
    { BTC: 50, ETH: 50 },
  );
  assert.equal(p.ordres.filter((o) => o.side === "sell").length, 0);
});

test("l'argent n'est pas engagé deux fois", () => {
  // 7 € de liquide, deux signaux haussiers : le second doit être limité.
  const p = deciderOrdres(
    { cash: 7, positions: [] },
    histo(haussier(160), haussier(160)),
    { BTC: 160, ETH: 160 },
  );
  const total = p.ordres
    .filter((o) => o.side === "buy")
    .reduce((s, o) => s + o.montant * (1 + cfg.couts.fraisPct / 100), 0);
  assert.ok(total <= 7 + 1e-9, `engagé ${total} € pour 7 € disponibles`);
});

test("un historique trop court ne déclenche rien", () => {
  const p = deciderOrdres(
    { cash: 100, positions: [] },
    histo(serie([100, 101, 102]), serie([100, 101, 102])),
    { BTC: 102, ETH: 102 },
  );
  assert.equal(p.ordres.length, 0);
});

test("un prix manquant est signalé sans planter", () => {
  const p = deciderOrdres(
    { cash: 100, positions: [] },
    histo(haussier(160), baissier(50)),
    { BTC: 0, ETH: 50 },
  );
  assert.equal(p.ordres.length, 0);
  assert.match(p.signaux.BTC, /indisponible/);
});

console.log("\nDurée de l'expérience");

test("le premier jour est le jour 1", () => {
  assert.equal(jourDeLExperience("2026-10-03", "2026-10-03"), 1);
});

test("le décompte suit les journées", () => {
  assert.equal(jourDeLExperience("2026-10-03", "2026-10-04"), 2);
  assert.equal(jourDeLExperience("2026-10-03", "2026-12-01"), 60);
});

test("deux mois correspondent à la durée configurée", () => {
  assert.equal(cfg.dureeJours, 60);
  // Au 61e jour, l'expérience est terminée.
  assert.ok(jourDeLExperience("2026-10-03", "2026-12-02") > cfg.dureeJours);
});

console.log(`\n${reussis} test(s) réussi(s)\n`);
