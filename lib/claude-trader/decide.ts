/**
 * Appel à l'API Claude pour obtenir les ordres du jour.
 *
 * La clé d'API est lue par le SDK dans la variable d'environnement
 * ANTHROPIC_API_KEY. Elle n'apparaît jamais dans le code ni dans les
 * comptes rendus.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CLAUDE_TRADER, DISCLAIMER } from "../constants";
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
  source: string;
  /** Clôtures des 30 derniers jours, de la plus ancienne à la plus récente. */
  clotures: number[];
  variation7j: number | null;
  variation30j: number | null;
};

function variation(series: number[], jours: number): number | null {
  if (series.length <= jours) return null;
  const avant = series[series.length - 1 - jours];
  const maintenant = series[series.length - 1];
  if (!avant) return null;
  return ((maintenant - avant) / avant) * 100;
}

export async function rassemblerContexte(): Promise<ContexteMarche[]> {
  return Promise.all(
    ASSETS.map(async (a) => {
      const { bars, source } = await getPrices(a.id as AssetId, 60);
      const clotures = bars.slice(-30).map((b) => Number(b.close.toFixed(6)));
      return {
        asset: a.id,
        label: a.label,
        dernierPrix: bars.at(-1)?.close ?? 0,
        source,
        clotures,
        variation7j: variation(clotures, 7),
        variation30j: variation(clotures, 29),
      };
    }),
  );
}

const SYSTEME = `Tu gères un portefeuille d'entraînement en argent entièrement FICTIF, dans un simulateur pédagogique.

Règles :
- Tout est simulé. Aucun ordre réel n'est passé, aucun argent réel n'est engagé.
- Tu réponds uniquement par la structure demandée.
- Chaque ordre doit être justifié en une phrase courte, en français simple.
- Si rien ne justifie d'agir, renvoie une liste d'ordres vide. Ne pas agir est une décision valable.
- Tu ne peux pas vendre plus que ce que le portefeuille détient, ni acheter au-delà des liquidités disponibles.
- Un seul ordre ne doit pas engager plus de ${CLAUDE_TRADER.maxOrdrePct} % de la valeur du portefeuille.
- Au maximum ${CLAUDE_TRADER.maxOrdresParJour} ordres par jour.
- Les prix fournis sont des clôtures passées. Tu n'as aucune information sur l'avenir.

${DISCLAIMER}`;

function construirePrompt(marche: ContexteMarche[], etat: EtatCompte): string {
  const positions =
    etat.positions.length > 0
      ? etat.positions
          .map((p) => `  - ${p.asset} : ${p.quantity.toFixed(6)} (valeur ${p.value.toFixed(2)} €)`)
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

  return `## État du portefeuille fictif

Liquidités : ${etat.cash.toFixed(2)} €
Valeur totale : ${etat.totalValue.toFixed(2)} €
Capital de départ : ${etat.startCapital.toFixed(2)} €
Positions :
${positions}

## Marché

${actifs}

## Ta tâche

Décide des ordres à passer aujourd'hui sur ce portefeuille fictif, puis justifie chacun en une phrase.`;
}

export type ResultatDecision =
  | { ok: true; decision: Decision; modele: string }
  | { ok: false; erreur: string };

/**
 * Demande les ordres du jour. En cas d'échec — clé absente, erreur réseau,
 * refus, réponse non conforme au schéma — renvoie `ok: false`, et l'appelant
 * ne passe alors AUCUN ordre.
 */
export async function demanderDecision(
  marche: ContexteMarche[],
  etat: EtatCompte,
): Promise<ResultatDecision> {
  if (!cleConfiguree()) {
    return { ok: false, erreur: "La variable ANTHROPIC_API_KEY n'est pas configurée." };
  }

  const client = new Anthropic();

  try {
    const reponse = await client.messages.parse({
      model: CLAUDE_TRADER.modele,
      max_tokens: 16000,
      system: SYSTEME,
      output_config: {
        effort: "medium",
        format: zodOutputFormat(DecisionSchema),
      },
      messages: [{ role: "user", content: construirePrompt(marche, etat) }],
    });

    if (reponse.stop_reason === "refusal") {
      return { ok: false, erreur: "Le modèle a décliné la demande." };
    }
    if (reponse.stop_reason === "max_tokens") {
      return { ok: false, erreur: "Réponse interrompue (limite de longueur atteinte)." };
    }

    const decision = reponse.parsed_output;
    if (!decision) {
      return { ok: false, erreur: "Réponse illisible : elle ne respecte pas le format attendu." };
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
