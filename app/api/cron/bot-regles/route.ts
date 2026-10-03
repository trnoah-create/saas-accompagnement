/**
 * Tâche quotidienne du bot automatique, appelée par Vercel Cron.
 *
 * Aucun appel à une intelligence artificielle, aucune API payante.
 * L'adresse contourne le mot de passe du site (une tâche planifiée ne peut
 * pas se connecter), elle est donc protégée par CRON_SECRET. Sans secret
 * configuré, elle est fermée.
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
    const message = (e as Error).message;
    console.error("[bot] échec :", e);

    // Une panne de la tâche est précisément ce qu'il faut savoir : on alerte.
    // L'alerte ne doit jamais masquer l'erreur d'origine.
    try {
      const { envoyerAlerte } = await import("@/lib/alertes");
      await envoyerAlerte({
        type: "tache_echec",
        cle: `tache_echec:${new Date().toISOString().slice(0, 16)}`,
        titre: "La tâche quotidienne du bot a échoué",
        message:
          `L'exécution s'est interrompue sur une erreur : ${message}\n\n` +
          `Aucun ordre n'a été passé. La page /diagnostic donne l'état complet.`,
      });
    } catch (e2) {
      console.error("[bot] alerte impossible :", (e2 as Error).message);
    }

    return NextResponse.json({ erreur: "Exécution impossible." }, { status: 500 });
  }
}

export const GET = executer;
export const POST = executer;
