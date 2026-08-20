# MonProjet

Site vitrine (landing page + offres) du projet d'accompagnement et de formation
destiné aux personnes qui veulent créer leur propre SaaS.

Next.js (App Router) · TypeScript · Tailwind CSS v4 · déployable sur Vercel.

## Démarrer

```bash
npm install
npm run dev      # http://localhost:3000
```

Autres commandes : `npm run build` (build de production), `npm start` (sert le build).

## ⚙️ Renommer le projet

Le nom « MonProjet » est provisoire et **centralisé en un seul endroit**.
Pour le changer, modifie une seule ligne dans [`config/site.ts`](config/site.ts) :

```ts
export const siteConfig = {
  name: "MonProjet", // ← seule ligne à modifier
  ...
};
```

Le nouveau nom se propage automatiquement partout : header, footer, titres de
pages, métadonnées SEO, favicon (généré depuis l'initiale), textes des offres.

Le même fichier contient aussi le slogan, la description SEO, l'URL de
production, l'e-mail de contact, la navigation et les liens légaux.

## Structure

```
app/
  layout.tsx              Layout global (header, footer, thème, SEO)
  page.tsx                Landing : hero, « Pourquoi moi », témoignages, CTA
  offres/                 Les deux offres, le programme et la FAQ
  a-propos/               Parcours du fondateur
  connexion/              Espace membre (à venir)
  mentions-legales/       ⚠️ vide — à rédiger
  cgu/                    ⚠️ vide — à rédiger
  icon.tsx                Favicon généré depuis siteConfig.name
components/               Header, footer, thème, témoignages, UI partagée
config/
  site.ts                 ⭐ Nom du projet et configuration générale
  offers.ts               Tarifs, bénéfices et modules de la formation
```

## Modifier les offres

Tarifs, arguments et modules de la formation vivent dans
[`config/offers.ts`](config/offers.ts) — aucune modification de composant
nécessaire pour ajuster un prix ou ajouter un module.

## Ajouter des témoignages

La section témoignages est un placeholder. Dans
[`components/testimonials.tsx`](components/testimonials.tsx), remplis le tableau
`testimonials` : la section bascule automatiquement du placeholder vers la
grille dès qu'il contient au moins une entrée.

## Pages légales

`/mentions-legales` et `/cgu` sont volontairement vides, en attente de la
création de la micro-entreprise. Chaque fichier liste en commentaire les
éléments à renseigner ; il suffit ensuite de remplacer `<LegalPlaceholder />`
par le contenu rédigé.

## Mode clair / sombre

Toggle dans le header, préférence enregistrée dans `localStorage`. Par défaut le
site suit la préférence système, jusqu'à un premier choix manuel. Un script
inline (`components/theme-provider.tsx`) applique le thème avant le rendu pour
éviter tout flash au chargement.

## Paiements

Aucune intégration Stripe pour l'instant : les boutons des offres renvoient vers
`/connexion`, qui invite à passer par e-mail. Le branchement du paiement se fera
plus tard.

## Déploiement sur Vercel

Importer le dépôt sur [vercel.com/new](https://vercel.com/new) : le framework est
détecté automatiquement, aucune variable d'environnement n'est requise. Pense à
mettre à jour `url` dans `config/site.ts` avec le domaine final (utilisé pour les
métadonnées de partage).
