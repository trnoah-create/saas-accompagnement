import type { Metadata } from "next";
import { offers } from "@/config/offers";
import { siteConfig } from "@/config/site";
import {
  ArrowIcon,
  ButtonLink,
  CheckIcon,
  Eyebrow,
  SectionHeading,
} from "@/components/ui";

export const metadata: Metadata = {
  title: "Offres",
  description:
    "Formation à 100 € en paiement unique, ou accompagnement personnalisé à 500 €/mois limité à 10 places.",
};

/** Les modules sont portés par l'offre « Formation » (cf. config/offers.ts). */
const formationModules =
  offers.find((offer) => offer.modules)?.modules ?? [];

const faq = [
  {
    question: "Faut-il savoir coder pour commencer ?",
    answer:
      "Non, et c'est précisément ce qui a changé ces dernières années : l'IA prend en charge la plus grande partie du travail technique, c'est elle qui écrit l'essentiel du code. Ce n'est pas du no-code, c'est un vrai produit codé — mais tu n'as pas besoin de savoir l'écrire toi-même. En revanche tu restes aux commandes : comprendre ce que tu construis, arbitrer, relire ce que l'IA produit. La formation t'apprend exactement ça.",
  },
  {
    question: "Combien de temps faut-il y consacrer ?",
    answer:
      "La formation se suit à ton rythme. En pratique, quelques heures par semaine suffisent pour avancer sérieusement sur ton projet.",
  },
  {
    question: "Pourquoi limiter l'accompagnement à 10 places ?",
    answer:
      "Parce que répondre en moins de 24 h sur des projets réels demande du temps. Au-delà de 10 personnes, le suivi ne serait plus personnalisé.",
  },
  {
    question: "L'accompagnement inclut-il la formation ?",
    answer:
      "Oui. Tu as accès à l'intégralité des modules dès le premier jour, en plus du suivi personnalisé.",
  },
];

export default function OffresPage() {
  return (
    <>
      {/* ── En-tête ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-slate-200 dark:border-slate-800">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-32 -z-10 h-100 bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,var(--color-brand-200),transparent)] opacity-60 blur-3xl dark:bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,var(--color-brand-800),transparent)] dark:opacity-40"
        />
        <div className="container-page py-20 text-center sm:py-24">
          <Eyebrow>Deux façons d&apos;avancer</Eyebrow>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
            Choisis ton niveau d&apos;accompagnement
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-400">
            Apprends en autonomie avec la formation complète, ou avance à mes
            côtés avec un suivi personnalisé sur ton projet.
          </p>
        </div>
      </section>

      {/* ── Cartes d'offres ──────────────────────────────────── */}
      <section className="py-16 sm:py-20">
        <div className="container-page">
          <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-2">
            {offers.map((offer) => (
              <div
                key={offer.id}
                className={`relative flex h-full flex-col rounded-3xl p-8 sm:p-10 ${
                  offer.featured
                    ? "bg-slate-900 text-slate-300 shadow-xl ring-1 ring-slate-900 dark:ring-slate-700"
                    : "border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
                }`}
              >
                {offer.badge && (
                  <span className="absolute -top-3 left-8 rounded-full bg-brand-500 px-3.5 py-1 text-xs font-semibold text-white shadow-sm">
                    {offer.badge}
                  </span>
                )}

                <h2
                  className={`text-xl font-semibold ${offer.featured ? "text-white" : ""}`}
                >
                  {offer.name}
                </h2>

                <p
                  className={`mt-3 min-h-14 text-sm leading-relaxed ${
                    offer.featured
                      ? "text-slate-400"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {offer.tagline}
                </p>

                <div className="mt-7 flex items-baseline gap-1.5">
                  <span
                    className={`text-5xl font-bold tracking-tight ${
                      offer.featured ? "text-white" : "text-slate-900 dark:text-white"
                    }`}
                  >
                    {offer.price}
                  </span>
                  {offer.priceSuffix && (
                    <span
                      className={`text-lg font-medium ${
                        offer.featured
                          ? "text-slate-400"
                          : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {offer.priceSuffix}
                    </span>
                  )}
                </div>

                <p
                  className={`mt-2 text-sm ${
                    offer.featured ? "text-slate-400" : "text-slate-500 dark:text-slate-500"
                  }`}
                >
                  {offer.billingNote}
                </p>

                {offer.scarcity && (
                  <p className="mt-4 inline-flex items-center gap-2 self-start rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white">
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    {offer.scarcity}
                  </p>
                )}

                <div className="mt-8">
                  <ButtonLink
                    href={siteConfig.login.href}
                    className="w-full"
                    variant={offer.featured ? "inverse" : "secondary"}
                  >
                    {offer.ctaLabel}
                    <ArrowIcon className="size-4" />
                  </ButtonLink>
                  <p
                    className={`mt-3 text-center text-xs ${
                      offer.featured ? "text-slate-500" : "text-slate-500 dark:text-slate-500"
                    }`}
                  >
                    Paiement bientôt disponible — reviens très vite.
                  </p>
                </div>

                <ul className="mt-8 space-y-3.5 border-t border-slate-200/70 pt-8 dark:border-slate-800">
                  {offer.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm">
                      <CheckIcon
                        className={`mt-0.5 size-4 shrink-0 ${
                          offer.featured ? "text-emerald-400" : "text-emerald-500"
                        }`}
                      />
                      <span
                        className={
                          offer.featured
                            ? "text-slate-300"
                            : "text-slate-700 dark:text-slate-300"
                        }
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                {offer.modules && (
                  <p className="mt-6 text-sm text-slate-500 dark:text-slate-500">
                    {offer.modules.length} modules —{" "}
                    <a
                      href="#programme"
                      className="font-medium text-brand-600 underline underline-offset-4 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                    >
                      voir le programme détaillé
                    </a>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Programme de la formation ────────────────────────── */}
      <section
        id="programme"
        className="scroll-mt-20 border-t border-slate-200 py-20 sm:py-24 dark:border-slate-800"
      >
        <div className="container-page">
          <SectionHeading
            centered
            eyebrow="Formation"
            title="Au programme"
            description="Sept modules qui suivent l'ordre réel d'un lancement — de la validation de l'idée aux premiers clients payants. Inclus dans les deux offres."
          />
          <ol className="mx-auto mt-14 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {formationModules.map((module) => (
              <li
                key={module.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <h3 className="text-sm font-semibold">{module.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {module.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section className="border-t border-slate-200 py-20 sm:py-24 dark:border-slate-800">
        <div className="container-page">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Questions fréquentes
          </h2>
          <dl className="mx-auto mt-12 grid max-w-4xl gap-8 sm:grid-cols-2">
            {faq.map((item) => (
              <div key={item.question}>
                <dt className="font-semibold text-slate-900 dark:text-white">
                  {item.question}
                </dt>
                <dd className="mt-2 leading-relaxed text-slate-600 dark:text-slate-400">
                  {item.answer}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}
