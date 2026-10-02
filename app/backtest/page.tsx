import type { Metadata } from "next";
import { ASSETS, getPrices, type AssetId } from "@/lib/market";
import { runBacktest } from "@/lib/engine/backtest";
import { STRATEGIES, DEFAULT_PARAMS, type StrategyId } from "@/lib/engine/strategies";
import { START_CAPITAL } from "@/lib/constants";
import { LineChart } from "@/components/chart";
import { CHART_COLORS } from "@/lib/colors";
import { DisclaimerNote, DemoDataWarning } from "@/components/disclaimer";
import { euro, prix, pourcent, quantite } from "@/lib/format";

export const metadata: Metadata = { title: "Backtest" };
export const dynamic = "force-dynamic";

const champ =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white";

function nombre(v: string | undefined, defaut: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return defaut;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const get = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

  const assetId = (ASSETS.find((a) => a.id === get("asset"))?.id ?? "BTC") as AssetId;
  const strategy = (STRATEGIES.find((s) => s.id === get("strategy"))?.id ??
    "sma_cross") as StrategyId;
  const slow = nombre(get("slow"), DEFAULT_PARAMS.slow, 3, 400);
  const fast = Math.min(nombre(get("fast"), DEFAULT_PARAMS.fast, 2, 200), slow - 1);
  const days = nombre(get("days"), 365, 30, 1000);

  const { bars, source } = await getPrices(assetId, days);
  const resultat = runBacktest(bars, strategy, { fast, slow }, START_CAPITAL);

  // Référence : la même période en « acheter et garder ».
  const reference = runBacktest(bars, "buy_and_hold", { fast, slow }, START_CAPITAL);

  const asset = ASSETS.find((a) => a.id === assetId)!;
  const positif = resultat.returnPct >= 0;

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold tracking-tight">Backtest</h1>
      <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-400">
        Rejoue une stratégie sur les prix passés. Chaque décision n&apos;utilise que les journées
        déjà terminées : jamais le prix du jour où l&apos;ordre est passé.
      </p>

      <form method="get" className="mt-8 grid gap-4 rounded-2xl border border-slate-200 p-5 sm:grid-cols-2 lg:grid-cols-5 dark:border-slate-800">
        <div>
          <label htmlFor="asset" className="mb-1.5 block text-xs font-medium">Actif</label>
          <select id="asset" name="asset" defaultValue={assetId} className={champ}>
            {ASSETS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="strategy" className="mb-1.5 block text-xs font-medium">Stratégie</label>
          <select id="strategy" name="strategy" defaultValue={strategy} className={champ}>
            {STRATEGIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="fast" className="mb-1.5 block text-xs font-medium">Moyenne courte</label>
          <input id="fast" name="fast" type="number" min={2} max={200} defaultValue={fast} className={champ} />
        </div>
        <div>
          <label htmlFor="slow" className="mb-1.5 block text-xs font-medium">Moyenne longue</label>
          <input id="slow" name="slow" type="number" min={3} max={400} defaultValue={slow} className={champ} />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="days" className="mb-1.5 block text-xs font-medium">Jours</label>
            <input id="days" name="days" type="number" min={30} max={1000} defaultValue={days} className={champ} />
          </div>
          <button type="submit" className="cursor-pointer rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-900">
            Lancer
          </button>
        </div>
      </form>

      <div className="mt-6"><DemoDataWarning source={source} /></div>

      <h2 className="mt-10 text-xl font-bold">
        {asset.label} · {STRATEGIES.find((s) => s.id === strategy)!.label}
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        {bars.length} jours, du {bars[0]?.day} au {bars.at(-1)?.day} · capital de départ {START_CAPITAL} €
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { l: "Valeur finale", v: euro(resultat.finalValue) },
          { l: "Gain", v: pourcent(resultat.returnPct),
            t: positif ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400" },
          { l: "Pire chute", v: pourcent(resultat.maxDrawdownPct, false), t: "text-red-600 dark:text-red-400" },
          { l: "Ordres", v: String(resultat.orderCount) },
          { l: "Frais payés", v: euro(resultat.totalFees) },
        ].map((c) => (
          <div key={c.l} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{c.l}</div>
            <div className={`mt-2 text-xl font-bold ${c.t ?? ""}`}>{c.v}</div>
          </div>
        ))}
      </div>
      <DisclaimerNote className="mt-3" />

      <div className="mt-8 rounded-2xl border border-slate-200 p-6 dark:border-slate-800">
        <h3 className="font-semibold">Évolution du portefeuille</h3>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
          Comparé à « acheter et garder » sur la même période
          ({pourcent(reference.returnPct)}).
        </p>
        <LineChart
          height={260}
          series={[
            { points: resultat.equity, color: CHART_COLORS[0], label: "Stratégie testée" },
            { points: reference.equity, color: CHART_COLORS[2], label: "Acheter et garder" },
          ]}
        />
      </div>

      {resultat.trades.length > 0 && (
        <>
          <h3 className="mt-10 text-lg font-bold">Ordres simulés ({resultat.trades.length})</h3>
          <div className="mt-4 max-h-96 overflow-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Sens</th>
                  <th className="px-4 py-3 font-semibold">Prix</th>
                  <th className="px-4 py-3 font-semibold">Quantité</th>
                  <th className="px-4 py-3 font-semibold">Frais</th>
                </tr>
              </thead>
              <tbody>
                {resultat.trades.map((t, i) => (
                  <tr key={i} className="border-t border-slate-200 dark:border-slate-800">
                    <td className="px-4 py-2.5">{t.day}</td>
                    <td className={`px-4 py-2.5 font-medium ${t.side === "buy" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {t.side === "buy" ? "Achat" : "Vente"}
                    </td>
                    <td className="px-4 py-2.5">{prix(t.price)}</td>
                    <td className="px-4 py-2.5">{quantite(t.quantity)}</td>
                    <td className="px-4 py-2.5">{euro(t.fee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
