/** Formatage uniforme des nombres, en français, dans toute l'application. */

export function euro(n: number): string {
  return `${n.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

/** Prix : plus de décimales pour les actifs à très faible valeur (Dogecoin). */
export function prix(n: number): string {
  const decimales = n < 1 ? 6 : 2;
  return `${n.toLocaleString("fr-FR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })} €`;
}

export function pourcent(n: number, signe = true): string {
  const s = signe && n > 0 ? "+" : "";
  return `${s}${n.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} %`;
}

export function quantite(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}
