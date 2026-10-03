/**
 * Tests de la base, exécutés contre un VRAI moteur PostgreSQL (PGlite).
 */
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { setRunner, ensureSchema, query, transaction } from "../lib/db";
import { getPortfolio, buy, sell, getOrders, resetPortfolio } from "../lib/portfolio";
import { getBot, saveBot } from "../lib/bot";
import { envoyerAlerte, dernieresAlertes } from "../lib/alertes";
import { capitalDuMois, historiqueCapital, suivreValeurDuMois } from "../lib/bot-regles/capital";
import { botEnPause, mettreBotEnPause, motifPause } from "../lib/bot-regles/run";
import { botReglesConfig } from "../config/bot-regles";

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

function brancher(pg: PGlite) {
  setRunner(async (text, params) => (await pg.query(text, params)).rows as Record<string, unknown>[]);
}

(async () => {
  const pg = new PGlite();
  brancher(pg);

  console.log("\nSchéma à propriétaire unique");

  await test("les tables sont créées", async () => {
    await ensureSchema();
    const t = await query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const noms = t.map((x) => x.table_name);
    for (const attendue of ["owner_portfolio", "owner_positions", "owner_orders", "owner_bot", "price_bars"]) {
      assert.ok(noms.includes(attendue), `table manquante : ${attendue}`);
    }
  });

  await test("aucune table de comptes ne subsiste", async () => {
    const t = await query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const noms = t.map((x) => x.table_name);
    for (const interdite of ["users", "sessions", "portfolios"]) {
      assert.ok(!noms.includes(interdite), `table de comptes encore présente : ${interdite}`);
    }
  });

  await test("le portefeuille ne peut exister qu'en un seul exemplaire", async () => {
    await assert.rejects(
      () => query("INSERT INTO owner_portfolio (id, cash, start_capital) VALUES (2, 50, 50)"),
      /violates check constraint|contrainte/i,
    );
  });

  console.log("\nPortefeuille");

  await test("portefeuille initial à 1 000 €", async () => {
    const p = await getPortfolio();
    assert.equal(p.cash, 1000);
    assert.equal(p.positions.length, 0);
  });

  await test("achat : débit, position et frais de 0,1 %", async () => {
    await buy("BTC", 500);
    const p = await getPortfolio();
    assert.ok(Math.abs(p.cash - 500) < 1e-9, `liquide = ${p.cash}`);
    assert.equal(p.positions[0].asset, "BTC");
    const o = await getOrders();
    assert.ok(Math.abs(o[0].fee - 0.5) < 1e-9, `frais = ${o[0].fee}`);
  });

  await test("achat au-delà du liquide refusé", async () => {
    await assert.rejects(() => buy("BTC", 10_000), /Liquidités insuffisantes/);
  });

  await test("vente partielle", async () => {
    const avant = await getPortfolio();
    await sell("BTC", avant.positions[0].quantity / 2);
    const apres = await getPortfolio();
    assert.ok(apres.cash > avant.cash);
    assert.equal((await getOrders())[0].side, "sell");
  });

  await test("vente supérieure à la position refusée", async () => {
    await assert.rejects(() => sell("BTC", 999), /supérieure à ce que tu détiens/);
  });

  await test("une transaction échouée ne laisse rien derrière elle", async () => {
    const avant = await getPortfolio();
    await assert.rejects(() =>
      transaction([
        { text: "UPDATE owner_portfolio SET cash = cash - 100 WHERE id = 1" },
        { text: "INSERT INTO owner_orders (asset, side, quantity, price, fee) VALUES ('BTC','INVALIDE',1,1,1)" },
      ]),
    );
    const apres = await getPortfolio();
    assert.ok(Math.abs(apres.cash - avant.cash) < 1e-9, "le liquide a bougé malgré l'échec");
  });

  await test("réinitialisation", async () => {
    await resetPortfolio();
    const p = await getPortfolio();
    assert.equal(p.cash, 1000);
    assert.equal(p.positions.length, 0);
    assert.equal((await getOrders()).length, 0);
  });

  console.log("\nBot");

  await test("réglages par défaut puis enregistrement", async () => {
    assert.equal((await getBot()).enabled, 0);
    await saveBot({ asset: "ETH", max_loss_pct: 15, enabled: 1, fast: 10, slow: 30 });
    const b = await getBot();
    assert.equal(b.asset, "ETH");
    assert.equal(b.enabled, 1);
    assert.equal(b.max_loss_pct, 15);
  });

  await test("moyenne courte forcée sous la moyenne longue", async () => {
    await saveBot({ fast: 90, slow: 50 });
    const b = await getBot();
    assert.ok(b.fast < b.slow, `fast=${b.fast} slow=${b.slow}`);
  });

  await pg.close();

  // ───────────────────────────────────────────────────────────
  console.log("\nMigration depuis l'ancienne base multi-comptes");

  const vieux = new PGlite();
  brancher(vieux);

  await test("une base à l'ancien format est migrée sans perte", async () => {
    // On reconstitue l'ancien schéma, avec deux comptes.
    await vieux.exec(`
      CREATE TABLE users (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        email text NOT NULL UNIQUE, password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE sessions (token text PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL);
      CREATE TABLE portfolios (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        cash double precision NOT NULL, start_capital double precision NOT NULL);
      CREATE TABLE positions (user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        asset text NOT NULL, quantity double precision NOT NULL, PRIMARY KEY (user_id, asset));
      CREATE TABLE orders (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        asset text NOT NULL, side text NOT NULL CHECK (side IN ('buy','sell')),
        quantity double precision NOT NULL, price double precision NOT NULL,
        fee double precision NOT NULL, source text NOT NULL DEFAULT 'manuel',
        created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE bots (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        asset text NOT NULL, strategy text NOT NULL, fast integer NOT NULL DEFAULT 20,
        slow integer NOT NULL DEFAULT 50, max_loss_pct double precision NOT NULL DEFAULT 20,
        enabled integer NOT NULL DEFAULT 0, stopped_reason text);

      INSERT INTO users (email, password_hash) VALUES ('proprio@exemple.fr','x'), ('autre@exemple.fr','y');
      INSERT INTO portfolios (user_id, cash, start_capital) VALUES (1, 742.50, 1000), (2, 10, 1000);
      INSERT INTO positions (user_id, asset, quantity) VALUES (1, 'BTC', 0.004), (2, 'ETH', 9);
      INSERT INTO orders (user_id, asset, side, quantity, price, fee)
        VALUES (1,'BTC','buy',0.004,64000,0.25), (2,'ETH','buy',9,3000,0.03);
      INSERT INTO bots (user_id, asset, strategy, max_loss_pct, enabled)
        VALUES (1,'DOGE','sma_cross',12,1), (2,'SPY','buy_and_hold',40,0);
    `);

    await ensureSchema(); // déclenche la migration

    const p = await getPortfolio();
    assert.ok(Math.abs(p.cash - 742.5) < 1e-9, `liquide repris = ${p.cash}`);
    assert.equal(p.positions.length, 1, "la position du propriétaire doit être reprise");
    assert.equal(p.positions[0].asset, "BTC");

    const o = await getOrders();
    assert.equal(o.length, 1, "seuls les ordres du propriétaire sont repris");
    assert.equal(o[0].asset, "BTC");

    const b = await getBot();
    assert.equal(b.asset, "DOGE", "les réglages du bot doivent être repris");
    assert.equal(b.max_loss_pct, 12);

    const tables = (
      await query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
      )
    ).map((t) => t.table_name);
    for (const interdite of ["users", "sessions", "portfolios", "positions", "orders", "bots"]) {
      assert.ok(!tables.includes(interdite), `ancienne table non supprimée : ${interdite}`);
    }
  });

  await test("rejouer la migration ne casse rien", async () => {
    const avant = await getPortfolio();
    await ensureSchema();
    const apres = await getPortfolio();
    assert.equal(apres.cash, avant.cash);
    assert.equal((await getOrders()).length, 1);
  });

  await vieux.close();

  // ─── Alertes et capital mensuel, sur une base neuve ────────────────

  const pg2 = new PGlite();
  brancher(pg2);
  await ensureSchema();

  console.log("\nAlertes");

  await test("une alerte est enregistrée et marquée comme non envoyée", async () => {
    const envoyee = await envoyerAlerte({
      type: "perte_jour",
      cle: "perte_jour:2026-10-03",
      titre: "Limite quotidienne atteinte",
      message: "Perte de 3,00 €.",
    });
    assert.equal(envoyee, true, "la première alerte doit partir");

    const lignes = await dernieresAlertes(10);
    assert.equal(lignes.length, 1);
    assert.equal(lignes[0].type, "perte_jour");
    assert.equal(lignes[0].canaux, "", "aucun canal configuré en test");
    assert.match(lignes[0].erreur ?? "", /aucun canal configuré/);
  });

  await test("la même alerte n'est jamais envoyée deux fois", async () => {
    const encore = await envoyerAlerte({
      type: "perte_jour",
      cle: "perte_jour:2026-10-03",
      titre: "Limite quotidienne atteinte",
      message: "Perte de 3,00 €.",
    });
    assert.equal(encore, false, "la relance ne doit rien renvoyer");
    assert.equal((await dernieresAlertes(10)).length, 1, "pas de doublon en base");
  });

  await test("une clé différente passe bien", async () => {
    assert.equal(
      await envoyerAlerte({
        type: "prix_indisponible",
        cle: "prix_indisponible:SPY:2026-10-03",
        titre: "Aucune source pour SPY",
        message: "Toutes les sources ont échoué.",
      }),
      true,
    );
    const lignes = await dernieresAlertes(10);
    assert.equal(lignes.length, 2);
    assert.equal(lignes[0].type, "prix_indisponible", "la plus récente d'abord");
  });

  console.log("\nCapital mois par mois");

  await test("le premier mois part du capital de départ", async () => {
    const m = await capitalDuMois("2026-10-03", 100);
    assert.equal(m.mois, "2026-10");
    assert.equal(m.capitalReference, botReglesConfig.capitalDepart);
    assert.equal(m.cloture, false);
  });

  await test("rappeler le même mois ne crée pas de doublon", async () => {
    await capitalDuMois("2026-10-20", 110);
    const lignes = await historiqueCapital(10);
    assert.equal(lignes.length, 1, "une seule ligne pour octobre");
  });

  await test("le mois suivant clôt le précédent", async () => {
    // Valeur de fin d'octobre enregistrée dans la courbe de valeur.
    await query(
      `INSERT INTO bot_equity (day, open_value, close_value) VALUES ('2026-10-31', 100, 118)
       ON CONFLICT (day) DO UPDATE SET close_value = 118`,
    );
    const novembre = await capitalDuMois("2026-11-02", 118);
    assert.equal(novembre.mois, "2026-11");

    const lignes = await historiqueCapital(10);
    const octobre = lignes.find((l) => l.mois === "2026-10");
    assert.ok(octobre);
    assert.equal(octobre.cloture, true, "octobre doit être clos");
    assert.equal(octobre.valeurFin, 118, "sa valeur de fin vient de bot_equity");
  });

  await test("sans réinvestissement, le capital de référence ne monte pas", async () => {
    // L'option est désactivée par défaut : un gain de 18 € ne doit rien changer.
    assert.equal(botReglesConfig.reinvestissement.actif, false);
    const lignes = await historiqueCapital(10);
    const novembre = lignes.find((l) => l.mois === "2026-11");
    assert.ok(novembre);
    assert.equal(novembre.capitalReference, botReglesConfig.capitalDepart);
    const octobre = lignes.find((l) => l.mois === "2026-10");
    assert.equal(octobre?.gainReinvesti, 0, "rien ne doit être réinvesti");
  });

  await test("réinvestissement activé : le gain du mois clos monte le capital", async () => {
    // Novembre finit à 118 € pour un capital de référence de 100 € :
    // +18 € de gain, donc décembre démarre avec 118 € de référence.
    await query(
      `INSERT INTO bot_equity (day, open_value, close_value) VALUES ('2026-11-30', 118, 118)
       ON CONFLICT (day) DO UPDATE SET close_value = 118`,
    );
    const decembre = await capitalDuMois("2026-12-01", 118, true);
    assert.equal(decembre.capitalReference, 118, "décembre part de 100 € + 18 € de gain");

    // Décembre finit à 140 € : +22 € par rapport à ses 118 € de référence.
    await query(
      `INSERT INTO bot_equity (day, open_value, close_value) VALUES ('2026-12-31', 118, 140)
       ON CONFLICT (day) DO UPDATE SET close_value = 140`,
    );
    const janvier = await capitalDuMois("2027-01-04", 140, true);
    assert.equal(
      janvier.capitalReference,
      140,
      "janvier doit partir de 118 € + 22 € de gain",
    );

    const decembreClos = (await historiqueCapital(20)).find((l) => l.mois === "2026-12");
    assert.equal(decembreClos?.gainReinvesti, 22);

    // Et une perte, elle, ne doit rien éroder.
    await query(
      `INSERT INTO bot_equity (day, open_value, close_value) VALUES ('2027-01-31', 140, 120)
       ON CONFLICT (day) DO UPDATE SET close_value = 120`,
    );
    const fevrier = await capitalDuMois("2027-02-02", 120, true);
    assert.equal(fevrier.capitalReference, 140, "une perte ne baisse pas le capital");
    const janvierClos = (await historiqueCapital(20)).find((l) => l.mois === "2027-01");
    assert.equal(janvierClos?.gainReinvesti, 0);
  });

  await test("la valeur du mois en cours se met à jour", async () => {
    await suivreValeurDuMois("2027-02-10", 123.45);
    const fevrier = (await historiqueCapital(20)).find((l) => l.mois === "2027-02");
    assert.equal(fevrier?.valeurFin, 123.45);
  });

  await test("le motif d'arrêt est conservé puis effacé", async () => {
    await mettreBotEnPause(true, "Plancher total atteint.");
    assert.equal(await botEnPause(), true);
    assert.equal(await motifPause(), "Plancher total atteint.");

    await mettreBotEnPause(false);
    assert.equal(await botEnPause(), false);
    assert.equal(await motifPause(), null, "le motif doit disparaître à la réactivation");
  });

  await pg2.close();

  console.log(`\n${reussis} test(s) réussi(s)\n`);
})();
