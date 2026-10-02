import type { Metadata } from "next";
import { etatBase, etatActifs, etatAcces, etatClaudeTrader } from "@/lib/health";
import { prix } from "@/lib/format";

export const metadata: Metadata = { title: "Diagnostic", robots: { index: false } };
export const dynamic = "force-dynamic";

function Pastille({ ok, texte }: { ok: boolean; texte: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
        ok
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
      }`}
    >
      <span className={`size-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />
      {texte}
    </span>
  );
}

export default async function Page() {
  const acces = etatAcces();
  const trader = etatClaudeTrader();
  const base = await etatBase();
  const actifs = await etatActifs();

  const prixReels = actifs.filter((a) => a.reel).length;
  const toutVaBien = acces.configure && base.joignable && prixReels === actifs.length;

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold tracking-tight">Diagnostic</h1>
      <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-400">
        Cette page vérifie en direct que tout fonctionne. Ouvre-la après chaque déploiement.
      </p>

      {/* Verdict global, en français simple */}
      <div
        className={`mt-8 rounded-2xl border p-6 ${
          toutVaBien
            ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40"
            : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
        }`}
      >
        <h2 className="text-lg font-bold">
          {toutVaBien ? "✅ Tout fonctionne" : "⚠️ Il reste quelque chose à régler"}
        </h2>
        <ul className="mt-3 space-y-1.5 text-sm">
          <li>
            {acces.configure ? "✅" : "❌"} Mot de passe du site :{" "}
            {acces.configure
              ? "configuré, le site est protégé"
              : "SITE_PASSWORD manquante, le site est inaccessible"}
          </li>
          <li>
            {base.joignable ? "✅" : "❌"} Base de données :{" "}
            {base.joignable
              ? "connectée, les comptes seront bien enregistrés"
              : base.configuree
                ? "configurée mais injoignable"
                : "pas encore connectée"}
          </li>
          <li>
            {prixReels === actifs.length ? "✅" : "❌"} Prix de marché :{" "}
            {prixReels === actifs.length
              ? "les 4 actifs reçoivent de vrais prix"
              : `seulement ${prixReels} actif(s) sur ${actifs.length} avec de vrais prix`}
          </li>
        </ul>
        {!toutVaBien && (
          <p className="mt-4 text-sm">
            Les étapes à suivre sont détaillées dans le fichier <code>README.md</code> du projet,
            section « Mettre le site en ligne depuis un téléphone ».
          </p>
        )}
      </div>

      {/* Mode Claude trader */}
      <h2 className="mt-10 text-xl font-bold">Mode Claude trader</h2>
      <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <Pastille
            ok={trader.cleApi}
            texte={trader.cleApi ? "ANTHROPIC_API_KEY définie" : "ANTHROPIC_API_KEY absente"}
          />
          <Pastille
            ok={trader.cronSecret}
            texte={trader.cronSecret ? "CRON_SECRET défini" : "CRON_SECRET absent"}
          />
          <Pastille ok={!trader.courtierReel} texte={`Courtier : ${trader.courtierNom}`} />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {trader.cleApi
            ? "La tâche quotidienne pourra demander une décision au modèle."
            : "Sans clé d'API, la tâche quotidienne ne passera aucun ordre."}{" "}
          {trader.cronSecret
            ? "L'adresse de la tâche est protégée par son secret."
            : "Sans CRON_SECRET, l'adresse de la tâche est fermée et la tâche ne peut pas s'exécuter."}
        </p>
        <p className="text-xs text-slate-500">
          Aucune valeur de clé n&apos;est affichée ici. Le courtier réel n&apos;existe pas dans ce
          projet : seule la simulation est implémentée.
        </p>
      </div>

      {/* Accès */}
      <h2 className="mt-10 text-xl font-bold">Mot de passe du site</h2>
      <div className="mt-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <Pastille
          ok={acces.configure}
          texte={acces.configure ? "SITE_PASSWORD définie" : "SITE_PASSWORD absente"}
        />
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{acces.detail}</p>
        <p className="mt-2 text-xs text-slate-500">
          La valeur du mot de passe n&apos;est jamais affichée ici.
        </p>
      </div>

      {/* Base */}
      <h2 className="mt-10 text-xl font-bold">Base de données</h2>
      <div className="mt-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <Pastille ok={base.joignable} texte={base.joignable ? "Connectée" : "Indisponible"} />
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{base.detail}</p>
        {base.hote && (
          <p className="mt-2 text-xs text-slate-500">Serveur : {base.hote}</p>
        )}
      </div>

      {/* Prix */}
      <h2 className="mt-10 text-xl font-bold">Prix de marché</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Les sources sont essayées dans l&apos;ordre ; la première qui répond est retenue.
        « Démonstration » signifie qu&apos;aucune n&apos;a répondu et que les prix affichés sont
        <strong> inventés</strong>.
      </p>

      <div className="mt-5 space-y-5">
        {actifs.map((a) => (
          <div key={a.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">{a.label}</h3>
              <Pastille ok={a.reel} texte={a.reel ? "Prix réels" : "Démonstration"} />
            </div>

            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="text-slate-500">Source retenue :</dt>
                <dd className="font-medium">{a.sourceLabel}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-500">Dernier prix :</dt>
                <dd>{a.dernierPrix === null ? "—" : prix(a.dernierPrix)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-500">Dernière date :</dt>
                <dd>{a.derniereDate ?? "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-500">Journées reçues :</dt>
                <dd>{a.jours}</dd>
              </div>
            </dl>

            {a.note && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                {a.note}
              </p>
            )}

            {a.tentatives.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Sources essayées, dans l&apos;ordre
                </h4>
                <ol className="mt-2 space-y-1.5">
                  {a.tentatives.map((t, i) => (
                    <li
                      key={`${t.source}-${i}`}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm"
                    >
                      <span aria-hidden="true">{t.ok ? "✅" : "❌"}</span>
                      <span className="font-medium">{t.source}</span>
                      <span className="text-xs text-slate-500">{t.hote}</span>
                      <span
                        className={
                          t.ok
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-red-700 dark:text-red-400"
                        }
                      >
                        {t.message}
                      </span>
                      {t.ms > 0 && <span className="text-xs text-slate-500">· {t.ms} ms</span>}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {a.tentatives.length === 0 && (
              <p className="mt-3 text-xs text-slate-500">
                Prix servis depuis le cache : aucune source n&apos;a été interrogée cette fois-ci.
              </p>
            )}
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-slate-500">
        Page de contrôle technique. Elle n&apos;expose aucune donnée personnelle ni aucun mot de
        passe, et n&apos;est pas indexée par les moteurs de recherche.
      </p>
    </div>
  );
}
