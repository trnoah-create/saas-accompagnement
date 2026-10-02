/**
 * Vérification des ordres proposés par le modèle.
 *
 * Fonction pure : aucune base, aucun réseau. Tout ordre impossible est
 * refusé avec un motif lisible, et les ordres valables restants sont
 * exécutés. Le modèle propose ; ce fichier décide.
 */
import { CLAUDE_TRADER, FEE_RATE } from "../constants";
import { ASSET_IDS } from "../market/assets";
import type { OrdreDemande, OrdreRefuse } from "../broker";
import type { Decision } from "./schema";

export type EtatValidation = {
  cash: number;
  totalValue: number;
  positions: { asset: string; quantity: number }[];
};

export type Prix = Record<string, number>;

export type Verdict = {
  acceptes: OrdreDemande[];
  refuses: OrdreRefuse[];
};

/**
 * Les ordres sont examinés dans l'ordre proposé, en tenant compte des
 * effets des précédents : vendre puis racheter avec le produit de la vente
 * reste possible, mais dépenser deux fois le même argent ne l'est pas.
 */
export function validerOrdres(
  decision: Decision,
  etat: EtatValidation,
  prix: Prix,
): Verdict {
  const acceptes: OrdreDemande[] = [];
  const refuses: OrdreRefuse[] = [];

  let cash = etat.cash;
  const detenu = new Map<string, number>();
  for (const p of etat.positions) detenu.set(p.asset, p.quantity);

  const plafondOrdre = (etat.totalValue * CLAUDE_TRADER.maxOrdrePct) / 100;

  for (const o of decision.ordres) {
    const refus = (motifRefus: string) =>
      refuses.push({
        asset: o.actif,
        side: o.sens,
        quantity: o.quantite,
        reason: o.justification,
        motifRefus,
      });

    if (acceptes.length >= CLAUDE_TRADER.maxOrdresParJour) {
      refus(`Plafond de ${CLAUDE_TRADER.maxOrdresParJour} ordres par jour atteint.`);
      continue;
    }
    if (!ASSET_IDS.includes(o.actif as (typeof ASSET_IDS)[number])) {
      refus(`Actif inconnu : ${o.actif}.`);
      continue;
    }
    if (!Number.isFinite(o.quantite) || o.quantite <= 0) {
      refus("Quantité invalide.");
      continue;
    }

    const p = prix[o.actif];
    if (!Number.isFinite(p) || p <= 0) {
      refus("Prix indisponible pour cet actif.");
      continue;
    }

    const brut = o.quantite * p;
    const frais = brut * FEE_RATE;

    const tropGros = () =>
      `Ordre trop gros : ${brut.toFixed(2)} € dépasse le plafond de ${plafondOrdre.toFixed(2)} € (${CLAUDE_TRADER.maxOrdrePct} % du portefeuille).`;

    if (o.sens === "achat") {
      if (brut > plafondOrdre + 1e-9) {
        refus(tropGros());
        continue;
      }
      const cout = brut + frais;
      if (cout > cash + 1e-9) {
        refus(
          `Liquidités insuffisantes : ${cout.toFixed(2)} € nécessaires, ${cash.toFixed(2)} € disponibles.`,
        );
        continue;
      }
      cash -= cout;
      detenu.set(o.actif, (detenu.get(o.actif) ?? 0) + o.quantite);
      acceptes.push({
        asset: o.actif as OrdreDemande["asset"],
        side: "buy",
        quantity: o.quantite,
        reason: o.justification,
      });
    } else {
      // Pour une vente, on vérifie d'abord la position : annoncer « trop
      // gros » quand l'actif n'est pas détenu serait trompeur.
      const possede = detenu.get(o.actif) ?? 0;
      if (o.quantite > possede + 1e-12) {
        refus(
          `Position insuffisante : ${o.quantite} demandés, ${possede} détenus.`,
        );
        continue;
      }
      if (brut > plafondOrdre + 1e-9) {
        refus(tropGros());
        continue;
      }
      cash += brut - frais;
      detenu.set(o.actif, possede - o.quantite);
      acceptes.push({
        asset: o.actif as OrdreDemande["asset"],
        side: "sell",
        quantity: o.quantite,
        reason: o.justification,
      });
    }
  }

  return { acceptes, refuses };
}

/** Faut-il suspendre les échanges du jour pour cause de perte trop forte ? */
export function perteJourDepassee(
  valeurActuelle: number,
  valeurVeille: number | null,
): { depassee: boolean; pct: number | null } {
  if (valeurVeille === null || valeurVeille <= 0) return { depassee: false, pct: null };
  const pct = ((valeurActuelle - valeurVeille) / valeurVeille) * 100;
  return { depassee: pct <= -CLAUDE_TRADER.maxPerteJourPct, pct };
}
