import { Testimonials } from "@/components/testimonials";
import { ArrowIcon, ButtonLink, CheckIcon, Eyebrow, SectionHeading } from "@/components/ui";
import { siteConfig } from "@/config/site";

const journey = [
  {
    step: "01",
    title: "Construit de zéro, avec l'IA",
    description: `${siteConfig.flagshipProduct}, je l'ai construit moi-même avec ${siteConfig.aiTool}, de la première ligne jusqu'à la mise en production. L'IA a écrit l'essentiel du code — les décisions, je les ai prises, assumées, et parfois payées.`,
  },
  {
    step: "02",
    title: "Ce que ça coûte vraiment",
    description:
      "Le temps que ça prend réellement, le budget que ça demande, les impasses dans lesquelles on s'engage sans le voir. Je te donne les vrais chiffres et les arbitrages, pas une estimation optimiste.",
  },
  {
    step: "03",
    title: "Les difficultés, sans filtre",
    description:
      "Les blocages techniques, les semaines où rien n'avance, les décisions qu'on repousse. Tu sauras à quoi t'attendre et comment passer au travers — parce que je suis passé par là.",
  },
];

const highlights = [
  "Un SaaS réellement lancé, pas de la théorie",
  "Un produit codé et mis en production de bout en bout",
  "Des méthodes testées sur un produit qui tourne",
];

export default function HomePage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-125 bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,var(--color-brand-200),transparent)] opacity-60 blur-3xl dark:bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,var(--color-brand-800),transparent)] dark:opacity-40"
        />

        <div className="container-page py-24 text-center sm:py-32">
          <div className="animate-fade-up">
            <Eyebrow>
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Places d&apos;accompagnement ouvertes ce mois-ci
            </Eyebrow>
          </div>

          <h1 className="animate-fade-up mx-auto mt-8 max-w-4xl text-4xl font-bold tracking-tight text-balance sm:text-6xl">
            Lance ton SaaS de zéro,{" "}
            <span className="bg-gradient-to-r from-brand-600 to-brand-400 bg-clip-text text-transparent">
              sans perdre deux ans
            </span>{" "}
            à tâtonner.
          </h1>

          <p className="animate-fade-up mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl dark:text-slate-400">
            De l&apos;idée au premier client : la méthode complète, les
            outils, et un accompagnement personnalisé par quelqu&apos;un qui l&apos;a
            déjà fait — pas quelqu&apos;un qui en parle.
          </p>

          <div className="animate-fade-up mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="/offres" className="w-full sm:w-auto">
              Découvrir les offres
              <ArrowIcon className="size-4" />
            </ButtonLink>
            <ButtonLink href="/a-propos" variant="secondary" className="w-full sm:w-auto">
              En savoir plus sur moi
            </ButtonLink>
          </div>

          <ul className="animate-fade-up mx-auto mt-12 flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {highlights.map((item) => (
              <li
                key={item}
                className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400"
              >
                <CheckIcon className="size-4 shrink-0 text-emerald-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Pourquoi moi ─────────────────────────────────────── */}
      <section className="border-t border-slate-200 py-24 sm:py-32 dark:border-slate-800">
        <div className="container-page">
          <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <SectionHeading
                eyebrow="Pourquoi moi"
                title={`J'ai construit ${siteConfig.flagshipProduct}, et je sais ce que ça coûte.`}
                description={`Je ne t'apprends pas à lancer un SaaS depuis un cours théorique. Je te transmets ce que j'ai appris en construisant ${siteConfig.flagshipProduct} de zéro avec l'IA : le temps que ça prend, ce que ça coûte, et les difficultés qu'on ne découvre qu'une fois dedans.`}
              />

              <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50/60 p-6 dark:border-slate-800 dark:bg-slate-900/40">
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  La plupart des créateurs ne se trompent pas sur leur idée : ils
                  se trompent sur ce qu&apos;il faut réellement tenir pour la mener
                  jusqu&apos;à un produit qui tourne — le temps, le budget, et les
                  moments où plus rien n&apos;avance.{" "}
                  <span className="font-medium text-slate-900 dark:text-white">
                    Savoir à l&apos;avance ce que ça demande, c&apos;est ce qui fait
                    la différence entre un projet abandonné et un SaaS lancé.
                  </span>
                </p>
              </div>

              <div className="mt-8">
                <ButtonLink href="/offres">
                  Voir les offres
                  <ArrowIcon className="size-4" />
                </ButtonLink>
              </div>
            </div>

            <ol className="relative space-y-8">
              {journey.map((item) => (
                <li
                  key={item.step}
                  className="relative rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start gap-5">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-900 text-sm font-bold text-white dark:bg-white dark:text-slate-900">
                      {item.step}
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold">{item.title}</h3>
                      <p className="mt-2 leading-relaxed text-slate-600 dark:text-slate-400">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ── Témoignages (placeholder) ────────────────────────── */}
      <Testimonials />

      {/* ── CTA final ────────────────────────────────────────── */}
      <section className="border-t border-slate-200 py-24 sm:py-28 dark:border-slate-800">
        <div className="container-page">
          <div className="relative overflow-hidden rounded-3xl bg-slate-900 px-8 py-16 text-center sm:px-16 dark:bg-slate-900 dark:ring-1 dark:ring-slate-800">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 -top-24 h-64 bg-[radial-gradient(ellipse_40%_60%_at_50%_50%,var(--color-brand-600),transparent)] opacity-50 blur-2xl"
            />
            <h2 className="relative text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ton SaaS mérite mieux qu&apos;un dossier « idées » oublié.
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-lg text-slate-300">
              Formation à 100 € ou accompagnement personnalisé à 500 €/mois —
              limité à 10 places.
            </p>
            <div className="relative mt-9">
              <ButtonLink href="/offres" variant="inverse">
                Choisir mon offre
                <ArrowIcon className="size-4" />
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
