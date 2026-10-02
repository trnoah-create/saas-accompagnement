/**
 * Tests du mode « Claude trader » : validation des ordres, plafonds,
 * garde-fous. Aucun appel réseau, aucune base.
 */
import assert from "node:assert/strict";
import { validerOrdres, perteJourDepassee } from "../lib/claude-trader/valider";
import { DecisionSchema } from "../lib/claude-trader/schema";
import { CLAUDE_TRADER } from "../lib/constants";

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

const PRIX = { BTC: 50_000, ETH: 2_500, DOGE: 0.1, SPY: 500 };

const etat = (cash: number, positions: { asset: string; quantity: number }[] = [], total?: number) => ({
  cash,
  totalValue: total ?? cash,
  positions,
});

const decision = (ordres: unknown[]) => ({ analyse: "test", ordres }) as never;

console.log("\nOrdres impossibles refusés");

test("actif inconnu", () => {
  const v = validerOrdres(
    decision([{ actif: "TESLA", sens: "achat", quantite: 1, justification: "x" }]),
    etat(1000),
    PRIX,
  );
  assert.equal(v.acceptes.length, 0);
  assert.match(v.refuses[0].motifRefus, /Actif inconnu/);
});

test("quantité nulle ou négative", () => {
  for (const q of [0, -1]) {
    const v = validerOrdres(
      decision([{ actif: "BTC", sens: "achat", quantite: q, justification: "x" }]),
      etat(1000),
      PRIX,
    );
    assert.equal(v.acceptes.length, 0, `quantité ${q} acceptée`);
  }
});

test("liquidités insuffisantes", () => {
  const v = validerOrdres(
    decision([{ actif: "BTC", sens: "achat", quantite: 1, justification: "x" }]),
    etat(1000, [], 1000),
    PRIX,
  );
  assert.equal(v.acceptes.length, 0);
  assert.match(v.refuses[0].motifRefus, /trop gros|insuffisantes/);
});

test("vente sans position", () => {
  const v = validerOrdres(
    decision([{ actif: "ETH", sens: "vente", quantite: 1, justification: "x" }]),
    etat(1000, [], 1000),
    PRIX,
  );
  assert.equal(v.acceptes.length, 0);
  assert.match(v.refuses[0].motifRefus, /Position insuffisante/);
});

test("vente supérieure à la position détenue", () => {
  const v = validerOrdres(
    decision([{ actif: "ETH", sens: "vente", quantite: 5, justification: "x" }]),
    // Portefeuille large : le refus doit porter sur la position, pas la taille.
    etat(0, [{ asset: "ETH", quantity: 2 }], 200_000),
    PRIX,
  );
  assert.equal(v.acceptes.length, 0);
  assert.match(v.refuses[0].motifRefus, /2 détenus/);
});

console.log("\nPlafonds");

test("un ordre ne peut dépasser le plafond par ordre", () => {
  // Portefeuille 10 000 € → plafond 25 % = 2 500 €. Un achat de 3 000 € est refusé.
  const v = validerOrdres(
    decision([{ actif: "SPY", sens: "achat", quantite: 6, justification: "x" }]),
    etat(10_000, [], 10_000),
    PRIX,
  );
  assert.equal(v.acceptes.length, 0);
  assert.match(v.refuses[0].motifRefus, /trop gros/);
});

test("un ordre juste sous le plafond passe", () => {
  const v = validerOrdres(
    decision([{ actif: "SPY", sens: "achat", quantite: 4, justification: "x" }]),
    etat(10_000, [], 10_000),
    PRIX,
  );
  assert.equal(v.acceptes.length, 1, JSON.stringify(v.refuses));
});

test("le nombre d'ordres par jour est plafonné", () => {
  const trop = Array.from({ length: CLAUDE_TRADER.maxOrdresParJour + 3 }, () => ({
    actif: "DOGE",
    sens: "achat",
    quantite: 100,
    justification: "x",
  }));
  const v = validerOrdres(decision(trop), etat(10_000, [], 10_000), PRIX);
  assert.equal(v.acceptes.length, CLAUDE_TRADER.maxOrdresParJour);
  assert.ok(v.refuses.some((r) => /Plafond de .* ordres par jour/.test(r.motifRefus)));
});

