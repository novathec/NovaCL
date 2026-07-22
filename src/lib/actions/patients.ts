"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { friendlyDbError } from "@/lib/errors";

/**
 * Sanitiza el término de búsqueda antes de interpolarlo en un filtro `.or()`
 * de PostgREST: los caracteres de sintaxis ( , ) . " \ y los comodines % _
 * pueden romper o alterar la lógica del filtro.
 */
function sanitizeSearchTerm(q: string): string {
  return q
    .replace(/[(),."\\%_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export async function searchPatientsAction(q: string) {
  const ctx = await getSessionContext();
  const supabase = await createClient();
  const term = sanitizeSearchTerm(q);
  if (q && !term) return []; // el término quedó vacío tras sanitizar

  let query = supabase
    .from("LIS_patients")
    .select("id,nombres,apellidos,tipo_documento,numero_documento,sexo,fecha_nacimiento")
    .eq("organization_id", ctx.activeOrgId!)
    .order("apellidos")
    .limit(10);
  if (term) {
    query = query.or(
      `nombres.ilike.%${term}%,apellidos.ilike.%${term}%,numero_documento.ilike.%${term}%`
    );
  }
  const { data } = await query;
  return data ?? [];
}

const patientSchema = z
  .discriminatedUnion("tipo_documento", [
    z.object({
      tipo_documento: z.literal("DNI"),
      numero_documento: z
        .string()
        .min(1, "Documento requerido")
        .regex(/^\d{8}$/, "DNI debe tener 8 dígitos"),
    }),
    z.object({
      tipo_documento: z.literal("CE"),
      numero_documento: z
        .string()
        .min(1, "Documento requerido")
        .regex(/^[A-Za-z0-9]{6,12}$/, "CE debe tener 6-12 caracteres alfanuméricos"),
    }),
    z.object({
      tipo_documento: z.literal("PAS"),
      numero_documento: z
        .string()
        .min(1, "Documento requerido")
        .regex(/^[A-Za-z0-9]{6,9}$/, "Pasaporte debe tener 6-9 caracteres alfanuméricos"),
    }),
    z.object({
      tipo_documento: z.literal("OTRO"),
      numero_documento: z
        .string()
        .min(3, "Mínimo 3 caracteres")
        .max(40, "Máximo 40 caracteres"),
    }),
  ])
  .and(
    z.object({
      nombres: z.string().min(1, "Nombres requeridos"),
      apellidos: z.string().min(1, "Apellidos requeridos"),
      fecha_nacimiento: z
        .string()
        .optional()
        .nullable()
        .refine((f) => !f || (Date.parse(f) < Date.now() && Date.parse(f) > Date.parse("1900-01-01")), {
          message: "Fecha inválida",
        }),
      sexo: z.enum(["M", "F", "otro", "desconocido"]),
      telefono: z
        .string()
        .optional()
        .nullable()
        .refine((v) => !v || /^9\d{8}$/.test(v), {
          message: "Teléfono debe comenzar con 9 y tener 9 dígitos",
        }),
      email: z.string().email("Email inválido").optional().or(z.literal("")),
      direccion: z.string().optional().nullable(),
      grupo_sanguineo: z.string().optional().nullable(),
      alergias: z.string().optional().nullable(),
      antecedentes: z.string().optional().nullable(),
      seguro: z.string().optional().nullable(),
      contacto_emergencia: z
        .string()
        .max(200, "Máximo 200 caracteres")
        .optional()
        .nullable(),
    })
  );

export type PatientFormState =
  | {
      error?: string;
      warning?: string;
      fieldErrors?: Record<string, string>;
      ok?: boolean;
      id?: string;
    }
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
    console.error("savePatientAction insert/update failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      payload: { ...payload, numero_documento: payload.numero_documento ? "***" : null },
    });
    return {
      error:
        error.code === "23505"
          ? "Ya existe un paciente con ese documento."
          : friendlyDbError(error, "No se pudo guardar el paciente."),
    };
  }

  revalidatePath("/pacientes");
  return { ok: true, id: saved.id };
}
