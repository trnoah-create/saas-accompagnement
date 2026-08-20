/**
 * ─────────────────────────────────────────────────────────────
 *  CONTRÔLE D'ACCÈS — QUI A ACHETÉ QUOI
 *
 *  ⚠️  Ce module est le SEUL endroit qui décide si un visiteur a
 *      droit à l'accès Discord réservé à l'offre Accompagnement.
 *
 *  ⚠️  `server-only` fait échouer le build si ce fichier est importé,
 *      même indirectement, depuis un composant client. C'est
 *      volontaire : la décision d'accès ne doit jamais être prise
 *      dans le navigateur, où l'utilisateur peut la contourner.
 *
 *  ÉTAT ACTUEL : il n'existe ni authentification, ni base de données,
 *  ni Stripe dans ce projet. `getViewer()` ne peut donc identifier
 *  personne et renvoie systématiquement un visiteur anonyme sans achat.
 *  Conséquence assumée : en production, PERSONNE ne voit l'accès
 *  Discord aujourd'hui. C'est le comportement voulu — refuser par
 *  défaut plutôt que d'ouvrir à tort.
 * ─────────────────────────────────────────────────────────────
 */
import "server-only";

/** Les offres achetables. Doit rester aligné avec config/offers.ts. */
export type OfferId = "formation" | "accompagnement";

export type Viewer = {
  isAuthenticated: boolean;
  email: string | null;
  /** Offres réellement payées. Vide tant que le paiement n'est pas branché. */
  purchases: OfferId[];
};

const ANONYMOUS: Viewer = {
  isAuthenticated: false,
  email: null,
  purchases: [],
};

/**
 * Aperçu local uniquement — permet de visualiser la page telle que la
 * verra un abonné, sans attendre Stripe.
 *
 * Neutralisé dès que NODE_ENV vaut "production" : sur Vercel, en
 * production, cette variable n'a aucun effet, même si elle est définie.
 * Usage : DEV_PREVIEW_ENTITLEMENT=accompagnement npm run dev
 */
function devPreviewViewer(): Viewer | null {
  if (process.env.NODE_ENV === "production") return null;

  const preview = process.env.DEV_PREVIEW_ENTITLEMENT;
  if (preview !== "formation" && preview !== "accompagnement") return null;

  return {
    isAuthenticated: true,
    email: "apercu-local@example.test",
    purchases: [preview],
  };
}

/**
 * Identifie le visiteur courant et liste ses achats.
 *
 * ➜ À BRANCHER PLUS TARD, dans cet ordre :
 *
 *   1. AUTHENTIFICATION — lire la session depuis le cookie :
 *        const session = await auth();            // ex. Auth.js / Clerk / Supabase
 *        if (!session?.user) return ANONYMOUS;
 *
 *   2. ACHATS — interroger TA base de données, jamais le client :
 *        const rows = await db.purchase.findMany({
 *          where: { userId: session.user.id, status: "active" },
 *        });
 *
 *      La source de vérité doit être une table alimentée par le
 *      webhook Stripe (checkout.session.completed, customer.subscription.*),
 *      pas la réponse du navigateur après paiement : un utilisateur peut
 *      forger un retour de redirection, pas une écriture de webhook.
 *
 *      L'Accompagnement étant un abonnement mensuel, vérifier que
 *      l'abonnement est TOUJOURS actif (status "active" ou "trialing"),
 *      sinon un ancien abonné résilié garderait l'accès Discord.
 */
export async function getViewer(): Promise<Viewer> {
  const preview = devPreviewViewer();
  if (preview) return preview;

  // Aucune authentification branchée : personne n'est identifié.
  return ANONYMOUS;
}

/**
 * Seule autorisation qui compte pour l'accès Discord.
 * Refuse par défaut : il faut être authentifié ET avoir l'Accompagnement.
 */
export async function hasAccompagnement(): Promise<boolean> {
  const viewer = await getViewer();
  return viewer.isAuthenticated && viewer.purchases.includes("accompagnement");
}
