/**
 * Base de données — PostgreSQL hébergé (Neon, via l'intégration Vercel).
 *
 * Pourquoi plus SQLite : sur Vercel, le disque est effacé à chaque
 * déploiement et entre deux requêtes. Un fichier .db y serait remis à zéro
 * en permanence. Une base hébergée conserve réellement les comptes et les
 * ordres.
 *
 * Le pilote Neon parle en HTTP : pas de connexion TCP à maintenir, ce qui
 * convient aux fonctions serverless qui démarrent et s'arrêtent sans cesse.
 */
import "server-only";

export type Statement = { text: string; params?: unknown[] };

/** Erreur claire quand la base n'est pas branchée (variable manquante). */
export class DatabaseNonConfiguree extends Error {
  constructor() {
    super(
      "Aucune base de données n'est connectée. Ajoute la variable d'environnement DATABASE_URL (intégration Neon sur Vercel).",
    );
    this.name = "DatabaseNonConfiguree";
  }
}

type Runner = (text: string, params: unknown[]) => Promise<Record<string, unknown>[]>;

/** Panne de connexion passagère, par opposition à une vraie erreur SQL. */
function estErreurConnexion(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /Connection terminated|ECONNRESET|socket hang up|terminating connection|server closed/i.test(m);
}

let runner: Runner | null = null;
let schemaPret: Promise<void> | null = null;

/** Utilisé par les tests pour brancher un Postgres local à la place de Neon. */
export function setRunner(fn: Runner | null) {
  runner = fn;
  schemaPret = null;
}

export function urlBase(): string | null {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    null
  );
}

export function baseConfiguree(): boolean {
  return runner !== null || urlBase() !== null;
}

/**
 * Neon propose un pilote HTTP, idéal en serverless (pas de connexion TCP à
 * maintenir). Pour toute autre base PostgreSQL — Supabase, Railway, ou un
 * Postgres local — on utilise le pilote classique `pg`.
 */
function estNeon(url: string): boolean {
  try {
    return /\.neon\.(tech|build)$/.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function getRunner(): Promise<Runner> {
  if (runner) return runner;

  const url = urlBase();
  if (!url) throw new DatabaseNonConfiguree();

  if (estNeon(url)) {
    const { neon } = await import("@neondatabase/serverless");
    const client = neon(url);
    runner = async (text, params) =>
      (await client.query(text, params)) as Record<string, unknown>[];
  } else {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: url,
      ssl: url.includes("localhost") || url.includes("127.0.0.1")
        ? undefined
        : { rejectUnauthorized: false },
      // Les hébergeurs serverless limitent les connexions simultanées.
      // Réglable via DATABASE_POOL_MAX si besoin.
      max: Number(process.env.DATABASE_POOL_MAX) || 3,
    });
    // Une connexion inactive peut être coupée par l'hébergeur. Sans ce
    // garde-fou, l'erreur remonterait en 500 à l'utilisateur.
    pool.on("error", (e) => console.warn("[base] connexion perdue :", e.message));

    runner = async (text, params) => {
      let derniere: unknown;
      // Jusqu'à trois essais : le temps que le pool remplace la connexion
      // morte par une neuve. Une vraie erreur SQL, elle, remonte aussitôt.
      for (let essai = 0; essai < 3; essai++) {
        try {
          return (await pool.query(text, params)).rows;
        } catch (e) {
          if (!estErreurConnexion(e)) throw e;
          derniere = e;
          await new Promise((r) => setTimeout(r, 50 * (essai + 1)));
        }
      }
      throw derniere;
    };
  }
  return runner;
}

/** Crée les tables au premier appel, une seule fois par instance. */
export async function ensureSchema(): Promise<void> {
  if (!schemaPret) schemaPret = creerSchema();
  return schemaPret;
}

async function creerSchema() {
  const run = await getRunner();
  for (const text of SCHEMA) await run(text, []);

  const bilan = await migrerDepuisMultiComptes(run);
  if (bilan.migre) console.info("[base] migration vers le propriétaire unique :", bilan.detail);

  await alignerCapitalBot(run);
}

/**
 * Aligne le capital de départ du bot sur la valeur configurée, tant
 * qu'aucun ordre n'a été passé. Dès qu'un historique existe, on n'y touche
 * plus : on ne réécrit jamais un passé réel.
 */
