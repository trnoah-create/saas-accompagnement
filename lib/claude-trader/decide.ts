/**
 * Appel à l'API Claude pour obtenir les ordres du jour.
 *
 * La clé est lue par le SDK dans ANTHROPIC_API_KEY. Elle n'apparaît jamais
 * dans le code, ni dans les comptes rendus, ni dans les messages d'erreur.
 *
 * Le modèle n'a aucune mémoire d'un jour à l'autre : tout ce qu'il doit
 * savoir — stratégie, cadre, portefeuille, prix, comptes rendus récents —
 * lui est redonné à chaque appel.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { claudeTraderConfig as cfg } from "../../config/claude-trader";
import { DISCLAIMER } from "../constants";
import { ASSETS, getPrices, type AssetId } from "../market";
import { DecisionSchema, type Decision } from "./schema";
import type { EtatCompte } from "../broker";

export function cleConfiguree(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type ContexteMarche = {
  asset: string;
  label: string;
  dernierPrix: number;
  clotures: number[];
  variation7j: number | null;
  variation30j: number | null;
};

function variation(series: number[], jours: number): number | null {
  if (series.length <= jours) return null;
  const avant = series[series.length - 1 - jours];
  if (!avant) return null;
  return ((series[series.length - 1] - avant) / avant) * 100;
}

export async function rassemblerContexte(): Promise<ContexteMarche[]> {
  return Promise.all(
    ASSETS.map(async (a) => {
      const { bars } = await getPrices(a.id as AssetId, 60);
      const clotures = bars.slice(-30).map((b) => Number(b.close.toFixed(6)));
      return {
        asset: a.id,
        label: a.label,
        dernierPrix: bars.at(-1)?.close ?? 0,
        clotures,
        variation7j: variation(clotures, 7),
        variation30j: variation(clotures, 29),
      };
    }),
  );
}

/** Stratégie et cadre, identiques à chaque appel : le modèle les redécouvre. */
const SYSTEME = `Tu gères un petit portefeuille d'entraînement en argent entièrement FICTIF, dans un simulateur pédagogique.

## Ta stratégie
Tu es prudent. L'objectif n'est pas de multiplier les opérations mais de ne prendre que celles qui se justifient vraiment. Le portefeuille est petit : chaque ordre coûte des frais et un écart achat/vente, donc trop s'agiter fait perdre de l'argent mécaniquement.

**Ne rien faire est une décision normale et fréquente.** Si rien ne se détache nettement, renvoie une liste d'ordres vide. On ne te juge pas au nombre d'ordres passés.

## Le cadre, appliqué par le code
Ces règles ne sont pas négociables : le code refuse tout ordre qui les dépasse, même si tu le proposes.
- Actifs autorisés, et aucun autre : ${cfg.actifsAutorises.join(", ")}.
- Montant par ordre : entre ${cfg.ordres.montantMinEuros} € et ${cfg.ordres.montantMaxEuros} €.
- Au maximum ${cfg.ordres.maxParJour} ordres par jour.
- Un seul actif ne peut dépasser ${cfg.ordres.partMaxParActifPct} % du portefeuille.
- Pas d'effet de levier : tu ne peux pas engager plus que les liquidités disponibles.
- Pas de vente à découvert : tu ne peux vendre que ce que le portefeuille détient déjà.
- Frais de ${cfg.couts.fraisPct} % par ordre, plus un écart achat/vente de ${cfg.couts.ecartPct} %.
- Pertes maximales : ${cfg.pertes.blocageJour} € sur une journée, ${cfg.pertes.semaine} € sur une semaine, ${cfg.pertes.mois} € sur un mois. Au-delà, le mode s'arrête tout seul.

## Ce que tu renvoies
Uniquement la structure demandée : une analyse courte, puis la liste des ordres, chacun justifié en une phrase simple en français.

Les prix fournis sont des clôtures passées. Tu n'as aucune information sur l'avenir.

${DISCLAIMER}`;

export type CompteRenduBref = {
  day: string;
  statut: string;
  resume: string;
  valeur: number | null;
};

