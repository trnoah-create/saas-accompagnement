import { NextResponse } from "next/server";
import { fermerSession } from "@/lib/acces";

export async function POST(request: Request) {
  await fermerSession();
  return NextResponse.redirect(new URL("/connexion", request.url), { status: 303 });
}
