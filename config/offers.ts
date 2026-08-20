import { siteConfig } from "./site";

export type Offer = {
  id: string;
  name: string;
  price: string;
  priceSuffix: string;
  billingNote: string;
  tagline: string;
  featured: boolean;
  badge?: string;
  scarcity?: string;
  ctaLabel: string;
  features: string[];
  modules?: { title: string; description: string }[];
};

export const offers: Offer[] = [
  {
    id: "formation",
    name: "Formation",
    price: "100 €",
    priceSuffix: "",
    billingNote: "Paiement unique · Accès à vie",
    tagline:
      "Tout le processus, de l'idée au premier client payant. Accessible immédiatement après l'achat.",
    featured: false,
    ctaLabel: "Accéder à la formation",
    features: [
      "Accès immédiat à l'intégralité des modules",
      "Accès à vie, mises à jour incluses",
      "Templates, checklists et scripts prêts à l'emploi",
      "Études de cas réelles issues de " + siteConfig.flagshipProduct,
      "À suivre à ton rythme, sans échéance",
    ],
    modules: [
      {
        title: "1 · Trouver et valider son idée",
        description:
          "Repérer un vrai problème, interroger le marché et valider la demande avant d'écrire la moindre ligne de code.",
      },
      {
        title: "2 · Cadrer le MVP",
        description:
          "Réduire le périmètre à l'essentiel, définir le parcours utilisateur et poser une roadmap tenable.",
      },
      {
        title: "3 · Construire en no-code",
        description:
          "Assembler un produit fonctionnel et vendable en quelques semaines, sans équipe technique.",
      },
      {
        title: "4 · Migrer vers du code",
        description:
          "Savoir quand et comment sortir du no-code, choisir sa stack et migrer sans casser l'existant.",
      },
      {
        title: "5 · Paiements et abonnements",
        description:
          "Mettre en place la facturation récurrente, gérer les essais, les impayés et le churn.",
      },
      {
        title: "6 · Trouver ses premiers clients",
        description:
          "Canaux d'acquisition qui fonctionnent pour un SaaS débutant, prospection et positionnement.",
      },
      {
        title: "7 · Mesurer et faire croître",
        description:
          "Les métriques qui comptent vraiment (MRR, churn, activation) et quoi améliorer en priorité.",
      },
    ],
  },
  {
    id: "accompagnement",
    name: "Accompagnement",
    price: "500 €",
    priceSuffix: "/mois",
    billingNote: "Sans engagement · Résiliable à tout moment",
    tagline:
      "Un suivi personnalisé, à mes côtés, sur ton projet précis — avec la formation incluse.",
    featured: true,
    badge: "Le plus complet",
    scarcity: "Limité à 10 places par mois",
    ctaLabel: "Réserver une place",
    features: [
      "La formation complète incluse",
      "Suivi personnalisé sur ton projet",
      "Messages illimités, réponse sous 24 h",
      "Revue de ton produit, de ton code et de ton offre",
      "Priorisation de ta roadmap chaque semaine",
      "Places strictement limitées à 10 par mois",
    ],
  },
];
