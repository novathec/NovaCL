"use server";

import { getSessionContext, hasRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { generateConsolidatedPdf } from "@/lib/report-storage";

/**
 * Genera el informe consolidado (un solo PDF, formato ISO 15189) con los
 * resultados validados de varias órdenes del mismo paciente. Devuelve un
 * enlace firmado de 7 días para descargarlo o entregarlo.
 */
export async function generateConsolidatedReportAction(
  patientId: string,
  orderIds: string[]
) {
  const ctx = await getSessionContext();
  if (!hasRole(ctx.roles, ["org_admin", "sede_admin", "recepcion", "validador"])) {
    return { error: "No autorizado para emitir informes." };
  }
  if (orderIds.length < 1) return { error: "Selecciona al menos una orden." };
  if (orderIds.length > 20) return { error: "Máximo 20 órdenes por informe." };

  // Verificación con el cliente del usuario (pasa RLS): las órdenes deben
  // existir en su organización y pertenecer al paciente indicado.
  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("LIS_orders")
    .select("id, patient_id, organization_id, status")
    .in("id", orderIds)
    .eq("organization_id", ctx.activeOrgId!)
    .eq("patient_id", patientId);

  if (!orders || orders.length !== orderIds.length) {
    return { error: "Alguna orden no existe o no pertenece a este paciente." };
  }
  if (orders.some((o) => o.status === "anulada")) {
    return { error: "No se pueden incluir órdenes anuladas." };
  }

  const res = await generateConsolidatedPdf(orderIds, patientId, ctx.activeOrgId!);
  if (!res.ok) return { error: res.error };
  return { ok: true, url: res.url, reportId: res.reportId };
}
