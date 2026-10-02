"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { actionBot, actionRunBot, type ActionState } from "@/app/trade-actions";

const champ =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white";

function Submit({ label, variant = "primaire" }: { label: string; variant?: "primaire" | "secondaire" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      className={`cursor-pointer rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
        variant === "primaire"
          ? "bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
          : "border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
      }`}>
      {pending ? "…" : label}
    </button>
  );
}

export function BotPanel({
  config,
  assets,
  strategies,
}: {
  config: { asset: string; strategy: string; fast: number; slow: number; max_loss_pct: number; enabled: number };
  assets: { id: string; label: string }[];
  strategies: { id: string; label: string }[];
}) {
  const [reglages, saveAction] = useActionState<ActionState, FormData>(actionBot, {});
  const [execution, runAction] = useActionState<ActionState, FormData>(actionRunBot, {});

  return (
    <div className="space-y-6">
      <form action={saveAction} className="rounded-2xl border border-slate-200 p-6 dark:border-slate-800">
        <h2 className="font-semibold">Réglages du bot</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="asset" className="mb-1.5 block text-xs font-medium">Actif</label>
            <select id="asset" name="asset" defaultValue={config.asset} className={champ}>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="strategy" className="mb-1.5 block text-xs font-medium">Stratégie</label>
            <select id="strategy" name="strategy" defaultValue={config.strategy} className={champ}>
              {strategies.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="max_loss_pct" className="mb-1.5 block text-xs font-medium">
              Stop de perte maximale (%)
            </label>
            <input id="max_loss_pct" name="max_loss_pct" type="number" min={1} max={90} step={1}
                   defaultValue={config.max_loss_pct} className={champ} />
          </div>
          <div>
            <label htmlFor="fast" className="mb-1.5 block text-xs font-medium">Moyenne courte (jours)</label>
            <input id="fast" name="fast" type="number" min={2} max={200} defaultValue={config.fast} className={champ} />
          </div>
          <div>
            <label htmlFor="slow" className="mb-1.5 block text-xs font-medium">Moyenne longue (jours)</label>
            <input id="slow" name="slow" type="number" min={3} max={400} defaultValue={config.slow} className={champ} />
          </div>
          <div className="flex items-end">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
              <input type="checkbox" name="enabled" defaultChecked={config.enabled === 1}
                     className="size-4 cursor-pointer rounded border-slate-300" />
              Activer le bot
            </label>
          </div>
        </div>
        <div className="mt-6"><Submit label="Enregistrer" /></div>
        {reglages.ok && <p role="status" className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{reglages.ok}</p>}
        {reglages.error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{reglages.error}</p>}
      </form>

      <form action={runAction} className="rounded-2xl border border-slate-200 p-6 dark:border-slate-800">
        <h2 className="font-semibold">Exécuter un tour</h2>
        <p className="mt-1 mb-5 text-sm text-slate-600 dark:text-slate-400">
          Le bot lit le signal du jour et passe l&apos;ordre correspondant sur ton portefeuille
          fictif. La décision n&apos;utilise que les journées déjà closes.
        </p>
        <Submit label="Lancer le bot maintenant" variant="secondaire" />
        {execution.ok && (
          <p role="status" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/50">
            {execution.ok}
          </p>
        )}
        {execution.error && <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">{execution.error}</p>}
      </form>
    </div>
  );
}
