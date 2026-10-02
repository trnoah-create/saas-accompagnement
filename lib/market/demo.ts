/**
 * Données de DÉMONSTRATION — prix entièrement inventés.
 *
 * ⚠️ Ce ne sont PAS de vrais prix de marché. Elles servent uniquement à
 * faire tourner l'application quand le réseau est indisponible (hors-ligne,
 * pare-feu d'entreprise). Toute performance calculée dessus n'a aucune
 * valeur historique, et l'interface l'affiche clairement.
 *
 * La génération est déterministe : le même actif donne toujours la même
 * série, pour que les tests soient reproductibles.
 */
import type { Bar } from "./types";

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function rng(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PROFILS: Record<string, { depart: number; derive: number; volatilite: number }> = {
  BTC: { depart: 42000, derive: 0.0012, volatilite: 0.035 },
  ETH: { depart: 2300, derive: 0.0010, volatilite: 0.040 },
  DOGE: { depart: 0.12, derive: 0.0005, volatilite: 0.060 },
  SPY: { depart: 450, derive: 0.0004, volatilite: 0.009 },
};

function seedOf(asset: string): number {
  let h = 7;
  for (const c of asset) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function demoBars(asset: string, days: number): Bar[] {
  const profil = PROFILS[asset] ?? { depart: 100, derive: 0.0005, volatilite: 0.02 };
  const alea = rng(seedOf(asset));

  const bars: Bar[] = [];
  let prix = profil.depart;

  // On remonte `days` jours dans le passé jusqu'à aujourd'hui.
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i--) {
    const jour = new Date(base);
    jour.setUTCDate(base.getUTCDate() - i);

    const open = prix;
    // Marche aléatoire avec une légère tendance haussière.
    const variation = profil.derive + (alea() - 0.5) * 2 * profil.volatilite;
    const close = Math.max(open * (1 + variation), 0.0001);
    const high = Math.max(open, close) * (1 + alea() * profil.volatilite * 0.4);
    const low = Math.min(open, close) * (1 - alea() * profil.volatilite * 0.4);

    bars.push({
      day: jour.toISOString().slice(0, 10),
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
    });
    prix = close;
  }
  return bars;
}

function round(n: number): number {
  return n >= 1 ? Math.round(n * 100) / 100 : Math.round(n * 1e6) / 1e6;
}
