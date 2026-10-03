import type { Metadata } from "next";
import { historiqueBot, botEnPause, jourDeLExperience } from "@/lib/bot-regles/run";
import { etatBot } from "@/lib/bot-regles/courtier";
import { botReglesConfig as cfg } from "@/config/bot-regles";
import { BotPause } from "@/components/bot-pause";
import { DisclaimerNote } from "@/components/disclaimer";
import { LineChart } from "@/components/chart";
import { CHART_COLORS } from "@/lib/colors";
import { euro, prix, pourcent, quantite } from "@/lib/format";
import { jourLocal } from "@/lib/limites";

export const metadata: Metadata = { title: "Bot règles" };
export const dynamic = "force-dynamic";

const LIBELLES: Record<string, { texte: string; classe: string }> = {
  ordres: { texte: "Ordres passés", classe: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  aucun_ordre: { texte: "Aucun signal", classe: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  en_pause: { texte: "En pause", classe: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  blocage_jour: { texte: "Blocage du jour", classe: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  pause_auto: { texte: "Pause automatique", classe: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  termine: { texte: "Expérience terminée", classe: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200" },
};

function Limite({ label, valeur, seuil }: { label: string; valeur: number | null; seuil: number }) {
  const atteint = valeur !== null && valeur >= seuil;
  return (
    <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${atteint ? "text-red-600 dark:text-red-400" : ""}`}>
        {valeur === null ? "—" : euro(Math.max(valeur, 0))} / {euro(seuil)}
      </div>
    </div>
  );
}

export default async function Page() {
  const comptes = await historiqueBot(90);
  const pause = await botEnPause();
  const etat = await etatBot();

  const aujourdhui = jourLocal(new Date(), cfg.fuseau);
  const numeroJour = jourDeLExperience(etat.demarreLe, aujourdhui);
  const restants = Math.max(cfg.dureeJours - numeroJour + 1, 0);

  const dernier = comptes[0];
  const chrono = [...comptes].reverse();
  const courbeBot = chrono.filter((c) => c.valeur !== null).map((c) => ({ day: c.day, value: c.valeur as number }));
  const courbeTemoin = chrono.filter((c) => c.valeur_temoin !== null).map((c) => ({ day: c.day, value: c.valeur_temoin as number }));

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold tracking-tight">Bot à règles fixes</h1>
      <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-400">
        Croisement de moyennes mobiles {cfg.strategie.courte} et {cfg.strategie.longue} jours sur{" "}
        {cfg.actifs.join(" et ")}. Aucune intelligence artificielle, aucun appel payant : les règles
        sont appliquées mécaniquement.
      </p>

      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/40">
        <h2 className="font-semibold text-amber-900 dark:text-amber-200">Argent 100 % fictif</h2>
        <p className="mt-2 text-sm leading-relaxed text-amber-900 dark:text-amber-200">
          Portefeuille simulé, séparé de ton portefeuille manuel et de celui du mode Claude trader.
          Aucun courtier n&apos;est contacté, aucun ordre réel n&apos;est passé.
        </p>
        <DisclaimerNote className="mt-3 text-amber-800 dark:text-amber-300" />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <BotPause enPause={pause} />
        <span className="text-sm text-slate-600 dark:text-slate-400">
          État : <strong>{pause ? "en pause" : numeroJour > cfg.dureeJours ? "terminé" : "actif"}</strong>
        </span>
      </div>

      {/* Avancement de l'expérience */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { l: "Jour de l'expérience", v: `${Math.min(numeroJour, cfg.dureeJours)} / ${cfg.dureeJours}` },
          { l: "Jours restants", v: String(restants) },
          { l: "Valeur du portefeuille", v: euro(etat.totalValue) },
          {
            l: "Depuis le départ",
            v: pourcent(((etat.totalValue - etat.startCapital) / etat.startCapital) * 100),
            t: etat.totalValue >= etat.startCapital
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400",
          },
        ].map((c) => (
          <div key={c.l} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{c.l}</div>
            <div className={`mt-2 text-xl font-bold ${c.t ?? ""}`}>{c.v}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Démarré le {etat.demarreLe} · capital {euro(cfg.capitalDepart)} · ordres de{" "}
        {euro(cfg.ordres.minEuros)} à {euro(cfg.ordres.maxEuros)} · stop loss{" "}
        {cfg.sorties.stopLossPct} % · take profit {cfg.sorties.takeProfitPct} % · frais{" "}
        {cfg.couts.fraisPct} % et écart achat/vente {cfg.couts.ecartPct} %
      </p>

      {/* Les règles */}
      <h2 className="mt-10 text-xl font-bold">Les limites de perte</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Limite label="Perte du jour (alerte)" valeur={dernier?.detail?.pertes?.jour ?? null} seuil={cfg.pertes.alerteJour} />
        <Limite label="Perte du jour (blocage)" valeur={dernier?.detail?.pertes?.jour ?? null} seuil={cfg.pertes.blocageJour} />
        <Limite label="Perte de la semaine" valeur={dernier?.detail?.pertes?.semaine ?? null} seuil={cfg.pertes.semaine} />
        <Limite label="Perte du mois" valeur={dernier?.detail?.pertes?.mois ?? null} seuil={cfg.pertes.mois} />
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Journées de minuit à minuit, heure de {cfg.fuseau.replace("Europe/", "")}. Au-delà de la
        limite hebdomadaire ou mensuelle, le bot se met en pause et attend ta réactivation.
      </p>

      {/* Positions ouvertes */}
      {etat.positions.length > 0 && (
        <>
          <h2 className="mt-10 text-xl font-bold">Positions ouvertes</h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left dark:bg-slate-900/50">
                <tr>
                  <th className="px-4 py-3 font-semibold">Actif</th>
                  <th className="px-4 py-3 font-semibold">Quantité</th>
                  <th className="px-4 py-3 font-semibold">Prix d&apos;entrée</th>
                  <th className="px-4 py-3 font-semibold">Prix actuel</th>
                  <th className="px-4 py-3 font-semibold">Écart</th>
                  <th className="px-4 py-3 font-semibold">Stop / objectif</th>
                </tr>
              </thead>
              <tbody>
                {etat.positions.map((p) => {
                  const variation = ((p.price - p.prixEntree) / p.prixEntree) * 100;
                  return (
                    <tr key={p.asset} className="border-t border-slate-200 dark:border-slate-800">
                      <td className="px-4 py-3 font-medium">{p.asset}</td>
                      <td className="px-4 py-3">{quantite(p.quantity)}</td>
                      <td className="px-4 py-3">{prix(p.prixEntree)}</td>
                      <td className="px-4 py-3">{prix(p.price)}</td>
                      <td className={`px-4 py-3 font-semibold ${variation >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {pourcent(variation)}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {prix(p.prixEntree * (1 - cfg.sorties.stopLossPct / 100))} /{" "}
                        {prix(p.prixEntree * (1 + cfg.sorties.takeProfitPct / 100))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Comparaison */}
      <div className="mt-10 rounded-2xl border border-slate-200 p-6 dark:border-slate-800">
        <h2 className="mb-1 font-semibold">Comparaison</h2>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
          Le bot, le témoin « acheter et garder », et ton portefeuille manuel — ce dernier
          n&apos;est pas encore suivi jour par jour, sa courbe reste donc vide.
        </p>
        {courbeBot.length > 1 ? (
          <LineChart
            height={280}
            series={[
              { points: courbeBot, color: CHART_COLORS[0], label: "Bot à règles fixes" },
              { points: courbeTemoin, color: CHART_COLORS[2], label: "Acheter et garder" },
              { points: [], color: CHART_COLORS[4], label: "Portefeuille manuel (pas encore suivi)" },
            ]}
          />
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            La courbe apparaîtra après quelques journées d&apos;exécution.
          </p>
        )}
      </div>

      {/* Comptes rendus */}
      <h2 className="mt-10 text-xl font-bold">Comptes rendus quotidiens</h2>
      {comptes.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Aucun compte rendu pour l&apos;instant. Le premier arrivera après la première exécution.
        </p>
      ) : (
        <div className="mt-5 space-y-5">
          {comptes.map((c) => {
            const badge = LIBELLES[c.statut] ?? LIBELLES.aucun_ordre;
            return (
              <article key={c.day} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold">
                    {c.day}
                    {c.detail.jourDeLExperience && (
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        jour {c.detail.jourDeLExperience} / {cfg.dureeJours}
                      </span>
                    )}
                  </h3>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.classe}`}>
                    {badge.texte}
                  </span>
                </div>

                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{c.resume}</p>

                {c.detail.alerte && (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    ⚠️ {c.detail.alerte}
                  </p>
                )}

                {c.detail.signaux && Object.keys(c.detail.signaux).length > 0 && (
                  <dl className="mt-3 space-y-1 text-sm">
                    {Object.entries(c.detail.signaux).map(([actif, texte]) => (
                      <div key={actif} className="flex flex-wrap gap-2">
                        <dt className="font-medium">{actif} :</dt>
                        <dd className="text-slate-600 dark:text-slate-400">{texte}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {c.detail.executes?.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Ordres passés</h4>
                    <ul className="mt-2 space-y-2">
                      {c.detail.executes.map((o, i) => (
                        <li key={i} className="text-sm">
                          <span className={`font-medium ${o.side === "buy" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                            {o.side === "buy" ? "Achat" : "Vente"}
                          </span>{" "}
                          {euro(o.montant)} de {o.asset} — {quantite(o.quantity)} à {prix(o.price)}{" "}
                          (frais {euro(o.fee)})
                          <div className="text-slate-600 dark:text-slate-400">{o.raison}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {c.detail.refuses?.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      Ordres refusés par les règles
                    </h4>
                    <ul className="mt-2 space-y-2">
                      {c.detail.refuses.map((o, i) => (
                        <li key={i} className="text-sm">
                          <span className="font-medium">
                            {o.side === "buy" ? "Achat" : "Vente"} {euro(o.montant)} de {o.asset}
                          </span>{" "}
                          — <span className="text-red-700 dark:text-red-400">{o.motifRefus}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                  {c.valeur !== null && <span>Valeur : {euro(c.valeur)}</span>}
                  {c.gain_jour_pct !== null && <span>Jour : {pourcent(c.gain_jour_pct)}</span>}
                  {c.valeur_temoin !== null && <span>Témoin : {euro(c.valeur_temoin)}</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
