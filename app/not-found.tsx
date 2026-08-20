import { PageShell } from "@/components/page-shell";
import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <PageShell
      title="Page introuvable"
      description="Cette page n'existe pas ou a été déplacée."
    >
      <ButtonLink href="/">Retour à l&apos;accueil</ButtonLink>
    </PageShell>
  );
}