test("le motif d'une vente impossible parle de la position, pas de la taille", () => {
  const v = validerOrdres(
    decision([{ actif: "BTC", sens: "vente", quantite: 10, justification: "x" }]),
    etat(100, [], 100),
    PRIX,
  );
  assert.match(v.refuses[0].motifRefus, /Position insuffisante/);
});

console.log("\nEnchaînement des ordres");

test("l'argent ne peut pas être dépensé deux fois", () => {
  // 1 000 € de liquide, deux achats de 600 € : le second doit être refusé.
  const v = validerOrdres(
    decision([
      { actif: "SPY", sens: "achat", quantite: 1.2, justification: "a" },
      { actif: "SPY", sens: "achat", quantite: 1.2, justification: "b" },
    ]),
    etat(1000, [], 4000),
    PRIX,
  );
  assert.equal(v.acceptes.length, 1);
  assert.match(v.refuses[0].motifRefus, /insuffisantes/);
});

test("vendre puis racheter avec le produit de la vente est possible", () => {
  const v = validerOrdres(
    decision([
      { actif: "ETH", sens: "vente", quantite: 0.4, justification: "vendre" },
      { actif: "SPY", sens: "achat", quantite: 1.9, justification: "racheter" },
    ]),
    etat(0, [{ asset: "ETH", quantity: 1 }], 5000),
    PRIX,
  );
  assert.equal(v.acceptes.length, 2, JSON.stringify(v.refuses));
  assert.equal(v.acceptes[0].side, "sell");
  assert.equal(v.acceptes[1].side, "buy");
});

test("les ordres valables passent même si d'autres sont refusés", () => {
  const v = validerOrdres(
    decision([
      { actif: "INCONNU", sens: "achat", quantite: 1, justification: "x" },
      { actif: "DOGE", sens: "achat", quantite: 1000, justification: "ok" },
    ]),
    etat(1000, [], 4000),
    PRIX,
  );
  assert.equal(v.acceptes.length, 1);
  assert.equal(v.refuses.length, 1);
  assert.equal(v.acceptes[0].asset, "DOGE");
});

test("une liste d'ordres vide est acceptée sans rien faire", () => {
  const v = validerOrdres(decision([]), etat(1000), PRIX);
  assert.equal(v.acceptes.length, 0);
  assert.equal(v.refuses.length, 0);
});

console.log("\nStop de perte quotidien");

test("une perte sous le seuil n'arrête rien", () => {
  const r = perteJourDepassee(980, 1000);
  assert.equal(r.depassee, false);
  assert.ok(Math.abs(r.pct! - -2) < 1e-9);
});

test("une perte au-delà du seuil arrête la journée", () => {
  const r = perteJourDepassee(900, 1000);
  assert.equal(r.depassee, true, `perte de ${r.pct}% non détectée`);
});

test("sans valeur de référence, on n'arrête pas", () => {
  assert.equal(perteJourDepassee(500, null).depassee, false);
});

console.log("\nFormat de réponse imposé");

test("une réponse conforme est acceptée", () => {
  const r = DecisionSchema.safeParse({
    analyse: "Marché calme.",
    ordres: [{ actif: "BTC", sens: "achat", quantite: 0.01, justification: "tendance" }],
  });
  assert.equal(r.success, true);
});

test("un actif hors liste est rejeté par le schéma", () => {
  const r = DecisionSchema.safeParse({
    analyse: "x",
    ordres: [{ actif: "GME", sens: "achat", quantite: 1, justification: "y" }],
  });
  assert.equal(r.success, false);
});

test("un sens inconnu est rejeté", () => {
  const r = DecisionSchema.safeParse({
    analyse: "x",
    ordres: [{ actif: "BTC", sens: "shorter", quantite: 1, justification: "y" }],
  });
  assert.equal(r.success, false);
});

test("une quantité négative est rejetée par le schéma", () => {
  const r = DecisionSchema.safeParse({
    analyse: "x",
    ordres: [{ actif: "BTC", sens: "achat", quantite: -1, justification: "y" }],
  });
  assert.equal(r.success, false);
});

test("une justification manquante est rejetée", () => {
  const r = DecisionSchema.safeParse({
    analyse: "x",
    ordres: [{ actif: "BTC", sens: "achat", quantite: 1 }],
  });
  assert.equal(r.success, false);
});

console.log(`\n${reussis} test(s) réussi(s)\n`);
