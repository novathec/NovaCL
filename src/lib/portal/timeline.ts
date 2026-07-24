import type { OrderStatus, SampleStatus, ItemStatus } from "@/lib/database.types";

/**
 * Modelo de "seguimiento" del examen pensado para el paciente: traduce la
 * máquina de estados clínica (orden + muestra) a una línea de tiempo de 4
 * hitos comprensibles, con un mensaje de acompañamiento redactado para
 * transmitir calma y la certeza de que está siendo atendido.
 *
 * El avance se afina con el estado real de la MUESTRA (tomada / en tránsito /
 * recibida / en análisis / procesada), que es más granular que el estado de la
 * orden: así "Muestra tomada" se marca con precisión y el hint refleja dónde
 * está físicamente la muestra.
 *
 * Lógica pura (sin React ni acceso a datos) para reutilizarla y probarla.
 */

export type StepState = "done" | "current" | "upcoming";
export type StepKey = "recibida" | "muestra" | "analisis" | "listos";

export type TimelineStep = {
  key: StepKey;
  label: string;
  hint: string;
  state: StepState;
};

export type PortalTimeline = {
  steps: TimelineStep[];
  currentIndex: number;
  ready: boolean;
  delivered: boolean;
  partial: boolean;
  cancelled: boolean;
  headline: string;
  message: string;
  /** Etiqueta corta de la etapa (para chips). */
  stageLabel: string;
  progress: number;
  tone: "progress" | "ready" | "cancelled";
};

const BASE: { key: StepKey; label: string; hint: string }[] = [
  { key: "recibida", label: "Orden recibida", hint: "Recibimos tu solicitud" },
  { key: "muestra", label: "Muestra tomada", hint: "Tomamos tu muestra" },
  { key: "analisis", label: "En análisis", hint: "Trabajando en el laboratorio" },
  { key: "listos", label: "Resultados listos", hint: "Validados y disponibles" },
];

// Hito en curso según el estado de la orden (base, luego se afina con muestra).
const ORDER_INDEX: Record<OrderStatus, number> = {
  registrada: 1,
  en_toma: 1,
  en_proceso: 2,
  parcial: 2,
  completada: 3,
  entregada: 3,
  anulada: 0,
};

// Hito en curso según el estado de la muestra (más granular en pre-analítica).
function sampleIndex(s: SampleStatus | null): number {
  switch (s) {
    case "tomada":
    case "en_transito":
    case "recibida":
    case "en_analisis":
      return 2; // muestra ya tomada -> el trabajo pasó a análisis
    case "procesada":
      return 3; // análisis terminado -> a validación
    default:
      return 1; // pendiente / null / rechazada -> aún en toma
  }
}

// Detalle físico de la muestra para el hint del hito en curso.
function sampleHint(s: SampleStatus | null): string | null {
  switch (s) {
    case "tomada":
      return "Tu muestra fue tomada";
    case "en_transito":
      return "En camino al laboratorio";
    case "recibida":
      return "Recibida en el laboratorio";
    case "en_analisis":
      return "En análisis en este momento";
    case "procesada":
      return "Análisis terminado";
    default:
      return null;
  }
}

type StageKey =
  | "preparando"
  | "toma"
  | "analisis"
  | "validando"
  | "parcial"
  | "listos"
  | "entregada"
  | "anulada";

const STAGE_LABEL: Record<StageKey, string> = {
  preparando: "Preparando",
  toma: "En toma",
  analisis: "En análisis",
  validando: "Validando",
  parcial: "Parciales listos",
  listos: "Listo",
  entregada: "Entregado",
  anulada: "Anulada",
};

const STAGE_COPY: Record<StageKey, { headline: string; message: string }> = {
  preparando: {
    headline: "Estamos preparando tu atención",
    message:
      "Recibimos tu orden y ya está en marcha. En breve tomaremos tu muestra.",
  },
  toma: {
    headline: "Estamos tomando tu muestra",
    message:
      "Nuestro personal está recolectando tu muestra con todo el cuidado.",
  },
  analisis: {
    headline: "Analizando tus muestras",
    message:
      "El equipo del laboratorio está procesando tus exámenes con cuidado. Gracias por tu paciencia.",
  },
  validando: {
    headline: "Validando tus resultados",
    message:
      "El análisis terminó. Un profesional está revisando y validando tus resultados antes de entregártelos.",
  },
  parcial: {
    headline: "Algunos resultados ya están listos",
    message:
      "Parte de tus exámenes ya fue validada y puedes verla. El resto continúa en proceso.",
  },
  listos: {
    headline: "¡Tus resultados están listos!",
    message:
      "Tus exámenes fueron validados por el laboratorio. Ya puedes verlos y descargarlos.",
  },
  entregada: {
    headline: "Resultados entregados",
    message:
      "Tus resultados fueron validados y entregados. Puedes consultarlos cuando lo necesites.",
  },
  anulada: {
    headline: "Esta orden fue anulada",
    message:
      "Esta orden ya no está activa. Si tienes dudas, comunícate con tu laboratorio.",
  },
};

