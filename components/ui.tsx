import Link from "next/link";

type ButtonVariant = "primary" | "secondary" | "ghost" | "inverse";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-slate-900 text-white shadow-sm hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200",
  secondary:
    "border border-slate-300 text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800",
  ghost:
    "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
  /** À utiliser sur un fond sombre, quel que soit le thème actif. */
  inverse:
    "bg-white text-slate-900 shadow-sm hover:bg-slate-100 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100",
};

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5 ${variants[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  centered = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  centered?: boolean;
}) {
  return (
    <div className={`max-w-2xl ${centered ? "mx-auto text-center" : ""}`}>
      {eyebrow && (
        <p className="text-sm font-semibold text-brand-600 dark:text-brand-400">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-lg leading-relaxed text-slate-600 dark:text-slate-400">
          {description}
        </p>
      )}
    </div>
  );
}

export function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

export function ArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
