"use server";

import { revalidatePath } from "next/cache";
import { connecte } from "@/lib/acces";
import { mettreEnPause } from "@/lib/claude-trader/run";

export type PauseState = { ok?: string; error?: string };

export async function actionPause(_p: PauseState, fd: FormData): Promise<PauseState> {
  if (!(await connecte())) return { error: "Accès refusé." };

  const pause = fd.get("pause") === "oui";
  await mettreEnPause(pause);
  revalidatePath("/claude-trader");
  return { ok: pause ? "Mode mis en pause." : "Mode réactivé." };
}
