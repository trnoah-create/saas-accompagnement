import Link from "next/link";
import { siteConfig } from "@/config/site";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`group inline-flex items-center gap-2.5 ${className}`}
      aria-label={`${siteConfig.name} — retour à l'accueil`}
    >
      <span className="grid size-8 place-items-center rounded-lg bg-slate-900 text-sm font-bold text-white transition-transform group-hover:-rotate-6 dark:bg-white dark:text-slate-900">
        {siteConfig.name.charAt(0)}
      </span>
      <span className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">
        {siteConfig.name}
      </span>
    </Link>
  );
}
