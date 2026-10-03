"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { actionPauseBot, type PauseBotState } from "@/app/bot-actions";

function Bouton({ pause }: { pause: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`cursor-pointer rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
        pause ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"
      }`}
    >
      {pending ? "…" : pause ? "Mettre en pause" : "Réactiver le bot"}
    </button>
  );
}

export function BotPause({ enPause }: { enPause: boolean }) {
  const [state, action] = useActionState<PauseBotState, FormData>(actionPauseBot, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="pause" value={enPause ? "non" : "oui"} />
      <Bouton pause={!enPause} />
      {state.ok && <span className="text-sm text-emerald-600 dark:text-emerald-400">{state.ok}</span>}
      {state.error && <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span>}
    </form>
  );
}
