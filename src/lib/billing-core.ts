import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getBillingProvider, type BillingProviderConfig } from "@/lib/integrations/billing";

type DB = SupabaseClient<Database>;

/**
 * Núcleo de emisión de comprobantes, sin chequeo de rol ni revalidación de
 * rutas: lo comparten la acción manual (emitInvoiceAction) y la automatización
 * al completar una orden. El chequeo de autorización es responsabilidad del
 * llamador.
 */
export async function emitInvoiceForOrder(
  supabase: DB,
  orgId: string,
  orderId: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: order } = await supabase
    .from("LIS_orders")
    .select(
      "id, codigo, moneda, patients:LIS_patients(nombres,apellidos,tipo_documento,numero_documento,email,direccion), order_items:LIS_order_items(study_nombre,study_codigo,precio,descuento,status)"
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Orden no encontrada." };

  const { data: integ } = await supabase
    .from("LIS_billing_integrations")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();

  const cfg: BillingProviderConfig = {
    provider: integ?.provider ?? "wally",
    enabled: integ?.enabled ?? true,
    config: (integ?.config as Record<string, unknown>) ?? {},
  };

  const patient = order.patients as unknown as {
    nombres: string;
    apellidos: string;
    tipo_documento: string;
    numero_documento: string;
    email: string | null;
    direccion: string | null;
  };
  const items = (
    order.order_items as unknown as {
      study_nombre: string;
      study_codigo: string;
      precio: number;
      descuento: number;
      status: string;
    }[]
  ).filter((i) => i.status !== "anulado");

  // Correlativo SUNAT: ascendente por serie, asignado por el emisor.
  const serie = String(cfg.config.serie ?? "B001");
  const { count: emitidas } = await supabase
    .from("LIS_invoices")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("serie", serie);
  const numero = (emitidas ?? 0) + 1;

  const provider = getBillingProvider(cfg);
  const result = await provider.emitInvoice({
    moneda: order.moneda,
    referencia: order.codigo,
    numero,
    cliente: {
      tipo_documento: patient.tipo_documento,
      numero_documento: patient.numero_documento,
      nombre: `${patient.nombres} ${patient.apellidos}`,
      email: patient.email,
      direccion: patient.direccion,
    },
    lineas: items.map((i) => ({
      descripcion: i.study_nombre,
      codigo: i.study_codigo,
      cantidad: 1,
      precio_unitario: i.precio - i.descuento,
    })),
  });

  const { data: invoice, error } = await supabase
    .from("LIS_invoices")
    .insert({
      organization_id: orgId,
      order_id: orderId,
      provider: cfg.provider,
      external_id: result.externalId ?? null,
      serie: result.serie ?? null,
      numero: result.numero ?? null,
      status: result.ok ? "emitida" : "error_sync",
      moneda: order.moneda,
      subtotal: result.subtotal,
      impuestos: result.impuestos,
      total: result.total,
      pdf_url: result.pdfUrl ?? null,
      xml_url: result.xmlUrl ?? null,
      payload: (result.raw as never) ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await supabase.from("LIS_invoice_events").insert({
    invoice_id: invoice.id,
    tipo: result.ok ? "response" : "error",
    detalle: { ok: result.ok, error: result.error ?? null } as never,
  });

  if (!result.ok) return { ok: false, error: result.error ?? "Error al emitir el comprobante." };
  return { ok: true };
}
