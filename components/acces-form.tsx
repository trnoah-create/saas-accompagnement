"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { actionAcces, type AccesState } from "@/app/acces-actions";

function Bouton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full cursor-pointer rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
    >
      {pending ? "Vérification…" : "Entrer"}
    </button>
  );
}

export function AccesForm({ suite }: { suite: string }) {
  const [state, formAction] = useActionState<AccesState, FormData>(actionAcces, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="suite" value={suite} />
      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-medium">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          placeholder="••••••••"
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.error}
        </p>
      )}

      <Bouton />
    </form>
  );
}
