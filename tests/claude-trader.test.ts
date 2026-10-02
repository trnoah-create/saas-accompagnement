/**
 * Tests du mode « Claude trader » : limites de perte, cadre des ordres,
 * découpage du temps. Aucun réseau, aucune base.
 */
import assert from "node:assert/strict";
import {
  evaluerLimites,
  jourLocal,
  debutSemaine,
  debutMois,
} from "../lib/claude-trader/limites";
import { validerOrdres } from "../lib/claude-trader/valider";
import { DecisionSchema } from "../lib/claude-trader/schema";
import { claudeTraderConfig as cfg } from "../config/claude-trader";

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

const C = 100; // capital de départ
const ouv = (jour: number | null, semaine: number | null = jour, mois: number | null = jour) =>
  ({ jour, semaine, mois });

console.log("\nLimites de perte — journée");

test("sans perte, les échanges continuent", () => {
  assert.equal(evaluerLimites(100, ouv(100)).action, "continuer");
  assert.equal(evaluerLimites(103, ouv(100)).action, "continuer");
});

test("perte de 1,99 € : toujours sous l'alerte", () => {
  assert.equal(evaluerLimites(98.01, ouv(100)).action, "continuer");
});

test("perte de 2 € : alerte, mais les échanges continuent", () => {
  const d = evaluerLimites(98, ouv(100));
  assert.equal(d.action, "alerte");
  assert.match(d.action === "alerte" ? d.motif : "", /alerte/i);
});

test("perte de 2,99 € : encore en alerte", () => {
  assert.equal(evaluerLimites(97.01, ouv(100)).action, "alerte");
});

