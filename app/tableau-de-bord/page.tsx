import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getPortfolio, getOrders } from "@/lib/portfolio";
import { ASSETS, getPrices, type AssetId } from "@/lib/market";
import { TradePanel } from "@/components/trade-panel";
import { LineChart } from "@/components/chart";
import { CHART_COLORS } from "@/lib/colors";
import { DisclaimerNote, DemoDataWarning } from "@/components/disclaimer";
import { actionReset } from "@/app/trade-actions";
import { euro, prix, pourcent, quantite } from "@/lib/format";

export const metadata: Metadata = { title: "Tableau de bord" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await currentUser();
  if (!user) redirect("/connexion");

  const portefeuille = await getPortfolio(user.id);
  const ordres = await getOrders(user.id, 20);

  // Prix courants + courbes pour chaque actif.
  const series = await Promise.all(
    ASSETS.map(async (a, i) => {
      const { bars, source } = await getPrices(a.id as AssetId, 120);
      return {
        id: a.id,
        label: a.label,
        price: bars.at(-1)?.close ?? 0,
        source,
        points: bars.map((b) => ({ day: b.day, value: b.close })),
        color: CHART_COLORS[i % CHART_COLORS.length],
      };
    }),
  );
  const sourceGlobale = series.some((s) => s.source === "demo") ? "demo" : "marché";
  const gainPositif = portefeuille.returnPct >= 0;

  return (
    <div className="container-page py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tableau de bord</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{user.email}</p>
        </div>
        <form action={actionReset}>
          <button type="submit"
            className="cursor-pointer rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium transition-colors hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
            Réinitialiser le portefeuille
          </button>
        </form>
      </div>

      <div className="mt-6"><DemoDataWarning source={sourceGlobale} /></div>

      {/* Chiffres clés */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Valeur totale", valeur: euro(portefeuille.totalValue) },
          { label: "Liquidités", valeur: euro(portefeuille.cash) },
          { label: "Investi", valeur: euro(portefeuille.investedValue) },
          {
            label: "Gain / perte",
            valeur: pourcent(portefeuille.returnPct),
            ton: gainPositif ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
          },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{c.label}</div>
            <div className={`mt-2 text-2xl font-bold ${c.ton ?? ""}`}>{c.valeur}</div>
          </div>
        ))}
      </div>
      <DisclaimerNote className="mt-3" />

      {/* Passage d'ordres */}
      <h2 className="mt-12 text-xl font-bold">Passer un ordre</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Frais simulés de 0,1 % par ordre. Aucun vrai courtier n&apos;est contacté.
      </p>
      <div className="mt-5">
        <TradePanel
          assets={series.map((s) => ({ id: s.id, label: s.label, price: s.price }))}
          held={portefeuille.positions.map((p) => ({ asset: p.asset, quantity: p.quantity }))}
          cash={portefeuille.cash}
        />
      </div>

      {/* Positions */}
      {portefeuille.positions.length > 0 && (
        <>
          <h2 className="mt-12 text-xl font-bold">Mes positions</h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left dark:bg-slate-900/50">
                <tr>
                  <th className="px-4 py-3 font-semibold">Actif</th>
                  <th className="px-4 py-3 font-semibold">Quantité</th>
                  <th className="px-4 py-3 font-semibold">Prix</th>
                  <th className="px-4 py-3 font-semibold">Valeur</th>
                </tr>
              </thead>
              <tbody>
                {portefeuille.positions.map((p) => (
                  <tr key={p.asset} className="border-t border-slate-200 dark:border-slate-800">
                    <td className="px-4 py-3 font-medium">{p.asset}</td>
                    <td className="px-4 py-3">{quantite(p.quantity)}</td>
                    <td className="px-4 py-3">{prix(p.price)}</td>
                    <td className="px-4 py-3">{euro(p.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Graphiques */}
      <h2 className="mt-12 text-xl font-bold">Évolution des prix (120 jours)</h2>
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        {series.map((s) => (
          <div key={s.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="font-semibold">{s.label}</h3>
              <span className="text-sm text-slate-600 dark:text-slate-400">{prix(s.price)}</span>
            </div>
            <LineChart series={[{ points: s.points, color: s.color, label: s.label }]} labels={false} />
          </div>
        ))}
      </div>

      {/* Historique */}
      <h2 className="mt-12 text-xl font-bold">Historique des ordres</h2>
      {ordres.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Aucun ordre pour l&apos;instant.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left dark:bg-slate-900/50">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Sens</th>
                <th className="px-4 py-3 font-semibold">Actif</th>
                <th className="px-4 py-3 font-semibold">Quantité</th>
                <th className="px-4 py-3 font-semibold">Prix</th>
                <th className="px-4 py-3 font-semibold">Frais</th>
                <th className="px-4 py-3 font-semibold">Origine</th>
              </tr>
            </thead>
            <tbody>
              {ordres.map((o) => (
                <tr key={o.id} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="px-4 py-3 whitespace-nowrap">{o.created_at}</td>
                  <td className={`px-4 py-3 font-medium ${o.side === "buy" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {o.side === "buy" ? "Achat" : "Vente"}
                  </td>
                  <td className="px-4 py-3">{o.asset}</td>
                  <td className="px-4 py-3">{quantite(o.quantity)}</td>
                  <td className="px-4 py-3">{prix(o.price)}</td>
                  <td className="px-4 py-3">{euro(o.fee)}</td>
                  <td className="px-4 py-3 text-slate-500">{o.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
