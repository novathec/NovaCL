"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { friendlyDbError, rpcError } from "@/lib/errors";
import type { AppointmentStatus } from "@/lib/database.types";

/** "Hoy" en la zona horaria operativa (Perú) como fecha ISO YYYY-MM-DD. */
function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

const fechaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
  .refine((f) => f >= todayISO(), { message: "No se puede agendar en una fecha pasada" });

const horaSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (formato HH:MM)");

const appointmentSchema = z.object({
  patient_id: z.string().uuid("Selecciona un paciente"),
  fecha: fechaSchema,
  hora_inicio: horaSchema,
  duracion_min: z.coerce.number().int().min(5).max(480),
  motivo: z.string().max(300, "Máximo 300 caracteres").optional(),
  medico_solicitante: z.string().max(200, "Máximo 200 caracteres").optional(),
  medico_solicitante_id: z.string().uuid().optional().or(z.literal("")),
  canal: z.enum(["presencial", "telefono", "whatsapp", "web"]).default("presencial"),
  notas: z.string().max(1000, "Máximo 1000 caracteres").optional(),
  study_ids: z.array(z.string().uuid()).default([]),
});

export type AppointmentInput = z.infer<typeof appointmentSchema>;

/** Máquina de estados de la cita (espejo de la UI de agenda). */
const APPT_NEXT: Record<AppointmentStatus, AppointmentStatus[]> = {
  programada: ["confirmada", "en_espera", "cancelada", "no_asistio"],
  confirmada: ["en_espera", "cancelada", "no_asistio"],
  en_espera: ["atendida", "cancelada", "no_asistio"],
  atendida: [],
  cancelada: [],
  no_asistio: [],
};

export async function createAppointmentAction(input: AppointmentInput) {
  const ctx = await getSessionContext();
  if (!ctx.activeSedeId) return { error: "Selecciona una sede activa." };

  const parsed = appointmentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los campos." };
  }
  const d = parsed.data;

  const supabase = await createClient();

  // Aviso de solape: misma sede, misma fecha, hora ocupada por una cita viva
  const { data: solapes } = await supabase
    .from("LIS_appointments")
    .select("id,hora_inicio,duracion_min")
    .eq("sede_id", ctx.activeSedeId)
    .eq("fecha", d.fecha)
    .not("status", "in", "(cancelada,no_asistio)");
  const inicio = toMinutes(d.hora_inicio);
  const overlap = (solapes ?? []).some((s) => {
    const sIni = toMinutes(s.hora_inicio);
    return inicio < sIni + s.duracion_min && sIni < inicio + d.duracion_min;
  });

  const { data, error } = await supabase
    .from("LIS_appointments")
    .insert({
      organization_id: ctx.activeOrgId!,
      sede_id: ctx.activeSedeId,
      patient_id: d.patient_id,
      fecha: d.fecha,
      hora_inicio: d.hora_inicio,
      duracion_min: d.duracion_min,
      motivo: d.motivo || null,
      medico_solicitante: d.medico_solicitante || null,
      medico_solicitante_id: d.medico_solicitante_id || null,
      canal: d.canal,
      notas: d.notas || null,
      study_ids: d.study_ids,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (error) return { error: friendlyDbError(error, "No se pudo crear la cita.") };

  revalidatePath("/agenda");
  return { ok: true, id: data.id, overlap };
}

export async function rescheduleAppointmentAction(
  id: string,
  fecha: string,
  hora_inicio: string
) {
  const parsed = z
    .object({ fecha: fechaSchema, hora_inicio: horaSchema })
    .safeParse({ fecha, hora_inicio });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los campos." };
  }

  const supabase = await createClient();
  const { data: appt } = await supabase
    .from("LIS_appointments")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!appt) return { error: "Cita no encontrada." };
  if (!["programada", "confirmada", "en_espera"].includes(appt.status)) {
    return { error: `No se puede reprogramar una cita ${appt.status}.` };
  }

  const { error } = await supabase
    .from("LIS_appointments")
    .update({ fecha: parsed.data.fecha, hora_inicio: parsed.data.hora_inicio, status: "programada" })
    .eq("id", id);
  if (error) return { error: friendlyDbError(error, "No se pudo reprogramar la cita.") };
  revalidatePath("/agenda");
  return { ok: true };
}