async function alignerCapitalBot(run: Runner): Promise<void> {
  const { botReglesConfig } = await import("../config/bot-regles");
  const capital = botReglesConfig.capitalDepart;

  const ordres = await run("SELECT 1 FROM bot_orders LIMIT 1", []);
  if (ordres.length > 0) return;

  await run(
    `INSERT INTO bot_portfolio (id, cash, start_capital) VALUES (1, $1, $1)
     ON CONFLICT (id) DO UPDATE SET cash = $1, start_capital = $1
     WHERE bot_portfolio.start_capital <> $1`,
    [capital],
  );
}

/** Exécute une requête et renvoie les lignes. */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  await ensureSchema();
  const run = await getRunner();
  return (await run(text, params)) as T[];
}

/** Une seule ligne, ou undefined. */
export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  return (await query<T>(text, params))[0];
}

/**
 * Plusieurs requêtes dans une seule transaction : soit tout passe, soit
 * rien. Indispensable pour un mouvement d'argent, où débiter le liquide
 * sans créditer la position laisserait le portefeuille incohérent.
 */
export async function transaction(statements: Statement[]): Promise<void> {
  await ensureSchema();

  if (runner && !urlBase()) {
    // Chemin de test (Postgres local) : on encadre manuellement.
    await runner("BEGIN", []);
    try {
      for (const s of statements) await runner(s.text, s.params ?? []);
      await runner("COMMIT", []);
    } catch (e) {
      await runner("ROLLBACK", []);
      throw e;
    }
    return;
  }

  const url = urlBase();
  if (!url) throw new DatabaseNonConfiguree();

  if (estNeon(url)) {
    const { neon } = await import("@neondatabase/serverless");
    const client = neon(url);
    await client.transaction(statements.map((s) => client.query(s.text, s.params ?? [])));
    return;
  }

  // Pilote classique : on encadre explicitement la transaction.
  const run = await getRunner();
  await run("BEGIN", []);
  try {
    for (const s of statements) await run(s.text, s.params ?? []);
    await run("COMMIT", []);
  } catch (e) {
    await run("ROLLBACK", []);
    throw e;
  }
}

