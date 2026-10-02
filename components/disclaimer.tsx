import { DISCLAIMER } from "@/lib/constants";

/** Bandeau affiché sur toutes les pages, en haut. */
export function DisclaimerBanner() {
  return (
    <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
      <p className="container-page py-2.5 text-center text-xs font-medium text-amber-900 dark:text-amber-200">
        ⚠️ {DISCLAIMER}
      </p>
    </div>
  );
}

/** Rappel compact, à placer près des chiffres de performance. */
export function DisclaimerNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-slate-500 dark:text-slate-500 ${className}`}>{DISCLAIMER}</p>
  );
}

/** Avertit quand les prix affichés sont inventés. */
export function DemoDataWarning({ source }: { source: string }) {
  if (source !== "demo") return null;
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
    >
      <strong className="font-semibold">Données de démonstration.</strong> Le réseau n&apos;a pas
      permis de télécharger les vrais prix : ceux affichés sont <strong>inventés</strong>. Les
      résultats ci-dessous n&apos;ont aucune valeur historique.
    </div>
  );
}
