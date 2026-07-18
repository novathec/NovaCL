"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext, hasRole } from "@/lib/auth/session";
import { emitInvoiceForOrder } from "@/lib/billing-core";

/**
 * Emite el comprobante de una orden a través del proveedor configurado por el
 * tenant (por defecto Wally). Registra la factura y su bitácora de eventos.
 * La lógica de emisión vive en billing-core (compartida con la automatización).
 */
export async function emitInvoiceAction(orderId: string) {
  const ctx = await getSessionContext();
  if (!hasRole(ctx.roles, ["org_admin", "sede_admin", "facturacion"])) {
    return { error: "No autorizado para facturar." };
  }

  const supabase = await createClient();
  const result = await emitInvoiceForOrder(supabase, ctx.activeOrgId!, orderId);

  revalidatePath("/facturacion");
  revalidatePath(`/ordenes/${orderId}`);

  if (!result.ok) return { error: result.error ?? "Error al emitir el comprobante." };
  return { ok: true };
}