const SCHEMA: string[] = [
  // Portefeuille unique : une seule ligne, verrouillée par la contrainte id = 1.
  `CREATE TABLE IF NOT EXISTS owner_portfolio (
     id            smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
     cash          double precision NOT NULL,
     start_capital double precision NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS owner_positions (
     asset    text PRIMARY KEY,
     quantity double precision NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS owner_orders (
     id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     asset      text NOT NULL,
     side       text NOT NULL CHECK (side IN ('buy','sell')),
     quantity   double precision NOT NULL,
     price      double precision NOT NULL,
     fee        double precision NOT NULL,
     source     text NOT NULL DEFAULT 'manuel',
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS owner_bot (
     id             smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
     asset          text NOT NULL,
     strategy       text NOT NULL,
     fast           integer NOT NULL DEFAULT 20,
     slow           integer NOT NULL DEFAULT 50,
     max_loss_pct   double precision NOT NULL DEFAULT 20,
     enabled        integer NOT NULL DEFAULT 0,
     stopped_reason text
   )`,
  // ─── Bot automatique : portefeuille distinct du tien ─────────────
  `CREATE TABLE IF NOT EXISTS bot_portfolio (
     id            smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
     cash          double precision NOT NULL,
     start_capital double precision NOT NULL,
     started_on    date NOT NULL DEFAULT CURRENT_DATE,
     paused        integer NOT NULL DEFAULT 0
   )`,
  // prix_entree : prix moyen d'achat, nécessaire au stop loss.
  `CREATE TABLE IF NOT EXISTS bot_positions (
     asset       text PRIMARY KEY,
     quantity    double precision NOT NULL,
     prix_entree double precision NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS bot_orders (
     id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     day        date NOT NULL DEFAULT CURRENT_DATE,
     asset      text NOT NULL,
     side       text NOT NULL CHECK (side IN ('buy','sell')),
     montant    double precision NOT NULL,
     quantity   double precision NOT NULL,
     price      double precision NOT NULL,
     fee        double precision NOT NULL,
     reason     text NOT NULL DEFAULT '',
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  // Motif d'un arrêt : vide tant que le bot tourne, rempli par un plancher
  // atteint. Ajouté après coup, d'où le ALTER.
  `ALTER TABLE bot_portfolio ADD COLUMN IF NOT EXISTS paused_reason text`,
  `CREATE TABLE IF NOT EXISTS bot_benchmark (
     asset    text PRIMARY KEY,
     quantity double precision NOT NULL
   )`,
  // Alertes envoyées. `cle` rend l'envoi idempotent : une même alerte ne
  // part jamais deux fois, même si la tâche est relancée.
  `CREATE TABLE IF NOT EXISTS bot_alertes (
     id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     cle        text NOT NULL UNIQUE,
     type       text NOT NULL,
     titre      text NOT NULL,
     message    text NOT NULL DEFAULT '',
     canaux     text NOT NULL DEFAULT '',
     erreur     text,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  // Capital de référence par mois : base du plancher total, et trace de
  // l'éventuel réinvestissement des gains.
  `CREATE TABLE IF NOT EXISTS bot_capital (
     mois                text PRIMARY KEY,
     capital_reference   double precision NOT NULL,
     valeur_debut        double precision,
     valeur_fin          double precision,
     gain_reinvesti      double precision NOT NULL DEFAULT 0,
     cloture             integer NOT NULL DEFAULT 0,
     created_at          timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS bot_equity (
     day         date PRIMARY KEY,
     open_value  double precision NOT NULL,
     close_value double precision NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS bot_reports (
     day              date PRIMARY KEY,
     statut           text NOT NULL,
     valeur           double precision,
     gain_jour_pct    double precision,
     valeur_temoin    double precision,
     temoin_gain_pct  double precision,
     resume           text NOT NULL DEFAULT '',
     detail           text NOT NULL DEFAULT '{}',
     erreur           text,
     created_at       timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS price_bars (
     asset  text NOT NULL,
     day    date NOT NULL,
     open   double precision NOT NULL,
     high   double precision NOT NULL,
     low    double precision NOT NULL,
     close  double precision NOT NULL,
     source text NOT NULL,
     PRIMARY KEY (asset, day)
   )`,
];

/**
 * Migration depuis l'ancien schéma multi-comptes.
 *
 * Le site n'a plus qu'un propriétaire. Si la base contient encore les
 * anciennes tables, on récupère le portefeuille du PREMIER compte créé puis
 * on supprime tout ce qui concerne les comptes e-mail.
 *
 * Idempotente : rejouée sur une base déjà migrée, elle ne fait rien.
 * Aucune réinitialisation de la base Neon n'est donc nécessaire.
 */
async function migrerDepuisMultiComptes(
  run: Runner,
): Promise<{ migre: boolean; detail: string }> {
  const existe = async (table: string) => {
    const r = await run(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );
    return r.length > 0;
  };

  if (!(await existe("portfolios"))) return { migre: false, detail: "rien à migrer" };

  const dejaRempli = await run("SELECT 1 FROM owner_portfolio LIMIT 1", []);
  let detail = "anciennes tables supprimées";

  if (dejaRempli.length === 0) {
    // Le plus ancien compte devient le propriétaire.
    const proprio = await run(
      "SELECT user_id FROM portfolios ORDER BY user_id ASC LIMIT 1",
      [],
    );
    const uid = proprio[0]?.user_id;

    if (uid !== undefined) {
      await run(
        `INSERT INTO owner_portfolio (id, cash, start_capital)
         SELECT 1, cash, start_capital FROM portfolios WHERE user_id = $1`,
        [uid],
      );
      if (await existe("positions")) {
        await run(
          `INSERT INTO owner_positions (asset, quantity)
           SELECT asset, quantity FROM positions WHERE user_id = $1
           ON CONFLICT (asset) DO NOTHING`,
          [uid],
        );
      }
      if (await existe("orders")) {
        await run(
          `INSERT INTO owner_orders (asset, side, quantity, price, fee, source, created_at)
           SELECT asset, side, quantity, price, fee, source, created_at
           FROM orders WHERE user_id = $1 ORDER BY id ASC`,
          [uid],
        );
      }
      if (await existe("bots")) {
        await run(
          `INSERT INTO owner_bot (id, asset, strategy, fast, slow, max_loss_pct, enabled, stopped_reason)
           SELECT 1, asset, strategy, fast, slow, max_loss_pct, enabled, stopped_reason
           FROM bots WHERE user_id = $1
           ON CONFLICT (id) DO NOTHING`,
          [uid],
        );
      }
      detail = "portefeuille du premier compte repris, anciennes tables supprimées";
    }
  }

  // Suppression dans l'ordre des dépendances.
  for (const t of ["orders", "positions", "portfolios", "bots", "sessions", "users"]) {
    await run(`DROP TABLE IF EXISTS ${t} CASCADE`, []);
  }

  return { migre: true, detail };
}
