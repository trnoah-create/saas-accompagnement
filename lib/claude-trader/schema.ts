import { z } from "zod";
import { ASSET_IDS } from "../market/assets";

/**
 * Forme imposée à la réponse du modèle. Toute réponse qui ne s'y conforme
 * pas est rejetée en bloc : dans ce cas, aucun ordre n'est passé.
 */
export const DecisionSchema = z.object({
  analyse: z
    .string()
    .describe("Analyse générale du marché en une à trois phrases, en français."),
  ordres: z
    .array(
      z.object({
        actif: z.enum(ASSET_IDS as [string, ...string[]]),
        sens: z.enum(["achat", "vente"]),
        quantite: z
          .number()
          .positive()
          .describe("Quantité d'actif, strictement positive."),
        justification: z
          .string()
          .describe("Raison de cet ordre, une phrase courte en français."),
      }),
    )
    .describe("Liste des ordres souhaités. Tableau vide si aucune action."),
});

export type Decision = z.infer<typeof DecisionSchema>;
