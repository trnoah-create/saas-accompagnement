import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { ArrowIcon, ButtonLink } from "@/components/ui";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "À propos",
  description: `Le parcours derrière ${siteConfig.name} : la création de ${siteConfig.flagshipProduct}, construit de zéro avec l'IA.`,
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
          , un SaaS que j&apos;ai construit de zéro avec l&apos;aide de
          l&apos;IA — {siteConfig.aiTool} — dès la première ligne. Pas de no-code,
          pas d&apos;équipe technique : un vrai produit, codé, déployé et mis
          entre les mains de clients payants.
        </p>
        <p>
          C&apos;est ce qui a tout changé pour moi, et c&apos;est ce qui rend la
          création d&apos;un SaaS accessible aujourd&apos;hui à quelqu&apos;un qui
          n&apos;a pas un parcours d&apos;ingénieur. Mais je ne vais pas te vendre
          du rêve : l&apos;IA écrit l&apos;essentiel du code, elle ne décide pas à
          ta place. C&apos;est toi qui définis ce que tu construis, qui arbitres,
          qui relis ce qu&apos;elle produit et qui tranches quand ça part de
          travers. Savoir la piloter, c&apos;est un vrai savoir-faire — et ça
          s&apos;apprend.
        </p>
        <p>
          Ce que je transmets ici, ce sont les décisions concrètes de ce
          parcours : comment valider une idée, quoi construire en premier,
          comment faire travailler l&apos;IA sur ton projet sans perdre le
          contrôle, comment déployer et encaisser la montée en charge, comment
          fixer ses prix et où trouver ses premiers clients payants. Avec le temps
          que ça prend réellement et ce que ça coûte.
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
