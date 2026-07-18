import type {
  Role,
  OrderStatus,
  OrderPriority,
  ItemStatus,
  SampleStatus,
  ResultFlag,
  AppointmentStatus,
} from "@/lib/database.types";

export const ROLE_LABELS: Record<Role, string> = {
  org_admin: "Administrador de organización",
  sede_admin: "Administrador de sede",
  recepcion: "Recepción",
  toma_muestra: "Toma de muestra",
  analista: "Analista",
  validador: "Validador",
  facturacion: "Facturación",
  medico: "Médico solicitante",
  lectura: "Solo lectura",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  registrada: "Registrada",
  en_toma: "En toma",
  en_proceso: "En proceso",
  parcial: "Parcial",
  completada: "Completada",
  entregada: "Entregada",
  anulada: "Anulada",
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  registrada: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  en_toma: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  en_proceso: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  parcial: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  completada: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  entregada: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  anulada: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export const PRIORITY_LABELS: Record<OrderPriority, string> = {
  rutina: "Rutina",
  urgente: "Urgente",
  stat: "STAT",
};

export const PRIORITY_COLORS: Record<OrderPriority, string> = {
  rutina: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  urgente: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  stat: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  resultado_cargado: "Resultado cargado",
  validado: "Validado",
  rechazado: "Rechazado",
  anulado: "Anulado",
};

export const SAMPLE_STATUS_LABELS: Record<SampleStatus, string> = {
  pendiente: "Pendiente",
  tomada: "Tomada",
  en_transito: "En tránsito",
  recibida: "Recibida",
  en_analisis: "En análisis",
  procesada: "Procesada",
  rechazada: "Rechazada",
};

export const FLAG_LABELS: Record<ResultFlag, string> = {
  normal: "Normal",
  bajo: "Bajo",
  alto: "Alto",
  critico_bajo: "Crítico bajo",
  critico_alto: "Crítico alto",
  anormal: "Anormal",
};

export const FLAG_COLORS: Record<ResultFlag, string> = {
  normal: "text-emerald-600 dark:text-emerald-400",
  bajo: "text-amber-600 dark:text-amber-400",
  alto: "text-amber-600 dark:text-amber-400",
  critico_bajo: "text-red-600 dark:text-red-400 font-semibold",
  critico_alto: "text-red-600 dark:text-red-400 font-semibold",
  anormal: "text-amber-600 dark:text-amber-400",
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  programada: "Programada",
  confirmada: "Confirmada",
  en_espera: "En espera",
  atendida: "Atendida",
  no_asistio: "No asistió",
  cancelada: "Cancelada",
};

export const APPOINTMENT_STATUS_COLORS: Record<AppointmentStatus, string> = {
  programada: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  confirmada: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  en_espera: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  atendida: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  no_asistio: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  cancelada: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export const APPOINTMENT_CHANNEL_LABELS: Record<string, string> = {
  presencial: "Presencial",
  telefono: "Teléfono",
  whatsapp: "WhatsApp",
  web: "Web",
};

export const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({
  value: value as Role,
  label,
}));
