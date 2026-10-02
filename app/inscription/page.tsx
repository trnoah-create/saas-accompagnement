import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { PageShell } from "@/components/page-shell";
import { currentUser } from "@/lib/auth";
import { START_CAPITAL } from "@/lib/constants";

export const metadata: Metadata = { title: "Créer un compte" };

export default async function Page() {
  if (await currentUser()) redirect("/tableau-de-bord");
  return (
    <PageShell
      title="Créer un compte"
      description={`Tu démarres avec ${START_CAPITAL} € fictifs. Aucune donnée bancaire, aucun vrai paiement.`}
    >
      <div className="mx-auto max-w-sm"><AuthForm mode="inscription" /></div>
    </PageShell>
  );
}
