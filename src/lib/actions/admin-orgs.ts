"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireSuperadmin } from "@/lib/auth/session";
import { z } from "zod";

const orgSchema = z.object({
  nombre: z.string().min(2, "Nombre demasiado corto").max(120),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Solo letras minúsculas, números y guiones"),
  ruc: z.string().trim().max(20).optional().or(z.literal("")),
  logo_url: z.string().trim().url().optional().or(z.literal("")),
  timezone: z.string().min(3).max(60),
  locale: z.string().min(2).max(10),
  activo: z.boolean(),
});

const sedeSchema = z.object({
  organization_id: z.string().uuid(),
  codigo: z.string().min(1).max(20),
  nombre: z.string().min(2).max(120),
  direccion: z.string().trim().max(200).optional().or(z.literal("")),
  telefono: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email().optional().or(z.literal("")),
  es_procesadora: z.boolean(),
  activo: z.boolean(),
});

export type OrgFormState =
  | { ok?: true; id?: string; error?: string; fieldErrors?: Record<string, string> }
  | undefined;

export type SedeFormState =
  | { ok?: true; id?: string; error?: string; fieldErrors?: Record<string, string> }
  | undefined;

export type DeleteResult = { ok?: true; error?: string } | undefined;

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function createOrganizationAction(
  _prev: OrgFormState,
  formData: FormData,
): Promise<OrgFormState> {
  await requireSuperadmin();

  const raw = Object.fromEntries(formData.entries());
  const parsed = orgSchema.safeParse({
    ...raw,
    activo: raw.activo === "on" || raw.activo === "true",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    const detail: string[] = [];
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as string;
      fieldErrors[key] = issue.message;
      detail.push(`${key}: ${issue.message}`);
    }
    console.error("createOrganizationAction validation failed", {
      raw: Object.fromEntries(formData.entries()),
      issues: parsed.error.issues,
    });
    return {
      error: `Revisa los campos: ${detail.join("; ")}`,
      fieldErrors,
    };
  }
  const data = parsed.data;

  const admin = createAdminClient();
  const { data: saved, error } = await admin
    .from("LIS_organizations")
    .insert({
      nombre: data.nombre,
      slug: data.slug || slugify(data.nombre),
      ruc: data.ruc || null,
      logo_url: data.logo_url || null,
      timezone: data.timezone,
      locale: data.locale,
      activo: data.activo,
      settings: {},
    })
    .select("id")
    .single();

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Ya existe una organización con ese slug."
          : "No se pudo crear la organización.",
    };
  }

  revalidatePath("/admin/organizaciones");
  return { ok: true, id: saved.id };
}

export async function updateOrganizationAction(
  orgId: string,
  _prev: OrgFormState,
  formData: FormData,
): Promise<OrgFormState> {
  await requireSuperadmin();

  const raw = Object.fromEntries(formData.entries());
  const parsed = orgSchema.safeParse({
    ...raw,
    activo: raw.activo === "on" || raw.activo === "true",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { error: "Revisa los campos.", fieldErrors };
  }
  const data = parsed.data;

  const admin = createAdminClient();
  const { error } = await admin
    .from("LIS_organizations")
    .update({
      nombre: data.nombre,
      slug: data.slug || slugify(data.nombre),
      ruc: data.ruc || null,
      logo_url: data.logo_url || null,
      timezone: data.timezone,
      locale: data.locale,
      activo: data.activo,
    })
    .eq("id", orgId);

  if (error) {
    return { error: "No se pudo actualizar la organización." };
  }

  revalidatePath("/admin/organizaciones");
  return { ok: true, id: orgId };
}

export async function toggleOrganizationAction(
  orgId: string,
  activo: boolean,
): Promise<DeleteResult> {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("LIS_organizations")
    .update({ activo })
    .eq("id", orgId);
  if (error) return { error: "No se pudo cambiar el estado." };
  revalidatePath("/admin/organizaciones");
  return { ok: true };
}

export async function createSedeForOrgAction(
  _prev: SedeFormState,
  formData: FormData,
): Promise<SedeFormState> {
  await requireSuperadmin();

  const raw = Object.fromEntries(formData.entries());
  const parsed = sedeSchema.safeParse({
    ...raw,
    es_procesadora: raw.es_procesadora === "on" || raw.es_procesadora === "true",
    activo: raw.activo === "on" || raw.activo === "true",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { error: "Revisa los campos.", fieldErrors };
  }
  const data = parsed.data;

  const admin = createAdminClient();
  const { data: saved, error } = await admin
    .from("LIS_sedes")
    .insert({
      organization_id: data.organization_id,
      codigo: data.codigo,
      nombre: data.nombre,
      direccion: data.direccion || null,
      telefono: data.telefono || null,
      email: data.email || null,
      es_procesadora: data.es_procesadora,
      activo: data.activo,
      settings: {},
    })
    .select("id")
    .single();

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Ya existe una sede con ese código en la organización."
          : "No se pudo crear la sede.",
    };
  }

  revalidatePath("/admin/organizaciones");
  return { ok: true, id: saved.id };
}

