import Link from "next/link";
import { siteConfig } from "@/config/site";
import { Logo } from "./logo";

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/30">
      <div className="container-page py-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              {siteConfig.tagline}
            </p>
            <a
              href={`mailto:${siteConfig.email}`}
              className="mt-3 inline-block text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
            >
              {siteConfig.email}
            </a>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:gap-16">
            <div>
              <h2 className="text-xs font-semibold tracking-wider text-slate-900 uppercase dark:text-white">
                Navigation
              </h2>
              <ul className="mt-4 space-y-2.5">
                {[...siteConfig.nav, siteConfig.login].map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="text-xs font-semibold tracking-wider text-slate-900 uppercase dark:text-white">
                Légal
              </h2>
              <ul className="mt-4 space-y-2.5">
                {siteConfig.legal.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-slate-200 pt-6 dark:border-slate-800">
          <p className="text-sm text-slate-500 dark:text-slate-500">
            © {new Date().getFullYear()} {siteConfig.name}. Tous droits réservés.
          </p>
        </div>
      </div>
    </footer>
  );
}
