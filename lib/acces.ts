/**
 * Accès au site — un seul mot de passe, pas de comptes.
 */
import "server-only";
import { cookies } from "next/headers";
import {
  COOKIE_ACCES,
  creerJeton,
  dateExpiration,
  jetonValide,
  motDePasseConfigure,
  motDePasseValide,
} from "./session";

export { motDePasseConfigure };

/** Vrai si le visiteur a déjà saisi le bon mot de passe. */
export async function connecte(): Promise<boolean> {
  return jetonValide((await cookies()).get(COOKIE_ACCES)?.value);
}

/** Vérifie le mot de passe et ouvre la session. Lève une erreur sinon. */
export async function ouvrirSession(motDePasse: string): Promise<void> {
  if (!motDePasseConfigure()) {
    throw new Error(
      "Le site n'est pas encore configuré : la variable SITE_PASSWORD est absente.",
    );
  }
  if (!motDePasseValide(motDePasse)) {
    throw new Error("Mot de passe incorrect.");
  }

  const store = await cookies();
  store.set(COOKIE_ACCES, creerJeton(), {
    httpOnly: true, // inaccessible au JavaScript du navigateur
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: dateExpiration(),
  });
}

export async function fermerSession(): Promise<void> {
  (await cookies()).delete(COOKIE_ACCES);
}
