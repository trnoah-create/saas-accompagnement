import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { LegalPlaceholder } from "@/components/legal-placeholder";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Mentions légales du site.",
  robots: { index: false },
};

/**
 * ⚠️ Page volontairement vide.
 *
 * À compléter une fois la micro-entreprise créée. Éléments à renseigner :
 * dénomination, statut juridique, SIREN/SIRET, adresse du siège,
 * directeur de la publication, contact, hébergeur (Vercel Inc.).
 * Il suffit de remplacer <LegalPlaceholder /> par le contenu rédigé.
 */
export default function MentionsLegalesPage() {
  return (
    <PageShell title="Mentions légales">
      <LegalPlaceholder />
    </PageShell>
  );
}
