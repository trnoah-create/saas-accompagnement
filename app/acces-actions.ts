"use server";

import { redirect } from "next/navigation";
import { ouvrirSession } from "@/lib/acces";

export type AccesState = { error?: string };

export async function actionAcces(_prev: AccesState, fd: FormData): Promise<AccesState> {
  const motDePasse = String(fd.get("password") ?? "");
  const suite = String(fd.get("suite") ?? "");

  try {
    await ouvrirSession(motDePasse);
  } catch (e) {
    return { error: (e as Error).message };
  }

  // On ne redirige que vers un chemin interne, jamais vers un site externe.
  redirect(suite.startsWith("/") && !suite.startsWith("//") ? suite : "/tableau-de-bord");
}
