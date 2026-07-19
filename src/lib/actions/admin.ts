"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getSessionContext, hasRole } from "@/lib/auth/session";
import type { Role } from "@/lib/database.types";

async function requireOrgAdmin() {
  const ctx = await getSessionContext();
  if (!hasRole(ctx.roles, ["org_admin", "sede_admin"]) && !ctx.profile?.es_superadmin) {
    throw new Error("No autorizado");
  }
  return ctx;
}

// ── Sedes ────────────────────────────────────────────────────
export async function createSedeAction(_prev: unknown, formData: FormData) {
  const ctx = await requireOrgAdmin();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const codigo = String(formData.get("codigo") ?? "").trim();
  const direccion = String(formData.get("direccion") ?? "").trim();
  if (!nombre || !codigo) return { error: "Código y nombre son obligatorios." };

  const supabase = await createClient();
  const { error } = await supabase.from("LIS_sedes").insert({
    organization_id: ctx.activeOrgId!,
    codigo,
    nombre,
    direccion: direccion || null,
  });
  if (error) {
    return { error: error.code === "23505" ? "Ya existe una sede con ese código." : "No se pudo crear la sede." };
  }
  revalidatePath("/configuracion");
  return { ok: true };
}

export async function toggleSedeAction(sedeId: string, activo: boolean) {
  await requireOrgAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("LIS_sedes").update({ activo }).eq("id", sedeId);
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  return { ok: true };
}

// ── Miembros / roles ─────────────────────────────────────────
export async function addMemberAction(_prev: unknown, formData: FormData) {
  const ctx = await requireOrgAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "") as Role;
  const sedeId = String(formData.get("sede_id") ?? "");
  if (!email || !role) return { error: "Email y rol son obligatorios." };

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
    return { error: error.code === "23505" ? "El usuario ya tiene ese rol en esa sede." : "No se pudo asignar el rol." };
  }
  revalidatePath("/configuracion");
  return { ok: true };
}

export async function removeMemberAction(membershipId: string) {
  await requireOrgAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("LIS_memberships").delete().eq("id", membershipId);
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  return { ok: true };
}

// ── Facturación ──────────────────────────────────────────────
export async function saveBillingAction(_prev: unknown, formData: FormData) {
  const ctx = await requireOrgAdmin();
  const provider = String(formData.get("provider") ?? "wally");
  const enabled = formData.get("enabled") === "on";
  const serie = String(formData.get("serie") ?? "").trim();
  const igv = Number(formData.get("igv") ?? 0.18);
  const autoInvoice = formData.get("auto_invoice") === "on";
  const autoDeliver = formData.get("auto_deliver") === "on";

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
  if (error) return { error: error.message };
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
  const ctx = await requireOrgAdmin();
  const supabase = await createClient();
  const rows = entries.map((e) => ({
    organization_id: ctx.activeOrgId!,
    sede_id: sedeId,
    role,
    module: e.module,
    can_view: e.view,
    can_edit: e.view && e.edit, // editar implica ver
    updated_by: ctx.user.id,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("LIS_role_permissions")
    .upsert(rows, { onConflict: "organization_id,sede_id,role,module" });
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Elimina las sobrescrituras del rol en ese alcance → vuelven los defaults. */
export async function resetPermissionsAction(sedeId: string | null, role: Role) {
  const ctx = await requireOrgAdmin();
  const supabase = await createClient();
  let q = supabase
    .from("LIS_role_permissions")
    .delete()
    .eq("organization_id", ctx.activeOrgId!)
    .eq("role", role);
  q = sedeId === null ? q.is("sede_id", null) : q.eq("sede_id", sedeId);
  const { error } = await q;
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ── Profesionales (directorio compartido) ────────────────────

export async function saveProfessionalAction(_prev: unknown, formData: FormData) {
  const ctx = await requireOrgAdmin();
  const id = String(formData.get("id") ?? "");
  const nombres = String(formData.get("nombres") ?? "").trim();
  const apellidos = String(formData.get("apellidos") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "medico");
  if (!nombres || !apellidos) return { error: "Nombres y apellidos son obligatorios." };

  const payload = {
    organization_id: ctx.activeOrgId!,
    tipo,
    nombres,
    apellidos,
    numero_colegiatura: String(formData.get("numero_colegiatura") ?? "").trim() || null,
    colegio: String(formData.get("colegio") ?? "").trim() || null,
    especialidad: String(formData.get("especialidad") ?? "").trim() || null,
    telefono: String(formData.get("telefono") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    externo: formData.get("externo") === "on",
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("LIS_professionals").update(payload).eq("id", id)
    : await supabase.from("LIS_professionals").insert(payload);
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  return { ok: true };
}

export async function toggleProfessionalAction(id: string, activo: boolean) {
  await requireOrgAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("LIS_professionals").update({ activo }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  return { ok: true };
}
