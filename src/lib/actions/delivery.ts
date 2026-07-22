"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext, hasRole } from "@/lib/auth/session";
import { friendlyDbError } from "@/lib/errors";
import type { DeliveryChannel } from "@/lib/database.types";
import { sendResultEmail } from "@/lib/integrations/notifications";

/**
 * Crea una entrega de resultados. Genera un token de acceso al portal público
 * y, si el canal es email, dispara la notificación (proveedor configurable).
 *
 * Defensa en servidor (además de RLS): la orden debe pertenecer a la
 * organización activa y estar completada (todos los resultados validados).
 */
export async function createDeliveryAction(
  orderId: string,
  canal: DeliveryChannel,
  destino: string
) {
  const ctx = await getSessionContext();
  if (!hasRole(ctx.roles, ["org_admin", "sede_admin", "recepcion", "validador"])) {
    return { error: "No autorizado para entregar resultados." };
  }
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("LIS_orders")
    .select("id, status")
    .eq("id", orderId)
    .eq("organization_id", ctx.activeOrgId!)
    .maybeSingle();
  if (!order) return { error: "Orden no encontrada." };
  if (order.status !== "completada") {
    return { error: "Solo se pueden entregar órdenes completadas (resultados validados)." };
  }

  const expira = new Date();
  expira.setDate(expira.getDate() + 30);

  const { data: delivery, error } = await supabase
    .from("LIS_result_deliveries")
    .insert({
      organization_id: ctx.activeOrgId!,
      order_id: orderId,
      canal,
      destino,
      status: "pendiente",
      token_expira_at: expira.toISOString(),
      enviado_por: ctx.user.id,
    })
    .select("id, access_token")
    .single();

  if (error) return { error: friendlyDbError(error, "No se pudo crear la entrega.") };

  const portalBase = process.env.RESULTS_PUBLIC_BASE_URL ?? "http://localhost:3000/portal";
  const link = `${portalBase}/${delivery.access_token}`;

  let sent = true;
  let errorDetalle: string | null = null;

  if (canal === "email") {
    const res = await sendResultEmail(destino, link);
    sent = res.ok;
    errorDetalle = res.error ?? null;
  } else if (canal === "sms" || canal === "whatsapp") {
    // SMS/WhatsApp aún no tienen proveedor integrado: NO se marca como
    // enviado — queda pendiente y el personal comparte el enlace manualmente.
    sent = false;
  }
  // portal: la generación del enlace ES la entrega (se comparte manualmente).

  await supabase
    .from("LIS_result_deliveries")
    .update({
      status: sent ? "enviado" : canal === "email" ? "fallido" : "pendiente",
      enviado_at: sent ? new Date().toISOString() : null,
      error_detalle: errorDetalle,
    })
    .eq("id", delivery.id);

  revalidatePath("/entrega");
  revalidatePath(`/ordenes/${orderId}`);
  return { ok: true, link, sent };
}
