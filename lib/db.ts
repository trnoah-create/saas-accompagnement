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
  `CREATE TABLE IF NOT EXISTS users (
     id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     email         text NOT NULL UNIQUE,
     password_hash text NOT NULL,
     created_at    timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     token      text PRIMARY KEY,
     user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     expires_at timestamptz NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS portfolios (
     user_id       integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     cash          double precision NOT NULL,
     start_capital double precision NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS positions (
     user_id  integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     asset    text NOT NULL,
     quantity double precision NOT NULL,
     PRIMARY KEY (user_id, asset)
   )`,
  `CREATE TABLE IF NOT EXISTS orders (
     id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     asset      text NOT NULL,
     side       text NOT NULL CHECK (side IN ('buy','sell')),
     quantity   double precision NOT NULL,
     price      double precision NOT NULL,
     fee        double precision NOT NULL,
     source     text NOT NULL DEFAULT 'manuel',
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS bots (
     user_id        integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     asset          text NOT NULL,
     strategy       text NOT NULL,
     fast           integer NOT NULL DEFAULT 20,
     slow           integer NOT NULL DEFAULT 50,
     max_loss_pct   double precision NOT NULL DEFAULT 20,
     enabled        integer NOT NULL DEFAULT 0,
     stopped_reason text
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
