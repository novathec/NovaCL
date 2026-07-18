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
  const criticos = await findCriticals(supabase, inputs);
  revalidatePath(`/resultados/${orderId}`);
  revalidatePath(`/ordenes/${orderId}`);
  return { ok: true, criticos };
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

  const criticos = await findCriticals(supabase, inputs);

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
  return { ok: true, criticos, automation };
}
