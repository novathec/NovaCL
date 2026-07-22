/**
 * "Recordar sesión" para la autenticación por cookies de Supabase (SSR).
 *
 * Supabase guarda la sesión en cookies "sb-*-auth-token". Por defecto las
 * emite con "maxAge" (persistentes: sobreviven al cierre del navegador).
 * Cuando el usuario NO marca "recordar sesión" las convertimos en cookies de
 * sesión (sin "maxAge"/"expires"): el navegador las elimina al cerrarse.
 *
 * La preferencia se guarda en la cookie [REMEMBER_COOKIE] para que TODOS los
 * puntos que reescriben las cookies de auth la respeten — no solo el login,
 * también el refresco periódico del middleware. Si solo el login la aplicara,
 * el primer refresco de token volvería a hacerlas persistentes.
 */
export const REMEMBER_COOKIE = "nova_remember";

/** ¿Es una cookie de sesión de Supabase (token de auth)? */
function isSupabaseAuthCookie(name: string): boolean {
  return name.startsWith("sb-") && name.includes("auth-token");
}

/**
 * Ajusta las opciones de una cookie según la preferencia "recordar sesión".
 * Si `remember` es false y la cookie es de auth, elimina "maxAge"/"expires"
 * para degradarla a cookie de sesión. El resto de cookies no se tocan.
 */
export function applyRemember<T extends CookieLikeOptions>(
  name: string,
  options: T,
  remember: boolean
): T {
  if (remember || !isSupabaseAuthCookie(name)) return options;
  const next = { ...options };
  delete next.maxAge;
  delete next.expires;
  return next;
}

type CookieLikeOptions = { maxAge?: number; expires?: Date } & Record<string, unknown>;
