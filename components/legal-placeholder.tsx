import { siteConfig } from "@/config/site";

/**
 * Bloc affiché sur les pages légales tant que leur contenu n'est pas rédigé.
 * À supprimer page par page au fur et à mesure de leur rédaction.
 */
export function LegalPlaceholder() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-8 dark:border-slate-700 dark:bg-slate-900/40">
      <p className="leading-relaxed text-slate-600 dark:text-slate-400">
        Cette page sera complétée prochainement, à l&apos;issue de la création de
        la structure juridique de {siteConfig.name}.
      </p>
      <p className="mt-4 text-sm text-slate-500 dark:text-slate-500">
        Pour toute question en attendant, écris à{" "}
        <a
          href={`mailto:${siteConfig.email}`}
          className="font-medium text-brand-600 underline underline-offset-4 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
        >
          {siteConfig.email}
        </a>
        .
      </p>
    </div>
  );
}
