"use server";

import { revalidatePath } from "next/cache";
import { connecte } from "@/lib/acces";
import { buy, sell, resetPortfolio } from "@/lib/portfolio";
import { saveBot, runBot } from "@/lib/bot";
import type { AssetId } from "@/lib/market";
import type { StrategyId } from "@/lib/engine/strategies";

export type ActionState = { error?: string; ok?: string };

/**
 * Deuxième verrou. proxy.ts bloque déjà les requêtes sans mot de passe,
 * mais une Server Action doit vérifier elle-même : c'est le principe de
 * ne jamais faire confiance à une seule barrière.
 */
async function autorise(): Promise<boolean> {
  return connecte();
}

export async function actionAchat(_p: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await autorise())) return { error: "Accès refusé." };
  try {
    await buy(String(fd.get("asset")) as AssetId, Number(fd.get("amount")));
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/tableau-de-bord");
  return { ok: "Achat simulé enregistré." };
}

export async function actionVente(_p: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await autorise())) return { error: "Accès refusé." };
  try {
    await sell(String(fd.get("asset")) as AssetId, Number(fd.get("quantity")));
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/tableau-de-bord");
  return { ok: "Vente simulée enregistrée." };
}

export async function actionReset(): Promise<void> {
  if (!(await autorise())) return;
  await resetPortfolio();
  revalidatePath("/tableau-de-bord");
}

export async function actionBot(_p: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await autorise())) return { error: "Accès refusé." };

  await saveBot({
    asset: String(fd.get("asset")) as AssetId,
    strategy: String(fd.get("strategy")) as StrategyId,
    fast: Number(fd.get("fast")),
    slow: Number(fd.get("slow")),
    max_loss_pct: Number(fd.get("max_loss_pct")),
    enabled: fd.get("enabled") === "on" ? 1 : 0,
    stopped_reason: null,
  });
  revalidatePath("/bot");
  return { ok: "Réglages enregistrés." };
}

export async function actionRunBot(_p: ActionState): Promise<ActionState> {
  if (!(await autorise())) return { error: "Accès refusé." };

  const r = await runBot();
  revalidatePath("/bot");
  revalidatePath("/tableau-de-bord");
  return { ok: `${r.action.toUpperCase()} — ${r.message}` };
}
