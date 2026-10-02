import type { Metadata } from "next";
import { ASSETS, getPrices, type AssetId } from "@/lib/market";
import { runBacktest } from "@/lib/engine/backtest";
import { STRATEGIES, DEFAULT_PARAMS } from "@/lib/engine/strategies";
import { START_CAPITAL } from "@/lib/constants";
import { LineChart } from "@/components/chart";
import { CHART_COLORS } from "@/lib/colors";
import { DisclaimerNote, DemoDataWarning } from "@/components/disclaimer";
import { euro, pourcent } from "@/lib/format";

export const metadata: Metadata = { title: "Comparateur" };
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const brut = Array.isArray(sp.days) ? sp.days[0] : sp.days;
  const days = Math.max(60, Math.min(1000, Math.round(Number(brut) || 365)));

  // Chaque actif × chaque stratégie, sur la même période.
  const lignes = [];
  let demo = false;

  for (const asset of ASSETS) {
    const { bars, source } = await getPrices(asset.id as AssetId, days);
    if (source === "demo") demo = true;

    for (const strat of STRATEGIES) {
      const r = runBacktest(bars, strat.id, DEFAULT_PARAMS, START_CAPITAL);
      lignes.push({
        asset: asset.label,
        assetId: asset.id,
        strategie: strat.label,
        strategieId: strat.id,
        ...r,
      });
    }
  }

  lignes.sort((a, b) => b.returnPct - a.returnPct);
  const meilleur = lignes[0];

  // Courbes des 4 meilleures combinaisons.
  const courbes = lignes.slice(0, 4).map((l, i) => ({
    points: l.equity,
    color: CHART_COLORS[i % CHART_COLORS.length],
    label: `${l.asset} · ${l.strategie}`,
  }));

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold tracking-tight">Comparateur</h1>
      <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-400">
        Chaque actif confronté à chaque stratégie, sur la même période et avec le même capital de
        départ. Moyennes mobiles {DEFAULT_PARAMS.fast} et {DEFAULT_PARAMS.slow} jours.
      </p>

      <form method="get" className="mt-6 flex items-end gap-3">
        <div>
          <label htmlFor="days" className="mb-1.5 block text-xs font-medium">Période (jours)</label>
          <input id="days" name="days" type="number" min={60} max={1000} defaultValue={days}
                 className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
        </div>
        <button type="submit" className="cursor-pointer rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-900">
          Comparer
        </button>
      </form>

      <div className="mt-6"><DemoDataWarning source={demo ? "demo" : "marché"} /></div>

      <div className="mt-8 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">
          Meilleure combinaison sur la période
        </div>
        <div className="mt-2 text-xl font-bold">
          {meilleur.asset} · {meilleur.strategie}{" "}
          <span className={meilleur.returnPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
            {pourcent(meilleur.returnPct)}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Le passé ne se répète pas : ce classement ne prédit rien.
        </p>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left dark:bg-slate-900/50">
            <tr>
              <th className="px-4 py-3 font-semibold">Actif</th>
              <th className="px-4 py-3 font-semibold">Stratégie</th>
              <th className="px-4 py-3 font-semibold">Valeur finale</th>
              <th className="px-4 py-3 font-semibold">Gain</th>
              <th className="px-4 py-3 font-semibold">Pire chute</th>
              <th className="px-4 py-3 font-semibold">Ordres</th>
              <th className="px-4 py-3 font-semibold">Frais</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={`${l.assetId}-${l.strategieId}`} className="border-t border-slate-200 dark:border-slate-800">
                <td className="px-4 py-3 font-medium">{l.asset}</td>
                <td className="px-4 py-3">{l.strategie}</td>
                <td className="px-4 py-3">{euro(l.finalValue)}</td>
                <td className={`px-4 py-3 font-semibold ${l.returnPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {pourcent(l.returnPct)}
                </td>
                <td className="px-4 py-3 text-red-600 dark:text-red-400">{pourcent(l.maxDrawdownPct, false)}</td>
                <td className="px-4 py-3">{l.orderCount}</td>
                <td className="px-4 py-3">{euro(l.totalFees)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DisclaimerNote className="mt-3" />

      <div className="mt-10 rounded-2xl border border-slate-200 p-6 dark:border-slate-800">
        <h2 className="mb-4 font-semibold">Les 4 meilleures combinaisons</h2>
        <LineChart height={280} series={courbes} />
      </div>
    </div>
  );
}
