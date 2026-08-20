import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { ArrowIcon, ButtonLink } from "@/components/ui";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "À propos",
  description: `Le parcours derrière ${siteConfig.name} : la création de ${siteConfig.flagshipProduct}, du no-code au code.`,
};

export default function AProposPage() {
  return (
    <PageShell
      title="À propos"
      description={`${siteConfig.name} est né d'une conviction simple : on apprend à lancer un SaaS en le lançant, pas en accumulant des cours.`}
    >
      <div className="space-y-6 leading-relaxed text-slate-600 dark:text-slate-400">
        <p>
          J&apos;ai créé{" "}
          <strong className="font-semibold text-slate-900 dark:text-white">
            {siteConfig.flagshipProduct}
          </strong>
          , un SaaS que j&apos;ai lancé en no-code avant de le migrer vers du code.
          Ce chemin — sortir vite un produit imparfait, le confronter à de vrais
          clients, puis le solidifier techniquement — est celui que je recommande
          aujourd&apos;hui à la majorité des créateurs.
        </p>
        <p>
          Le no-code m&apos;a permis de valider une demande réelle en quelques
          semaines au lieu de plusieurs mois. La migration vers du code est venue
          après, quand le produit avait des utilisateurs, des revenus, et des
          limites claires à dépasser. Faire l&apos;inverse — coder pendant un an un
          produit que personne n&apos;a demandé — est l&apos;erreur la plus
          coûteuse que je vois se répéter.
        </p>
        <p>
          Ce que je transmets ici, ce sont les décisions concrètes de ce parcours :
          comment valider une idée, quoi construire en premier, quand quitter le
          no-code, comment fixer ses prix, et où trouver ses premiers clients
          payants.
        </p>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <ButtonLink href="/offres">
          Voir les offres
          <ArrowIcon className="size-4" />
        </ButtonLink>
        <ButtonLink href={`mailto:${siteConfig.email}`} variant="secondary">
          Me contacter
        </ButtonLink>
      </div>
    </PageShell>
  );
}