test("perte de 3 € : blocage jusqu'au lendemain", () => {
  const d = evaluerLimites(97, ouv(100));
  assert.equal(d.action, "bloquer_jour");
  assert.match(d.action === "bloquer_jour" ? d.motif : "", /jusqu'à demain/);
});

test("perte de 5 € sur la journée : blocage, la semaine tient encore", () => {
  // 5 € perdus : au-delà du blocage quotidien (3 €) mais sous la limite
  // hebdomadaire (6 €), donc on bloque la journée sans mettre en pause.
  assert.equal(evaluerLimites(95, ouv(100)).action, "bloquer_jour");
});

test("une grosse perte franchit aussi la limite hebdomadaire et met en pause", () => {
  // 10 € perdus : le blocage du jour ET la limite de la semaine sont
  // franchis ; c'est la règle la plus grave qui s'applique.
  const d = evaluerLimites(90, ouv(100));
  assert.equal(d.action, "pause");
  assert.match(d.action === "pause" ? d.motif : "", /hebdomadaire/);
});

test("les pertes sont mesurées en euros, pas en pourcentage", () => {
  // 3 € sur un portefeuille de 1 000 € = 0,3 % : bloque quand même.
  assert.equal(evaluerLimites(997, ouv(1000)).action, "bloquer_jour");
  // 2 % d'un portefeuille de 50 € = 1 € : ne bloque pas.
  assert.equal(evaluerLimites(49, ouv(50)).action, "continuer");
});

console.log("\nLimites de perte — semaine et mois");

test("perte hebdomadaire de 6 € : mise en pause", () => {
  const d = evaluerLimites(94, ouv(94, 100, 100));
  assert.equal(d.action, "pause");
  assert.match(d.action === "pause" ? d.motif : "", /hebdomadaire/);
});

test("perte hebdomadaire de 5,99 € : pas de pause", () => {
  assert.notEqual(evaluerLimites(94.01, ouv(94.01, 100, 100)).action, "pause");
});

test("perte mensuelle de 15 € : mise en pause", () => {
  const d = evaluerLimites(85, ouv(85, 85, 100));
  assert.equal(d.action, "pause");
  assert.match(d.action === "pause" ? d.motif : "", /mensuelle/);
});

test("la limite mensuelle prime sur l'hebdomadaire", () => {
  const d = evaluerLimites(80, ouv(80, 90, 100));
  assert.equal(d.action, "pause");
  assert.match(d.action === "pause" ? d.motif : "", /mensuelle/);
});

test("la pause prime sur le blocage du jour", () => {
  // Perte du jour 4 € ET perte du mois 20 € : c'est la pause qui l'emporte.
  const d = evaluerLimites(80, ouv(84, 84, 100));
  assert.equal(d.action, "pause");
});

test("sans historique, aucune limite ne se déclenche", () => {
  assert.equal(evaluerLimites(50, ouv(null)).action, "continuer");
});

test("les pertes sont reportées pour l'affichage", () => {
  const d = evaluerLimites(96, ouv(100, 101, 102));
  assert.ok(Math.abs(d.pertes.jour! - 4) < 1e-9);
  assert.ok(Math.abs(d.pertes.semaine! - 5) < 1e-9);
  assert.ok(Math.abs(d.pertes.mois! - 6) < 1e-9);
});

console.log("\nDécoupage du temps (heure de Paris)");

test("la journée bascule à minuit heure de Paris, pas UTC", () => {
  // 31 décembre 23 h 30 UTC = 1er janvier 00 h 30 à Paris (UTC+1).
  assert.equal(jourLocal(new Date("2025-12-31T23:30:00Z")), "2026-01-01");
  // 1er janvier 00 h 30 UTC = toujours le 1er janvier à Paris.
  assert.equal(jourLocal(new Date("2026-01-01T00:30:00Z")), "2026-01-01");
});

test("en heure d'été, le décalage est de deux heures", () => {
  // 30 juin 22 h 30 UTC = 1er juillet 00 h 30 à Paris (UTC+2).
  assert.equal(jourLocal(new Date("2026-06-30T22:30:00Z")), "2026-07-01");
});

test("la semaine commence le lundi", () => {
  assert.equal(debutSemaine("2026-10-02"), "2026-09-28"); // vendredi → lundi
  assert.equal(debutSemaine("2026-09-28"), "2026-09-28"); // lundi → lui-même
  assert.equal(debutSemaine("2026-10-04"), "2026-09-28"); // dimanche → lundi
});

test("le mois commence le 1er", () => {
  assert.equal(debutMois("2026-10-02"), "2026-10-01");
  assert.equal(debutMois("2026-01-31"), "2026-01-01");
});

console.log("\nCadre des ordres");

const PRIX = { BTC: 50_000, ETH: 2_500, DOGE: 0.1, SPY: 500 };
const etat = (cash: number, positions: { asset: string; quantity: number }[] = [], total?: number) => ({
  cash,
  totalValue: total ?? cash,
  positions,
});
const dec = (ordres: unknown[]) => ({ analyse: "test", ordres }) as never;

test("un montant au-dessus du plafond est refusé", () => {
  const v = validerOrdres(
    dec([{ actif: "BTC", sens: "achat", montant: 6, justification: "x" }]),
    etat(C, [], C),
    PRIX,
  );
  assert.equal(v.acceptes.length, 0);
  assert.match(v.refuses[0].motifRefus, /plafond de 5,00 €|plafond de 5.00 €/);
});

test("un montant au plafond exact passe", () => {
  const v = validerOrdres(
    dec([{ actif: "BTC", sens: "achat", montant: 5, justification: "x" }]),
    etat(C, [], C),
    PRIX,
  );
  assert.equal(v.acceptes.length, 1, JSON.stringify(v.refuses));
});

test("un montant dérisoire est refusé", () => {
  const v = validerOrdres(
    dec([{ actif: "BTC", sens: "achat", montant: 0.2, justification: "x" }]),
    etat(C, [], C),
    PRIX,
  );
  assert.match(v.refuses[0].motifRefus, /minimum/);
});

test("pas plus de 3 ordres par jour", () => {
  const v = validerOrdres(
    dec(
      Array.from({ length: 6 }, () => ({
        actif: "DOGE",
        sens: "achat",
        montant: 2,
        justification: "x",
      })),
    ),
    etat(C, [], C),
    PRIX,
  );
  assert.equal(v.acceptes.length, cfg.ordres.maxParJour);
  assert.ok(v.refuses.some((r) => /ordres par jour/.test(r.motifRefus)));
});

test("un actif ne peut dépasser 40 % du portefeuille", () => {
  // Déjà 38 € de BTC sur 100 € ; ajouter 5 € ferait 43 %.
  const v = validerOrdres(
    dec([{ actif: "BTC", sens: "achat", montant: 5, justification: "x" }]),
    etat(62, [{ asset: "BTC", quantity: 38 / PRIX.BTC }], 100),
    PRIX,
  );
  assert.equal(v.acceptes.length, 0);
  assert.match(v.refuses[0].motifRefus, /40 %/);
});

test("vente à découvert interdite", () => {
  const v = validerOrdres(
    dec([{ actif: "ETH", sens: "vente", montant: 3, justification: "x" }]),
    etat(C, [], C),
    PRIX,
  );
  assert.equal(v.acceptes.length, 0);
  assert.match(v.refuses[0].motifRefus, /découvert/);
});

test("on ne vend pas plus que ce qu'on détient", () => {
  const v = validerOrdres(
    dec([{ actif: "ETH", sens: "vente", montant: 5, justification: "x" }]),
    etat(0, [{ asset: "ETH", quantity: 2 / PRIX.ETH }], 100),
    PRIX,
  );
  assert.equal(v.acceptes.length, 0);
  assert.match(v.refuses[0].motifRefus, /Position insuffisante/);
});

test("pas d'effet de levier : on n'engage pas plus que le liquide", () => {
  // Portefeuille cohérent de 100 € : 5 € de liquide, 95 € déjà investis
  // ailleurs. La concentration n'est donc pas la contrainte qui mord.
  const v = validerOrdres(
    dec([
      { actif: "SPY", sens: "achat", montant: 4, justification: "a" },
      { actif: "SPY", sens: "achat", montant: 4, justification: "b" },
    ]),
    etat(5, [
      { asset: "BTC", quantity: 50 / PRIX.BTC },
      { asset: "ETH", quantity: 45 / PRIX.ETH },
    ]),
    PRIX,
  );
  assert.equal(v.acceptes.length, 1, JSON.stringify(v.refuses));
  assert.match(v.refuses[0].motifRefus, /insuffisantes/);
});

test("un actif hors liste est refusé", () => {
  const v = validerOrdres(
    dec([{ actif: "TSLA", sens: "achat", montant: 2, justification: "x" }]),
    etat(C, [], C),
    PRIX,
  );
  assert.match(v.refuses[0].motifRefus, /non autorisé/);
});

test("ne rien faire est accepté", () => {
  const v = validerOrdres(dec([]), etat(C, [], C), PRIX);
  assert.equal(v.acceptes.length, 0);
  assert.equal(v.refuses.length, 0);
});

test("les ordres valables passent même si d'autres sont refusés", () => {
  const v = validerOrdres(
    dec([
      { actif: "TSLA", sens: "achat", montant: 2, justification: "x" },
      { actif: "DOGE", sens: "achat", montant: 3, justification: "ok" },
    ]),
    etat(C, [], C),
    PRIX,
  );
  assert.equal(v.acceptes.length, 1);
  assert.equal(v.acceptes[0].asset, "DOGE");
  assert.equal(v.refuses.length, 1);
});

console.log("\nCoûts simulés");

test("les frais réduisent le liquide au-delà du montant engagé", () => {
  const v = validerOrdres(
    dec([{ actif: "SPY", sens: "achat", montant: 5, justification: "x" }]),
    // 5,00 € pile ne suffit pas : il faut aussi les frais.
    etat(5, [
      { asset: "BTC", quantity: 50 / PRIX.BTC },
      { asset: "ETH", quantity: 45 / PRIX.ETH },
    ]),
    PRIX,
  );
  assert.equal(v.acceptes.length, 0);
  assert.match(v.refuses[0].motifRefus, /insuffisantes/);
});

test("l'écart achat/vente fait acheter plus cher et vendre moins cher", async () => {
  const { prixAchat, prixVente } = await import("../config/claude-trader");
  assert.ok(prixAchat(100) > 100, "l'achat devrait coûter plus que le prix affiché");
  assert.ok(prixVente(100) < 100, "la vente devrait rapporter moins que le prix affiché");
  // Aller-retour immédiat : on perd l'écart.
  assert.ok(prixVente(100) < prixAchat(100));
});

console.log("\nFormat de réponse imposé");

test("une réponse conforme est acceptée", () => {
  assert.equal(
    DecisionSchema.safeParse({
      analyse: "Marché calme.",
      ordres: [{ actif: "BTC", sens: "achat", montant: 3, justification: "tendance" }],
    }).success,
    true,
  );
});

test("ne rien faire est une réponse conforme", () => {
  assert.equal(DecisionSchema.safeParse({ analyse: "Rien à signaler.", ordres: [] }).success, true);
});

for (const [nom, mauvais] of [
  ["actif hors liste", { actif: "GME", sens: "achat", montant: 2, justification: "y" }],
  ["sens inconnu", { actif: "BTC", sens: "shorter", montant: 2, justification: "y" }],
  ["montant négatif", { actif: "BTC", sens: "achat", montant: -2, justification: "y" }],
  ["justification absente", { actif: "BTC", sens: "achat", montant: 2 }],
] as const) {
  test(`${nom} : rejeté par le schéma`, () => {
    assert.equal(DecisionSchema.safeParse({ analyse: "x", ordres: [mauvais] }).success, false);
  });
}

console.log(`\n${reussis} test(s) réussi(s)\n`);
