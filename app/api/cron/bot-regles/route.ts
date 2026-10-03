/**
 * Tâche quotidienne du bot à règles fixes, appelée par Vercel Cron.
 *
 * Aucun appel à une API payante. L'adresse contourne le mot de passe du
 * site (une tâche planifiée ne peut pas se connecter), elle est donc
 * protégée par CRON_SECRET. Sans secret configuré, elle est fermée.
 */
import { NextResponse } from "next/server";
import { executerJourneeBot } from "@/lib/bot-regles/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorise(request: Request): boolean {
  const attendu = process.env.CRON_SECRET;
  if (!attendu) return false;
  return (request.headers.get("authorization") ?? "") === `Bearer ${attendu}`;
}

async function executer(request: Request) {
  if (!autorise(request)) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  try {
    const c = await executerJourneeBot();
    return NextResponse.json({
      jour: c.day,
      statut: c.statut,
      resume: c.resume,
      ordres: c.detail.executes.length,
      refuses: c.detail.refuses.length,
    });
  } catch (e) {
    console.error("[bot-regles] échec :", e);
    return NextResponse.json({ erreur: "Exécution impossible." }, { status: 500 });
  }
}

export const GET = executer;
export const POST = executer;
