"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { actionAchat, actionVente, type ActionState } from "@/app/trade-actions";
import { euro, prix, quantite } from "@/lib/format";

const champ =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white";

function Submit({ label, ton }: { label: string; ton: "vert" | "rouge" }) {
  const { pending } = useFormStatus();
  const couleur = ton === "vert"
    ? "bg-emerald-600 hover:bg-emerald-700"
    : "bg-red-600 hover:bg-red-700";
  return (
    <button type="submit" disabled={pending}
      className={`w-full cursor-pointer rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${couleur}`}>
      {pending ? "…" : label}
    </button>
  );
}

function Message({ state }: { state: ActionState }) {
  if (state.error)
    return <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{state.error}</p>;
  if (state.ok)
    return <p role="status" className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">{state.ok}</p>;
  return null;
}

export function TradePanel({
  assets,
  held,
  cash,
}: {
  assets: { id: string; label: string; price: number }[];
  held: { asset: string; quantity: number }[];
  cash: number;
}) {
  const [achat, actionA] = useActionState<ActionState, FormData>(actionAchat, {});
  const [vente, actionV] = useActionState<ActionState, FormData>(actionVente, {});

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <form action={actionA} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <h3 className="font-semibold">Acheter</h3>
        <p className="mt-1 text-xs text-slate-500">Liquide disponible : {euro(cash)}</p>
        <div className="mt-4 space-y-3">
          <select name="asset" className={champ} aria-label="Actif à acheter">
            {assets.map((a) => (
              <option key={a.id} value={a.id}>{a.label} — {prix(a.price)}</option>
            ))}
          </select>
          <input name="amount" type="number" step="0.01" min="0.01" max={cash} required
                 className={champ} placeholder="Montant en €" aria-label="Montant en euros" />
          <Submit label="Acheter (simulation)" ton="vert" />
        </div>
        <Message state={achat} />
      </form>

      <form action={actionV} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <h3 className="font-semibold">Vendre</h3>
        <p className="mt-1 text-xs text-slate-500">
          {held.length ? `${held.length} position(s) ouverte(s)` : "Aucune position ouverte"}
        </p>
        <div className="mt-4 space-y-3">
          <select name="asset" className={champ} disabled={!held.length} aria-label="Actif à vendre">
            {held.map((h) => (
              <option key={h.asset} value={h.asset}>{h.asset} — {quantite(h.quantity)}</option>
            ))}
            {!held.length && <option>Rien à vendre</option>}
          </select>
          <input name="quantity" type="number" step="0.000001" min="0.000001" required
                 disabled={!held.length} className={champ} placeholder="Quantité"
                 aria-label="Quantité à vendre" />
          <Submit label="Vendre (simulation)" ton="rouge" />
        </div>
        <Message state={vente} />
      </form>
    </div>
  );
}
