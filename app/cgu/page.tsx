import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { LegalPlaceholder } from "@/components/legal-placeholder";

export const metadata: Metadata = {
  title: "CGU",
  description: "Conditions générales d'utilisation du site.",
  robots: { index: false },
};

/**
 * ⚠️ Page volontairement vide.
 *
 * À compléter une fois la micro-entreprise créée. Éléments à prévoir :
 * objet et acceptation, description des services, accès et compte,
 * tarifs et modalités de paiement, droit de rétractation, propriété
 * intellectuelle, responsabilité, données personnelles, droit applicable.
 * Il suffit de remplacer <LegalPlaceholder /> par le contenu rédigé.
 */
export default function CguPage() {
  return (
    <PageShell title="Conditions générales d'utilisation">
      <LegalPlaceholder />
    </PageShell>
  );
}
