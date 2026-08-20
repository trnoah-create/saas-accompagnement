export function PageShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="container-page py-20 sm:py-24">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
        {description && (
          <p className="mt-5 text-lg leading-relaxed text-slate-600 dark:text-slate-400">
            {description}
          </p>
        )}
        {children && <div className="mt-12">{children}</div>}
      </div>
    </section>
  );
}
