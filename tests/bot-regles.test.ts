/**
 * Tests du bot automatique. Aucun réseau, aucune base, aucun appel payant.
 *
 * Trois choses sont vérifiées ici :
 *   1. les règles elles-mêmes (moyenne mobile, stop loss, plafonds) ;
 *   2. les limites de perte en euros ;
 *   3. la séparation entre les règles et le courtier, par lecture du code.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  deciderOrdres,
  signalMoyenneMobile,
  type EtatBot,
  type Historiques,
  type ReglesBot,
} from "../lib/bot-regles/decider";
import { evaluerLimites, jourDeLExperience, jourLocal } from "../lib/limites";
import {
  botReglesConfig as cfg,
  poidsMaxPct,
  idsActifs,
  fraisBot,
  prixAchatBot,
  prixVenteBot,
} from "../config/bot-regles";
import { calculerCapitalSuivant, moisDe } from "../lib/bot-regles/reinvestissement";
import { ASSETS, ASSET_IDS, getAsset } from "../lib/market/assets";
import { sourcesPour } from "../lib/market/sources";
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

// ─── Fabriques d'historiques ─────────────────────────────────────────

/** Série de clôtures → bougies journalières. */
function serie(closes: number[]): Bar[] {
  return closes.map((c, i) => {
    const d = new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    return { day: d, open: c, high: c * 1.01, low: c * 0.99, close: c };
  });
}

/**
 * Historique dont la dernière clôture CONNUE est au-dessus de sa moyenne
 * 50 jours : 60 jours plats à 100, puis une montée. `prixDuJour` est la
 * bougie du jour en cours, que les règles doivent ignorer.
 */
function auDessus(prixDuJour = 130): Bar[] {
  const plat = Array.from({ length: 60 }, () => 100);
  const monte = Array.from({ length: 20 }, (_, i) => 100 + (i + 1) * 2);
  return serie([...plat, ...monte, prixDuJour]);
}

/** Historique dont la dernière clôture connue est SOUS sa moyenne 50 jours. */
function enDessous(prixDuJour = 70): Bar[] {
  const plat = Array.from({ length: 60 }, () => 100);
  const baisse = Array.from({ length: 20 }, (_, i) => 100 - (i + 1) * 2);
  return serie([...plat, ...baisse, prixDuJour]);
}

/** Historique trop court pour une moyenne 50 jours. */
function tropCourt(): Bar[] {
  return serie(Array.from({ length: 20 }, (_, i) => 100 + i));
}

// ─── Configurations de test ──────────────────────────────────────────

const REGLES_BASE: ReglesBot = {
  actifs: [
    { id: "BTC", poidsMaxPct: 25, actif: true },
    { id: "SOL", poidsMaxPct: 10, actif: true },
  ],
  moyenneMobileJours: 50,
  ordres: { minEuros: 2, maxParJour: 5 },
  quantiteMinimale: { BTC: 0.0001, SOL: 0.01 },
  sorties: { stopLossPct: 5 },
  couts: { fraisPct: 0.1, ecartPct: 0.1 },
};

function regles(patch: Partial<ReglesBot> = {}): ReglesBot {
  return { ...REGLES_BASE, ...patch };
}

/** Portefeuille : liquide, valeur totale, positions. */
function etat(cash: number, positions: EtatBot["positions"] = [], valeurTotale = cash): EtatBot {
  return { cash, valeurTotale, positions };
}

console.log("\nSignal « prix contre moyenne mobile »");

test("une clôture au-dessus de la moyenne 50 jours donne le signal haussier", () => {
  const s = signalMoyenneMobile(auDessus(), 50);
  assert.ok(s, "un signal doit être calculable");
  assert.equal(s.position, "au-dessus");
  assert.ok(s.cloture > s.moyenne, "la clôture doit dépasser la moyenne");
});

test("une clôture sous la moyenne 50 jours donne le signal baissier", () => {
  const s = signalMoyenneMobile(enDessous(), 50);
  assert.ok(s);
  assert.equal(s.position, "en-dessous");
  assert.ok(s.cloture < s.moyenne);
});

test("moins de 50 journées closes : aucun signal, jamais de supposition", () => {
  assert.equal(signalMoyenneMobile(tropCourt(), 50), null);
  // Exactement 50 journées closes (51 bougies) : le signal devient calculable.
  assert.equal(signalMoyenneMobile(serie(Array.from({ length: 50 }, () => 100)), 50), null);
  assert.ok(signalMoyenneMobile(serie(Array.from({ length: 51 }, (_, i) => 100 + i)), 50));
});

