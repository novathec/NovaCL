"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import {
  setPortalSession,
  clearPortalSession,
  readPortalSession,
  SESSION_TTL_SECONDS,
} from "@/lib/portal/session";

export type PortalActionState = { error?: string } | undefined;

/** Ventana y tope de intentos por IP (anti barrido de fechas). */
const RATE_WINDOW_MIN = 10;
const RATE_MAX_ATTEMPTS = 12;

/** Documentos aceptados por el portal. */
const TIPOS = new Set(["DNI", "CE", "PASAPORTE"]);

async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "desconocida";
}

/**
 * Vincula al paciente con documento + fecha de nacimiento y abre su sesión de
 * portal. Respuestas genéricas ante fallo (no revela si el documento existe) y
 * rate-limit por IP para frenar el barrido de fechas contra un documento.
 */
export async function linkPortalAction(
  _prev: PortalActionState,
  formData: FormData
): Promise<PortalActionState> {
  const tipoRaw = String(formData.get("tipo_documento") ?? "DNI").toUpperCase();
  const tipo = TIPOS.has(tipoRaw) ? tipoRaw : "DNI";
  const doc = String(formData.get("numero_documento") ?? "").replace(/\s+/g, "").trim();
  const dob = String(formData.get("fecha_nacimiento") ?? "").trim();

  if (!doc || !dob) {
    return { error: "Ingresa tu número de documento y tu fecha de nacimiento." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    return { error: "La fecha de nacimiento no es válida." };
  }

  const admin = createAdminClient();
  const ip = await clientIp();

  // La tabla de intentos aún no está en los tipos generados hasta correr
  // `db:types`; se accede con un cliente sin tipar solo para esta operación.
  const raw = admin as unknown as SupabaseClient;

  // Rate-limit: intentos recientes desde esta IP.
  const since = new Date(Date.now() - RATE_WINDOW_MIN * 60_000).toISOString();
  const { count } = await raw
    .from("LIS_portal_login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", since);

  if ((count ?? 0) >= RATE_MAX_ATTEMPTS) {
    return {
      error: "Demasiados intentos. Espera unos minutos antes de volver a intentar.",
    };
  }

  const { data: matches } = await admin
    .from("LIS_patients")
    .select("id, nombres, apellidos")
    .eq("tipo_documento", tipo)
    .eq("numero_documento", doc)
    .eq("fecha_nacimiento", dob);

  const ok = !!matches && matches.length > 0;
  await raw
    .from("LIS_portal_login_attempts")
    .insert({ ip, documento: `${tipo} ${doc}`, exito: ok });

  if (!ok) {
    return {
      error:
        "No encontramos una atención registrada con esos datos. Si ya te atendiste, verifica tu número de documento y fecha de nacimiento; si nunca te has atendido en el laboratorio, no cuentas con resultados para consultar. Ante cualquier duda, comunícate con tu laboratorio.",
    };
  }

  const first = matches[0]!;
  await setPortalSession({
    doc,
    tipo,
    dob,
    pids: matches.map((m) => m.id),
    nombre: first.nombres,
  });

  redirect("/portal/mis-resultados");
}

/**
 * Renueva la sesión del portal por otros 10 minutos ("mantener sesión"). Solo
 * funciona si la sesión aún es válida; si ya caducó, devuelve null y el cliente
 * cierra la sesión. Re-emite la cookie firmada con un nuevo `exp`.
 */
export async function refreshPortalSessionAction(): Promise<{ exp: number } | null> {
  const session = await readPortalSession();
  if (!session) return null;
  await setPortalSession({
    doc: session.doc,
    tipo: session.tipo,
    dob: session.dob,
    pids: session.pids,
    nombre: session.nombre,
  });
  return { exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
}

/** Cierra la sesión del portal y vuelve al acceso. */
export async function portalLogoutAction(): Promise<void> {
  await clearPortalSession();
  redirect("/portal");
}
