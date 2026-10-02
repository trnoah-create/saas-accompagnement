import type { Metadata } from "next";
import { etatBase, etatActifs, etatAcces } from "@/lib/health";
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
        « Réels » signifie que les prix viennent bien de Binance ou de Stooq. « Démonstration »
        signifie que le réseau a échoué et que les prix sont inventés.
      </p>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left dark:bg-slate-900/50">
            <tr>
              <th className="px-4 py-3 font-semibold">Actif</th>
              <th className="px-4 py-3 font-semibold">Fournisseur</th>
              <th className="px-4 py-3 font-semibold">État</th>
              <th className="px-4 py-3 font-semibold">Dernier prix</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Jours reçus</th>
            </tr>
          </thead>
          <tbody>
            {actifs.map((a) => (
              <tr key={a.id} className="border-t border-slate-200 dark:border-slate-800">
                <td className="px-4 py-3 font-medium">{a.label}</td>
                <td className="px-4 py-3 text-slate-500">{a.fournisseur}</td>
                <td className="px-4 py-3">
                  <Pastille ok={a.reel} texte={a.reel ? "Prix réels" : "Démonstration"} />
                </td>
                <td className="px-4 py-3">{a.dernierPrix === null ? "—" : prix(a.dernierPrix)}</td>
                <td className="px-4 py-3">{a.derniereDate ?? "—"}</td>
                <td className="px-4 py-3">{a.jours}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-xs text-slate-500">
        Page de contrôle technique. Elle n&apos;expose aucune donnée personnelle ni aucun mot de
        passe, et n&apos;est pas indexée par les moteurs de recherche.
      </p>
    </div>
  );
}