test("anti-triche : la bougie du jour en cours n'entre pas dans la décision", () => {
  // Deux historiques identiques, sauf le prix du jour en cours.
  const a = signalMoyenneMobile(auDessus(130), 50);
  const b = signalMoyenneMobile(auDessus(1), 50);
  assert.deepEqual(a, b, "le prix du jour ne doit pas changer le signal");
});

console.log("\nAchats");

test("prix au-dessus de la moyenne : le bot achète", () => {
  const p = deciderOrdres(etat(100), { BTC: auDessus() }, { BTC: 130 }, regles());
  const achat = p.ordres.find((o) => o.asset === "BTC");
  assert.ok(achat, "un achat de BTC est attendu");
  assert.equal(achat.side, "buy");
  assert.match(achat.raison, /au-dessus de sa moyenne 50 jours/);
});

test("prix sous la moyenne : aucun achat", () => {
  const p = deciderOrdres(etat(100), { BTC: enDessous() }, { BTC: 70 }, regles());
  assert.equal(p.ordres.length, 0);
  assert.match(p.signaux.BTC, /Hors marché/);
});

test("historique trop court : aucun ordre, et le motif est explicite", () => {
  const p = deciderOrdres(etat(100), { BTC: tropCourt() }, { BTC: 110 }, regles());
  assert.equal(p.ordres.length, 0);
  assert.match(p.signaux.BTC, /historique trop court/);
});

test("prix ou historique manquant : aucun ordre", () => {
  const p = deciderOrdres(etat(100), {}, {}, regles());
  assert.equal(p.ordres.length, 0);
  assert.match(p.signaux.BTC, /indisponible/);
});

console.log("\nPlafond par actif");

test("au maximum 25 % du portefeuille sur un actif", () => {
  const p = deciderOrdres(etat(100), { BTC: auDessus() }, { BTC: 130 }, regles());
  const achat = p.ordres.find((o) => o.asset === "BTC");
  assert.ok(achat);
  assert.ok(
    Math.abs(achat.montant - 25) < 1e-6,
    `25 € attendus sur un portefeuille de 100 €, obtenu ${achat.montant}`,
  );
});

test("Solana est plafonnée à 10 % du portefeuille", () => {
  const p = deciderOrdres(
    etat(100),
    { BTC: enDessous(), SOL: auDessus() },
    { BTC: 70, SOL: 130 },
    regles(),
  );
  const achat = p.ordres.find((o) => o.asset === "SOL");
  assert.ok(achat, "un achat de SOL est attendu");
  assert.ok(
    Math.abs(achat.montant - 10) < 1e-6,
    `10 € attendus, obtenu ${achat.montant}`,
  );
});

test("le plafond suit la valeur totale, pas seulement le liquide", () => {
  // 40 € de liquide, 160 € investis ailleurs → total 200 € → plafond 50 €.
  const e = etat(40, [{ asset: "SOL", quantity: 1, prixEntree: 160 }], 200);
  const p = deciderOrdres(
    e,
    { BTC: auDessus(), SOL: auDessus() },
    { BTC: 130, SOL: 160 },
    regles(),
  );
  const achat = p.ordres.find((o) => o.asset === "BTC");
  assert.ok(achat);
  // Le plafond vaut 50 €, mais le liquide ne permet que ~39,96 €.
  assert.ok(achat.montant < 40 && achat.montant > 39, `obtenu ${achat.montant}`);
});

test("plafond de 0 % : aucun achat", () => {
  const p = deciderOrdres(
    etat(100),
    { BTC: auDessus() },
    { BTC: 130 },
    regles({ actifs: [{ id: "BTC", poidsMaxPct: 0, actif: true }] }),
  );
  assert.equal(p.ordres.length, 0);
  assert.match(p.signaux.BTC, /plafond de 0 %/);
});

console.log("\nVentes et stop loss");

test("le prix repasse sous la moyenne : la position est vendue", () => {
  const e = etat(0, [{ asset: "BTC", quantity: 1, prixEntree: 70 }], 70);
  const p = deciderOrdres(e, { BTC: enDessous() }, { BTC: 70 }, regles());
  const vente = p.ordres.find((o) => o.asset === "BTC");
  assert.ok(vente);
  assert.equal(vente.side, "sell");
  assert.match(vente.raison, /repassé sous sa moyenne 50 jours/);
});

