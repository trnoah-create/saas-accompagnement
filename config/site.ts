/**
 * ─────────────────────────────────────────────────────────────
 *  CONFIGURATION CENTRALE DU SITE
 *  Pour renommer le projet, modifier `name` ci-dessous.
 * ─────────────────────────────────────────────────────────────
 */
export const siteConfig = {
  /** ⬇️ NOM DU PROJET — la seule ligne à changer pour renommer le site. */
  name: "SimuTrade",

  tagline: "Apprends le trading sans risquer un centime.",

  description:
    "Simulateur de trading à argent fictif : portefeuille virtuel, backtests de stratégies et bot automatique sur Bitcoin, Ethereum, Dogecoin et le S&P 500.",

  url: "https://simutrade.vercel.app",
  email: "contact@simutrade.fr",

  /** Navigation visible pour tout le monde. */
  nav: [
    { label: "Accueil", href: "/" },
    { label: "Backtest", href: "/backtest" },
    { label: "Comparateur", href: "/comparateur" },
  ],

  /** Navigation réservée aux membres connectés. */
  navPrivee: [
    { label: "Tableau de bord", href: "/tableau-de-bord" },
    { label: "Bot", href: "/bot" },
  ],

  login: { label: "Se connecter", href: "/connexion" },

  legal: [
    { label: "Mentions légales", href: "/mentions-legales" },
    { label: "CGU", href: "/cgu" },
  ],
} as const;

export type SiteConfig = typeof siteConfig;
