"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext, hasRole } from "@/lib/auth/session";
import { generateBarcode } from "@/lib/utils";
import type { OrderPriority, Database } from "@/lib/database.types";

export type CreateOrderInput = {
  patientId: string;
  studyIds: string[];
  prioridad: OrderPriority;
  medico?: string;
  diagnostico?: string;
  observaciones?: string;
};

export async function createOrderAction(input: CreateOrderInput) {
  const ctx = await getSessionContext();
  if (!ctx.activeSedeId) return { error: "Selecciona una sede activa." };
  if (input.studyIds.length === 0) return { error: "Agrega al menos un estudio." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_sede_id: ctx.activeSedeId,
    p_patient_id: input.patientId,
    p_items: input.studyIds.map((study_id) => ({ study_id })),
    p_prioridad: input.prioridad,
    p_medico: input.medico || null,
    p_diagnostico: input.diagnostico || null,
    p_observaciones: input.observaciones || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/ordenes");
  return { ok: true, orderId: data.id, codigo: data.codigo };
}

/** Genera una muestra para la orden cubriendo los estudios indicados. */
export async function createSampleAction(orderId: string, orderItemIds: string[], specimenTypeId?: string) {
  const ctx = await getSessionContext();
  const supabase = await createClient();

  const { data: sample, error } = await supabase
    .from("LIS_samples")
    .insert({
      organization_id: ctx.activeOrgId!,
      order_id: orderId,
      specimen_type_id: specimenTypeId ?? null,
      barcode: generateBarcode(),
      status: "tomada",
      sede_toma_id: ctx.activeSedeId,
      tomada_por: ctx.user.id,
      tomada_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (orderItemIds.length > 0) {
    await supabase.from("LIS_sample_items").insert(
      orderItemIds.map((order_item_id) => ({ sample_id: sample.id, order_item_id }))
    );
  }
  // avanzar items a en_proceso
  await supabase
    .from("LIS_order_items")
    .update({ status: "en_proceso" })
    .in("id", orderItemIds)
    .eq("status", "pendiente");

  revalidatePath(`/ordenes/${orderId}`);
  revalidatePath("/muestras");
  return { ok: true, sampleId: sample.id };
}

export async function updateSampleStatusAction(
  sampleId: string,
  status: "recibida" | "en_analisis" | "procesada" | "rechazada",
  motivo?: string
) {
  const ctx = await getSessionContext();
  const supabase = await createClient();

  const patch: Database["public"]["Tables"]["LIS_samples"]["Update"] = { status };
  if (status === "recibida") {
    patch.recibida_por = ctx.user.id;
    patch.recibida_at = new Date().toISOString();
  }
  if (status === "rechazada") patch.motivo_rechazo = motivo ?? null;

  const { error } = await supabase.from("LIS_samples").update(patch).eq("id", sampleId);
  if (error) return { error: error.message };

  revalidatePath("/muestras");
  return { ok: true };
}

export async function anularOrderAction(orderId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("LIS_orders").update({ status: "anulada" }).eq("id", orderId);
  if (error) return { error: error.message };
  revalidatePath("/ordenes");
  revalidatePath(`/ordenes/${orderId}`);
  return { ok: true };
}

export async function marcarEntregadaAction(orderId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("LIS_orders").update({ status: "entregada" }).eq("id", orderId);
  if (error) return { error: error.message };
  revalidatePath(`/ordenes/${orderId}`);
  return { ok: true };
}

/**
 * Add-on test: agrega un estudio a una orden EXISTENTE (el médico pide un
 * examen adicional con la misma muestra). Toma el precio vigente (de sede o
 * base), evita duplicados y verifica si la orden ya tiene una muestra del
 * tipo que el estudio requiere; si no, lo advierte para programar nueva toma.
 */
export async function addStudyToOrderAction(orderId: string, studyId: string) {
  const ctx = await getSessionContext();
  if (!hasRole(ctx.roles, ["org_admin", "sede_admin", "recepcion"])) {
    return { error: "No autorizado para modificar la orden." };
  }
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("LIS_orders")
    .select("id, status, sede_id, organization_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { error: "Orden no encontrada." };
  if (["entregada", "anulada"].includes(order.status)) {
    return { error: "No se pueden agregar estudios a una orden entregada o anulada." };
  }

  const { data: study } = await supabase
    .from("LIS_studies")
    .select("id, codigo, nombre, specimen_type_id, specimen_types:LIS_specimen_types(nombre)")
    .eq("id", studyId)
    .maybeSingle();
  if (!study) return { error: "Estudio no encontrado." };

  const { data: existing } = await supabase
    .from("LIS_order_items")
    .select("id")
    .eq("order_id", orderId)
    .eq("study_id", studyId)
    .neq("status", "anulado")
    .limit(1);
  if (existing && existing.length > 0) {
    return { error: "La orden ya incluye este estudio." };
  }

  // Precio vigente: primero el específico de la sede, luego el base
  const { data: prices } = await supabase
    .from("LIS_study_prices")
    .select("precio, sede_id")
    .eq("study_id", studyId)
    .eq("activo", true)
    .or(`sede_id.eq.${order.sede_id},sede_id.is.null`)
    .order("vigente_desde", { ascending: false });
  const precio =
    prices?.find((p) => p.sede_id === order.sede_id)?.precio ??
    prices?.find((p) => p.sede_id === null)?.precio ??
    0;

  const { error } = await supabase.from("LIS_order_items").insert({
    order_id: orderId,
    study_id: studyId,
    status: "pendiente",
    precio,
    descuento: 0,
    study_nombre: study.nombre,
    study_codigo: study.codigo,
  });
  if (error) return { error: error.message };

  // Compatibilidad de tubo: ¿ya existe una muestra utilizable del tipo requerido?
  let warning: string | undefined;
  if (study.specimen_type_id) {
    const { data: muestras } = await supabase
      .from("LIS_samples")
      .select("id")
      .eq("order_id", orderId)
      .eq("specimen_type_id", study.specimen_type_id)
      .neq("status", "rechazada")
      .limit(1);
    if (!muestras || muestras.length === 0) {
      const tipo =
        (study.specimen_types as unknown as { nombre: string } | null)?.nombre ?? "muestra";
      warning = `La orden no tiene ${tipo.toLowerCase()} utilizable: programa una nueva toma.`;
    }
  }

  revalidatePath(`/ordenes/${orderId}`);
  revalidatePath("/ordenes");
  return { ok: true, precio, warning };
}