test("stop loss : une perte de plus de 5 % déclenche la vente", () => {
  // Entrée à 100, prix à 94 → −6 %, alors que la moyenne reste favorable.
  const e = etat(0, [{ asset: "BTC", quantity: 1, prixEntree: 100 }], 94);
  const p = deciderOrdres(e, { BTC: auDessus(94) }, { BTC: 94 }, regles());
  const vente = p.ordres.find((o) => o.asset === "BTC");
  assert.ok(vente, "le stop loss doit vendre même si la moyenne est favorable");
  assert.equal(vente.side, "sell");
  assert.match(vente.raison, /Stop loss/);
});

test("une perte inférieure au stop loss ne déclenche rien", () => {
  // Entrée à 100, prix à 97 → −3 %, au-dessus du seuil de −5 %.
  const e = etat(0, [{ asset: "BTC", quantity: 1, prixEntree: 100 }], 97);
  const p = deciderOrdres(e, { BTC: auDessus(97) }, { BTC: 97 }, regles());
  assert.equal(p.ordres.length, 0);
  assert.match(p.signaux.BTC, /Conservé/);
});

test("le stop loss est prioritaire sur le signal de moyenne mobile", () => {
  const e = etat(0, [{ asset: "BTC", quantity: 1, prixEntree: 100 }], 70);
  const p = deciderOrdres(e, { BTC: enDessous(70) }, { BTC: 70 }, regles());
  const vente = p.ordres[0];
  assert.ok(vente);
  assert.match(vente.raison, /Stop loss/, "le motif doit être le stop loss");
});

test("une position en gain au-dessus de sa moyenne est conservée", () => {
  const e = etat(0, [{ asset: "BTC", quantity: 1, prixEntree: 100 }], 130);
  const p = deciderOrdres(e, { BTC: auDessus(130) }, { BTC: 130 }, regles());
  assert.equal(p.ordres.length, 0, "aucun take profit : on laisse courir le gain");
  assert.match(p.signaux.BTC, /Conservé/);
});

test("pas de rachat d'un actif déjà détenu", () => {
  const e = etat(100, [{ asset: "BTC", quantity: 1, prixEntree: 125 }], 225);
  const p = deciderOrdres(e, { BTC: auDessus(130) }, { BTC: 130 }, regles());
  assert.equal(p.ordres.filter((o) => o.side === "buy").length, 0);
});

console.log("\nDésactivation d'un actif");

test("un actif désactivé n'est plus acheté", () => {
  const p = deciderOrdres(
    etat(100),
    { SOL: auDessus() },
    { SOL: 130 },
    regles({ actifs: [{ id: "SOL", poidsMaxPct: 10, actif: false }] }),
  );
  assert.equal(p.ordres.length, 0);
  assert.match(p.signaux.SOL, /désactivé/);
});

test("une position ouverte sur un actif désactivé reste vendable", () => {
  const e = etat(0, [{ asset: "SOL", quantity: 1, prixEntree: 100 }], 70);
  const p = deciderOrdres(
    e,
    { SOL: enDessous(70) },
    { SOL: 70 },
    regles({ actifs: [{ id: "SOL", poidsMaxPct: 10, actif: false }] }),
  );
  assert.equal(p.ordres.length, 1);
  assert.equal(p.ordres[0].side, "sell");
});

test("une position sur un actif absent de la configuration reste vendable", () => {
  // Cas d'un actif retiré de la liste alors qu'une position est ouverte.
  const e = etat(0, [{ asset: "DOGE", quantity: 1, prixEntree: 100 }], 70);
  const p = deciderOrdres(e, { DOGE: enDessous(70) }, { DOGE: 70 }, regles());
  const vente = p.ordres.find((o) => o.asset === "DOGE");
  assert.ok(vente, "la position orpheline doit pouvoir être soldée");
  assert.equal(vente.side, "sell");
});

console.log("\nGarde-fous sur la taille des ordres");