export async function updateAppointmentStatusAction(
  id: string,
  status: AppointmentStatus,
  motivo?: string
) {
  const supabase = await createClient();
  const { data: appt } = await supabase
    .from("LIS_appointments")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!appt) return { error: "Cita no encontrada." };
  if (!APPT_NEXT[appt.status as AppointmentStatus]?.includes(status)) {
    return { error: `Transición no permitida: ${appt.status} → ${status}.` };
  }

  const patch: { status: AppointmentStatus; cancel_motivo?: string | null } = { status };
  if (status === "cancelada") patch.cancel_motivo = motivo?.trim().slice(0, 500) || null;

  const { error } = await supabase.from("LIS_appointments").update(patch).eq("id", id);
  if (error) return { error: friendlyDbError(error, "No se pudo actualizar la cita.") };
  revalidatePath("/agenda");
  return { ok: true };
}

/**
 * Check-in: genera la orden de atencion desde la cita (con los estudios
 * preseleccionados si los hay) y enlaza cita → orden.
 */
export async function checkInAppointmentAction(id: string) {
  const ctx = await getSessionContext();
  if (!ctx.activeSedeId) return { error: "Selecciona una sede activa." };

  const supabase = await createClient();
  const { data: appt, error: e1 } = await supabase
    .from("LIS_appointments")
    .select("id,patient_id,sede_id,study_ids,medico_solicitante,medico_solicitante_id,motivo,order_id,status")
    .eq("id", id)
    .single();
  if (e1 || !appt) return { error: "Cita no encontrada." };
  if (appt.order_id) return { error: "La cita ya tiene una orden asociada." };
  if (!["programada", "confirmada", "en_espera"].includes(appt.status)) {
    return { error: `No se puede registrar la llegada de una cita ${appt.status}.` };
  }

  // Sin estudios preseleccionados: marcar en espera y completar en /ordenes/nueva
  if (!appt.study_ids || appt.study_ids.length === 0) {
    await supabase.from("LIS_appointments").update({ status: "en_espera" }).eq("id", id);
    revalidatePath("/agenda");
    return { ok: true, redirect: `/ordenes/nueva?patient=${appt.patient_id}&cita=${appt.id}` };
  }

  const { data: order, error: e2 } = await supabase.rpc("create_order", {
    p_sede_id: appt.sede_id,
    p_patient_id: appt.patient_id,
    p_items: appt.study_ids.map((study_id) => ({ study_id })),
    p_prioridad: "rutina",
    p_medico: appt.medico_solicitante,
    p_medico_id: appt.medico_solicitante_id,
    p_diagnostico: appt.motivo,
    p_observaciones: null,
  });
  if (e2) return { error: rpcError(e2, "No se pudo crear la orden de la cita.") };

  // Enlace atómico: solo si nadie ganó la carrera del check-in
  const { data: linked } = await supabase
    .from("LIS_appointments")
    .update({ status: "atendida", order_id: order.id })
    .eq("id", id)
    .is("order_id", null)
    .select("id");
  if (!linked || linked.length === 0) {
    // Otro check-in concurrente enlazó primero: anular la orden huérfana
    await supabase
      .from("LIS_orders")
      .update({ status: "anulada", motivo_anulacion: "Check-in duplicado (concurrencia)" })
      .eq("id", order.id);
    revalidatePath("/agenda");
    return { error: "La cita ya fue registrada por otro usuario." };
  }

  revalidatePath("/agenda");
  revalidatePath("/ordenes");
  return { ok: true, redirect: `/ordenes/${order.id}`, codigo: order.codigo };
}

/** Enlaza una orden creada manualmente con la cita de origen (flujo sin estudios). */
export async function linkOrderToAppointmentAction(citaId: string, orderId: string) {
  const supabase = await createClient();
  const { data: linked, error } = await supabase
    .from("LIS_appointments")
    .update({ status: "atendida", order_id: orderId })
    .eq("id", citaId)
    .is("order_id", null)
    .select("id");
  if (error) return { error: friendlyDbError(error, "No se pudo enlazar la cita.") };
  if (!linked || linked.length === 0) {
    return { error: "La cita ya tiene una orden enlazada." };
  }
  revalidatePath("/agenda");
  return { ok: true };
}

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