function sectionHistorique(recents: CompteRenduBref[]): string {
  if (recents.length === 0) {
    return "Aucun compte rendu antérieur : c'est la première journée.";
  }
  return recents
    .map(
      (r) =>
        `- ${r.day} (${r.statut})${r.valeur === null ? "" : ` — portefeuille ${r.valeur.toFixed(2)} €`} : ${r.resume}`,
    )
    .join("\n");
}

function construirePrompt(
  marche: ContexteMarche[],
  etat: EtatCompte,
  recents: CompteRenduBref[],
): string {
  const positions =
    etat.positions.length > 0
      ? etat.positions
          .map(
            (p) =>
              `  - ${p.asset} : ${p.quantity.toFixed(8)} unités, valeur ${p.value.toFixed(2)} € (${((p.value / etat.totalValue) * 100).toFixed(1)} % du portefeuille)`,
          )
          .join("\n")
      : "  (aucune position ouverte)";

  const actifs = marche
    .map((m) => {
      const v7 = m.variation7j === null ? "n/d" : `${m.variation7j.toFixed(2)} %`;
      const v30 = m.variation30j === null ? "n/d" : `${m.variation30j.toFixed(2)} %`;
      return [
        `### ${m.label} (${m.asset})`,
        `Dernier prix : ${m.dernierPrix} €`,
        `Variation 7 jours : ${v7} · 30 jours : ${v30}`,
        `Clôtures des 30 derniers jours : ${m.clotures.join(", ")}`,
      ].join("\n");
    })
    .join("\n\n");

  return `## Portefeuille fictif

Capital de départ : ${etat.startCapital.toFixed(2)} €
Liquidités disponibles : ${etat.cash.toFixed(2)} €
Valeur totale : ${etat.totalValue.toFixed(2)} €
Positions :
${positions}

## Tes ${recents.length} derniers comptes rendus

Tu ne gardes aucun souvenir d'un jour à l'autre ; les voici pour situer ce que tu as déjà fait et pourquoi.

${sectionHistorique(recents)}

## Marché

${actifs}

## Ta tâche

Décide des ordres à passer aujourd'hui, ou d'aucun. Justifie chaque ordre en une phrase.`;
}

export type ResultatDecision =
  | { ok: true; decision: Decision; modele: string }
  | { ok: false; erreur: string };

/**
 * Demande les ordres du jour. En cas d'échec — clé absente, réseau, refus,
 * limite de débit, réponse non conforme — renvoie `ok: false`, et
 * l'appelant ne passe AUCUN ordre.
 */
export async function demanderDecision(
  marche: ContexteMarche[],
  etat: EtatCompte,
  recents: CompteRenduBref[],
): Promise<ResultatDecision> {
  if (!cleConfiguree()) {
    return { ok: false, erreur: "La variable ANTHROPIC_API_KEY n'est pas configurée." };
  }

  const client = new Anthropic();

  try {
    const reponse = await client.messages.parse({
      model: cfg.modele,
      max_tokens: 16000,
      system: SYSTEME,
      output_config: {
        effort: "medium",
        format: zodOutputFormat(DecisionSchema),
      },
      messages: [{ role: "user", content: construirePrompt(marche, etat, recents) }],
    });

    if (reponse.stop_reason === "refusal") {
      return { ok: false, erreur: "Le modèle a décliné la demande." };
    }
    if (reponse.stop_reason === "max_tokens") {
      return { ok: false, erreur: "Réponse interrompue (limite de longueur atteinte)." };
    }

    const decision = reponse.parsed_output;
    if (!decision) {
      return { ok: false, erreur: "Réponse illisible : format attendu non respecté." };
    }

    return { ok: true, decision, modele: reponse.model };
  } catch (e) {
    // On ne recopie jamais le contenu brut d'une erreur d'authentification,
    // qui pourrait contenir un fragment de clé.
    if (e instanceof Anthropic.AuthenticationError) {
      return { ok: false, erreur: "Clé d'API refusée par l'API Anthropic." };
    }
    if (e instanceof Anthropic.RateLimitError) {
      return { ok: false, erreur: "Limite de débit atteinte ; nouvel essai demain." };
    }
    if (e instanceof Anthropic.APIError) {
      return { ok: false, erreur: `Erreur de l'API (${e.status ?? "?"}).` };
    }
    return { ok: false, erreur: `Appel impossible : ${(e as Error).message}` };
  }
}
