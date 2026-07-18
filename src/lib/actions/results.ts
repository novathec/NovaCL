"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/session";
import { finalizeCompletedOrder, type FinalizeSummary } from "@/lib/automation";

export type ResultInput = {
  orderItemId: string;
  analyteId: string;
  valorNum?: number | null;
  valorTexto?: string | null;
  nota?: string | null;
};

export type CriticalValue = { analito: string; valor: string };
export type DeltaAlert = { analito: string; anterior: string; actual: string; fecha: string };

/** Umbral de delta check: variación relativa que dispara la alerta. */
const DELTA_THRESHOLD = 0.5;

/**
 * Delta check: compara los valores numéricos recién ingresados con el último
 * resultado validado del MISMO paciente y analito en órdenes anteriores.
 * Una variación mayor al umbral sugiere intercambio de tubos o
 * descalibración del analizador.
 */
async function findDeltaAlerts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
  inputs: ResultInput[]
): Promise<DeltaAlert[]> {
  const numeric = inputs.filter((i) => i.valorNum != null && Number.isFinite(i.valorNum));
  if (numeric.length === 0) return [];

  const { data: order } = await supabase
    .from("LIS_orders")
    .select("patient_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return [];

  const analyteIds = [...new Set(numeric.map((i) => i.analyteId))];
  const { data: previous } = await supabase
    .from("LIS_results")
    .select(
      "analyte_id, analyte_nombre, analyte_unidad, valor_num, validado_at, order_items:LIS_order_items!inner(order_id, orders:LIS_orders!inner(patient_id))"
    )
    .in("analyte_id", analyteIds)
    .eq("status", "validado")
    .not("valor_num", "is", null)
    .neq("order_items.order_id", orderId)
    .eq("order_items.orders.patient_id", order.patient_id)
    .order("validado_at", { ascending: false });

  const lastByAnalyte = new Map<
    string,
    { nombre: string; unidad: string | null; valor: number; fecha: string }
  >();
  for (const r of previous ?? []) {
    if (!lastByAnalyte.has(r.analyte_id) && r.valor_num != null) {
      lastByAnalyte.set(r.analyte_id, {
        nombre: r.analyte_nombre,
        unidad: r.analyte_unidad,
        valor: r.valor_num,
        fecha: r.validado_at ?? "",
      });
    }
  }

  const alerts: DeltaAlert[] = [];
  for (const input of numeric) {
    const prev = lastByAnalyte.get(input.analyteId);
    if (!prev || prev.valor === 0) continue;
    const delta = Math.abs(input.valorNum! - prev.valor) / Math.abs(prev.valor);
    if (delta > DELTA_THRESHOLD) {
      const u = prev.unidad ? ` ${prev.unidad}` : "";
      alerts.push({
        analito: prev.nombre,
        anterior: `${prev.valor}${u}`,
        actual: `${input.valorNum}${u}`,
        fecha: prev.fecha,
      });
    }
  }
  return alerts;
}

/**
 * Registra la constancia de aviso de valores críticos (ISO 15189): a quién
 * se comunicó, por qué medio y qué analitos. Queda en la bitácora de
 * auditoría vía trigger.
 */
export async function recordCriticalNotificationAction(
  orderId: string,
  criticos: CriticalValue[],
  notificadoA: string,
  medio: string,
  nota?: string
) {
  const ctx = await getSessionContext();
  if (!notificadoA.trim()) return { error: "Indica a quién se avisó." };
  const supabase = await createClient();
  const { error } = await supabase.from("LIS_critical_notifications").insert({
    organization_id: ctx.activeOrgId!,
    order_id: orderId,
    analitos: criticos,
    notificado_a: notificadoA.trim(),
    medio,
    nota: nota?.trim() || null,
    notificado_por: ctx.user.id,
  });
  if (error) return { error: error.message };
  revalidatePath(`/ordenes/${orderId}`);
  return { ok: true };
}

/** Valores críticos detectados en el lote recién guardado (para alertar). */
async function findCriticals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  inputs: ResultInput[]
): Promise<CriticalValue[]> {
  const itemIds = [...new Set(inputs.map((i) => i.orderItemId))];
  const analyteIds = [...new Set(inputs.map((i) => i.analyteId))];
  if (itemIds.length === 0) return [];
  const { data } = await supabase
    .from("LIS_results")
    .select("analyte_nombre, analyte_unidad, valor_num, valor_texto, flag")
    .in("order_item_id", itemIds)
    .in("analyte_id", analyteIds)
    .in("flag", ["critico_alto", "critico_bajo"]);
  return (data ?? []).map((r) => ({
    analito: r.analyte_nombre,
    valor: `${r.valor_num ?? r.valor_texto ?? "—"}${r.analyte_unidad ? ` ${r.analyte_unidad}` : ""} (${
      r.flag === "critico_alto" ? "crítico alto" : "crítico bajo"
    })`,
  }));
}

/** Guarda (o corrige) un lote de resultados sin validar. */
export async function saveResultsAction(orderId: string, inputs: ResultInput[]) {
  const supabase = await createClient();
  for (const r of inputs) {
    const { error } = await supabase.rpc("upsert_result", {
      p_order_item_id: r.orderItemId,
      p_analyte_id: r.analyteId,
      p_valor_num: r.valorNum ?? null,
      p_valor_texto: r.valorTexto ?? null,
      p_nota: r.nota ?? null,
      p_validar: false,
    });
    if (error) return { error: error.message };
  }
  const [criticos, deltas] = await Promise.all([
    findCriticals(supabase, inputs),
    findDeltaAlerts(supabase, orderId, inputs),
  ]);
  revalidatePath(`/resultados/${orderId}`);
  revalidatePath(`/ordenes/${orderId}`);
  return { ok: true, criticos, deltas };
}

/**
 * Valida (firma) los resultados de la orden. Requiere rol validador.
 * Si con esta validación la orden queda completada, dispara la automatización:
 * PDF del informe a Storage y, según configuración, factura y entrega.
 */
export async function validateResultsAction(orderId: string, inputs: ResultInput[]) {
  const ctx = await getSessionContext();
  if (!hasRole(ctx.roles, ["org_admin", "sede_admin", "validador"])) {
    return { error: "Solo un validador puede firmar los resultados." };
  }
  const supabase = await createClient();
  for (const r of inputs) {
    const { error } = await supabase.rpc("upsert_result", {
      p_order_item_id: r.orderItemId,
      p_analyte_id: r.analyteId,
      p_valor_num: r.valorNum ?? null,
      p_valor_texto: r.valorTexto ?? null,
      p_nota: r.nota ?? null,
      p_validar: true,
    });
    if (error) return { error: error.message };
  }

  const [criticos, deltas] = await Promise.all([
    findCriticals(supabase, inputs),
    findDeltaAlerts(supabase, orderId, inputs),
  ]);

  // El trigger rollup_order_status ya movió la orden a `completada` si este
  // era el último lote pendiente — ahí se encadena la automatización.
  let automation: FinalizeSummary | undefined;
  const { data: order } = await supabase
    .from("LIS_orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle();
  if (order?.status === "completada") {
    try {
      automation = await finalizeCompletedOrder(orderId, ctx.user.id);
    } catch {
      // La automatización nunca debe revertir ni bloquear la validación.
    }
  }

  revalidatePath(`/resultados/${orderId}`);
  revalidatePath(`/ordenes/${orderId}`);
  return { ok: true, criticos, deltas, automation };
}
