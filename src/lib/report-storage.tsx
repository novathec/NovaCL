import { createHash } from "node:crypto";
import { renderToBuffer } from "@react-pdf/renderer";
import { createAdminClient } from "@/lib/supabase/server";
import { buildOrderReport } from "@/lib/reports";
import { OrderReportPdf } from "@/lib/pdf/order-report-pdf";

const BUCKET = "reports";

export type StoredReport =
  | { ok: true; version: number; storagePath: string }
  | { ok: false; error: string };

/**
 * Genera el PDF del informe (solo resultados validados), lo sube al bucket
 * privado `reports` y registra la fila en LIS_report_documents.
 * Versionado: cada llamada crea v{n+1} sin sobrescribir versiones previas.
 * Corre con service role: pensado para invocarse desde server actions/webhooks.
 */
export async function generateAndStoreOrderReport(
  orderId: string,
  actorId?: string
): Promise<StoredReport> {
  const admin = createAdminClient();

  const { data: order } = await admin
    .from("LIS_orders")
    .select("organization_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Orden no encontrada." };

  const report = await buildOrderReport(admin, orderId, true);
  if (!report || report.studies.length === 0) {
    return { ok: false, error: "La orden no tiene resultados validados." };
  }

  const { count } = await admin
    .from("LIS_report_documents")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);
  const version = (count ?? 0) + 1;

  const buffer = await renderToBuffer(<OrderReportPdf data={report} version={version} />);
  const storagePath = `${order.organization_id}/${orderId}/v${version}.pdf`;

  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upErr) return { ok: false, error: `Storage: ${upErr.message}` };

  const { error: insErr } = await admin.from("LIS_report_documents").insert({
    organization_id: order.organization_id,
    order_id: orderId,
    storage_path: storagePath,
    version,
    hash: createHash("sha256").update(buffer).digest("hex"),
    generado_por: actorId ?? null,
  });
  if (insErr) return { ok: false, error: insErr.message };

  return { ok: true, version, storagePath };
}

/** Signed URL de lectura (1 hora) para un informe almacenado. */
export async function signedReportUrl(storagePath: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  return data?.signedUrl ?? null;
}
