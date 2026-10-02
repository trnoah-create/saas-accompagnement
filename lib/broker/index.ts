/**
 * ─────────────────────────────────────────────────────────────────────
 *  CHOIX DU COURTIER
 *
 *  ⚠️ LIRE AVANT TOUTE MODIFICATION
 *
 *  Ce projet ne contient AUCUN code capable de passer un ordre réel :
 *  pas de connexion à un courtier, pas d'identifiants, pas de données
 *  bancaires. Le seul courtier disponible est la simulation.
 *
 *  Brancher un vrai courtier ne consisterait pas à changer une variable
 *  d'environnement : il faudrait écrire une nouvelle implémentation de
 *  l'interface `Courtier`, l'ajouter ci-dessous, et modifier la constante
 *  MODE sciemment. Ce garde-fou existe pour qu'aucun réglage distrait,
 *  aucune variable oubliée dans Vercel et aucune suggestion automatique
 *  ne puissent engager d'argent réel.
 * ─────────────────────────────────────────────────────────────────────
 */
import "server-only";
import { courtierSimule } from "./simule";
import type { Courtier } from "./types";

export * from "./types";

/** Seule valeur acceptée. Changer cette ligne ne suffit pas : il n'existe
 *  aucune autre implémentation à laquelle elle pourrait renvoyer. */
const MODE: "simulation" = "simulation";

export function courtier(): Courtier {
  if (MODE !== "simulation") {
    // Inatteignable aujourd'hui : sécurité si quelqu'un modifie MODE sans
    // avoir écrit l'implémentation correspondante.
    throw new Error(
      "Aucun courtier réel n'est implémenté. Le mode doit rester « simulation ».",
    );
  }
  return courtierSimule;
}

/** Vrai si de l'argent réel pourrait être engagé. Toujours faux ici. */
export function courtierEstReel(): boolean {
  return courtier().reel;
}
