"use server";

import { siteConfig } from "@/config/site";

export type ContactState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<"name" | "email" | "message", string>>;
};

const LIMITS = { name: 100, email: 200, message: 5000 } as const;

/** Validation volontairement permissive : rejeter un email valide coûte un client. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function sendContactEmail(input: {
  name: string;
  email: string;
  message: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM_EMAIL;
  const to = process.env.CONTACT_TO_EMAIL ?? siteConfig.email;

  if (!apiKey || !from) {
    throw new Error("NOT_CONFIGURED");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      // L'adresse du visiteur ne sert qu'à la réponse : elle n'est jamais
      // utilisée comme expéditeur, ce qui éviterait les rejets SPF/DMARC.
      reply_to: input.email,
      subject: `[${siteConfig.name}] Message de ${input.name}`,
      text: [
        `Nom    : ${input.name}`,
        `Email  : ${input.email}`,
        "",
        input.message,
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend ${response.status}: ${await response.text()}`);
  }
}

export async function submitContact(
  _prevState: ContactState,
  formData: FormData,
): Promise<ContactState> {
  // Pot de miel : un champ invisible que seuls les robots remplissent.
  // On répond « succès » sans rien envoyer, pour ne pas les renseigner.
  if (field(formData, "website")) {
    return { status: "success", message: "Message envoyé. Je te réponds vite." };
  }

  const name = field(formData, "name");
  const email = field(formData, "email");
  const message = field(formData, "message");

  const fieldErrors: ContactState["fieldErrors"] = {};
  if (!name) fieldErrors.name = "Indique ton nom.";
  else if (name.length > LIMITS.name) fieldErrors.name = "Nom trop long.";

  if (!email) fieldErrors.email = "Indique ton adresse e-mail.";
  else if (email.length > LIMITS.email || !EMAIL_RE.test(email))
    fieldErrors.email = "Cette adresse e-mail semble invalide.";

  if (!message) fieldErrors.message = "Écris ton message.";
  else if (message.length > LIMITS.message)
    fieldErrors.message = `Message trop long (${LIMITS.message} caractères maximum).`;

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors };
  }

  try {
    await sendContactEmail({ name, email, message });
    return {
      status: "success",
      message: "Message envoyé. Je te réponds sous 24 h ouvrées.",
    };
  } catch (error) {
    // Les détails restent côté serveur : ils peuvent contenir la réponse
    // du fournisseur, on ne les expose pas au visiteur.
    console.error("[contact] échec de l'envoi :", error);

    if (error instanceof Error && error.message === "NOT_CONFIGURED") {
      return {
        status: "error",
        message: `L'envoi d'e-mail n'est pas encore configuré sur ce site. En attendant, écris directement à ${siteConfig.email}.`,
      };
    }

    return {
      status: "error",
      message: `L'envoi a échoué. Réessaie, ou écris directement à ${siteConfig.email}.`,
    };
  }
}
