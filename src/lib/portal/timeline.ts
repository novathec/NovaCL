import type { OrderStatus } from "@/lib/database.types";

/**
 * Modelo de "seguimiento" del examen pensado para el paciente: traduce la
 * máquina de estados clínica (registrada → … → entregada) a una línea de
 * tiempo de 4 hitos comprensibles, con un mensaje de acompañamiento redactado
 * para transmitir calma y la certeza de que está siendo atendido.
 *
 * Lógica pura (sin React ni acceso a datos) para poder reutilizarla en el
 * dashboard y en el detalle, y probarla de forma aislada.
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
  /** Índice del hito en curso. */
  currentIndex: number;
  /** Hay al menos un resultado validado para ver. */
  ready: boolean;
  /** Entregada formalmente al paciente. */
  delivered: boolean;
  /** Algunos estudios listos y otros aún en análisis. */
  partial: boolean;
  /** Orden anulada. */
  cancelled: boolean;
  /** Título cálido del estado actual. */
  headline: string;
  /** Frase de acompañamiento. */
  message: string;
  /** Avance 0..1 para la barra sutil. */
  progress: number;
  tone: "progress" | "ready" | "cancelled";
};

const BASE: { key: StepKey; label: string; hint: string }[] = [
  { key: "recibida", label: "Orden recibida", hint: "Recibimos tu solicitud" },
  { key: "muestra", label: "Muestra tomada", hint: "Tomamos tu muestra" },
  { key: "analisis", label: "En análisis", hint: "Trabajando en el laboratorio" },
  { key: "listos", label: "Resultados listos", hint: "Validados y disponibles" },
];

// Hito actualmente en curso según el estado de la orden.
const CURRENT_INDEX: Record<OrderStatus, number> = {
  registrada: 1,
  en_toma: 1,
  en_proceso: 2,
  parcial: 2,
  completada: 3,
  entregada: 3,
  anulada: 0,
};

function copyFor(
  status: OrderStatus,
  partial: boolean
): { headline: string; message: string } {
  switch (status) {
    case "registrada":
      return {
        headline: "Estamos preparando tu atención",
        message:
          "Recibimos tu orden y ya está en marcha. En breve tomaremos tu muestra.",
      };
    case "en_toma":
      return {
        headline: "Estamos tomando tu muestra",
        message:
          "Nuestro personal está recolectando tu muestra con todo el cuidado.",
      };
    case "en_proceso":
      return {
        headline: "Analizando tus muestras",
        message:
          "El equipo del laboratorio está procesando tus exámenes con cuidado. Gracias por tu paciencia.",
      };
    case "parcial":
      return partial
        ? {
            headline: "Algunos resultados ya están listos",
            message:
              "Parte de tus exámenes ya fue validada y puedes verla. El resto continúa en análisis.",
          }
        : {
            headline: "Analizando tus muestras",
            message:
              "El equipo del laboratorio está procesando tus exámenes con cuidado. Gracias por tu paciencia.",
          };
    case "completada":
      return {
        headline: "¡Tus resultados están listos!",
        message:
          "Tus exámenes fueron validados por el laboratorio. Ya puedes verlos y descargarlos.",
      };
    case "entregada":
      return {
        headline: "Resultados entregados",
        message:
          "Tus resultados fueron validados y entregados. Puedes consultarlos cuando lo necesites.",
      };
    case "anulada":
      return {
        headline: "Esta orden fue anulada",
        message:
          "Esta orden ya no está activa. Si tienes dudas, comunícate con tu laboratorio.",
      };
  }
}

export function buildPortalTimeline(
  status: OrderStatus,
  opts: { reportReady: boolean }
): PortalTimeline {
  const cancelled = status === "anulada";
  const fullyReady = status === "completada" || status === "entregada";
  const delivered = status === "entregada";
  const partial = status === "parcial" && opts.reportReady;
  const ready = !cancelled && (opts.reportReady || fullyReady);

  const currentIndex = fullyReady ? 3 : CURRENT_INDEX[status];

  const steps: TimelineStep[] = BASE.map((s, i) => {
    let state: StepState;
    if (cancelled) state = "upcoming";
    else if (fullyReady || i < currentIndex) state = "done";
    else if (i === currentIndex) state = "current";
    else state = "upcoming";
    // Parcial con resultados: el hito "listos" se muestra en curso (no futuro),
    // porque ya hay algo disponible aunque el análisis continúe.
    if (partial && s.key === "listos") state = "current";
    return { ...s, state };
  });

  const { headline, message } = copyFor(status, partial);

  return {
    steps,
    currentIndex,
    ready,
    delivered,
    partial,
    cancelled,
    headline,
    message,
    progress: cancelled ? 0 : fullyReady ? 1 : currentIndex / (BASE.length - 1),
    tone: cancelled ? "cancelled" : fullyReady ? "ready" : "progress",
  };
}
