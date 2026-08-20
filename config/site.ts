/**
 * ─────────────────────────────────────────────────────────────
 *  CONFIGURATION CENTRALE DU SITE
 *
 *  Pour renommer le projet, il suffit de modifier `name` ci-dessous.
 *  Le nom est utilisé partout : header, footer, titres de pages,
 *  métadonnées SEO, textes des offres, etc.
 * ─────────────────────────────────────────────────────────────
 */

export const siteConfig = {
  /** ⬇️ NOM DU PROJET — la seule ligne à changer pour renommer le site. */
  name: "MonProjet",

  /** Slogan court, affiché sous le logo dans le footer. */
  tagline: "Lance ton SaaS, de l'idée au premier client payant.",

  /** Description utilisée pour le SEO et les partages sur les réseaux. */
  description:
    "Formation et accompagnement personnalisé pour créer, lancer et faire décoller ton propre SaaS — même en partant de zéro.",

  /** URL de production (à mettre à jour après le déploiement Vercel). */
  url: "https://monprojet.vercel.app",

  /** Adresse de contact affichée dans le footer. */
  email: "contact@monprojet.fr",

  /** Le SaaS de référence du fondateur, cité dans la section « Pourquoi moi ». */
  flagshipProduct: "Ventify",

  /** Navigation principale du header. */
  nav: [
    { label: "Accueil", href: "/" },
    { label: "Offres", href: "/offres" },
    { label: "À propos", href: "/a-propos" },
  ],

  /** Lien de connexion (isolé du reste de la nav, style bouton). */
  login: { label: "Se connecter", href: "/connexion" },

  /** Liens légaux du footer. */
  legal: [
    { label: "Mentions légales", href: "/mentions-legales" },
    { label: "CGU", href: "/cgu" },
  ],
} as const;

export type SiteConfig = typeof siteConfig;
