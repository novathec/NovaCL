import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { REMEMBER_COOKIE, applyRemember } from "@/lib/auth/remember";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 * Usa la cookie de sesion del usuario => respeta RLS.
 *
 * `remember` controla la persistencia de las cookies de auth (ver
 * lib/auth/remember). Si se omite, se lee de la cookie de preferencia; el
 * login lo pasa explícito porque en ese momento la cookie aún no existe.
 */
export async function createClient(opts?: { remember?: boolean }) {
  const cookieStore = await cookies();
  const remember = opts?.remember ?? cookieStore.get(REMEMBER_COOKIE)?.value === "1";

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, applyRemember(name, options, remember))
            );
          } catch {
            // Invocado desde un Server Component: el refresh de sesion
            // lo maneja el middleware. Se puede ignorar sin problema.
          }
        },
      },
    }
  );
}

/**
 * Cliente con service role — SOLO para tareas de servidor de confianza
 * (webhooks, jobs, integraciones). Omite RLS. Nunca exponer al cliente.
 */
export function createAdminClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll: () => [], setAll: () => {} },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}
