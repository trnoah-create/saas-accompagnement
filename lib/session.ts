/**
 * Session du propriétaire — un seul utilisateur, un seul mot de passe.
 *
 * Le jeton de session est signé, pas stocké : il contient sa date
 * d'expiration et une signature calculée avec SITE_PASSWORD comme clé.
 * Deux conséquences utiles :
 *   - aucune table de sessions à gérer en base ;
 *   - changer SITE_PASSWORD invalide instantanément toutes les sessions.
 *
 * Ce fichier est volontairement sans dépendance à la base de données :
 * il doit pouvoir être utilisé depuis proxy.ts, qui s'exécute avant tout
 * rendu de page.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE_ACCES = "acces";
const DUREE_MS = 30 * 24 * 3600 * 1000; // 30 jours

/** Le mot de passe n'est jamais écrit dans le code : il vient de Vercel. */
export function motDePasseConfigure(): boolean {
  return Boolean(process.env.SITE_PASSWORD && process.env.SITE_PASSWORD.length > 0);
}

function signer(donnee: string, cle: string): string {
  return createHmac("sha256", cle).update(donnee).digest("hex");
}

/** Comparaison à durée constante : on ne peut pas deviner le secret au chrono. */
function egalite(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Vrai si le mot de passe fourni correspond à celui configuré. */
export function motDePasseValide(saisi: string): boolean {
  const attendu = process.env.SITE_PASSWORD;
  if (!attendu) return false;
  return egalite(saisi, attendu);
}

/** Fabrique un jeton signé, valable 30 jours. */
export function creerJeton(maintenant = Date.now()): string {
  const cle = process.env.SITE_PASSWORD;
  if (!cle) throw new Error("SITE_PASSWORD n'est pas configuré.");
  const expiration = String(maintenant + DUREE_MS);
  return `${expiration}.${signer(expiration, cle)}`;
}

/** Vérifie un jeton : signature correcte et pas encore expiré. */
export function jetonValide(jeton: string | undefined, maintenant = Date.now()): boolean {
  if (!jeton) return false;

  const cle = process.env.SITE_PASSWORD;
  if (!cle) return false; // sans mot de passe configuré, rien n'est valide

  const separateur = jeton.lastIndexOf(".");
  if (separateur <= 0) return false;

  const expiration = jeton.slice(0, separateur);
  const signature = jeton.slice(separateur + 1);

  if (!egalite(signature, signer(expiration, cle))) return false;

  const limite = Number(expiration);
  return Number.isFinite(limite) && limite > maintenant;
}

export function dateExpiration(maintenant = Date.now()): Date {
  return new Date(maintenant + DUREE_MS);
}
