import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccesForm } from "@/components/acces-form";
import { PageShell } from "@/components/page-shell";
import { connecte, motDePasseConfigure } from "@/lib/acces";

export const metadata: Metadata = { title: "Accès", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await connecte()) redirect("/tableau-de-bord");

  const sp = await searchParams;
  const brut = Array.isArray(sp.suite) ? sp.suite[0] : sp.suite;
  const suite = typeof brut === "string" && brut.startsWith("/") && !brut.startsWith("//") ? brut : "";

  const configure = motDePasseConfigure();

  return (
    <PageShell title="Accès privé" description="Ce site est réservé à son propriétaire.">
      <div className="mx-auto max-w-sm">
        {configure ? (
          <AccesForm suite={suite} />
        ) : (
          <div
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <strong className="font-semibold">Site pas encore configuré.</strong>
            <p className="mt-2 leading-relaxed">
              La variable <code>SITE_PASSWORD</code> est absente. Ajoute-la dans Vercel
              (<em>Settings → Environment Variables</em>), puis redéploie. Tant qu&apos;elle
              manque, personne ne peut entrer — y compris toi.
            </p>
          </div>
        )}
      </div>
    </PageShell>
  );
}
