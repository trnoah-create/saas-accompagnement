"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { buy, sell, resetPortfolio } from "@/lib/portfolio";
import { saveBot, runBot } from "@/lib/bot";
import type { AssetId } from "@/lib/market";
import type { StrategyId } from "@/lib/engine/strategies";

export type ActionState = { error?: string; ok?: string };

export async function actionAchat(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return { error: "Connecte-toi pour passer un ordre." };

  try {
    await buy(user.id, String(fd.get("asset")) as AssetId, Number(fd.get("amount")));
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/tableau-de-bord");
  return { ok: "Achat simulé enregistré." };
}

export async function actionVente(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return { error: "Connecte-toi pour passer un ordre." };

  try {
    await sell(user.id, String(fd.get("asset")) as AssetId, Number(fd.get("quantity")));
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/tableau-de-bord");
  return { ok: "Vente simulée enregistrée." };
}

export async function actionReset(): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  await resetPortfolio(user.id);
  revalidatePath("/tableau-de-bord");
}

export async function actionBot(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return { error: "Connecte-toi d'abord." };

  await saveBot(user.id, {
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
  const user = await currentUser();
  if (!user) return { error: "Connecte-toi d'abord." };

  const r = await runBot(user.id);
  revalidatePath("/bot");
  revalidatePath("/tableau-de-bord");
  return { ok: `${r.action.toUpperCase()} — ${r.message}` };
}
