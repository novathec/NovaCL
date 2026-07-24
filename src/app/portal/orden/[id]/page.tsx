import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/server";
import { readPortalSession } from "@/lib/portal/session";
import { getPortalOrder } from "@/lib/portal/data";
import { buildPortalTimeline } from "@/lib/portal/timeline";
import { buildOrderReport } from "@/lib/reports";
import { PortalTimeline } from "@/components/portal/portal-timeline";
import { ResultsReport } from "@/components/results/results-report";
import { PrintButton } from "@/components/results/print-button";
import { PortalTopbar } from "../../_components/portal-topbar";

export const metadata = { title: "Seguimiento · Portal del paciente" };
export const dynamic = "force-dynamic";

export default async function PortalOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await readPortalSession();
  if (!session) redirect("/portal");

  const admin = createAdminClient();

  // La orden debe pertenecer a la identidad del paciente en sesión.
  const order = await getPortalOrder(admin, id, session.pids);
  if (!order) notFound();

  const timeline = buildPortalTimeline(order.status, {
    reportReady: order.reportReady,
  });

  // onlyValidated=true: el paciente solo ve resultados firmados.
  const report = order.reportReady ? await buildOrderReport(admin, id, true) : null;
  const hasReport = !!report && report.studies.length > 0;

  return (
    <div
      className="theme-light min-h-screen bg-slate-50 print:bg-white"
      style={{ ["--portal-accent" as string]: "#0f8a8d" }}
    >
      <PortalTopbar nombre={session.nombre} />

      <div className="no-print border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/portal/mis-resultados"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Mis resultados
          </Link>
          {hasReport && <PrintButton label="Descargar / Imprimir" />}
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 print:px-0 print:py-0">
        {/* Código de la orden */}
        <div className="mb-5 flex items-baseline justify-between gap-3">
          <p className="font-mono text-sm font-semibold text-slate-700">
            {order.codigo}
          </p>
        </div>

        {/* Seguimiento (no se imprime: el PDF es el informe clínico) */}
        <div className="no-print mb-6">
          <PortalTimeline timeline={timeline} />
        </div>

        {hasReport ? (
          <>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold text-slate-900">
                  {report!.organizacion}
                </p>
                <p className="text-sm text-slate-500">{report!.sede}</p>
              </div>
              <p className="text-right text-sm font-medium text-slate-500">
                Reporte de resultados
              </p>
            </div>

            <ResultsReport data={report!} />

            <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-slate-400">
              <ShieldCheck className="h-4 w-4" />
              Documento de resultados validado. Consulta con tu médico para su
              interpretación.
            </p>
          </>
        ) : (
          !timeline.cancelled && (
            <p className="no-print mx-auto max-w-md text-center text-xs leading-relaxed text-slate-400">
              Te avisaremos apenas tus resultados estén validados. Puedes cerrar
              esta página con tranquilidad y volver cuando quieras.
            </p>
          )
        )}
      </main>
    </div>
  );
}
