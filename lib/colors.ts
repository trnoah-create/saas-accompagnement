/**
 * Couleurs des courbes.
 *
 * ⚠️ Volontairement dans un module SANS "use client" : une valeur exportée
 * depuis un module client est remplacée par une référence côté serveur, et
 * un composant serveur qui l'importerait recevrait `undefined`.
 */
export const CHART_COLORS = [
  "#6366f1", // indigo
  "#10b981", // émeraude
  "#f59e0b", // ambre
  "#ef4444", // rouge
  "#8b5cf6", // violet
] as const;
