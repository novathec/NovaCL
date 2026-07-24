import {
  Check,
  ClipboardList,
  TestTube,
  Microscope,
  FileCheck2,
  Ban,
  CheckCircle2,
  AlertTriangle,
  ListChecks,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  PortalTimeline as Timeline,
  StepKey,
  StudyStage,
} from "@/lib/portal/timeline";

const STEP_ICON: Record<StepKey, LucideIcon> = {
  recibida: ClipboardList,
  muestra: TestTube,
  analisis: Microscope,
  listos: FileCheck2,
};

/**
 * Seguimiento vertical completo del examen. Comunica en qué etapa está la
 * orden con lenguaje cálido; la etapa en curso "late" suavemente para dar la
 * sensación de que hay trabajo activo (que el paciente está siendo atendido).
 */
export function PortalTimeline({ timeline }: { timeline: Timeline }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7">
      {/* Encabezado emocional del estado */}
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-2.5 w-2.5 shrink-0 rounded-full",
            timeline.cancelled
              ? "bg-slate-400"
              : timeline.tone === "ready"
                ? "bg-emerald-500"
                : "animate-pulse bg-[var(--portal-accent,#0f8a8d)]"
          )}
        />
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            {timeline.headline}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            {timeline.message}
          </p>
        </div>
      </div>

      {/* Barra de avance sutil */}
      {!timeline.cancelled && (
        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              timeline.tone === "ready"
                ? "bg-emerald-500"
                : "bg-[var(--portal-accent,#0f8a8d)]"
            )}
            style={{ width: `${Math.round(timeline.progress * 100)}%` }}
          />
        </div>
      )}

      {/* Hitos */}
      <ol className="mt-6 space-y-0">
        {timeline.steps.map((step, i) => {
          const Icon = timeline.cancelled ? Ban : STEP_ICON[step.key];
          const isLast = i === timeline.steps.length - 1;
          const done = step.state === "done";
          const current = step.state === "current";
          return (
            <li key={step.key} className="flex gap-3.5">
              {/* Columna del nodo + conector */}
              <div className="flex flex-col items-center">
                <span className="relative flex h-9 w-9 items-center justify-center">
                  {current && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--portal-accent,#0f8a8d)] opacity-25" />
                  )}
                  <span
                    className={cn(
                      "relative flex h-9 w-9 items-center justify-center rounded-full border",
                      done &&
                        "border-transparent bg-[var(--portal-accent,#0f8a8d)] text-white",
                      current &&
                        "border-[var(--portal-accent,#0f8a8d)] bg-white text-[var(--portal-accent,#0f8a8d)]",
                      !done &&
                        !current &&
                        "border-slate-200 bg-slate-50 text-slate-300"
                    )}
                  >
                    {done ? (
                      <Check className="h-4.5 w-4.5" strokeWidth={2.5} />
                    ) : (
                      <Icon className="h-4.5 w-4.5" />
                    )}
                  </span>
                </span>
                {!isLast && (
                  <span
                    className={cn(
                      "my-1 w-0.5 flex-1 rounded-full",
                      done ? "bg-[var(--portal-accent,#0f8a8d)]" : "bg-slate-200"
                    )}
                    style={{ minHeight: "1.75rem" }}
                  />
                )}
              </div>

              {/* Texto del hito */}
              <div className={cn("pb-6", isLast && "pb-0")}>
                <p
                  className={cn(
                    "text-sm font-medium",
                    current
                      ? "text-[var(--portal-accent,#0f8a8d)]"
                      : done
                        ? "text-slate-900"
                        : "text-slate-400"
                  )}
                >
                  {step.label}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-xs",
                    current ? "text-slate-600" : "text-slate-400"
                  )}
                >
                  {current && timeline.partial
                    ? "Algunos ya disponibles"
                    : step.hint}
                  {current && !timeline.partial && (
                    <span className="ml-1.5 inline-flex items-center gap-1 font-medium text-[var(--portal-accent,#0f8a8d)]">
                      · En curso
                    </span>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Versión compacta horizontal para las tarjetas del dashboard: 4 puntos con
 * conectores y una etiqueta de la etapa en curso.
 */
export function TimelineStepper({ timeline }: { timeline: Timeline }) {
  return (
    <div>
      <div className="flex items-center">
        {timeline.steps.map((step, i) => {
          const done = step.state === "done";
          const current = step.state === "current";
          const isLast = i === timeline.steps.length - 1;
          return (
            <div key={step.key} className="flex flex-1 items-center last:flex-none">
              <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                {current && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--portal-accent,#0f8a8d)] opacity-30" />
                )}
                <span
                  className={cn(
                    "relative h-3.5 w-3.5 rounded-full border-2",
                    done &&
                      "border-[var(--portal-accent,#0f8a8d)] bg-[var(--portal-accent,#0f8a8d)]",
                    current &&
                      "border-[var(--portal-accent,#0f8a8d)] bg-white",
                    !done && !current && "border-slate-200 bg-slate-100"
                  )}
                />
              </span>
              {!isLast && (
                <span
                  className={cn(
                    "mx-1 h-0.5 flex-1 rounded-full",
                    done ? "bg-[var(--portal-accent,#0f8a8d)]" : "bg-slate-200"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Desglose por estudio: cada examen de la orden con su propia etapa, porque
 * pueden avanzar a ritmos distintos (una muestra ya procesada mientras otra
 * sigue en análisis). Da al paciente el detalle sin abrumarlo.
 */
export function StudyBreakdown({
  studies,
}: {
  studies: { nombre: string; stage: StudyStage }[];
}) {
  if (studies.length === 0) return null;
  const listos = studies.filter((s) => s.stage.ready).length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <ListChecks className="h-4.5 w-4.5 text-slate-400" />
          Detalle por estudio
        </h3>
        <span className="text-xs font-medium text-slate-500">
          {listos} de {studies.length} listo{studies.length === 1 ? "" : "s"}
        </span>
      </div>

      <ul className="divide-y divide-slate-100">
        {studies.map(({ nombre, stage }) => (
          <li key={nombre} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">
                {nombre}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">{stage.hint}</p>
            </div>
            <StudyStageChip stage={stage} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function StudyStageChip({ stage }: { stage: StudyStage }) {
  const tone = stage.tone;
  const Icon =
    tone === "ready"
      ? CheckCircle2
      : tone === "attention"
        ? AlertTriangle
        : Microscope;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1",
        tone === "ready" &&
          "bg-emerald-50 text-emerald-700 ring-emerald-100",
        tone === "attention" && "bg-amber-50 text-amber-700 ring-amber-100",
        tone === "progress" &&
          "bg-[var(--portal-accent,#0f8a8d)]/10 text-[var(--portal-accent,#0f8a8d)] ring-[var(--portal-accent,#0f8a8d)]/15"
      )}
    >
      {tone === "progress" ? (
        <span className="flex h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--portal-accent,#0f8a8d)]" />
      ) : (
        <Icon className="h-3 w-3" />
      )}
      {stage.label}
    </span>
  );
}