test("plafond d'ordres par jour respecté", () => {
  const actifs = [
    { id: "BTC", poidsMaxPct: 25, actif: true },
    { id: "ETH", poidsMaxPct: 25, actif: true },
    { id: "SPY", poidsMaxPct: 25, actif: true },
  ];
  const p = deciderOrdres(
    etat(100),
    { BTC: auDessus(), ETH: auDessus(), SPY: auDessus() },
    { BTC: 130, ETH: 130, SPY: 130 },
    regles({ actifs, ordres: { minEuros: 2, maxParJour: 2 } }),
  );
  assert.equal(p.ordres.length, 2, "jamais plus de 2 ordres");
  assert.equal(p.refus.length, 1);
  assert.match(p.refus[0].motifRefus, /Plafond de 2 ordres par jour/);
});

test("liquidités insuffisantes : le montant est réduit, frais compris", () => {
  // Portefeuille de 100 € dont 95 € déjà investis en SOL : le plafond BTC
  // vaut 25 €, mais il ne reste que 5 € de liquide.
  const e = etat(5, [{ asset: "SOL", quantity: 1, prixEntree: 95 }], 100);
  const p = deciderOrdres(
    e,
    { BTC: auDessus(), SOL: auDessus(95) },
    { BTC: 130, SOL: 95 },
    regles(),
  );
  const achat = p.ordres.find((o) => o.asset === "BTC" && o.side === "buy");
  assert.ok(achat, "un achat réduit de BTC est attendu");
  assert.ok(achat.montant <= 5, "l'ordre ne peut pas dépasser le liquide");
  assert.ok(
    achat.montant + achat.montant * 0.001 <= 5 + 1e-9,
    "frais compris, le coût doit tenir dans le liquide",
  );
});

test("montant possible sous le minimum : ordre refusé", () => {
  const p = deciderOrdres(etat(1), { BTC: auDessus() }, { BTC: 130 }, regles());
  assert.equal(p.ordres.length, 0);
  assert.match(p.refus[0].motifRefus, /en dessous du minimum/);
});

test("quantité minimale inatteignable sous le plafond : ordre refusé", () => {
  // 1 unité minimale à 130 € alors que le plafond vaut 25 €.
  const p = deciderOrdres(
    etat(100),
    { BTC: auDessus() },
    { BTC: 130 },
    regles({ quantiteMinimale: { BTC: 1 } }),
  );
  assert.equal(p.ordres.length, 0);
  assert.match(p.refus[0].motifRefus, /au-dessus du plafond/);
});

test("un refus de vente n'invente jamais un motif d'achat", () => {
  const actifs = [
    { id: "BTC", poidsMaxPct: 25, actif: true },
    { id: "SOL", poidsMaxPct: 10, actif: true },
  ];
  const e = etat(
    0,
    [
      { asset: "BTC", quantity: 1, prixEntree: 100 },
      { asset: "SOL", quantity: 1, prixEntree: 100 },
    ],
    140,
  );
  const p = deciderOrdres(
    e,
    { BTC: enDessous(70), SOL: enDessous(70) },
    { BTC: 70, SOL: 70 },
    regles({ actifs, ordres: { minEuros: 2, maxParJour: 1 } }),
  );
  assert.equal(p.ordres.length, 1);
  assert.equal(p.refus.length, 1);
  assert.equal(p.refus[0].side, "sell");
});

console.log("\nLimites de perte en euros");

const SEUILS = { pertes: cfg.pertes };

test("sous le seuil d'alerte : le bot continue", () => {
  const d = evaluerLimites(99.5, { jour: 100, semaine: 100, mois: 100 }, SEUILS);
  assert.equal(d.action, "continuer");
});

test(`perte du jour de ${cfg.pertes.alerteJour} € : alerte sans blocage`, () => {
  const d = evaluerLimites(100 - cfg.pertes.alerteJour, { jour: 100, semaine: 100, mois: 100 }, SEUILS);
  assert.equal(d.action, "alerte");
});

