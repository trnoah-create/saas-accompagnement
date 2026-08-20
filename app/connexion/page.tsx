import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { ButtonLink } from "@/components/ui";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Se connecter",
  description: `Accès à l'espace membre ${siteConfig.name}.`,
};

export default function ConnexionPage() {
  return (
    <PageShell
      title="Se connecter"
      description="L'espace membre n'est pas encore ouvert. Il arrivera en même temps que les paiements."
    >
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-8 dark:border-slate-800 dark:bg-slate-900/40">
        <h2 className="text-lg font-semibold">En attendant</h2>
        <p className="mt-2 leading-relaxed text-slate-600 dark:text-slate-400">
          Les inscriptions se font directement par e-mail. Écris-moi en précisant
          l&apos;offre qui t&apos;intéresse et l&apos;état d&apos;avancement de ton
          projet.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href={`mailto:${siteConfig.email}`}>
            Écrire à {siteConfig.email}
          </ButtonLink>
          <ButtonLink href="/offres" variant="secondary">
            Revoir les offres
          </ButtonLink>
        </div>
      </div>
    </PageShell>
  );
}
