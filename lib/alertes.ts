/**
 * ─────────────────────────────────────────────────────────────────────
 *  ALERTES
 *
 *  Deux étages, et le premier marche TOUJOURS :
 *
 *   1. toute alerte est d'abord ENREGISTRÉE EN BASE. Elle est donc visible
 *      sur le site même sans rien configurer ;
 *   2. ensuite, si tu as configuré un canal, elle t'est ENVOYÉE.
 *
 *  Canaux, par variables d'environnement (aucune clé n'est écrite dans le
 *  code, et aucune n'est obligatoire) :
 *
 *   • ALERTE_WEBHOOK_URL  — une adresse qui reçoit un message JSON.
 *       Compatible Discord, Slack, ntfy, Zapier, Make… Le corps envoyé
 *       contient à la fois `content` (Discord) et `text` (Slack), donc la
 *       même adresse fonctionne dans les deux cas.
 *   • RESEND_API_KEY + ALERTE_EMAIL  — un vrai email, via Resend.
 *       ALERTE_EMAIL_FROM est facultatif.
 *
 *  Un envoi qui échoue ne fait JAMAIS échouer le bot : l'erreur est notée
 *  à côté de l'alerte, et le bot continue son travail.
 * ─────────────────────────────────────────────────────────────────────
 */
import "server-only";
import { query, queryOne } from "./db";
import { siteConfig } from "../config/site";

export type TypeAlerte =
  | "perte_jour"
  | "perte_semaine"
  | "perte_mois"
  | "perte_totale"
  | "tache_echec"
  | "tache_manquante"
  | "prix_indisponible";

export type DemandeAlerte = {
  type: TypeAlerte;
  /**
   * Identifiant unique de CET événement — par exemple
   * `perte_jour:2026-10-03`. Deux appels avec la même clé n'envoient qu'un
   * seul message : la tâche peut être relancée sans te spammer.
   */
  cle: string;
  titre: string;
  message: string;
};

export type LigneAlerte = {
  id: number;
  cle: string;
  type: TypeAlerte;
  titre: string;
  message: string;
  canaux: string;
  erreur: string | null;
  created_at: string;
};

const TIMEOUT_MS = 8_000;

/** Canaux configurés, pour l'affichage sur /diagnostic. */
export function canauxConfigures(): { webhook: boolean; email: boolean } {
  return {
    webhook: Boolean(process.env.ALERTE_WEBHOOK_URL),
    email: Boolean(process.env.RESEND_API_KEY && process.env.ALERTE_EMAIL),
  };
}

export function alertesConfigurees(): boolean {
  const c = canauxConfigures();
  return c.webhook || c.email;
}

async function poster(
  url: string,
  corps: unknown,
  entetes: Record<string, string>,
): Promise<void> {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...entetes },
      body: JSON.stringify(corps),
      signal: controleur.signal,
      cache: "no-store",
    });
    if (!r.ok) {
      const corpsErreur = (await r.text().catch(() => "")).slice(0, 200);
      throw new Error(`HTTP ${r.status}${corpsErreur ? ` — ${corpsErreur}` : ""}`);
    }
  } finally {
    clearTimeout(minuteur);
  }
}

async function envoyerWebhook(a: DemandeAlerte): Promise<void> {
  const url = process.env.ALERTE_WEBHOOK_URL;
  if (!url) throw new Error("ALERTE_WEBHOOK_URL absente");

  const texte = `[${siteConfig.name}] ${a.titre}\n${a.message}`;
  await poster(
    url,
    {
      // `content` pour Discord, `text` pour Slack : les deux sont présents.
      content: texte,
      text: texte,
      titre: a.titre,
      message: a.message,
      type: a.type,
      site: siteConfig.name,
    },
    {},
  );
}

async function envoyerEmail(a: DemandeAlerte): Promise<void> {
  const cle = process.env.RESEND_API_KEY;
  const destinataire = process.env.ALERTE_EMAIL;
  if (!cle || !destinataire) throw new Error("RESEND_API_KEY ou ALERTE_EMAIL absente");

  await poster(
    "https://api.resend.com/emails",
    {
      from: process.env.ALERTE_EMAIL_FROM ?? "onboarding@resend.dev",
      to: [destinataire],
      subject: `[${siteConfig.name}] ${a.titre}`,
      text: `${a.message}\n\n— ${siteConfig.name} (simulation, argent fictif)`,
    },
    { authorization: `Bearer ${cle}` },
  );
}

/**
 * Enregistre l'alerte, puis tente de l'envoyer sur chaque canal configuré.
 *
 * Renvoie `false` si l'alerte avait déjà été traitée (même clé) : rien
 * n'est alors réenvoyé.
 */
export async function envoyerAlerte(a: DemandeAlerte): Promise<boolean> {
  // L'enregistrement fait aussi office de verrou anti-doublon.
  let nouvelle: { id: number } | undefined;
  try {
    nouvelle = await queryOne<{ id: number }>(
      `INSERT INTO bot_alertes (cle, type, titre, message) VALUES ($1, $2, $3, $4)
       ON CONFLICT (cle) DO NOTHING RETURNING id`,
      [a.cle, a.type, a.titre, a.message],
    );
  } catch (e) {
    // Base indisponible : on n'empêche pas le bot de travailler.
    console.warn("[alerte] enregistrement impossible :", (e as Error).message);
    return false;
  }

  if (!nouvelle) return false; // déjà envoyée

  const reussis: string[] = [];
  const echecs: string[] = [];

  for (const [nom, envoyer] of [
    ["webhook", envoyerWebhook],
    ["email", envoyerEmail],
  ] as const) {
    const actif =
      nom === "webhook" ? canauxConfigures().webhook : canauxConfigures().email;
    if (!actif) continue;
    try {
      await envoyer(a);
      reussis.push(nom);
    } catch (e) {
      echecs.push(`${nom} : ${(e as Error).message}`);
      console.warn(`[alerte] envoi ${nom} échoué :`, (e as Error).message);
    }
  }

  if (reussis.length === 0 && echecs.length === 0) {
    echecs.push("aucun canal configuré (alerte visible sur le site uniquement)");
  }

  try {
    await query("UPDATE bot_alertes SET canaux = $1, erreur = $2 WHERE id = $3", [
      reussis.join(", "),
      echecs.length > 0 ? echecs.join(" | ") : null,
      nouvelle.id,
    ]);
  } catch {
    // Sans conséquence : l'alerte est déjà enregistrée.
  }

  return true;
}

/** Dernières alertes, les plus récentes d'abord. */
export async function dernieresAlertes(limite = 20): Promise<LigneAlerte[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT id, cle, type, titre, message, canaux, erreur,
            to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
     FROM bot_alertes ORDER BY id DESC LIMIT $1`,
    [limite],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    cle: String(r.cle),
    type: r.type as TypeAlerte,
    titre: String(r.titre),
    message: String(r.message ?? ""),
    canaux: String(r.canaux ?? ""),
    erreur: r.erreur === null ? null : String(r.erreur),
    created_at: String(r.created_at ?? ""),
  }));
}