export function buildPortalTimeline(
  status: OrderStatus,
  opts: { reportReady: boolean; sampleStatus?: SampleStatus | null }
): PortalTimeline {
  const sample = opts.sampleStatus ?? null;
  const cancelled = status === "anulada";
  const fullyReady = status === "completada" || status === "entregada";
  const delivered = status === "entregada";
  const partial = status === "parcial" && opts.reportReady;
  const ready = !cancelled && (opts.reportReady || fullyReady);

  // Índice del hito en curso: el máximo entre lo que dice la orden y lo que
  // dice la muestra (nunca retrocede). Para órdenes ya listas es el último.
  const currentIndex = cancelled
    ? 0
    : fullyReady
      ? 3
      : Math.max(ORDER_INDEX[status], sampleIndex(sample));

  // Etapa de copy (coherente con el hito en curso).
  let stage: StageKey;
  if (cancelled) stage = "anulada";
  else if (delivered) stage = "entregada";
  else if (status === "completada" || (ready && !partial)) stage = "listos";
  else if (partial) stage = "parcial";
  else if (currentIndex >= 3) stage = "validando";
  else if (currentIndex === 2) stage = "analisis";
  else stage = status === "en_toma" || sample === "tomada" ? "toma" : "preparando";

  const hint = sampleHint(sample);

  const steps: TimelineStep[] = BASE.map((s, i) => {
    let state: StepState;
    if (cancelled) state = "upcoming";
    else if (fullyReady || i < currentIndex) state = "done";
    else if (i === currentIndex) state = "current";
    else state = "upcoming";
    // Parcial: el hito "listos" se muestra en curso (ya hay algo disponible).
    if (partial && s.key === "listos") state = "current";
    // Afinar el hint del hito en curso con el detalle real de la muestra.
    const useHint = state === "current" && hint ? hint : s.hint;
    return { ...s, hint: useHint, state };
  });

  const { headline, message } = STAGE_COPY[stage];

  return {
    steps,
    currentIndex,
    ready,
    delivered,
    partial,
    cancelled,
    headline,
    message,
    stageLabel: STAGE_LABEL[stage],
    progress: cancelled ? 0 : fullyReady ? 1 : currentIndex / (BASE.length - 1),
    tone: cancelled ? "cancelled" : fullyReady ? "ready" : "progress",
  };
}

// ── Desglose por estudio ────────────────────────────────────────────────────
// Cada estudio (order_item) avanza por su cuenta: su muestra puede estar en un
// punto y su resultado en otro. Este modelo compacto lo representa por estudio.

export type StudyStage = {
  /** Hito 0..3 (3 = listo). */
  stepIndex: number;
  label: string;
  hint: string;
  ready: boolean;
  tone: "ready" | "progress" | "attention";
};

export function buildStudyStage(input: {
  itemStatus: ItemStatus;
  sampleStatus: SampleStatus | null;
  hasValidated: boolean;
}): StudyStage {
  const { itemStatus, sampleStatus, hasValidated } = input;

  if (hasValidated || itemStatus === "validado") {
    return {
      stepIndex: 3,
      label: "Listo",
      hint: "Resultado disponible",
      ready: true,
      tone: "ready",
    };
  }
  if (itemStatus === "rechazado") {
    return {
      stepIndex: 1,
      label: "Requiere repetición",
      hint: "El laboratorio se comunicará contigo",
      ready: false,
      tone: "attention",
    };
  }
  if (sampleStatus === "rechazada") {
    return {
      stepIndex: 1,
      label: "Nueva muestra",
      hint: "Se necesita repetir la toma",
      ready: false,
      tone: "attention",
    };
  }
  if (sampleStatus === "procesada" || itemStatus === "resultado_cargado") {
    return {
      stepIndex: 3,
      label: "Validando",
      hint: "Análisis terminado, validando",
      ready: false,
      tone: "progress",
    };
  }

  const analysisHint: Partial<Record<SampleStatus, string>> = {
    tomada: "Muestra tomada",
    en_transito: "En camino al laboratorio",
    recibida: "Recibida en el laboratorio",
    en_analisis: "En análisis en este momento",
  };
  if (sampleStatus && analysisHint[sampleStatus]) {
    return {
      stepIndex: 2,
      label: "En análisis",
      hint: analysisHint[sampleStatus]!,
      ready: false,
      tone: "progress",
    };
  }
  if (itemStatus === "en_proceso") {
    return {
      stepIndex: 2,
      label: "En análisis",
      hint: "Trabajando en el laboratorio",
      ready: false,
      tone: "progress",
    };
  }
  // pendiente / sin muestra registrada
  return {
    stepIndex: 1,
    label: "En toma",
    hint: "Pendiente de muestra",
    ready: false,
    tone: "progress",
  };
}
