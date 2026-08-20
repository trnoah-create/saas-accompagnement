import { SectionHeading } from "./ui";

/**
 * Témoignages — section volontairement vide pour l'instant.
 *
 * Pour l'activer : ajouter des entrées dans le tableau `testimonials`
 * ci-dessous. La section bascule automatiquement du placeholder
 * vers la grille de témoignages dès qu'il y en a au moins un.
 */
type Testimonial = {
  quote: string;
  author: string;
  role: string;
};

const testimonials: Testimonial[] = [
  // {
  //   quote: "…",
  //   author: "Prénom Nom",
  //   role: "Fondateur de …",
  // },
];

export function Testimonials() {
  return (
    <section className="border-t border-slate-200 py-24 sm:py-32 dark:border-slate-800">
      <div className="container-page">
        <SectionHeading
          centered
          eyebrow="Témoignages"
          title="Ils sont passés de l'idée au produit"
          description="Les premiers retours d'accompagnement arriveront bientôt ici."
        />

        {testimonials.length === 0 ? (
          <div className="mx-auto mt-14 max-w-3xl">
            <div className="grid gap-6 sm:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  aria-hidden="true"
                  className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-6 dark:border-slate-700 dark:bg-slate-900/30"
                >
                  <div className="space-y-2.5">
                    <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800" />
                    <div className="h-2.5 w-11/12 rounded-full bg-slate-200 dark:bg-slate-800" />
                    <div className="h-2.5 w-2/3 rounded-full bg-slate-200 dark:bg-slate-800" />
                  </div>
                  <div className="mt-6 flex items-center gap-3">
                    <div className="size-8 rounded-full bg-slate-200 dark:bg-slate-800" />
                    <div className="space-y-1.5">
                      <div className="h-2 w-16 rounded-full bg-slate-200 dark:bg-slate-800" />
                      <div className="h-2 w-12 rounded-full bg-slate-200 dark:bg-slate-800" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-500">
              Les premières places d&apos;accompagnement viennent d&apos;ouvrir —
              les témoignages seront publiés au fur et à mesure.
            </p>
          </div>
        ) : (
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {testimonials.map((testimonial) => (
              <figure
                key={testimonial.author}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <blockquote className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  « {testimonial.quote} »
                </blockquote>
                <figcaption className="mt-6 text-sm">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {testimonial.author}
                  </div>
                  <div className="text-slate-500 dark:text-slate-500">
                    {testimonial.role}
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
