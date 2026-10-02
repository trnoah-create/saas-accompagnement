import { ButtonLink, ArrowIcon, CheckIcon, Eyebrow, SectionHeading } from "@/components/ui";
import { DisclaimerNote } from "@/components/disclaimer";
import { siteConfig } from "@/config/site";
import { START_CAPITAL, DISCLAIMER } from "@/lib/constants";
import { ASSETS } from "@/lib/market";
import { STRATEGIES } from "@/lib/engine/strategies";

export const dynamic = "force-dynamic";

const atouts = [
  "Argent 100 % fictif, aucune donnée bancaire",
  "Données de marché réelles et gratuites",
  "Aucun courtier, aucun ordre réel",
];

export default async function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden="true"
             className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-125 bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,var(--color-brand-200),transparent)] opacity-60 blur-3xl dark:bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,var(--color-brand-800),transparent)] dark:opacity-40" />

        <div className="container-page py-20 text-center sm:py-28">
          <Eyebrow>
            <span className="size-1.5 rounded-full bg-emerald-500" />
            {START_CAPITAL} € fictifs pour s&apos;entraîner
          </Eyebrow>

          <h1 className="mx-auto mt-8 max-w-4xl text-4xl font-bold tracking-tight text-balance sm:text-6xl">
            Apprends le trading{" "}
            <span className="bg-gradient-to-r from-brand-600 to-brand-400 bg-clip-text text-transparent">
              sans risquer un centime
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl dark:text-slate-400">
            Un portefeuille virtuel, de vrais prix de marché, et de quoi tester tes stratégies sur
            des années d&apos;historique. Tout est simulé, rien n&apos;est réel.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="/tableau-de-bord" className="w-full sm:w-auto">
              Ouvrir mon tableau de bord
              <ArrowIcon className="size-4" />
            </ButtonLink>
            <ButtonLink href="/backtest" variant="secondary" className="w-full sm:w-auto">
              Tester une stratégie
            </ButtonLink>
          </div>

          <ul className="mx-auto mt-12 flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {atouts.map((a) => (
              <li key={a} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <CheckIcon className="size-4 shrink-0 text-emerald-500" />
                {a}
              </li>
            ))}
          </ul>
          <DisclaimerNote className="mt-8" />
        </div>
      </section>

      <section className="border-t border-slate-200 py-20 dark:border-slate-800">
        <div className="container-page">
          <SectionHeading centered eyebrow="Ce que tu peux faire"
            title="Comprendre avant de risquer"
            description="Trois outils pour te faire une idée concrète, sans jamais engager d'argent réel." />

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              { t: "Portefeuille fictif", d: `Tu démarres avec ${START_CAPITAL} € virtuels. Achète et vends au prix du marché, avec des frais réalistes de 0,1 % par ordre.` },
              { t: "Backtest", d: "Rejoue une stratégie sur l'historique et vois ce qu'elle aurait donné : gain, pire chute, nombre d'ordres." },
              { t: "Bot automatique", d: "Laisse une stratégie piloter ton portefeuille fictif, avec un seuil de perte au-delà duquel tout est liquidé." },
            ].map((c) => (
              <div key={c.t} className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h3 className="text-lg font-semibold">{c.t}</h3>
                <p className="mt-2 leading-relaxed text-slate-600 dark:text-slate-400">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 py-20 dark:border-slate-800">
        <div className="container-page grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold">Les actifs suivis</h2>
            <ul className="mt-5 space-y-3">
              {ASSETS.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                  <span className="font-medium">{a.label}</span>
                  <span className="text-xs text-slate-500 uppercase">{a.kind}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-bold">Les stratégies</h2>
            <ul className="mt-5 space-y-3">
              {STRATEGIES.map((s) => (
                <li key={s.id} className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                  <div className="font-medium">{s.label}</div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{s.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 py-16 dark:border-slate-800">
        <div className="container-page">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950/40">
            <h2 className="font-semibold text-amber-900 dark:text-amber-200">À lire avant de commencer</h2>
            <p className="mt-2 text-sm leading-relaxed text-amber-900 dark:text-amber-200">
              {DISCLAIMER} {siteConfig.name} est un outil pédagogique : aucun courtier n&apos;est
              contacté, aucun ordre réel n&apos;est passé, aucune donnée bancaire n&apos;est
              demandée. Les gains affichés sont virtuels.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
