/**
 * Tests du mot de passe unique et du jeton de session signé.
 */
import assert from "node:assert/strict";
import {
  creerJeton,
  jetonValide,
  motDePasseConfigure,
  motDePasseValide,
} from "../lib/session";

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

console.log("\nMot de passe");

test("sans SITE_PASSWORD, rien n'est accepté", () => {
  delete process.env.SITE_PASSWORD;
  assert.equal(motDePasseConfigure(), false);
  assert.equal(motDePasseValide(""), false);
  assert.equal(motDePasseValide("nimporte"), false);
  assert.throws(() => creerJeton(), /SITE_PASSWORD/);
});

test("une variable vide compte comme absente", () => {
  process.env.SITE_PASSWORD = "";
  assert.equal(motDePasseConfigure(), false);
  assert.equal(motDePasseValide(""), false);
});

test("seul le bon mot de passe est accepté", () => {
  process.env.SITE_PASSWORD = "secret-du-proprietaire";
  assert.equal(motDePasseValide("secret-du-proprietaire"), true);
  assert.equal(motDePasseValide("secret-du-proprietair"), false);
  assert.equal(motDePasseValide("Secret-du-proprietaire"), false);
  assert.equal(motDePasseValide(""), false);
});

console.log("\nJeton de session");

test("un jeton fraîchement créé est valide", () => {
  process.env.SITE_PASSWORD = "secret";
  assert.equal(jetonValide(creerJeton()), true);
});

test("un jeton absent ou vide est refusé", () => {
  assert.equal(jetonValide(undefined), false);
  assert.equal(jetonValide(""), false);
});

test("un jeton forgé ou modifié est refusé", () => {
  process.env.SITE_PASSWORD = "secret";
  const bon = creerJeton();
  const [exp, sig] = [bon.slice(0, bon.lastIndexOf(".")), bon.slice(bon.lastIndexOf(".") + 1)];

  assert.equal(jetonValide(`${exp}.${"0".repeat(sig.length)}`), false, "signature bidon acceptée");
  assert.equal(jetonValide(`${Number(exp) + 999999}.${sig}`), false, "expiration repoussée acceptée");
  assert.equal(jetonValide("nimportequoi"), false);
  assert.equal(jetonValide(`${exp}.`), false);
});

test("un jeton expiré est refusé", () => {
  process.env.SITE_PASSWORD = "secret";
  const vieux = creerJeton(Date.now() - 40 * 24 * 3600 * 1000);
  assert.equal(jetonValide(vieux), false);
});

test("changer le mot de passe invalide les sessions en cours", () => {
  process.env.SITE_PASSWORD = "ancien";
  const jeton = creerJeton();
  assert.equal(jetonValide(jeton), true);

  process.env.SITE_PASSWORD = "nouveau";
  assert.equal(jetonValide(jeton), false, "la session a survécu au changement de mot de passe");
});

test("sans SITE_PASSWORD, aucun jeton n'est valide", () => {
  process.env.SITE_PASSWORD = "secret";
  const jeton = creerJeton();
  delete process.env.SITE_PASSWORD;
  assert.equal(jetonValide(jeton), false);
});

console.log(`\n${reussis} test(s) réussi(s)\n`);
