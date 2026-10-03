import type { Metadata } from "next";
import { etatBase, etatActifs, etatAcces, etatBotAuto } from "@/lib/health";
import { euro, prix } from "@/lib/format";

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
  const base = await etatBase();
  const bot = base.joignable ? await etatBotAuto() : null;
  const actifs = await etatActifs();

  const prixReels = actifs.filter((a) => a.reel).length;
  const assezDHistorique = actifs.filter((a) => a.unAnDHistorique).length;
  const toutVaBien =
    acces.configure &&
    base.joignable &&
    prixReels === actifs.length &&
    assezDHistorique === actifs.length &&
    Boolean(bot?.cronSecret);

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
              ? `les ${actifs.length} actifs reçoivent de vrais prix`
              : `seulement ${prixReels} actif(s) sur ${actifs.length} avec de vrais prix`}
          </li>
          <li>
            {assezDHistorique === actifs.length ? "✅" : "❌"} Historique :{" "}
            {assezDHistorique === actifs.length
              ? "au moins un an de cotations pour chaque actif"
              : `seulement ${assezDHistorique} actif(s) sur ${actifs.length} avec un an d'historique`}
          </li>
          <li>
            {bot?.cronSecret ? "✅" : "❌"} Tâche quotidienne :{" "}
            {bot?.cronSecret
              ? "CRON_SECRET défini, le bot peut s'exécuter chaque jour"
              : "CRON_SECRET manquant, la tâche quotidienne est fermée"}
          </li>
          {bot && (
            <li>
              {bot.tacheEnRetard ? "❌" : "✅"} Dernière exécution :{" "}
              {bot.heuresDepuisExecution === null
                ? "le bot n'a jamais tourné"
                : bot.tacheEnRetard
                  ? `il y a ${Math.round(bot.heuresDepuisExecution)} h — la tâche semble en panne (seuil ${bot.retardMaxHeures} h)`
                  : `il y a ${Math.round(bot.heuresDepuisExecution)} h, dans les délais`}
            </li>
          )}
          <li>
            {bot?.alertes.webhook || bot?.alertes.email ? "✅" : "⚠️"} Alertes :{" "}
            {bot?.alertes.webhook || bot?.alertes.email
              ? `envoyées par ${[bot.alertes.email && "email", bot.alertes.webhook && "notification"].filter(Boolean).join(" et ")}`
              : "aucun canal configuré — les alertes restent visibles sur cette page uniquement"}
          </li>
        </ul>
        {!toutVaBien && (
          <p className="mt-4 text-sm">
            Les étapes à suivre sont détaillées dans le fichier <code>README.md</code> du projet,
            section « Mettre le site en ligne depuis un téléphone ».
          </p>
        )}
      </div>

      {/* État du bot automatique */}
      <h2 className="mt-10 text-xl font-bold">Bot automatique</h2>
      {bot === null ? (
        <p className="mt-4 rounded-2xl border border-slate-200 p-5 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
          L&apos;état du bot ne peut pas être lu : la base de données est indisponible.
        </p>
      ) : (
        <div className="mt-4 space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            <Pastille
              ok={bot.cronSecret}
              texte={bot.cronSecret ? "CRON_SECRET défini" : "CRON_SECRET absent"}
            />
            <Pastille ok={!bot.courtierReel} texte={`Courtier : ${bot.courtierNom}`} />
            <Pastille
              ok={!bot.enPause}
              texte={bot.enPause ? "En pause" : "Actif"}
            />
          </div>

          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex flex-wrap gap-2">
              <dt className="text-slate-500">Dernière exécution :</dt>
              <dd className="font-medium">
                {bot.derniereExecution
                  ? `${bot.derniereExecution} (enregistrée le ${bot.derniereExecutionLe})`
                  : "jamais exécuté"}
              </dd>
            </div>
            <div className="flex flex-wrap gap-2">
              <dt className="text-slate-500">Ordres passés au total :</dt>
              <dd className="font-medium">{bot.ordresPasses}</dd>
            </div>
            <div className="flex flex-wrap gap-2">
              <dt className="text-slate-500">Ordres de la dernière journée :</dt>
              <dd className="font-medium">{bot.ordresDernierJour}</dd>
            </div>
            <div className="flex flex-wrap gap-2">
              <dt className="text-slate-500">Journées exécutées :</dt>
              <dd className="font-medium">{bot.journeesExecutees}</dd>
            </div>
          </dl>

          {bot.dernierResume && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
              Dernier compte rendu : {bot.dernierResume}
            </p>
          )}

          {bot.motifPause && (
            <p
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
            >
              Arrêté — réactivation manuelle nécessaire : {bot.motifPause}
            </p>
          )}

          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex flex-wrap gap-2">
              <dt className="text-slate-500">Capital de référence :</dt>
              <dd className="font-medium">
                {bot.capitalReference === null ? "—" : euro(bot.capitalReference)}
              </dd>
            </div>
            <div className="flex flex-wrap gap-2">
              <dt className="text-slate-500">
                Plancher total ({bot.plancherTotalPct} %) :
              </dt>
              <dd className="font-medium">
                {bot.plancherTotal === null ? "—" : euro(bot.plancherTotal)}
              </dd>
            </div>
            <div className="flex flex-wrap gap-2">
              <dt className="text-slate-500">Frais simulés prélevés :</dt>
              <dd className="font-medium">{euro(bot.fraisPreleves)}</dd>
            </div>
            <div className="flex flex-wrap gap-2">
              <dt className="text-slate-500">Réinvestissement mensuel :</dt>
              <dd className="font-medium">{bot.reinvestissement ? "activé" : "désactivé"}</dd>
            </div>
          </dl>

          <div className="text-sm text-slate-600 dark:text-slate-400">
            Règles appliquées : achat au-dessus de la moyenne{" "}
            {bot.moyenneMobileJours} jours, vente en dessous, stop loss à {bot.stopLossPct} %,
            arrêt de la journée à {euro(bot.perteMaxJourEuros)} de perte, arrêt définitif sous{" "}
            {bot.plancherTotalPct} % du capital de référence.
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {bot.actifs.map((a) => (
                <li key={a.id}>
                  <span className="font-medium">{a.id}</span>{" "}
                  {a.actif ? `max ${a.poidsMaxPct} %` : "désactivé"}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-slate-500">
            Le bot n&apos;appelle aucune intelligence artificielle et aucune API payante : aucune
            clé n&apos;est nécessaire. Le courtier réel n&apos;existe pas dans ce projet, seule la
            simulation est implémentée.
          </p>
        </div>
      )}

      {/* Alertes */}
      <h2 className="mt-10 text-xl font-bold">Alertes</h2>
      <div className="mt-4 space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <Pastille
            ok={Boolean(bot?.alertes.email)}
            texte={bot?.alertes.email ? "Email configuré" : "Email non configuré"}
          />
          <Pastille
            ok={Boolean(bot?.alertes.webhook)}
            texte={bot?.alertes.webhook ? "Notification configurée" : "Notification non configurée"}
          />
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-400">
          Le bot t&apos;alerte quand la <strong>limite de perte quotidienne</strong> ou le{" "}
          <strong>plancher total</strong> sont atteints, quand la <strong>tâche
          quotidienne échoue</strong> ou <strong>a sauté des journées</strong>, et quand{" "}
          <strong>toutes les sources de prix d&apos;un actif échouent</strong>.
        </p>

        {!bot?.alertes.email && !bot?.alertes.webhook && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="font-medium">Aucun canal configuré pour l&apos;instant.</p>
            <p className="mt-1">
              Les alertes restent enregistrées et visibles ci-dessous, mais rien ne t&apos;est
              envoyé. Pour recevoir un email, ajoute <code>RESEND_API_KEY</code> et{" "}
              <code>ALERTE_EMAIL</code> dans Vercel. Pour une notification (Discord, Slack,
              ntfy…), ajoute <code>ALERTE_WEBHOOK_URL</code>. Les deux peuvent coexister ; la
              marche à suivre est dans le <code>README.md</code>.
            </p>
          </div>
        )}

        {bot && bot.dernieresAlertes.length === 0 && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Aucune alerte à ce jour — c&apos;est bon signe.
          </p>
        )}

        {bot && bot.dernieresAlertes.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Dernières alertes
            </h3>
            <ul className="mt-2 space-y-3">
              {bot.dernieresAlertes.map((a) => (
                <li
                  key={a.id}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{a.titre}</span>
                    <span className="text-xs text-slate-500">{a.created_at}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-slate-600 dark:text-slate-400">
                    {a.message}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {a.canaux ? `Envoyée par : ${a.canaux}` : "Non envoyée"}
                    {a.erreur && ` · ${a.erreur}`}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-slate-500">
          Aucune clé d&apos;alerte n&apos;est affichée sur cette page. Un envoi qui échoue ne
          bloque jamais le bot : l&apos;alerte reste enregistrée ici.
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
                <dd className={a.unAnDHistorique ? "" : "font-medium text-red-700 dark:text-red-400"}>
                  {a.jours}
                  {a.unAnDHistorique ? " (plus d'un an)" : " — moins d'un an"}
                </dd>
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
