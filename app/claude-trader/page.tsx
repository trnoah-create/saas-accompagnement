import type { Metadata } from "next";
import { historique, enPause } from "@/lib/claude-trader/run";
import { courtier } from "@/lib/broker";
import { cleConfiguree } from "@/lib/claude-trader/decide";
import { claudeTraderConfig as cfg } from "@/config/claude-trader";
import { ClaudePause } from "@/components/claude-pause";
import { DisclaimerNote } from "@/components/disclaimer";
import { LineChart } from "@/components/chart";
import { CHART_COLORS } from "@/lib/colors";
import { euro, prix, pourcent, quantite } from "@/lib/format";

export const metadata: Metadata = { title: "Claude trader" };
export const dynamic = "force-dynamic";

const LIBELLES: Record<string, { texte: string; classe: string }> = {
  ordres: { texte: "Ordres passés", classe: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  aucun_ordre: { texte: "Aucun ordre", classe: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  en_pause: { texte: "En pause", classe: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  blocage_jour: { texte: "Blocage du jour", classe: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  pause_auto: { texte: "Pause automatique", classe: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  echec: { texte: "Échec", classe: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
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
  const comptes = await historique(60);
  const pause = await enPause();
  const broker = courtier();
  const cle = cleConfiguree();

  const dernier = comptes[0];
  const courbe = [...comptes]
    .reverse()
    .filter((c) => c.valeur !== null)
    .map((c) => ({ day: c.day, value: c.valeur as number }));
  const courbeTemoin = [...comptes]
    .reverse()
    .filter((c) => c.valeur_temoin !== null)
    .map((c) => ({ day: c.day, value: c.valeur_temoin as number }));

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold tracking-tight">Claude trader</h1>
      <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-400">
        Chaque jour, le modèle reçoit les prix récents et l&apos;état de ce portefeuille, puis
        propose des ordres. Le code les vérifie, refuse les impossibles, et exécute le reste.
      </p>

      {/* Garantie « rien de réel » */}
      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/40">
        <h2 className="font-semibold text-amber-900 dark:text-amber-200">Argent 100 % fictif</h2>
        <p className="mt-2 text-sm leading-relaxed text-amber-900 dark:text-amber-200">
          Courtier utilisé : <strong>{broker.nom}</strong>. Aucun ordre réel n&apos;est passé,
          aucun courtier n&apos;est contacté, aucune donnée bancaire n&apos;existe dans ce projet.
          Les ordres ne modifient que des lignes dans la base de données du site.
        </p>
        <DisclaimerNote className="mt-3 text-amber-800 dark:text-amber-300" />
      </div>

      {/* Commandes */}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <ClaudePause enPause={pause} />
        <span className="text-sm text-slate-600 dark:text-slate-400">
          État : <strong>{pause ? "en pause" : "actif"}</strong>
        </span>
      </div>

      {/* Le cadre, appliqué par le code */}
      <h2 className="mt-10 text-xl font-bold">Le cadre</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Ces limites sont appliquées par le code, jamais par le modèle. Un ordre qui les dépasse est
        refusé même si Claude le propose.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Limite label="Perte du jour (alerte)" valeur={dernier?.detail?.pertes?.jour ?? null} seuil={cfg.pertes.alerteJour} />
        <Limite label="Perte du jour (blocage)" valeur={dernier?.detail?.pertes?.jour ?? null} seuil={cfg.pertes.blocageJour} />
        <Limite label="Perte de la semaine" valeur={dernier?.detail?.pertes?.semaine ?? null} seuil={cfg.pertes.semaine} />
        <Limite label="Perte du mois" valeur={dernier?.detail?.pertes?.mois ?? null} seuil={cfg.pertes.mois} />
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Journées découpées de minuit à minuit, heure de {cfg.fuseau.replace("Europe/", "")}. Au-delà
        de la limite hebdomadaire ou mensuelle, le mode se met en pause et attend ta réactivation.
      </p>

      {!cle && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          La variable <code>ANTHROPIC_API_KEY</code> n&apos;est pas configurée : la tâche
          quotidienne ne pourra pas obtenir de décision, et aucun ordre ne sera passé.
        </p>
      )}

      {/* Chiffres du jour */}
      {dernier && (
        <>
          <h2 className="mt-10 text-xl font-bold">Dernier compte rendu · {dernier.day}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { l: "Valeur du portefeuille", v: dernier.valeur === null ? "—" : euro(dernier.valeur) },
              {
                l: "Gain du jour",
                v: dernier.gain_jour_pct === null ? "—" : pourcent(dernier.gain_jour_pct),
                t:
                  (dernier.gain_jour_pct ?? 0) >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400",
              },
              { l: "Témoin acheter et garder", v: dernier.valeur_temoin === null ? "—" : euro(dernier.valeur_temoin) },
              {
                l: "Écart avec le témoin",
                v:
                  dernier.valeur === null || dernier.valeur_temoin === null
                    ? "—"
                    : pourcent(((dernier.valeur - dernier.valeur_temoin) / dernier.valeur_temoin) * 100),
              },
            ].map((c) => (
              <div key={c.l} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
                <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{c.l}</div>
                <div className={`mt-2 text-xl font-bold ${c.t ?? ""}`}>{c.v}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Capital de départ : {euro(cfg.capitalDepart)} · montant par ordre :{" "}
            {euro(cfg.ordres.montantMaxEuros)} maximum · {cfg.ordres.maxParJour} ordres par jour ·{" "}
            {cfg.ordres.partMaxParActifPct} % maximum par actif · frais {cfg.couts.fraisPct} % et
            écart achat/vente {cfg.couts.ecartPct} %
          </p>
        </>
      )}

      {/* Courbes */}
      {courbe.length > 1 && (
        <div className="mt-8 rounded-2xl border border-slate-200 p-6 dark:border-slate-800">
          <h2 className="mb-4 font-semibold">Claude contre « acheter et garder »</h2>
          <LineChart
            height={260}
            series={[
              { points: courbe, color: CHART_COLORS[0], label: "Portefeuille Claude" },
              { points: courbeTemoin, color: CHART_COLORS[2], label: "Témoin acheter et garder" },
            ]}
          />
        </div>
      )}

      {/* Historique */}
      <h2 className="mt-10 text-xl font-bold">Historique des comptes rendus</h2>
      {comptes.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Aucun compte rendu pour l&apos;instant. Le premier arrivera après la première exécution
          de la tâche quotidienne.
        </p>
      ) : (
        <div className="mt-5 space-y-5">
          {comptes.map((c) => {
            const badge = LIBELLES[c.statut] ?? LIBELLES.aucun_ordre;
            return (
              <article key={c.day} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold">{c.day}</h3>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.classe}`}>
                    {badge.texte}
                  </span>
                </div>

                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{c.resume}</p>

                {c.erreur && (
                  <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                    {c.erreur}
                  </p>
                )}

                {c.detail.alerte && (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    ⚠️ {c.detail.alerte}
                  </p>
                )}

                {c.detail.analyse && (
                  <p className="mt-3 border-l-2 border-slate-300 pl-3 text-sm text-slate-600 italic dark:border-slate-700 dark:text-slate-400">
                    {c.detail.analyse}
                  </p>
                )}

                {c.detail.executes?.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      Ordres passés
                    </h4>
                    <ul className="mt-2 space-y-2">
                      {c.detail.executes.map((o, i) => (
                        <li key={i} className="text-sm">
                          <span
                            className={`font-medium ${o.side === "buy" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                          >
                            {o.side === "buy" ? "Achat" : "Vente"}
                          </span>{" "}
                          {euro(o.montant)} de {o.asset} — {quantite(o.quantity)} à {prix(o.price)}{" "}
                          (frais {euro(o.fee)}, prix affiché {prix(o.prixMarche)})
                          <div className="text-slate-600 dark:text-slate-400">{o.reason}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {c.detail.refuses?.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      Ordres refusés par le code
                    </h4>
                    <ul className="mt-2 space-y-2">
                      {c.detail.refuses.map((o, i) => (
                        <li key={i} className="text-sm">
                          <span className="font-medium">
                            {o.side === "buy" || o.side === "achat" ? "Achat" : "Vente"} {euro(o.montant)} de {o.asset}
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