export async function updateSedeAction(
  sedeId: string,
  _prev: SedeFormState,
  formData: FormData,
): Promise<SedeFormState> {
  await requireSuperadmin();

  const raw = Object.fromEntries(formData.entries());
  const parsed = sedeSchema.safeParse({
    ...raw,
    es_procesadora: raw.es_procesadora === "on" || raw.es_procesadora === "true",
    activo: raw.activo === "on" || raw.activo === "true",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { error: "Revisa los campos.", fieldErrors };
  }
  const data = parsed.data;

  const admin = createAdminClient();
  const { error } = await admin
    .from("LIS_sedes")
    .update({
      codigo: data.codigo,
      nombre: data.nombre,
      direccion: data.direccion || null,
      telefono: data.telefono || null,
      email: data.email || null,
      es_procesadora: data.es_procesadora,
      activo: data.activo,
    })
    .eq("id", sedeId);
  if (error) return { error: "No se pudo actualizar la sede." };

  revalidatePath("/admin/organizaciones");
  return { ok: true, id: sedeId };
}

export async function toggleSedeForOrgAction(
  sedeId: string,
  activo: boolean,
): Promise<DeleteResult> {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("LIS_sedes")
    .update({ activo })
    .eq("id", sedeId);
  if (error) return { error: "No se pudo cambiar el estado." };
  revalidatePath("/admin/organizaciones");
  return { ok: true };
}

export async function listAllOrganizationsAction() {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("LIS_organizations")
    .select("id, nombre, slug, ruc, timezone, locale, activo, created_at")
    .order("nombre");
  return data ?? [];
}

export async function listSedesForOrgAction(orgId: string) {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("LIS_sedes")
    .select("id, codigo, nombre, direccion, telefono, email, es_procesadora, activo")
    .eq("organization_id", orgId)
    .order("codigo");
  return data ?? [];
}

export async function getOrganizationAction(orgId: string) {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("LIS_organizations")
    .select(
      "id, nombre, slug, ruc, logo_url, timezone, locale, activo, created_at, updated_at, settings",
    )
    .eq("id", orgId)
    .maybeSingle();
  return data;
}

export async function getSedeAction(sedeId: string) {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("LIS_sedes")
    .select(
      "id, organization_id, codigo, nombre, direccion, telefono, email, es_procesadora, activo",
    )
    .eq("id", sedeId)
    .maybeSingle();
  return data;
}

export async function promoteToOrgAdminAction(
  orgId: string,
  email: string,
  role: "org_admin" | "sede_admin",
  sedeId: string | null,
): Promise<DeleteResult> {
  await requireSuperadmin();
  if (!email) return { error: "Email requerido" };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("LIS_profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!profile) return { error: "No existe un usuario con ese email." };

  const { error } = await admin.from("LIS_memberships").insert({
    organization_id: orgId,
    sede_id: sedeId,
    user_id: profile.id,
    role,
    activo: true,
  });
  if (error) {
    if (error.code === "23505") return { error: "El usuario ya tiene ese rol." };
    return { error: "No se pudo asignar el rol." };
  }
  revalidatePath("/admin/organizaciones");
  return { ok: true };
}

export async function dropMembershipAction(
  membershipId: string,
): Promise<DeleteResult> {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("LIS_memberships")
    .delete()
    .eq("id", membershipId);
  if (error) return { error: "No se pudo quitar el rol." };
  revalidatePath("/admin/organizaciones");
  return { ok: true };
}

export async function listOrgMembersAction(orgId: string) {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("LIS_memberships")
    .select(
      "id, role, sede_id, activo, profiles:LIS_profiles(nombre,email), sedes:LIS_sedes(nombre)",
    )
    .eq("organization_id", orgId)
    .order("role");
  return data ?? [];
}