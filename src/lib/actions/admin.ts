"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getSessionContext, hasRole } from "@/lib/auth/session";
import { friendlyDbError } from "@/lib/errors";
import type { Role } from "@/lib/database.types";

type Ctx = Awaited<ReturnType<typeof getSessionContext>>;

/**
 * Guard de administración de la organización. Alineado con RLS
 * (app.can_admin_org = org_admin + superadmin): un sede_admin recibe aquí un
 * mensaje claro en lugar de un error crudo de Postgres.
 * Devuelve error manejable en lugar de lanzar (un throw rompe la UI).
 */
async function orgAdminCtx(
  msg = "Solo el administrador de la organización puede realizar esta acción."
): Promise<{ ctx: Ctx } | { error: string }> {
  const ctx = await getSessionContext();
  if (!hasRole(ctx.roles, ["org_admin"]) && !ctx.profile?.es_superadmin) {
    return { error: msg };
  }
  return { ctx };
}

const ROLES: Role[] = [
  "org_admin",
  "sede_admin",
  "recepcion",
  "toma_muestra",
  "analista",
  "validador",
  "facturacion",
  "medico",
  "lectura",
];

const phoneSchema = z
  .string()
  .trim()
  .regex(/^9\d{8}$/, "Teléfono debe tener 9 dígitos y comenzar con 9")
  .optional()
  .or(z.literal(""));

const emailSchema = z
  .string()
  .trim()
  .email("Email inválido")
  .optional()
  .or(z.literal(""));

const colegiaturaSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{4,10}$/, "Número de colegiatura inválido")
  .optional()
  .or(z.literal(""));

