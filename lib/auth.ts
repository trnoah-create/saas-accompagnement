/**
 * Comptes utilisateurs — e-mail + mot de passe.
 *
 * Le mot de passe n'est jamais stocké en clair : on garde une empreinte
 * (scrypt + sel aléatoire). Même en lisant la base, on ne peut pas le
 * retrouver. La session est un jeton aléatoire posé dans un cookie
 * httpOnly, donc inaccessible au JavaScript du navigateur.
 */
import "server-only";
import { cookies } from "next/headers";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { START_CAPITAL } from "./constants";

const COOKIE = "session";
const SESSION_DAYS = 30;

export type User = { id: number; email: string };

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  // Comparaison à durée constante : évite de deviner le mot de passe
  // en mesurant le temps de réponse.
  return timingSafeEqual(candidate, expected);
}

async function startSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);

  db().prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .run(token, userId, expires.toISOString());

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
  const exists = db().prepare("SELECT id FROM users WHERE email = ?").get(clean);
  if (exists) throw new Error("Un compte existe déjà avec cet e-mail.");

  const info = db()
    .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
    .run(clean, hashPassword(password));
  const id = Number(info.lastInsertRowid);

  // Chaque nouveau compte reçoit son portefeuille fictif.
  db().prepare("INSERT INTO portfolios (user_id, cash, start_capital) VALUES (?, ?, ?)")
    .run(id, START_CAPITAL, START_CAPITAL);

  await startSession(id);
  return { id, email: clean };
}

export async function login(email: string, password: string): Promise<User> {
  const row = db()
    .prepare("SELECT id, email, password_hash FROM users WHERE email = ?")
    .get(email.trim().toLowerCase()) as
    | { id: number; email: string; password_hash: string }
    | undefined;

  // Message volontairement identique dans les deux cas : on n'indique pas
  // si l'e-mail existe, ce qui éviterait de cartographier les comptes.
  const invalide = new Error("E-mail ou mot de passe incorrect.");
  if (!row || !verifyPassword(password, row.password_hash)) throw invalide;

  await startSession(row.id);
  return { id: row.id, email: row.email };
}

export async function logout() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) db().prepare("DELETE FROM sessions WHERE token = ?").run(token);
  store.delete(COOKIE);
}

/** Utilisateur connecté, ou null. Refuse par défaut. */
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  const row = db()
    .prepare(
      `SELECT u.id, u.email FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now')`,
    )
    .get(token) as User | undefined;

  return row ?? null;
}
