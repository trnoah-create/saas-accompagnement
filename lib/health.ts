import "server-only";
import { baseConfiguree, query, urlBase } from "./db";
import { ASSETS, getPrices, type AssetId } from "./market";
import { motDePasseConfigure } from "./session";

export type EtatBase = {
  configuree: boolean;
  joignable: boolean;
  detail: string;
  hote: string | null;
};

export type EtatAcces = { configure: boolean; detail: string };

export function etatAcces(): EtatAcces {
  return motDePasseConfigure()
    ? {
        configure: true,
        detail: "La variable SITE_PASSWORD est bien définie : le site est protégé.",
      }
    : {
        configure: false,
        detail:
          "La variable SITE_PASSWORD est absente. Personne ne peut entrer, toi compris. Ajoute-la dans Vercel (Settings → Environment Variables), puis redéploie.",
      };
}

export type EtatActif = {
  id: string;
  label: string;
  fournisseur: string;
  source: string;
  reel: boolean;
  dernierPrix: number | null;
  derniereDate: string | null;
  jours: number;
};

export async function etatBase(): Promise<EtatBase> {
  const url = urlBase();
  let hote: string | null = null;
  try {
    if (url) hote = new URL(url).hostname;
  } catch {
    hote = null;
  }

  if (!baseConfiguree()) {
    return {
      configuree: false,
      joignable: false,
      hote: null,
      detail:
        "Aucune variable DATABASE_URL trouvée. La base n'est pas encore connectée : les comptes et les ordres ne peuvent pas être enregistrés.",
    };
  }

  try {
    await query("SELECT 1");
    return { configuree: true, joignable: true, hote, detail: "Connexion établie." };
  } catch (e) {
    return {
      configuree: true,
      joignable: false,
      hote,
      detail: `La base est configurée mais ne répond pas : ${(e as Error).message}`,
    };
  }
}

export async function etatActifs(): Promise<EtatActif[]> {
  return Promise.all(
    ASSETS.map(async (a) => {
      try {
        const { bars, source } = await getPrices(a.id as AssetId, 30);
        const dernier = bars.at(-1);
        return {
          id: a.id,
          label: a.label,
          fournisseur: a.provider,
          source,
          reel: source !== "demo",
          dernierPrix: dernier?.close ?? null,
          derniereDate: dernier?.day ?? null,
          jours: bars.length,
        };
      } catch (e) {
        return {
          id: a.id,
          label: a.label,
          fournisseur: a.provider,
          source: `erreur : ${(e as Error).message}`,
          reel: false,
          dernierPrix: null,
          derniereDate: null,
          jours: 0,
        };
      }
    }),
  );
}
