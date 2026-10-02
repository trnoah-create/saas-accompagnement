"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { actionConnexion, actionInscription, type AuthState } from "@/app/auth-actions";

const champ =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

function Bouton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      className="w-full cursor-pointer rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">
      {pending ? "Un instant…" : label}
    </button>
  );
}

export function AuthForm({ mode }: { mode: "connexion" | "inscription" }) {
  const action = mode === "connexion" ? actionConnexion : actionInscription;
  const [state, formAction] = useActionState<AuthState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-medium">E-mail</label>
        <input id="email" name="email" type="email" required autoComplete="email"
               className={champ} placeholder="toi@exemple.fr" />
      </div>
      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-medium">Mot de passe</label>
        <input id="password" name="password" type="password" required minLength={8}
               autoComplete={mode === "connexion" ? "current-password" : "new-password"}
               className={champ} placeholder="8 caractères minimum" />
      </div>

      {state.error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {state.error}
        </p>
      )}

      <Bouton label={mode === "connexion" ? "Se connecter" : "Créer mon compte"} />

      <p className="pt-2 text-center text-sm text-slate-600 dark:text-slate-400">
        {mode === "connexion" ? (
          <>Pas encore de compte ? <Link href="/inscription" className="font-medium underline underline-offset-4">Créer un compte</Link></>
        ) : (
          <>Déjà inscrit ? <Link href="/connexion" className="font-medium underline underline-offset-4">Se connecter</Link></>
        )}
      </p>
    </form>
  );
}
