/**
 * Base de données — SQLite (un simple fichier sur le disque).
 *
 * Pourquoi SQLite : aucun serveur à installer, aucune configuration.
 * Le fichier vit dans data/simulateur.db et n'est pas versionné.
 */
import "server-only";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

let instance: Database.Database | null = null;

export function db(): Database.Database {
  if (instance) return instance;

  const dir = path.join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });

  instance = new Database(path.join(dir, "simutrade.db"));
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  migrate(instance);
  return instance;
}

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );

    -- Portefeuille fictif : une ligne par utilisateur.
    CREATE TABLE IF NOT EXISTS portfolios (
      user_id  INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      cash     REAL NOT NULL,
      start_capital REAL NOT NULL
    );

    -- Quantité détenue par actif.
    CREATE TABLE IF NOT EXISTS positions (
      user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      asset    TEXT NOT NULL,
      quantity REAL NOT NULL,
      PRIMARY KEY (user_id, asset)
    );

    -- Historique de tous les ordres simulés.
    CREATE TABLE IF NOT EXISTS orders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      asset      TEXT NOT NULL,
      side       TEXT NOT NULL CHECK (side IN ('buy','sell')),
      quantity   REAL NOT NULL,
      price      REAL NOT NULL,
      fee        REAL NOT NULL,
      source     TEXT NOT NULL DEFAULT 'manuel',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Réglages du bot, un par utilisateur.
    CREATE TABLE IF NOT EXISTS bots (
      user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      asset        TEXT NOT NULL,
      strategy     TEXT NOT NULL,
      fast         INTEGER NOT NULL DEFAULT 20,
      slow         INTEGER NOT NULL DEFAULT 50,
      max_loss_pct REAL NOT NULL DEFAULT 20,
      enabled      INTEGER NOT NULL DEFAULT 0,
      stopped_reason TEXT
    );

    -- Cache des prix téléchargés, pour ne pas réinterroger l'API sans cesse.
    CREATE TABLE IF NOT EXISTS price_bars (
      asset  TEXT NOT NULL,
      day    TEXT NOT NULL,
      open   REAL NOT NULL,
      high   REAL NOT NULL,
      low    REAL NOT NULL,
      close  REAL NOT NULL,
      source TEXT NOT NULL,
      PRIMARY KEY (asset, day)
    );
  `);
}