// ── Sedes ────────────────────────────────────────────────────
export async function createSedeAction(_prev: unknown, formData: FormData) {
  const guard = await orgAdminCtx("Solo el administrador de la organización puede gestionar sedes adicionales.");
  if ("error" in guard) return { error: guard.error };
  const ctx = guard.ctx;
  const nombre = String(formData.get("nombre") ?? "").trim();
  const codigo = String(formData.get("codigo") ?? "").trim().toUpperCase();
  const direccion = String(formData.get("direccion") ?? "").trim();
  if (!nombre || !codigo) return { error: "Código y nombre son obligatorios." };
  if (nombre.length > 200 || codigo.length > 20 || direccion.length > 300) {
    return { error: "Algún campo excede la longitud permitida." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("LIS_sedes").insert({
    organization_id: ctx.activeOrgId!,
    codigo,
    nombre,
    direccion: direccion || null,
  });
  if (error) {
    return { error: error.code === "23505" ? "Ya existe una sede con ese código." : friendlyDbError(error, "No se pudo crear la sede.") };
  }
  revalidatePath("/configuracion");
  return { ok: true };
}

export async function toggleSedeAction(sedeId: string, activo: boolean) {
  const guard = await orgAdminCtx("Solo el administrador de la organización puede gestionar sedes adicionales.");
  if ("error" in guard) return { error: guard.error };
  const supabase = await createClient();
  const { error } = await supabase.from("LIS_sedes").update({ activo }).eq("id", sedeId);
  if (error) return { error: friendlyDbError(error, "No se pudo actualizar la sede.") };
  revalidatePath("/configuracion");
  return { ok: true };
}

// ── Miembros / roles ─────────────────────────────────────────
export async function addMemberAction(_prev: unknown, formData: FormData) {
  const guard = await orgAdminCtx();
  if ("error" in guard) return { error: guard.error };
  const ctx = guard.ctx;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roleRaw = String(formData.get("role") ?? "");
  const sedeId = String(formData.get("sede_id") ?? "");
  if (!email || !roleRaw) return { error: "Email y rol son obligatorios." };
  if (!ROLES.includes(roleRaw as Role)) return { error: "Rol inválido." };
  const role = roleRaw as Role;
  if (sedeId && !z.string().uuid().safeParse(sedeId).success) {
    return { error: "Sede inválida." };
  }

  // Buscar el perfil por email (con service role, fuera de RLS)
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("LIS_profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (!profile) {
    return { error: "No existe un usuario con ese email. Pídele que se registre primero." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("LIS_memberships").insert({
    organization_id: ctx.activeOrgId!,
    sede_id: sedeId || null,
    user_id: profile.id,
    role,
  });
  if (error) {
    return { error: error.code === "23505" ? "El usuario ya tiene ese rol en esa sede." : friendlyDbError(error, "No se pudo asignar el rol.") };
  }
  revalidatePath("/configuracion");
  return { ok: true };
}

export async function removeMemberAction(membershipId: string) {
  const guard = await orgAdminCtx();
  if ("error" in guard) return { error: guard.error };
  const supabase = await createClient();
  const { error } = await supabase.from("LIS_memberships").delete().eq("id", membershipId);
  if (error) return { error: friendlyDbError(error, "No se pudo quitar el rol.") };
  revalidatePath("/configuracion");
  return { ok: true };
}

// ── Facturación ──────────────────────────────────────────────
const BILLING_PROVIDERS = ["wally", "nubefact", "manual"] as const;

export async function saveBillingAction(_prev: unknown, formData: FormData) {
  const guard = await orgAdminCtx();
  if ("error" in guard) return { error: guard.error };
  const ctx = guard.ctx;
  const provider = String(formData.get("provider") ?? "wally");
  const enabled = formData.get("enabled") === "on";
  const serie = String(formData.get("serie") ?? "").trim().toUpperCase();
  const igv = Number(formData.get("igv") ?? 0.18);
  const autoInvoice = formData.get("auto_invoice") === "on";
  const autoDeliver = formData.get("auto_deliver") === "on";

  if (!(BILLING_PROVIDERS as readonly string[]).includes(provider)) {
    return { error: "Proveedor de facturación inválido." };
  }
  if (serie && !/^[A-Z0-9]{4}$/.test(serie)) {
    return { error: "La serie debe tener 4 caracteres alfanuméricos (ej. B001)." };
  }
  if (!Number.isFinite(igv) || igv < 0 || igv > 1) {
    return { error: "IGV debe estar entre 0 y 1." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("LIS_billing_integrations")
    .upsert(
      {
        organization_id: ctx.activeOrgId!,
        provider,
        enabled,
        config: {
          serie: serie || "B001",
          igv,
          auto_invoice: autoInvoice,
          auto_deliver: autoDeliver,
        },
      },
      { onConflict: "organization_id,provider" }
    );
  if (error) return { error: friendlyDbError(error, "No se pudo guardar la configuración.") };
  revalidatePath("/configuracion");
  return { ok: true };
}

// ── Permisos granulares por módulo ───────────────────────────

export type PermissionEntry = { module: string; view: boolean; edit: boolean };

/**
 * Guarda la matriz de permisos de un rol para toda la organización
 * (sedeId=null) o para una sede específica. Escribe una fila por módulo:
 * un snapshot explícito, fácil de auditar.
 */
export async function savePermissionsAction(
  sedeId: string | null,
  role: Role,
  entries: PermissionEntry[]
) {
  const guard = await orgAdminCtx();
  if ("error" in guard) return { error: guard.error };
  const ctx = guard.ctx;
  if (!ROLES.includes(role)) return { error: "Rol inválido." };
  if (sedeId !== null && !z.string().uuid().safeParse(sedeId).success) {
    return { error: "Sede inválida." };
  }
  if (!Array.isArray(entries) || entries.length > 100) {
    return { error: "Listado de permisos inválido." };
  }

  const supabase = await createClient();
  const rows = entries.map((e) => ({
    organization_id: ctx.activeOrgId!,
    sede_id: sedeId,
    role,
    module: String(e.module).slice(0, 40),
    can_view: Boolean(e.view),
    can_edit: Boolean(e.view && e.edit), // editar implica ver
    updated_by: ctx.user.id,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("LIS_role_permissions")
    .upsert(rows, { onConflict: "organization_id,sede_id,role,module" });
  if (error) return { error: friendlyDbError(error, "No se pudieron guardar los permisos.") };
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Elimina las sobrescrituras del rol en ese alcance → vuelven los defaults. */
export async function resetPermissionsAction(sedeId: string | null, role: Role) {
  const guard = await orgAdminCtx();
  if ("error" in guard) return { error: guard.error };
  const ctx = guard.ctx;
  if (!ROLES.includes(role)) return { error: "Rol inválido." };
  const supabase = await createClient();
  let q = supabase
    .from("LIS_role_permissions")
    .delete()
    .eq("organization_id", ctx.activeOrgId!)
    .eq("role", role);
  q = sedeId === null ? q.is("sede_id", null) : q.eq("sede_id", sedeId);
  const { error } = await q;
  if (error) return { error: friendlyDbError(error, "No se pudieron restablecer los permisos.") };
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ── Profesionales (directorio compartido) ────────────────────
const PROFESSIONAL_TYPES = ["medico", "tecnologo", "bioquimico", "enfermero", "otro"] as const;

export async function saveProfessionalAction(_prev: unknown, formData: FormData) {
  const guard = await orgAdminCtx();
  if ("error" in guard) return { error: guard.error };
  const ctx = guard.ctx;
  const id = String(formData.get("id") ?? "");
  const nombres = String(formData.get("nombres") ?? "").trim();
  const apellidos = String(formData.get("apellidos") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "medico");
  if (!nombres || !apellidos) return { error: "Nombres y apellidos son obligatorios." };
  if (nombres.length > 120 || apellidos.length > 120) {
    return { error: "Nombres o apellidos demasiado largos." };
  }
  if (!(PROFESSIONAL_TYPES as readonly string[]).includes(tipo)) {
    return { error: "Tipo de profesional inválido." };
  }

  const telefonoRaw = String(formData.get("telefono") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim();
  const colegiaturaRaw = String(formData.get("numero_colegiatura") ?? "").trim();

  if (telefonoRaw) {
    const r = phoneSchema.safeParse(telefonoRaw);
    if (!r.success) return { error: "Teléfono debe tener 9 dígitos y comenzar con 9." };
  }
  if (emailRaw) {
    const r = emailSchema.safeParse(emailRaw);
    if (!r.success) return { error: "Email inválido." };
  }
  if (colegiaturaRaw) {
    const r = colegiaturaSchema.safeParse(colegiaturaRaw);
    if (!r.success) return { error: "Número de colegiatura inválido (4-10 caracteres alfanuméricos)." };
  }

  const payload = {
    organization_id: ctx.activeOrgId!,
    tipo,
    nombres,
    apellidos,
    numero_colegiatura: colegiaturaRaw || null,
    colegio: String(formData.get("colegio") ?? "").trim().slice(0, 120) || null,
    especialidad: String(formData.get("especialidad") ?? "").trim().slice(0, 120) || null,
    telefono: telefonoRaw || null,
    email: emailRaw || null,
    externo: formData.get("externo") === "on",
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("LIS_professionals").update(payload).eq("id", id)
    : await supabase.from("LIS_professionals").insert(payload);
  if (error) return { error: friendlyDbError(error, "No se pudo guardar el profesional.") };
  revalidatePath("/configuracion");
  return { ok: true };
}

export async function toggleProfessionalAction(id: string, activo: boolean) {
  const guard = await orgAdminCtx();
  if ("error" in guard) return { error: guard.error };
  const supabase = await createClient();
  const { error } = await supabase.from("LIS_professionals").update({ activo }).eq("id", id);
  if (error) return { error: friendlyDbError(error, "No se pudo actualizar el profesional.") };
  revalidatePath("/configuracion");
  return { ok: true };
}
