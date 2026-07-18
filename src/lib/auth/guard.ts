import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  getEffectivePermissions,
  type ModuleKey,
  type PermissionMap,
} from "@/lib/permissions";

/**
 * Guard de módulo: verifica el permiso efectivo (defaults + sobrescrituras
 * de la organización/sede) y redirige a /sin-permiso si no alcanza.
 * Devuelve el mapa de permisos por si la página necesita decidir más fino.
 */
export async function requireModuleAccess(
  module: ModuleKey,
  action: "view" | "edit" = "view"
): Promise<PermissionMap> {
  const ctx = await getSessionContext();
  const supabase = await createClient();
  const perms = await getEffectivePermissions(
    supabase,
    ctx.activeOrgId!,
    ctx.activeSedeId,
    ctx.roles,
    ctx.profile?.es_superadmin ?? false
  );
  if (!perms[module]?.[action]) redirect("/sin-permiso");
  return perms;
}