test(`perte du jour de ${cfg.pertes.blocageJour} € : le bot s'arrête pour la journée`, () => {
  const d = evaluerLimites(100 - cfg.pertes.blocageJour, { jour: 100, semaine: 100, mois: 100 }, SEUILS);
  assert.equal(d.action, "bloquer_jour");
  assert.match(d.motif, /Aucun ordre jusqu'à demain/);
});

test("perte hebdomadaire dépassée : mise en pause", () => {
  const d = evaluerLimites(100 - cfg.pertes.semaine, { jour: 100, semaine: 100, mois: 100 }, SEUILS);
  assert.equal(d.action, "pause");
});

test("perte mensuelle dépassée : mise en pause, priorité la plus forte", () => {
  const d = evaluerLimites(100 - cfg.pertes.mois, { jour: 100, semaine: 100, mois: 100 }, SEUILS);
  assert.equal(d.action, "pause");
  assert.match(d.motif, /mensuelle/);
});

test("premier jour sans historique de valeurs : aucune limite déclenchée", () => {
  const d = evaluerLimites(100, { jour: null, semaine: null, mois: null }, SEUILS);
  assert.equal(d.action, "continuer");
});

test("les journées sont découpées à l'heure de Paris", () => {
  // 23 h 30 UTC le 3 octobre = déjà le 4 octobre à Paris.
  assert.equal(jourLocal(new Date("2026-10-03T23:30:00Z"), "Europe/Paris"), "2026-10-04");
  assert.equal(jourDeLExperience("2026-10-01", "2026-10-01"), 1);
  assert.equal(jourDeLExperience("2026-10-01", "2026-10-10"), 10);
});

console.log("\nPlancher total — arrêt définitif");

test("au-dessus du plancher, le bot continue", () => {
  // Plancher à 85 % de 100 € = 85 €. À 86 €, on continue.
  const d = evaluerLimites(86, { jour: 86, semaine: 86, mois: 86 }, SEUILS, 100);
  assert.equal(d.action, "continuer");
  assert.equal(d.pertes.total, 14);
});

test("le plancher atteint déclenche l'arrêt définitif", () => {
  const d = evaluerLimites(85, { jour: 85, semaine: 85, mois: 85 }, SEUILS, 100);
  assert.equal(d.action, "arret_total");
  assert.match(d.motif, /Plancher total atteint/);
  assert.match(d.motif, /réactivation manuelle/);
});

test("sous le plancher aussi, évidemment", () => {
  const d = evaluerLimites(50, { jour: 50, semaine: 50, mois: 50 }, SEUILS, 100);
  assert.equal(d.action, "arret_total");
});

test("le plancher total est prioritaire sur toutes les autres limites", () => {
  // Une perte du jour de 15 € dépasse aussi la limite quotidienne et
  // mensuelle : c'est l'arrêt définitif qui doit l'emporter.
  const d = evaluerLimites(85, { jour: 100, semaine: 100, mois: 100 }, SEUILS, 100);
  assert.equal(d.action, "arret_total");
});

test("sans capital de référence, le plancher n'est pas évalué", () => {
  const d = evaluerLimites(10, { jour: 10, semaine: 10, mois: 10 }, SEUILS);
  assert.notEqual(d.action, "arret_total");
  assert.equal(d.pertes.total, null);
});

test("le plancher suit le capital de référence, pas le capital de départ", () => {
  // Capital réinvesti à 200 € → plancher à 170 €, pas à 85 €.
  // 165 € est donc sous le plancher dans un cas, largement au-dessus dans l'autre.
  assert.equal(
    evaluerLimites(165, { jour: 165, semaine: 165, mois: 165 }, SEUILS, 200).action,
    "arret_total",
    "avec un capital de référence de 200 €, le plancher est à 170 €",
  );
  assert.equal(
    evaluerLimites(165, { jour: 165, semaine: 165, mois: 165 }, SEUILS, 100).action,
    "continuer",
    "avec un capital de référence de 100 €, le plancher est à 85 €",
  );
});

console.log("\nRéinvestissement mensuel des gains");

test("désactivé, le capital de référence ne bouge jamais", () => {
  assert.deepEqual(calculerCapitalSuivant(100, 130, false), {
    capital: 100,
    gainReinvesti: 0,
  });
  assert.deepEqual(calculerCapitalSuivant(100, 70, false), {
    capital: 100,
    gainReinvesti: 0,
  });
});

test("activé, un gain monte le capital de référence du mois suivant", () => {
  assert.deepEqual(calculerCapitalSuivant(100, 112.5, true), {
    capital: 112.5,
    gainReinvesti: 12.5,
  });
});

test("activé, une perte ne baisse JAMAIS le capital de référence", () => {
  assert.deepEqual(calculerCapitalSuivant(100, 80, true), {
    capital: 100,
    gainReinvesti: 0,
  });
});

test("un mois à l'équilibre ne change rien", () => {
  assert.deepEqual(calculerCapitalSuivant(100, 100, true), {
    capital: 100,
    gainReinvesti: 0,
  });
});

test("les gains s'empilent de mois en mois, jamais les pertes", () => {
  // Mois 1 : +20 → 120. Mois 2 : -30 → reste 120. Mois 3 : +10 → 130.
  let capital = 100;
  capital = calculerCapitalSuivant(capital, 120, true).capital;
  assert.equal(capital, 120);
  capital = calculerCapitalSuivant(capital, 90, true).capital;
  assert.equal(capital, 120, "une perte ne doit pas éroder le capital de référence");
  capital = calculerCapitalSuivant(capital, 130, true).capital;
  assert.equal(capital, 130);
});

test("réinvestir remonte le plancher, donc verrouille les gains", () => {
  // Après un mois à +50 %, le capital de référence passe à 150 € et le
  // plancher à 127,50 € : le bot s'arrête bien plus haut qu'au départ.
  const { capital } = calculerCapitalSuivant(100, 150, true);
  const plancher = capital * (cfg.pertes.plancherTotalPct / 100);
  assert.equal(plancher, 127.5);
  assert.equal(
    evaluerLimites(127, { jour: 127, semaine: 127, mois: 127 }, SEUILS, capital).action,
    "arret_total",
  );
});

test("le mois d'un jour est bien extrait", () => {
  assert.equal(moisDe("2026-10-03"), "2026-10");
  assert.equal(moisDe("2026-01-31"), "2026-01");
});

test("le réinvestissement est désactivé par défaut", () => {
  assert.equal(cfg.reinvestissement.actif, false, "l'option doit être désactivée au départ");
});

console.log("\nFrais simulés");

test("des frais sont prélevés sur chaque ordre", () => {
  assert.ok(cfg.couts.fraisPct > 0, "les frais ne doivent pas être nuls");
  assert.equal(cfg.couts.fraisPct, 0.1);
  assert.ok(cfg.couts.ecartPct > 0, "l'écart achat/vente ne doit pas être nul");
});

test("les frais et l'écart rendent un aller-retour perdant à prix constant", () => {
  // On achète puis on revend immédiatement au même prix de marché : le
  // portefeuille doit avoir perdu de l'argent, jamais en avoir gagné.
  const prixMarche = 100;
  const montant = 25;

  const prixAchat = prixAchatBot(prixMarche);
  const quantite = montant / prixAchat;
  const coutTotal = montant + fraisBot(montant);

  const prixVente = prixVenteBot(prixMarche);
  const encaisse = quantite * prixVente;
  const recu = encaisse - fraisBot(encaisse);

  assert.ok(recu < coutTotal, `aller-retour gagnant (${recu} vs ${coutTotal}) : frais ignorés`);
  // Ordre de grandeur : 0,1 % de frais à l'achat + 0,1 % à la vente
  // + 0,1 % d'écart ≈ 0,3 % du montant.
  const perte = coutTotal - recu;
  assert.ok(
    perte > montant * 0.002 && perte < montant * 0.005,
    `perte de ${perte} € sur ${montant} €, attendue autour de 0,3 %`,
  );
});

test("les frais figurent dans le plan d'ordres, pas seulement à l'exécution", () => {
  // Avec 5 € de liquide, l'ordre doit être réduit pour que frais compris
  // le coût tienne dans le liquide.
  const e = etat(5, [{ asset: "SOL", quantity: 1, prixEntree: 95 }], 100);
  const p = deciderOrdres(
    e,
    { BTC: auDessus(), SOL: auDessus(95) },
    { BTC: 130, SOL: 95 },
    regles(),
  );
  const achat = p.ordres.find((o) => o.asset === "BTC" && o.side === "buy");
  assert.ok(achat);
  assert.ok(achat.montant < 5, "le montant doit laisser de la place aux frais");
});

console.log("\nConfiguration demandée");

test("les cinq actifs attendus, sans Dogecoin", () => {
  assert.deepEqual([...ASSET_IDS].sort(), ["BTC", "ETH", "QQQ", "SOL", "SPY"]);
  assert.equal(getAsset("DOGE"), undefined, "Dogecoin doit avoir disparu");
});

test("Solana est cotée en euros chez Coinbase, essayé en premier", () => {
  const sol = getAsset("SOL");
  assert.ok(sol);
  assert.equal(sol.symboles.coinbase, "SOL-EUR");
  assert.equal(sourcesPour(sol)[0].id, "coinbase");
});

test("l'ordre de secours habituel est conservé derrière la source prioritaire", () => {
  const sol = getAsset("SOL");
  const btc = getAsset("BTC");
  assert.ok(sol && btc);
  // BTC garde l'ordre par défaut.
  assert.deepEqual(
    sourcesPour(btc).map((s) => s.id),
    ["binance", "coinbase", "kraken", "coingecko"],
  );
  // SOL remonte Coinbase, sans perdre les autres ni en changer l'ordre.
  assert.deepEqual(
    sourcesPour(sol).map((s) => s.id),
    ["coinbase", "binance", "kraken", "coingecko"],
  );
});

test("chaque actif a au moins deux sources de secours", () => {
  for (const a of ASSETS) {
    const utilisables = sourcesPour(a).filter((s) => s.urls(a, 400).length > 0);
    assert.ok(
      utilisables.length >= 2,
      `${a.id} n'a que ${utilisables.length} source(s) utilisable(s)`,
    );
  }
});

test("les plafonds demandés : 25 % par actif, 10 % pour Solana", () => {
  assert.equal(poidsMaxPct("SOL"), 10);
  for (const id of ["BTC", "ETH", "SPY", "QQQ"]) {
    assert.equal(poidsMaxPct(id), 25, `${id} doit être plafonné à 25 %`);
  }
});

test("stop loss d'environ 5 %, limite quotidienne entre 1 et 3 €", () => {
  assert.equal(cfg.sorties.stopLossPct, 5);
  assert.ok(
    cfg.pertes.blocageJour >= 1 && cfg.pertes.blocageJour <= 3,
    `limite quotidienne de ${cfg.pertes.blocageJour} €, attendue entre 1 et 3 €`,
  );
  assert.ok(cfg.pertes.alerteJour <= cfg.pertes.blocageJour);
});

test("moyenne mobile de 50 jours et plus d'un an d'historique demandé", () => {
  assert.equal(cfg.moyenneMobileJours, 50);
  assert.ok(cfg.historique.minimum >= 250, "au moins un an de Bourse");
  assert.ok(cfg.historique.jours >= cfg.historique.minimum);
});

test("tous les actifs suivis existent dans le catalogue de prix", () => {
  for (const id of idsActifs()) {
    assert.ok(getAsset(id), `${id} n'est pas un actif connu`);
    assert.ok(cfg.quantiteMinimale[id] > 0, `${id} n'a pas de quantité minimale`);
  }
});

console.log("\nSéparation des règles et du courtier");

const SOURCE_REGLES = readFileSync(new URL("../lib/bot-regles/decider.ts", import.meta.url), "utf8");
const SOURCE_COURTIER = readFileSync(new URL("../lib/broker/types.ts", import.meta.url), "utf8");

test("les règles n'importent ni courtier, ni base, ni réseau", () => {
  // On inspecte les lignes d'import, pas les commentaires.
  const imports = SOURCE_REGLES.split("\n").filter((l) => /^\s*import\b/.test(l));
  assert.ok(imports.length > 0, "le fichier doit bien avoir des imports");

  for (const ligne of imports) {
    for (const interdit of ["broker", "courtier", "/db", "server-only", "simule"]) {
      assert.ok(
        !ligne.includes(interdit),
        `decider.ts ne doit pas importer « ${interdit} » : ${ligne.trim()}`,
      );
    }
  }
  assert.ok(!SOURCE_REGLES.includes("fetch("), "aucun appel réseau dans les règles");
});

test("l'interface courtier expose bien acheter, vendre, solde et positions", () => {
  for (const methode of ["acheter(", "vendre(", "solde(", "positions("]) {
    assert.ok(SOURCE_COURTIER.includes(methode), `l'interface doit déclarer ${methode})`);
  }
  assert.ok(SOURCE_COURTIER.includes("readonly reel: false"), "le courtier reste non réel");
});

test("aucun appel à une API d'intelligence artificielle dans le projet", () => {
  for (const f of [
    "../lib/bot-regles/decider.ts",
    "../lib/bot-regles/run.ts",
    "../lib/broker/simule.ts",
    "../lib/broker/index.ts",
    "../lib/health.ts",
    "../config/bot-regles.ts",
  ]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    for (const interdit of ["anthropic", "ANTHROPIC_API_KEY", "openai"]) {
      assert.ok(!src.toLowerCase().includes(interdit.toLowerCase()), `${f} mentionne ${interdit}`);
    }
  }
});

console.log(`\n${reussis} test(s) réussi(s).`);
