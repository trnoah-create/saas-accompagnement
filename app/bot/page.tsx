import type { Metadata } from "next";
import { getBot } from "@/lib/bot";
import { getPortfolio } from "@/lib/portfolio";
import { ASSETS } from "@/lib/market";
import { STRATEGIES } from "@/lib/engine/strategies";
import { BotPanel } from "@/components/bot-panel";
import { DisclaimerNote } from "@/components/disclaimer";
import { euro } from "@/lib/format";

export const metadata: Metadata = { title: "Bot" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const config = await getBot();
  const portefeuille = await getPortfolio();
  const seuil = portefeuille.startCapital * (1 - config.max_loss_pct / 100);

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold tracking-tight">Bot automatique</h1>
      <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-400">
        Le bot applique la stratégie choisie sur ton portefeuille fictif. Si la valeur passe sous
        ton seuil de perte, il vend tout et s&apos;arrête.
      </p>
      <DisclaimerNote className="mt-3" />

      {config.stopped_reason && (
        <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {config.stopped_reason}
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { l: "État", v: config.enabled ? "Actif" : "À l'arrêt",
            t: config.enabled ? "text-emerald-600 dark:text-emerald-400" : "" },
          { l: "Valeur du portefeuille", v: euro(portefeuille.totalValue) },
          { l: "Seuil de liquidation", v: euro(seuil) },
        ].map((c) => (
          <div key={c.l} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{c.l}</div>
            <div className={`mt-2 text-xl font-bold ${c.t ?? ""}`}>{c.v}</div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <BotPanel
          config={config}
          assets={ASSETS.map((a) => ({ id: a.id, label: a.label }))}
          strategies={STRATEGIES.map((s) => ({ id: s.id, label: s.label }))}
        />
      </div>
    </div>
  );
}
