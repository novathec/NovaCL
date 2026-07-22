import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { REMEMBER_COOKIE, applyRemember } from "@/lib/auth/remember";

/** Rutas publicas que no requieren sesion. */
const PUBLIC_PATHS = [
  "/login",
  "/registro",
  "/portal",
  "/api/portal",
  "/api/webhooks",
  "/auth",
];

const ASSET_PATH_REGEX = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff|woff2)$/i;

function shouldBypassAuth(pathname: string) {
  return pathname.startsWith("/_next/") || pathname === "/favicon.ico" || ASSET_PATH_REGEX.test(pathname);
}

/**
 * Headers confiables que src/lib/auth/session.ts usa para no repetir
 * auth.getUser() (round-trip a GoTrue) en cada Server Component. Se borra
 * cualquier valor entrante antes de recalcularlos: un cliente nunca puede
 * hacerse pasar por otro usuario a traves de estos headers.
 */
const TRUSTED_USER_ID_HEADER = "x-nova-user-id";
const TRUSTED_USER_EMAIL_HEADER = "x-nova-user-email";

/** Refresca la sesion y protege las rutas privadas. */
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (shouldBypassAuth(path)) {
    return NextResponse.next({ request });
  }

  request.headers.delete(TRUSTED_USER_ID_HEADER);
  request.headers.delete(TRUSTED_USER_EMAIL_HEADER);

  let response = NextResponse.next({ request });

  // Preferencia "recordar sesión": si no es "1", el refresco de token vuelve
  // a emitir las cookies de auth como cookies de sesión (sin persistencia).
  const remember = request.cookies.get(REMEMBER_COOKIE)?.value === "1";

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, applyRemember(name, options, remember))
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user) {
    request.headers.set(TRUSTED_USER_ID_HEADER, user.id);
    request.headers.set(TRUSTED_USER_EMAIL_HEADER, user.email ?? "");
    // Reconstruir la respuesta para propagar los headers sin perder las
    // cookies de refresh de sesion seteadas arriba.
    const cookiesSoFar = response.cookies.getAll();
    response = NextResponse.next({ request });
    cookiesSoFar.forEach((c) => response.cookies.set(c));
  }

  return response;
}
