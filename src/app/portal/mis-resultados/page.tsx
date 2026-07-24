import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  FlaskConical,
  Inbox,
  TriangleAlert,
  CheckCircle2,
  Building2,
  Activity,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/server";
import { readPortalSession } from "@/lib/portal/session";
import { getPortalOrders, type PortalOrderCard } from "@/lib/portal/data";
import { buildPortalTimeline } from "@/lib/portal/timeline";
import { TimelineStepper } from "@/components/portal/portal-timeline";
import { formatDate } from "@/lib/utils";
import { PortalTopbar } from "../_components/portal-topbar";

export const metadata = { title: "Mis resultados · Portal del paciente" };
export const dynamic = "force-dynamic";

export default async function MisResultadosPage() {
  const session = await readPortalSession();
  if (!session) redirect("/portal");

  const admin = createAdminClient();
  const orders = await getPortalOrders(admin, session.pids);

  const listas = orders.filter((o) => o.reportReady);
  const enProceso = orders.filter((o) => !o.reportReady);

  return (
    <div
      className="theme-light min-h-screen bg-slate-50"
      style={{ ["--portal-accent" as string]: "#0f8a8d" }}
    >
      <PortalTopbar nombre={session.nombre} />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {/* Saludo */}
        <div className="mb-8">
          <p className="text-sm text-slate-500">Hola,</p>
          <h1 className="text-2xl font-semibold capitalize tracking-tight text-slate-900">
            {session.nombre.toLowerCase()}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {orders.length === 0
              ? "Aquí verás el estado de tus exámenes."
              : enProceso.length > 0
                ? "Estamos atendiendo tus exámenes. Aquí puedes seguir su avance con tranquilidad."
                : "Estos son tus resultados de laboratorio."}
          </p>
        </div>

        {orders.length === 0 && <EmptyState />}

        {/* Resultados listos primero (buenas noticias) */}
        {listas.length > 0 && (
          <section className="mb-10">
            <SectionTitle
              icon={CheckCircle2}
              title="Resultados listos"
              count={listas.length}
              tone="ready"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {listas.map((o) => (
                <ReadyCard key={o.id} order={o} />
              ))}
            </div>
          </section>
        )}

        {/* En seguimiento */}
        {enProceso.length > 0 && (
          <section>
            <SectionTitle
              icon={Activity}
              title="En seguimiento"
              count={enProceso.length}
              tone="progress"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {enProceso.map((o) => (
                <ProcessCard key={o.id} order={o} />
              ))}
            </div>
          </section>
        )}

        <p className="mx-auto mt-12 max-w-xl text-center text-xs leading-relaxed text-slate-400">
          Los resultados mostrados están validados por el laboratorio. Este
          informe es referencial: consulta siempre a tu médico para su
          interpretación.
        </p>
      </main>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  count,
  tone,
}: {
  icon: typeof Activity;
  title: string;
  count: number;
  tone: "ready" | "progress";
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Icon
        className={`h-4.5 w-4.5 ${
          tone === "ready" ? "text-emerald-500" : "text-[var(--portal-accent)]"
        }`}
      />
      <h2 className="text-base font-semibold text-slate-800">{title}</h2>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
        {count}
      </span>
    </div>
  );
}

/** Tarjeta de orden con resultados disponibles. */
function ReadyCard({ order }: { order: PortalOrderCard }) {
  return (
    <Link
      href={`/portal/orden/${order.id}`}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--portal-accent)]/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--portal-accent)]/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm font-semibold text-slate-900">
            {order.codigo}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{formatDate(order.fecha)}</p>
        </div>
        {order.critico ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-red-100">
            <TriangleAlert className="h-3 w-3" /> Revisar
          </span>
        ) : order.anormales > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-100">
            <TriangleAlert className="h-3 w-3" /> {order.anormales} a revisar
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
            <CheckCircle2 className="h-3 w-3" /> En rango
          </span>
        )}
      </div>

      <div className="mt-4 space-y-1.5 text-sm text-slate-600">
        <p className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-slate-400" />
          {order.estudiosListos}
          {order.estudiosTotal > order.estudiosListos
            ? ` de ${order.estudiosTotal}`
            : ""}{" "}
          {order.estudiosListos === 1 ? "estudio" : "estudios"} listo
          {order.estudiosListos === 1 ? "" : "s"}
        </p>
        <p className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-slate-400" />
          <span className="truncate">{order.sede || order.organizacion}</span>
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" /> Listo para ver
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--portal-accent)]">
          Ver
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

/** Tarjeta de orden en proceso: muestra el seguimiento (timeline compacto). */
function ProcessCard({ order }: { order: PortalOrderCard }) {
  const timeline = buildPortalTimeline(order.status, {
    reportReady: order.reportReady,
  });
  const currentLabel =
    timeline.steps[timeline.currentIndex]?.label ?? "En proceso";

  return (
    <Link
      href={`/portal/orden/${order.id}`}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--portal-accent)]/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--portal-accent)]/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm font-semibold text-slate-900">
            {order.codigo}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{formatDate(order.fecha)}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--portal-accent)]/10 px-2.5 py-1 text-xs font-medium text-[var(--portal-accent)]">
          <span className="flex h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--portal-accent)]" />
          {currentLabel}
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        {timeline.headline}
      </p>

      <div className="mt-4">
        <TimelineStepper timeline={timeline} />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-xs text-slate-500">
          {order.estudiosTotal}{" "}
          {order.estudiosTotal === 1 ? "estudio" : "estudios"}
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--portal-accent)]">
          Ver seguimiento
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
        <Inbox className="h-7 w-7 text-slate-400" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-slate-800">
        Aún no hay exámenes registrados
      </h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500">
        Cuando tu laboratorio registre una atención, podrás seguir aquí el
        avance de tus exámenes y ver tus resultados apenas estén listos.
      </p>
    </div>
  );
}
