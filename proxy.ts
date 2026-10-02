/**
 * Verrou global du site.
 *
 * En Next 16 ce fichier s'appelle proxy.ts (anciennement middleware.ts) et
 * s'exécute AVANT le rendu de toute page et de toute route d'API. C'est le
 * seul endroit qui garantit qu'aucune page ni aucune route ne puisse être
 * atteinte sans le mot de passe.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_ACCES, jetonValide } from "@/lib/session";

/**
 * Seuls chemins accessibles sans être connecté.
 *
 * /api/cron est appelé par Vercel Cron, qui ne peut pas saisir de mot de
 * passe : cette adresse vérifie elle-même son propre secret (CRON_SECRET)
 * et refuse tout appel sans lui.
 */
const LIBRES = ["/connexion", "/api/deconnexion", "/api/cron"];

export function proxy(request: NextRequest) {
  const chemin = request.nextUrl.pathname;

  if (LIBRES.some((p) => chemin === p || chemin.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  if (jetonValide(request.cookies.get(COOKIE_ACCES)?.value)) {
    return NextResponse.next();
  }

  // Les routes d'API répondent 401 plutôt qu'une redirection HTML.
  if (chemin.startsWith("/api/")) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const vers = new URL("/connexion", request.url);
  if (chemin !== "/") vers.searchParams.set("suite", chemin);
  return NextResponse.redirect(vers);
}

export const config = {
  // Tout le site, sauf les fichiers internes de Next et les images statiques.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon).*)"],
};
