"use server";

import { revalidatePath } from "next/cache";
import { connecte } from "@/lib/acces";
import { mettreBotEnPause } from "@/lib/bot-regles/run";

export type PauseBotState = { ok?: string; error?: string };

export async function actionPauseBot(
  _p: PauseBotState,
  fd: FormData,
): Promise<PauseBotState> {
  if (!(await connecte())) return { error: "Accès refusé." };

  const pause = fd.get("pause") === "oui";
  await mettreBotEnPause(pause);
  revalidatePath("/bot-regles");
  return { ok: pause ? "Bot mis en pause." : "Bot réactivé." };
}
