import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Sesión del portal público del paciente.
 *
 * No es una cuenta de Supabase: el paciente se "vincula" con DNI + fecha de
 * nacimiento y recibe una cookie firmada (HMAC-SHA256) que lleva su identidad
 * verificada. La firma la genera el servidor con el service-role key, así que
 * el cliente no puede fabricar ni alterar la sesión. La cookie es httpOnly.
 *
 * `pids` son los ids de todos los registros de paciente que comparten ese
 * documento + fecha de nacimiento (una misma persona puede existir en varias
 * organizaciones). El portal solo muestra órdenes de esos registros.
 */
export const PORTAL_COOKIE = "nova_portal";
/**
 * Vida de la sesión del portal: 10 minutos, por seguridad (datos de salud en
 * un dispositivo posiblemente compartido). No se persiste entre reinicios del
 * navegador: la cookie es de sesión y, además, el token firmado caduca a los
 * 10 minutos y el servidor lo rechaza aunque la cookie siga presente.
 */
export const SESSION_TTL_SECONDS = 10 * 60;

export type PortalSession = {
  /** Número de documento normalizado. */
  doc: string;
  /** Tipo de documento (DNI, CE, ...). */
  tipo: string;
  /** Fecha de nacimiento verificada (YYYY-MM-DD). */
  dob: string;
  /** Ids de LIS_patients que corresponden a esta identidad. */
  pids: string[];
  /** Nombre para saludar en la UI. */
  nombre: string;
  /** Expiración (epoch segundos). */
  exp: number;
};

function secret(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY no está configurada: no se puede firmar la sesión del portal."
    );
  }
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Serializa y firma la sesión como `<payload>.<firma>`. */
export function encodePortalSession(
  data: Omit<PortalSession, "exp">,
  maxAgeSeconds = SESSION_TTL_SECONDS
): string {
  const body: PortalSession = {
    ...data,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Verifica la firma y la expiración; devuelve la sesión o null. */
export function decodePortalSession(token?: string | null): PortalSession | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  // timingSafeEqual exige misma longitud; distinta longitud => firma inválida.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as PortalSession;
    if (
      !data ||
      typeof data.exp !== "number" ||
      data.exp * 1000 < Date.now() ||
      !Array.isArray(data.pids) ||
      data.pids.length === 0
    ) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/** Escribe la cookie de sesión del portal. */
export async function setPortalSession(
  data: Omit<PortalSession, "exp">,
  maxAgeSeconds = SESSION_TTL_SECONDS
): Promise<void> {
  const cookieStore = await cookies();
  // Sin `maxAge`/`expires`: cookie de sesión (no se guarda en disco, muere al
  // cerrar el navegador). La caducidad real la impone el `exp` firmado, que el
  // servidor valida en cada request.
  cookieStore.set(PORTAL_COOKIE, encodePortalSession(data, maxAgeSeconds), {
    path: "/portal",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

/** Lee y valida la sesión del portal desde la cookie. */
export async function readPortalSession(): Promise<PortalSession | null> {
  const cookieStore = await cookies();
  return decodePortalSession(cookieStore.get(PORTAL_COOKIE)?.value);
}

/** Elimina la cookie de sesión del portal. */
export async function clearPortalSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete({ name: PORTAL_COOKIE, path: "/portal" });
}
