"use server";

import { redirect } from "next/navigation";
import { login, register } from "@/lib/auth";

export type AuthState = { error?: string };

function lire(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };
}

export async function actionInscription(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const { email, password } = lire(formData);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { error: "Adresse e-mail invalide." };
  }
  if (password.length < 8) {
    return { error: "Le mot de passe doit faire au moins 8 caractères." };
  }

  try {
    await register(email, password);
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect("/tableau-de-bord");
}

export async function actionConnexion(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const { email, password } = lire(formData);
  try {
    await login(email, password);
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect("/tableau-de-bord");
}
