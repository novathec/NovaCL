"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_ORG_COOKIE, ACTIVE_SEDE_COOKIE } from "@/lib/auth/session";

export type ActionState = { error?: string } | undefined;

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");
  // Anti open-redirect: solo rutas internas ("//" también es externa).
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Credenciales inválidas. Verifica tu correo y contraseña." };

  redirect(safeNext);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Cambia la organización activa (persistida en cookie). */
export async function setActiveOrg(orgId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, orgId, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  cookieStore.delete(ACTIVE_SEDE_COOKIE); // resetear sede al cambiar de org
  revalidatePath("/", "layout");
}

/** Cambia la sede activa (persistida en cookie). */
export async function setActiveSede(sedeId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_SEDE_COOKIE, sedeId, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}
