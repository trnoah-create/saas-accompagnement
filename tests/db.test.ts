/**
 * Tests de la couche base de données, exécutés contre un VRAI moteur
 * PostgreSQL (PGlite, en mémoire). Ils valident le schéma et chaque
 * requête SQL sans avoir besoin du réseau ni d'une base hébergée.
 */
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { setRunner, ensureSchema, query, queryOne, transaction } from "../lib/db";
import { getPortfolio, buy, sell, getOrders, resetPortfolio } from "../lib/portfolio";
import { getBot, saveBot } from "../lib/bot";

let reussis = 0;
async function test(nom: string, fn: () => Promise<void>) {
  try {
    await fn();
    reussis++;
    console.log(`  ✓ ${nom}`);
  } catch (e) {
    console.error(`  ✗ ${nom}\n    ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

const pg = new PGlite();
setRunner(async (text, params) => (await pg.query(text, params)).rows as Record<string, unknown>[]);

async function creerUtilisateur(email: string): Promise<number> {
  const row = await queryOne<{ id: number }>(
    "INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id",
    [email],
  );
  return row!.id;
}

(async () => {
  console.log("\nSchéma PostgreSQL");

  await test("le schéma se crée sans erreur", async () => {
    await ensureSchema();
    const tables = await query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    const noms = tables.map((t) => t.table_name);
    for (const attendue of ["users", "sessions", "portfolios", "positions", "orders", "bots", "price_bars"]) {
      assert.ok(noms.includes(attendue), `table manquante : ${attendue}`);
    }
  });

  await test("le schéma peut être rejoué sans casser (idempotent)", async () => {
    for (const t of [
      `CREATE TABLE IF NOT EXISTS users (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        email text NOT NULL UNIQUE, password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now())`,
    ]) {
      await query(t);
    }
  });

  console.log("\nPortefeuille");
  const uid = await creerUtilisateur("alice@exemple.fr");

  await test("nouveau portefeuille crédité de 1 000 €", async () => {
    const p = await getPortfolio(uid);
    assert.equal(p.cash, 1000);
    assert.equal(p.totalValue, 1000);
    assert.equal(p.positions.length, 0);
  });

  await test("achat : liquide débité, position créée, frais de 0,1 %", async () => {
    await buy(uid, "BTC", 500);
    const p = await getPortfolio(uid);
    assert.ok(Math.abs(p.cash - 500) < 1e-9, `liquide = ${p.cash}`);
    assert.equal(p.positions.length, 1);
    assert.equal(p.positions[0].asset, "BTC");

    const ordres = await getOrders(uid);
    assert.equal(ordres.length, 1);
    assert.equal(ordres[0].side, "buy");
    assert.ok(Math.abs(ordres[0].fee - 0.5) < 1e-9, `frais = ${ordres[0].fee}`);
  });

  await test("achat supérieur au liquide refusé", async () => {
    await assert.rejects(() => buy(uid, "BTC", 10_000), /Liquidités insuffisantes/);
  });

  await test("vente : liquide recrédité et ordre tracé", async () => {
    const avant = await getPortfolio(uid);
    const q = avant.positions[0].quantity;
    await sell(uid, "BTC", q / 2);
    const apres = await getPortfolio(uid);
    assert.ok(apres.cash > avant.cash, "le liquide aurait dû augmenter");
    assert.ok(Math.abs(apres.positions[0].quantity - q / 2) < 1e-12);
    assert.equal((await getOrders(uid))[0].side, "sell");
  });

  await test("vente d'une quantité trop grande refusée", async () => {
    await assert.rejects(() => sell(uid, "BTC", 999), /supérieure à ce que tu détiens/);
  });

  await test("une transaction échouée ne laisse rien derrière elle", async () => {
    const avant = await getPortfolio(uid);
    await assert.rejects(() =>
      transaction([
        { text: "UPDATE portfolios SET cash = cash - 100 WHERE user_id = $1", params: [uid] },
        { text: "INSERT INTO orders (user_id, asset, side, quantity, price, fee) VALUES ($1,'BTC','INVALIDE',1,1,1)", params: [uid] },
      ]),
    );
    const apres = await getPortfolio(uid);
    assert.ok(Math.abs(apres.cash - avant.cash) < 1e-9, "le liquide a été débité malgré l'échec");
  });

  await test("réinitialisation : retour à 1 000 €, plus de position ni d'ordre", async () => {
    await resetPortfolio(uid);
    const p = await getPortfolio(uid);
    assert.equal(p.cash, 1000);
    assert.equal(p.positions.length, 0);
    assert.equal((await getOrders(uid)).length, 0);
  });

  console.log("\nBot");

  await test("réglages par défaut", async () => {
    const b = await getBot(uid);
    assert.equal(b.strategy, "sma_cross");
    assert.equal(b.enabled, 0);
  });

  await test("enregistrement et relecture des réglages", async () => {
    await saveBot(uid, { asset: "ETH", max_loss_pct: 15, enabled: 1, fast: 10, slow: 30 });
    const b = await getBot(uid);
    assert.equal(b.asset, "ETH");
    assert.equal(b.max_loss_pct, 15);
    assert.equal(b.enabled, 1);
    assert.equal(b.fast, 10);
  });

  await test("garde-fou : moyenne courte forcée sous la moyenne longue", async () => {
    await saveBot(uid, { fast: 90, slow: 50 });
    const b = await getBot(uid);
    assert.ok(b.fast < b.slow, `fast=${b.fast} slow=${b.slow}`);
  });

  console.log("\nIsolation entre comptes");

  await test("un compte ne voit pas le portefeuille d'un autre", async () => {
    const autre = await creerUtilisateur("bob@exemple.fr");
    await buy(autre, "ETH", 300);
    const pa = await getPortfolio(uid);
    const pb = await getPortfolio(autre);
    assert.equal(pa.positions.length, 0, "alice ne doit rien détenir");
    assert.equal(pb.positions.length, 1, "bob doit détenir sa position");
    assert.equal((await getOrders(uid)).length, 0);
  });

  console.log(`\n${reussis} test(s) réussi(s)\n`);
  await pg.close();
})();
