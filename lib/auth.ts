/**
 * Comptes utilisateurs — e-mail + mot de passe.
 *
 * Le mot de passe n'est jamais stocké en clair : on garde une empreinte
 * (scrypt + sel aléatoire). La session est un jeton aléatoire posé dans un
 * cookie httpOnly, inaccessible au JavaScript du navigateur.
 */
import "server-only";
import { cookies } from "next/headers";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { query, queryOne, transaction } from "./db";
import { START_CAPITAL } from "./constants";

const COOKIE = "session";
const SESSION_DAYS = 30;

export type User = { id: number; email: string };

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  // Comparaison à durée constante : on ne peut pas deviner le mot de passe
  // en mesurant le temps de réponse.
  return timingSafeEqual(candidate, expected);
}

async function startSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);

  await query("INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)", [
    token,
    userId,
    expires.toISOString(),
  ]);

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function register(email: string, password: string): Promise<User> {
  const clean = email.trim().toLowerCase();

  const existe = await queryOne("SELECT id FROM users WHERE email = $1", [clean]);
  if (existe) throw new Error("Un compte existe déjà avec cet e-mail.");

  const row = await queryOne<{ id: number }>(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
    [clean, hashPassword(password)],
  );
  if (!row) throw new Error("Création du compte impossible.");

  // Chaque nouveau compte reçoit son portefeuille fictif.
  await query(
    `INSERT INTO portfolios (user_id, cash, start_capital) VALUES ($1, $2, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [row.id, START_CAPITAL],
  );

  await startSession(row.id);
  return { id: row.id, email: clean };
}

export async function login(email: string, password: string): Promise<User> {
  const row = await queryOne<{ id: number; email: string; password_hash: string }>(
    "SELECT id, email, password_hash FROM users WHERE email = $1",
    [email.trim().toLowerCase()],
  );

  // Message identique dans les deux cas : on n'indique pas si l'e-mail
  // existe, ce qui permettrait de cartographier les comptes.
  if (!row || !verifyPassword(password, row.password_hash)) {
    throw new Error("E-mail ou mot de passe incorrect.");
  }

  await startSession(row.id);
  return { id: row.id, email: row.email };
}

export async function logout() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await query("DELETE FROM sessions WHERE token = $1", [token]);
  store.delete(COOKIE);
}

/** Utilisateur connecté, ou null. Refuse par défaut. */
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  try {
    return await chercherSession(token);
  } catch {
    // Base indisponible : on considère le visiteur comme non connecté
    // plutôt que de faire planter toute la page.
    return null;
  }
}

async function chercherSession(token: string): Promise<User | null> {
  const row = await queryOne<User>(
    `SELECT u.id, u.email FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > now()`,
    [token],
  );
  return row ?? null;
}

export { transaction };
