/**
 * Tâche quotidienne appelée par Vercel Cron.
 *
 * Cette adresse contourne le mot de passe du site (une tâche planifiée ne
 * peut pas se connecter), elle est donc protégée par son propre secret :
 * CRON_SECRET. Sans secret configuré, l'adresse est fermée.
 */
import { NextResponse } from "next/server";
import { executerJournee } from "@/lib/claude-trader/run";

export const dynamic = "force-dynamic";
/** Laisse le temps à l'appel au modèle d'aboutir. */
export const maxDuration = 120;

function autorise(request: Request): boolean {
  const attendu = process.env.CRON_SECRET;
  if (!attendu) return false;

  const entete = request.headers.get("authorization") ?? "";
  // Vercel Cron envoie « Authorization: Bearer <CRON_SECRET> ».
  return entete === `Bearer ${attendu}`;
}

async function executer(request: Request) {
  if (!autorise(request)) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  try {
    const compte = await executerJournee();
    return NextResponse.json({
      jour: compte.day,
      statut: compte.statut,
      resume: compte.resume,
      ordres: compte.detail.executes.length,
      refuses: compte.detail.refuses.length,
    });
  } catch (e) {
    console.error("[claude-trader] échec :", e);
    // Message générique : jamais de détail technique sur une adresse publique.
    return NextResponse.json({ erreur: "Exécution impossible." }, { status: 500 });
  }
}

export const GET = executer;
export const POST = executer;
