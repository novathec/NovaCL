import { createAdminClient } from "@/lib/supabase/server";
import { generateAndStoreOrderReport } from "@/lib/report-storage";
import { emitInvoiceForOrder } from "@/lib/billing-core";
import { sendResultEmail } from "@/lib/integrations/notifications";
import { getResultsPortalBase } from "@/lib/portal-url";

export type FinalizeSummary = {
  /** Versión del PDF almacenado en Storage, si se generó. */
  reportVersion?: number;
  reportError?: string;
  /** Resultado de la auto-facturación (solo si el toggle está activo). */
  invoice?: "emitida" | "error" | "ya_existia";
  /** Resultado de la auto-entrega (solo si el toggle está activo). */
  delivery?: "enviada" | "error" | "ya_existia";
};

/**
 * Efectos automáticos al completarse una orden (todos los resultados
 * validados): genera y almacena el PDF del informe y, según los toggles
 * `auto_invoice` / `auto_deliver` de la configuración de la organización,
 * emite el comprobante y envía los resultados al paciente.
 *
 * Cada paso es independiente: un fallo aguas abajo nunca revierte la
 * validación ni bloquea los demás pasos.
 */
export async function finalizeCompletedOrder(
  orderId: string,
  actorId: string
): Promise<FinalizeSummary> {
  const admin = createAdminClient();
  const summary: FinalizeSummary = {};

  // 1) Informe PDF versionado en Storage — siempre.
  try {
    const rep = await generateAndStoreOrderReport(orderId, actorId);
    if (rep.ok) summary.reportVersion = rep.version;
    else summary.reportError = rep.error;
  } catch (e) {
    summary.reportError = (e as Error).message;
  }

  const { data: order } = await admin
    .from("LIS_orders")
    .select("organization_id, patients:LIS_patients(email)")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return summary;

  const { data: integ } = await admin
    .from("LIS_billing_integrations")
    .select("config")
    .eq("organization_id", order.organization_id)
    .maybeSingle();
  const cfg = (integ?.config ?? {}) as Record<string, unknown>;

  // 2) Auto-facturación (opt-in por organización).
  if (cfg.auto_invoice === true) {
    try {
      const { count } = await admin
        .from("LIS_invoices")
        .select("id", { count: "exact", head: true })
        .eq("order_id", orderId)
        .neq("status", "anulada");
      if (count && count > 0) {
        summary.invoice = "ya_existia";
      } else {
        const res = await emitInvoiceForOrder(admin, order.organization_id, orderId);
        summary.invoice = res.ok ? "emitida" : "error";
      }
    } catch {
      summary.invoice = "error";
    }
  }

  // 3) Auto-entrega (opt-in por organización): email si hay correo, si no portal.
  if (cfg.auto_deliver === true) {
    try {
      // Dedup: no generar tokens/emails duplicados si la orden ya tiene una
      // entrega activa (re-validación tras corrección o doble validación).
      const { count: previas } = await admin
        .from("LIS_result_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("order_id", orderId)
        .neq("status", "fallido");
      if (previas && previas > 0) {
        summary.delivery = "ya_existia";
      } else {
        const email = (order.patients as unknown as { email: string | null } | null)?.email ?? null;
        const canal = email ? "email" : "portal";
        const expira = new Date();
        expira.setDate(expira.getDate() + 30);

        const { data: delivery, error } = await admin
          .from("LIS_result_deliveries")
          .insert({
            organization_id: order.organization_id,
            order_id: orderId,
            canal,
            destino: email,
            status: "pendiente",
            token_expira_at: expira.toISOString(),
            enviado_por: actorId,
          })
          .select("id, access_token")
          .single();
        if (error) throw new Error(error.message);

        const link = `${getResultsPortalBase()}/${delivery.access_token}`;

        let sent = true;
        let errorDetalle: string | null = null;
        if (canal === "email" && email) {
          const res = await sendResultEmail(email, link);
          sent = res.ok;
          errorDetalle = res.error ?? null;
        }

        await admin
          .from("LIS_result_deliveries")
          .update({
            status: sent ? "enviado" : "fallido",
            enviado_at: sent ? new Date().toISOString() : null,
            error_detalle: errorDetalle,
          })
          .eq("id", delivery.id);

        summary.delivery = sent ? "enviada" : "error";
      }
    } catch {
      summary.delivery = "error";
    }
  }

  return summary;
}
