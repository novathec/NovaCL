"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { AppointmentStatus } from "@/lib/database.types";

const appointmentSchema = z.object({
  patient_id: z.string().uuid("Selecciona un paciente"),
  fecha: z.string().min(1, "Fecha requerida"),
  hora_inicio: z.string().min(1, "Hora requerida"),
  duracion_min: z.coerce.number().int().min(5).max(480),
  motivo: z.string().optional(),
  medico_solicitante: z.string().optional(),
  canal: z.enum(["presencial", "telefono", "whatsapp", "web"]).default("presencial"),
  notas: z.string().optional(),
  study_ids: z.array(z.string().uuid()).default([]),
});

export type AppointmentInput = z.infer<typeof appointmentSchema>;

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
      canal: d.canal,
      notas: d.notas || null,
      study_ids: d.study_ids,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (error) return { error: "No se pudo crear la cita." };

  revalidatePath("/agenda");
  return { ok: true, id: data.id, overlap };
}

export async function rescheduleAppointmentAction(
  id: string,
  fecha: string,
  hora_inicio: string
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("LIS_appointments")
    .update({ fecha, hora_inicio, status: "programada" })
    .eq("id", id);
  if (error) return { error: "No se pudo reprogramar la cita." };
  revalidatePath("/agenda");
  return { ok: true };
}

export async function updateAppointmentStatusAction(
  id: string,
  status: AppointmentStatus,
  motivo?: string
) {
  const supabase = await createClient();
  const patch: { status: AppointmentStatus; cancel_motivo?: string | null } = { status };
  if (status === "cancelada") patch.cancel_motivo = motivo ?? null;

  const { error } = await supabase.from("LIS_appointments").update(patch).eq("id", id);
  if (error) return { error: "No se pudo actualizar la cita." };
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
    .select("id,patient_id,sede_id,study_ids,medico_solicitante,motivo,order_id")
    .eq("id", id)
    .single();
  if (e1 || !appt) return { error: "Cita no encontrada." };
  if (appt.order_id) return { error: "La cita ya tiene una orden asociada." };

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
    p_diagnostico: appt.motivo,
    p_observaciones: null,
  });
  if (e2) return { error: e2.message };

  await supabase
    .from("LIS_appointments")
    .update({ status: "atendida", order_id: order.id })
    .eq("id", id);

  revalidatePath("/agenda");
  revalidatePath("/ordenes");
  return { ok: true, redirect: `/ordenes/${order.id}`, codigo: order.codigo };
}

/** Enlaza una orden creada manualmente con la cita de origen (flujo sin estudios). */
export async function linkOrderToAppointmentAction(citaId: string, orderId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("LIS_appointments")
    .update({ status: "atendida", order_id: orderId })
    .eq("id", citaId)
    .is("order_id", null);
  if (error) return { error: "No se pudo enlazar la cita." };
  revalidatePath("/agenda");
  return { ok: true };
}

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
