import { z } from "zod";
import { claudeTraderConfig } from "../../config/claude-trader";

/**
 * Forme imposée à la réponse du modèle. Une réponse non conforme est
 * rejetée en bloc : dans ce cas, aucun ordre n'est passé.
 */
export const DecisionSchema = z.object({
  analyse: z
    .string()
    .describe("Lecture du marché en une à trois phrases, en français."),
  ordres: z
    .array(
      z.object({
        actif: z.enum(
          claudeTraderConfig.actifsAutorises as unknown as [string, ...string[]],
        ),
        sens: z.enum(["achat", "vente"]),
        montant: z
          .number()
          .positive()
          .describe(
            `Montant engagé en euros, entre ${claudeTraderConfig.ordres.montantMinEuros} et ${claudeTraderConfig.ordres.montantMaxEuros}.`,
          ),
        justification: z
          .string()
          .min(1)
          .describe("Raison de cet ordre, une phrase courte en français."),
      }),
    )
    .describe(
      "Ordres souhaités aujourd'hui. Tableau vide si rien ne justifie d'agir — c'est une réponse normale et fréquente.",
    ),
});

export type Decision = z.infer<typeof DecisionSchema>;
