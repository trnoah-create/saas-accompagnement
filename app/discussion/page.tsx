import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";
import { hasAccompagnement } from "@/lib/entitlements";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Discussion",
  description: `Pose ta question avant d'acheter, ou rejoins l'accès privé réservé aux membres de l'offre Accompagnement.`,
};

/**
 * La page dépend de l'identité du visiteur : elle ne doit jamais être
 * pré-rendue en statique au build, sinon la décision d'accès serait figée
 * dans un HTML servi à tout le monde.
 */
export const dynamic = "force-dynamic";

export default async function DiscussionPage() {
  // Décision prise côté serveur, avant tout rendu.
  const canAccessDiscord = await hasAccompagnement();

  // ⚠️ Le lien n'est lu QUE si l'accès est accordé. Tant que la condition
  // est fausse, l'URL n'existe nulle part dans la réponse envoyée au
  // navigateur — ni dans le HTML, ni dans le JS, ni dans le payload React.
  const discordInvite = canAccessDiscord
    ? process.env.DISCORD_INVITE_URL
    : undefined;

  return (
    <>
      <section className="border-b border-slate-200 dark:border-slate-800">
        <div className="container-page py-16 text-center sm:py-20">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Discussion
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-400">
            Une question avant de te lancer ? Écris-moi, je réponds
            personnellement.
          </p>
        </div>
      </section>

      {/* ── 1 · Formulaire de contact — visible par tous ──────── */}
      <section className="py-16 sm:py-20">
        <div className="container-page">
          <div className="mx-auto max-w-xl">
            <h2 className="text-2xl font-bold tracking-tight">Me poser une question</h2>
            <p className="mt-3 leading-relaxed text-slate-600 dark:text-slate-400">
              Pour toute question sur la formation, l&apos;accompagnement ou ton
              projet. Réponse sous 24 h ouvrées.
            </p>
            <div className="mt-8">
              <ContactForm />
            </div>
            <p className="mt-6 text-sm text-slate-500 dark:text-slate-500">
              Tu peux aussi écrire directement à{" "}
              <a
                href={`mailto:${siteConfig.email}`}
                className="font-medium text-brand-600 underline underline-offset-4 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
              >
                {siteConfig.email}
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      {/* ── 2 · Accès Discord — membres Accompagnement uniquement ──
          Rien de cette section n'est rendu pour les autres visiteurs. */}
      {canAccessDiscord && (
        <section className="border-t border-slate-200 py-16 sm:py-20 dark:border-slate-800">
          <div className="container-page">
            <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-slate-50/60 p-8 dark:border-slate-800 dark:bg-slate-900/40">
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-500/10 px-3 py-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Membre Accompagnement
              </span>

              <h2 className="mt-4 text-2xl font-bold tracking-tight">
                Ton accès Discord privé
              </h2>
              <p className="mt-3 leading-relaxed text-slate-600 dark:text-slate-400">
                Messages illimités, réponse sous 24 h. C&apos;est le canal
                direct pour avancer sur ton projet au quotidien.
              </p>

              {discordInvite ? (
                <a
                  href={discordInvite}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  Rejoindre le Discord privé
                </a>
              ) : (
                <p className="mt-7 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  Ton accès est bien actif, mais le lien d&apos;invitation
                  n&apos;est pas encore configuré sur le site. Écris-moi à{" "}
                  <a href={`mailto:${siteConfig.email}`} className="underline underline-offset-4">
                    {siteConfig.email}
                  </a>{" "}
                  et je te l&apos;envoie directement.
                </p>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
