"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

export async function searchPatientsAction(q: string) {
  const ctx = await getSessionContext();
  const supabase = await createClient();
  let query = supabase
    .from("LIS_patients")
    .select("id,nombres,apellidos,tipo_documento,numero_documento,sexo,fecha_nacimiento")
    .eq("organization_id", ctx.activeOrgId!)
    .order("apellidos")
    .limit(10);
  if (q) {
    query = query.or(
      `nombres.ilike.%${q}%,apellidos.ilike.%${q}%,numero_documento.ilike.%${q}%`
    );
  }
  const { data } = await query;
  return data ?? [];
}

const patientSchema = z.object({
  tipo_documento: z.string().min(1),
  numero_documento: z.string().min(1, "Documento requerido"),
  nombres: z.string().min(1, "Nombres requeridos"),
  apellidos: z.string().min(1, "Apellidos requeridos"),
  fecha_nacimiento: z.string().optional().nullable(),
  sexo: z.enum(["M", "F", "otro", "desconocido"]),
  telefono: z.string().optional().nullable(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  direccion: z.string().optional().nullable(),
  grupo_sanguineo: z.string().optional().nullable(),
  alergias: z.string().optional().nullable(),
  antecedentes: z.string().optional().nullable(),
  seguro: z.string().optional().nullable(),
  contacto_emergencia: z.string().optional().nullable(),
});

export type PatientFormState =
  | { error?: string; fieldErrors?: Record<string, string>; ok?: boolean; id?: string }
  | undefined;

export async function savePatientAction(
  _prev: PatientFormState,
  formData: FormData
): Promise<PatientFormState> {
  const ctx = await getSessionContext();
  if (!ctx.activeOrgId) return { error: "Sin organización activa." };

  const raw = Object.fromEntries(formData.entries());
  const parsed = patientSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { error: "Revisa los campos.", fieldErrors };
  }

  const data = parsed.data;
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");

  const payload = {
    organization_id: ctx.activeOrgId,
    tipo_documento: data.tipo_documento,
    numero_documento: data.numero_documento,
    nombres: data.nombres,
    apellidos: data.apellidos,
    fecha_nacimiento: data.fecha_nacimiento || null,
    sexo: data.sexo,
    telefono: data.telefono || null,
    email: data.email || null,
    direccion: data.direccion || null,
    grupo_sanguineo: data.grupo_sanguineo || null,
    alergias: data.alergias || null,
    antecedentes: data.antecedentes || null,
    seguro: data.seguro || null,
    contacto_emergencia: data.contacto_emergencia || null,
  };

  const query = id
    ? supabase.from("LIS_patients").update(payload).eq("id", id).select("id").single()
    : supabase.from("LIS_patients").insert(payload).select("id").single();

  const { data: saved, error } = await query;
  if (error) {
    return {
      error: error.code === "23505"
        ? "Ya existe un paciente con ese documento."
        : "No se pudo guardar el paciente.",
    };
  }

  revalidatePath("/pacientes");
  return { ok: true, id: saved.id };
}
