import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Role } from "@/lib/database.types";

type DB = SupabaseClient<Database>;

/**
 * Permisos granulares por módulo.
 *
 * - El superadmin global tiene acceso total, siempre.
 * - Cada organización puede sobrescribir, por rol y opcionalmente por sede,
 *   qué módulos se VEN y cuáles se EDITAN (tabla LIS_role_permissions).
 * - Sin sobrescritura aplican los defaults de este archivo.
 * - Precedencia: fila de sede específica > fila de toda la org > default.
 * - Con varios roles, gana el más permisivo (unión).
 */

export const MODULES = [
  "dashboard",
  "agenda",
  "pacientes",
  "ordenes",
  "muestras",
  "resultados",
  "entrega",
  "analitica",
  "catalogo",
  "facturacion",
  "trazabilidad",
  "configuracion",
] as const;

export type ModuleKey = (typeof MODULES)[number];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: "Panel",
  agenda: "Agenda",
  pacientes: "Pacientes",
  ordenes: "Órdenes / Atención",
  muestras: "Muestras",
  resultados: "Resultados",
  entrega: "Entrega",
  analitica: "Analítica",
  catalogo: "Catálogo",
  facturacion: "Facturación",
  trazabilidad: "Trazabilidad",
  configuracion: "Configuración",
};

export type Perm = { view: boolean; edit: boolean };
export type PermissionMap = Record<ModuleKey, Perm>;

/** Roles con acceso de VISTA por defecto (null = todos los miembros). */
const DEFAULT_VIEW_ROLES: Record<ModuleKey, Role[] | null> = {
  dashboard: null,
  agenda: ["org_admin", "sede_admin", "recepcion", "medico"],
  pacientes: ["org_admin", "sede_admin", "recepcion", "medico", "lectura"],
  ordenes: null,
  muestras: ["org_admin", "sede_admin", "toma_muestra", "analista", "recepcion"],
  resultados: ["org_admin", "sede_admin", "analista", "validador", "medico"],
  entrega: ["org_admin", "sede_admin", "recepcion", "validador"],
  analitica: ["org_admin", "sede_admin", "facturacion", "lectura"],
  catalogo: ["org_admin", "sede_admin"],
  facturacion: ["org_admin", "sede_admin", "facturacion"],
  trazabilidad: ["org_admin", "sede_admin", "lectura"],
  configuracion: ["org_admin", "sede_admin"],
};

/** Roles de solo lectura: por defecto ven pero no editan. */
const READ_ONLY_ROLES: Role[] = ["lectura", "medico"];

export function defaultPermsFor(roles: Role[]): PermissionMap {
  const map = {} as PermissionMap;
  const canEditBase = roles.some((r) => !READ_ONLY_ROLES.includes(r));
  for (const m of MODULES) {
    const allowed = DEFAULT_VIEW_ROLES[m];
    const view = allowed === null || allowed.some((r) => roles.includes(r));
    map[m] = { view, edit: view && canEditBase };
  }
  return map;
}

export const ALL_ALLOWED: PermissionMap = MODULES.reduce((acc, m) => {
  acc[m] = { view: true, edit: true };
  return acc;
}, {} as PermissionMap);

/**
 * Permisos efectivos del usuario para la sede activa: defaults del sistema +
 * sobrescrituras de la organización (org-wide y de sede). Unión permisiva
 * entre los roles del usuario.
 */
export async function getEffectivePermissions(
  supabase: DB,
  orgId: string,
  sedeId: string | null,
  roles: Role[],
  isSuperadmin: boolean
): Promise<PermissionMap> {
  if (isSuperadmin) return ALL_ALLOWED;
  if (roles.length === 0) {
    return MODULES.reduce((acc, m) => {
      acc[m] = { view: false, edit: false };
      return acc;
    }, {} as PermissionMap);
  }

  const { data: rows } = await supabase
    .from("LIS_role_permissions")
    .select("sede_id, role, module, can_view, can_edit")
    .eq("organization_id", orgId)
    .in("role", roles);

  // Por rol y módulo: la fila de la sede activa pisa a la de toda la org
  const overrides = new Map<string, { view: boolean; edit: boolean; scope: "org" | "sede" }>();
  for (const r of rows ?? []) {
    if (r.sede_id !== null && r.sede_id !== sedeId) continue;
    const key = `${r.role}:${r.module}`;
    const scope = r.sede_id === null ? "org" : "sede";
    const prev = overrides.get(key);
    if (!prev || (prev.scope === "org" && scope === "sede")) {
      overrides.set(key, { view: r.can_view, edit: r.can_edit, scope });
    }
  }

  const map = {} as PermissionMap;
  for (const m of MODULES) {
    let view = false;
    let edit = false;
    for (const role of roles) {
      const ov = overrides.get(`${role}:${m}`);
      if (ov) {
        view = view || ov.view;
        edit = edit || ov.edit;
      } else {
        const defaults = defaultPermsFor([role]);
        view = view || defaults[m].view;
        edit = edit || defaults[m].edit;
      }
    }
    map[m] = { view, edit };
  }
  return map;
}

export function can(perms: PermissionMap, module: ModuleKey, action: "view" | "edit" = "view") {
  return perms[module]?.[action] === true;
}
