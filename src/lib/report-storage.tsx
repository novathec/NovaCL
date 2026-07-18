import { createHash } from "node:crypto";
import { renderToBuffer } from "@react-pdf/renderer";
import { createAdminClient } from "@/lib/supabase/server";
import { buildConsolidatedReport } from "@/lib/consolidated-report";
import { LabReportPdf } from "@/lib/pdf/lab-report-pdf";

const BUCKET = "reports";

export type StoredReport =
  | { ok: true; version: number; storagePath: string }
  | { ok: false; error: string };

/**
 * Genera el PDF del informe de una orden (formato ISO 15189, solo resultados
 * validados), lo sube al bucket privado `reports` y registra la fila en
 * LIS_report_documents. Versionado: cada llamada crea v{n+1} sin sobrescribir.
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

  const report = await buildConsolidatedReport(admin, [orderId], true);
  if (!report || report.ordenes.every((o) => o.studies.length === 0)) {
    return { ok: false, error: "La orden no tiene resultados validados." };
  }

  const { count } = await admin
    .from("LIS_report_documents")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);
  const version = (count ?? 0) + 1;

  const buffer = await renderToBuffer(<LabReportPdf data={report} version={version} />);
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

export type ConsolidatedPdfResult =
  | { ok: true; url: string; reportId: string; storagePath: string }
  | { ok: false; error: string };

/**
 * Genera un PDF consolidado con los resultados validados de varias órdenes
 * del mismo paciente (fechas y metadatos de cada orden se conservan por
 * sección). El archivo queda en `{org}/consolidados/{paciente}/` y se
 * devuelve un enlace firmado de 7 días para entregarlo.
 *
 * Los PDF por orden en LIS_report_documents siguen siendo el registro
 * oficial e inmutable; el consolidado es un documento de entrega.
 */
export async function generateConsolidatedPdf(
  orderIds: string[],
  patientId: string,
  orgId: string
): Promise<ConsolidatedPdfResult> {
  const admin = createAdminClient();

  const report = await buildConsolidatedReport(admin, orderIds, true);
  if (!report) return { ok: false, error: "Órdenes inválidas o de pacientes distintos." };
  if (report.ordenes.every((o) => o.studies.length === 0)) {
    return { ok: false, error: "Las órdenes seleccionadas no tienen resultados validados." };
  }

  const buffer = await renderToBuffer(<LabReportPdf data={report} />);
  const storagePath = `${orgId}/consolidados/${patientId}/${report.reportId}.pdf`;

  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) return { ok: false, error: `Storage: ${upErr.message}` };

  const { data: signed } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
  if (!signed?.signedUrl) return { ok: false, error: "No se pudo firmar el enlace." };

  return { ok: true, url: signed.signedUrl, reportId: report.reportId, storagePath };
}

/** Signed URL de lectura (1 hora) para un informe almacenado. */
export async function signedReportUrl(storagePath: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  return data?.signedUrl ?? null;
}
