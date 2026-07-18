"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { addDays, format, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  Keyboard,
  Loader2,
  MoreHorizontal,
  Phone,
  Stethoscope,
  User,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  checkInAppointmentAction,
  rescheduleAppointmentAction,
  updateAppointmentStatusAction,
} from "@/lib/actions/appointments";
import {
  APPOINTMENT_CHANNEL_LABELS,
  APPOINTMENT_STATUS_COLORS,
  APPOINTMENT_STATUS_LABELS,
} from "@/lib/constants";
import { cn, calcAge } from "@/lib/utils";
import type { AppointmentStatus, Views } from "@/lib/database.types";
import { NewAppointmentDialog, type StudyLite } from "./new-appointment-dialog";

type Cita = Views<"v_agenda">;
type Vista = "dia" | "semana" | "lista";

const SHORTCUTS: [string, string][] = [
  ["N", "Nueva cita"],
  ["← / →", "Día o semana anterior / siguiente"],
  ["H", "Ir a hoy"],
  ["D", "Vista día"],
  ["S", "Vista semana"],
  ["L", "Vista lista"],
  ["?", "Ver atajos"],
];

// Grilla horaria: 1 px por minuto (60 px por hora)
const PX_MIN = 1;
const SNAP_MIN = 15;

// Acento lateral por estado para los bloques del calendario
const STATUS_EDGE: Record<AppointmentStatus, string> = {
  programada: "border-l-slate-400",
  confirmada: "border-l-blue-500",
  en_espera: "border-l-amber-500",
  atendida: "border-l-emerald-500",
  no_asistio: "border-l-orange-500",
  cancelada: "border-l-red-500",
};

const STATUS_DOT: Record<AppointmentStatus, string> = {
  programada: "bg-slate-400",
  confirmada: "bg-blue-500",
  en_espera: "bg-amber-500",
  atendida: "bg-emerald-500",
  no_asistio: "bg-orange-500",
  cancelada: "bg-red-500",
};

const STATUS_ORDER: AppointmentStatus[] = [
  "programada",
  "confirmada",
  "en_espera",
  "atendida",
  "no_asistio",
  "cancelada",
];

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHHMM = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function AgendaClient({
  citas,
  fecha,
  vista,
  studies,
  sedeNombre,
}: {
  citas: Cita[];
  fecha: string;
  vista: Vista;
  studies: StudyLite[];
  sedeNombre: string;
}) {
  const router = useRouter();
  const [openNew, setOpenNew] = useState(false);
  const [horaNueva, setHoraNueva] = useState<string | undefined>();
  const [fechaNueva, setFechaNueva] = useState<string | undefined>();
  const [openHelp, setOpenHelp] = useState(false);
  const [detalle, setDetalle] = useState<Cita | null>(null);
  const [reprogramar, setReprogramar] = useState<Cita | null>(null);
  const [cancelar, setCancelar] = useState<Cita | null>(null);

  // Filtros (client-side sobre las citas ya cargadas en la vista)
  const [fEstado, setFEstado] = useState<AppointmentStatus | null>(null);
  const [fEstudio, setFEstudio] = useState("todos");
  const [fMedico, setFMedico] = useState("todos");

  const conteoEstados = useMemo(() => {
    const m = new Map<AppointmentStatus, number>();
    for (const c of citas) m.set(c.status, (m.get(c.status) ?? 0) + 1);
    return m;
  }, [citas]);

  const estudiosEnVista = useMemo(() => {
    const ids = new Set(citas.flatMap((c) => c.study_ids));
    return studies.filter((s) => ids.has(s.id));
  }, [citas, studies]);

  const medicosEnVista = useMemo(
    () =>
      [...new Set(citas.map((c) => c.medico_solicitante).filter((m): m is string => !!m))].sort(),
    [citas]
  );

  const filtrosActivos = fEstado !== null || fEstudio !== "todos" || fMedico !== "todos";

  const citasFiltradas = useMemo(
    () =>
      citas.filter(
        (c) =>
          (fEstado === null || c.status === fEstado) &&
          (fEstudio === "todos" || c.study_ids.includes(fEstudio)) &&
          (fMedico === "todos" || c.medico_solicitante === fMedico)
      ),
    [citas, fEstado, fEstudio, fMedico]
  );

  function limpiarFiltros() {
    setFEstado(null);
    setFEstudio("todos");
    setFMedico("todos");
  }

  const go = useCallback(
    (f: string, v: Vista = vista) => {
      router.push(`/agenda?fecha=${f}&vista=${v}`);
    },
    [router, vista]
  );

  const shift = useCallback(
    (dir: 1 | -1) => {
      const base = new Date(`${fecha}T12:00:00`);
      const next = addDays(base, dir * (vista === "semana" ? 7 : 1));
      go(format(next, "yyyy-MM-dd"));
    },
    [fecha, vista, go]
  );

  function agendarEn(f: string, hora: string) {
    setFechaNueva(f);
    setHoraNueva(hora);
    setOpenNew(true);
  }

  // Atajos globales de teclado
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable)
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (openNew || openHelp || detalle || reprogramar || cancelar) return;

      switch (e.key) {
        case "n":
        case "N":
          e.preventDefault();
          setFechaNueva(undefined);
          setHoraNueva(undefined);
          setOpenNew(true);
          break;
        case "ArrowLeft":
          e.preventDefault();
          shift(-1);
          break;
        case "ArrowRight":
          e.preventDefault();
          shift(1);
          break;
        case "h":
        case "H":
          e.preventDefault();
          go(format(new Date(), "yyyy-MM-dd"));
          break;
        case "d":
        case "D":
          e.preventDefault();
          go(fecha, "dia");
          break;
        case "s":
        case "S":
          e.preventDefault();
          go(fecha, "semana");
          break;
        case "l":
        case "L":
          e.preventDefault();
          go(fecha, "lista");
          break;
        case "?":
          e.preventDefault();
          setOpenHelp(true);
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fecha, go, shift, openNew, openHelp, detalle, reprogramar, cancelar]);

  const base = new Date(`${fecha}T12:00:00`);
  const titulo =
    vista === "semana"
      ? `Semana del ${format(startOfWeek(base, { weekStartsOn: 1 }), "d MMM", { locale: es })}`
      : format(base, "EEEE d 'de' MMMM", { locale: es });

  return (
    <TooltipProvider delayDuration={150}>
      <PageHeader
        title="Agenda"
        description={`${sedeNombre} · ${
          filtrosActivos
            ? `${citasFiltradas.length} de ${citas.length} citas (filtrado)`
            : `${citas.length} cita${citas.length !== 1 ? "s" : ""} en vista`
        }`}
      >
        <Button variant="outline" size="icon" onClick={() => setOpenHelp(true)} title="Atajos (?)">
          <Keyboard className="h-4 w-4" />
        </Button>
        <Button
          onClick={() => {
            setFechaNueva(undefined);
            setHoraNueva(undefined);
            setOpenNew(true);
          }}
        >
          <CalendarPlus className="h-4 w-4" /> Nueva cita{" "}
          <kbd className="ml-1 hidden rounded bg-primary-foreground/20 px-1.5 text-xs sm:inline">N</kbd>
        </Button>
      </PageHeader>

      {/* Barra de navegación temporal */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shift(-1)} title="Anterior (←)">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => shift(1)} title="Siguiente (→)">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => go(format(new Date(), "yyyy-MM-dd"))}
            title="Hoy (H)"
          >
            Hoy
          </Button>
          <Input
            type="date"
            value={fecha}
            onChange={(e) => e.target.value && go(e.target.value)}
            className="h-8 w-36"
            aria-label="Ir a fecha"
          />
          <span className="ml-1 hidden text-sm font-medium capitalize md:inline">{titulo}</span>
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-1">
          {(
            [
              ["dia", "Día"],
              ["semana", "Semana"],
              ["lista", "Lista"],
            ] as [Vista, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => go(fecha, v)}
              className={cn(
                "rounded-md px-3 py-1 text-sm transition-all duration-200",
                vista === v
                  ? "bg-brand-gradient text-primary-foreground shadow-glow"
                  : "hover:bg-accent"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros: estado (chips con conteo), estudio y médico */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUS_ORDER.filter((s) => conteoEstados.has(s)).map((s) => {
          const activo = fEstado === s;
          return (
            <button
              key={s}
              onClick={() => setFEstado(activo ? null : s)}
              aria-pressed={activo}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-200 active:scale-[0.97]",
                activo
                  ? "border-primary bg-accent text-accent-foreground shadow-glow"
                  : "text-muted-foreground hover:border-primary/40 hover:bg-accent"
              )}
              title={`Filtrar: ${APPOINTMENT_STATUS_LABELS[s]}`}
            >
              <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[s])} />
              {APPOINTMENT_STATUS_LABELS[s]}
              <span className="tabular-nums opacity-70">{conteoEstados.get(s)}</span>
            </button>
          );
        })}

        {estudiosEnVista.length > 0 && (
          <Select value={fEstudio} onValueChange={setFEstudio}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Estudio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estudios</SelectItem>
              {estudiosEnVista.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {medicosEnVista.length > 0 && (
          <Select value={fMedico} onValueChange={setFMedico}>
            <SelectTrigger className="h-8 w-52 text-xs">
              <SelectValue placeholder="Médico solicitante" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los médicos</SelectItem>
              {medicosEnVista.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {filtrosActivos && (
          <Button variant="ghost" size="sm" onClick={limpiarFiltros} className="h-8 text-xs">
            <X className="h-3.5 w-3.5" /> Limpiar
          </Button>
        )}
      </div>

      {vista === "lista" ? (
        <ListaView
          citas={citasFiltradas}
          onDetalle={setDetalle}
          onReprogramar={setReprogramar}
          onCancelar={setCancelar}
        />
      ) : (
        <TimeGrid
          citas={citasFiltradas}
          fecha={fecha}
          dias={vista === "semana" ? 7 : 1}
          onDetalle={setDetalle}
          onAgendar={agendarEn}
          onSelectDay={(f) => go(f, "dia")}
        />
      )}

      {/* Pie con atajos */}
      <div className="mt-6 hidden flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground md:flex">
        {SHORTCUTS.map(([k, label]) => (
          <span key={k} className="flex items-center gap-1">
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">{k}</kbd> {label}
          </span>
        ))}
        <span className="ml-auto hidden lg:inline">
          Consejo: haz clic en un espacio libre del calendario para agendar a esa hora.
        </span>
      </div>

      <NewAppointmentDialog
        open={openNew}
        onOpenChange={setOpenNew}
        fechaInicial={fechaNueva ?? fecha}
        horaInicial={horaNueva}
        studies={studies}
      />

      <DetalleDialog
        cita={detalle}
        onClose={() => setDetalle(null)}
        onReprogramar={(c) => {
          setDetalle(null);
          setReprogramar(c);
        }}
        onCancelar={(c) => {
          setDetalle(null);
          setCancelar(c);
        }}
      />
      <ReprogramarDialog cita={reprogramar} onClose={() => setReprogramar(null)} />
      <CancelarDialog cita={cancelar} onClose={() => setCancelar(null)} />

      <Dialog open={openHelp} onOpenChange={setOpenHelp}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-4 w-4" /> Atajos de teclado
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {SHORTCUTS.map(([k, label]) => (
              <div key={k} className="flex items-center justify-between text-sm">
                <span>{label}</span>
                <kbd className="rounded border bg-muted px-2 py-0.5 font-mono text-xs">{k}</kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

// ─────────────────────────────────────────────────────────────
// Acciones compartidas sobre una cita
// ─────────────────────────────────────────────────────────────
function useCitaActions(c: Cita | null, onDone?: () => void) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setStatus(status: "confirmada" | "en_espera" | "no_asistio") {
    if (!c) return;
    startTransition(async () => {
      const res = await updateAppointmentStatusAction(c.id, status);
      if ("error" in res && res.error) toast.error(res.error);
      else {
        toast.success(`Cita ${APPOINTMENT_STATUS_LABELS[status].toLowerCase()}`);
        onDone?.();
      }
    });
  }

  function checkIn() {
    if (!c) return;
    startTransition(async () => {
      const res = await checkInAppointmentAction(c.id);
      if ("error" in res && res.error) return void toast.error(res.error);
      if ("codigo" in res && res.codigo) toast.success(`Orden ${res.codigo} creada`);
      onDone?.();
      if ("redirect" in res && res.redirect) router.push(res.redirect as never);
    });
  }

  return { pending, setStatus, checkIn };
}

const citaActiva = (c: Cita) => !["atendida", "cancelada", "no_asistio"].includes(c.status);

// ─────────────────────────────────────────────────────────────
// Burbuja informativa (hover) con el detalle de la cita
// ─────────────────────────────────────────────────────────────
function CitaBubble({ cita: c }: { cita: Cita }) {
  const fin = toHHMM(toMin(c.hora_inicio) + c.duracion_min);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">{c.paciente}</p>
        <Badge className={APPOINTMENT_STATUS_COLORS[c.status]}>
          {APPOINTMENT_STATUS_LABELS[c.status]}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {c.tipo_documento} {c.numero_documento} · {calcAge(c.fecha_nacimiento)}
      </p>
      <div className="flex items-center gap-1.5 text-xs">
        <Clock className="h-3 w-3 text-primary" />
        {c.hora_inicio.slice(0, 5)}–{fin} · {c.duracion_min} min ·{" "}
        {APPOINTMENT_CHANNEL_LABELS[c.canal] ?? c.canal}
      </div>
      {c.motivo && (
        <div className="flex items-start gap-1.5 text-xs">
          <FileText className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
          <span>{c.motivo}</span>
        </div>
      )}
      {c.medico_solicitante && (
        <div className="flex items-center gap-1.5 text-xs">
          <Stethoscope className="h-3 w-3 text-primary" />
          {c.medico_solicitante}
        </div>
      )}
      {c.telefono && (
        <div className="flex items-center gap-1.5 text-xs">
          <Phone className="h-3 w-3 text-primary" />
          {c.telefono}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {c.study_ids.length > 0
          ? `${c.study_ids.length} estudio${c.study_ids.length !== 1 ? "s" : ""} preseleccionado${c.study_ids.length !== 1 ? "s" : ""}`
          : "Sin estudios preseleccionados"}
        {c.order_codigo && ` · Orden ${c.order_codigo}`}
      </p>
      <p className="border-t pt-1.5 text-[11px] text-muted-foreground">
        Clic para ver acciones
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Grilla horaria (vista día = 1 columna, semana = 7 columnas)
// ─────────────────────────────────────────────────────────────
type EvLayout = { c: Cita; top: number; height: number; lane: number; lanes: number };

function layoutDia(citas: Cita[], inicioMin: number): EvLayout[] {
  const evs = [...citas]
    .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
    .map((c) => {
      const start = toMin(c.hora_inicio);
      const end = start + Math.max(c.duracion_min, 20);
      return { c, start, end, lane: 0, lanes: 1 };
    });

  // Agrupar solapados en clústeres y asignar carriles
  const lanesEnd: number[] = [];
  let cluster: typeof evs = [];
  let clusterEnd = -1;
  const flush = () => {
    const n = Math.max(0, ...cluster.map((e) => e.lane)) + 1;
    cluster.forEach((e) => (e.lanes = n));
    cluster = [];
    lanesEnd.length = 0;
  };
  for (const e of evs) {
    if (cluster.length > 0 && e.start >= clusterEnd) flush();
    let lane = lanesEnd.findIndex((end) => end <= e.start);
    if (lane === -1) {
      lane = lanesEnd.length;
      lanesEnd.push(e.end);
    } else {
      lanesEnd[lane] = e.end;
    }
    e.lane = lane;
    clusterEnd = Math.max(clusterEnd, e.end);
    cluster.push(e);
  }
  if (cluster.length > 0) flush();

  return evs.map(({ c, start, end, lane, lanes }) => ({
    c,
    top: (start - inicioMin) * PX_MIN,
    height: (end - start) * PX_MIN,
    lane,
    lanes,
  }));
}

function useAhora() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return ahora;
}

function TimeGrid({
  citas,
  fecha,
  dias,
  onDetalle,
  onAgendar,
  onSelectDay,
}: {
  citas: Cita[];
  fecha: string;
  dias: 1 | 7;
  onDetalle: (c: Cita) => void;
  onAgendar: (fecha: string, hora: string) => void;
  onSelectDay: (fecha: string) => void;
}) {
  const ahora = useAhora();
  const hoy = format(ahora, "yyyy-MM-dd");

  const columnas = useMemo(() => {
    if (dias === 1) return [{ iso: fecha, dia: new Date(`${fecha}T12:00:00`) }];
    const lunes = startOfWeek(new Date(`${fecha}T12:00:00`), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(lunes, i);
      return { iso: format(d, "yyyy-MM-dd"), dia: d };
    });
  }, [fecha, dias]);

  // Rango horario: 07:00–20:00, ampliado si hay citas fuera
  const [inicioMin, finMin] = useMemo(() => {
    let min = 7 * 60;
    let max = 20 * 60;
    for (const c of citas) {
      const s = toMin(c.hora_inicio);
      min = Math.min(min, Math.floor(s / 60) * 60);
      max = Math.max(max, Math.ceil((s + c.duracion_min) / 60) * 60);
    }
    return [min, max];
  }, [citas]);

  const horas = useMemo(
    () => Array.from({ length: (finMin - inicioMin) / 60 }, (_, i) => inicioMin / 60 + i),
    [inicioMin, finMin]
  );
  const altura = (finMin - inicioMin) * PX_MIN;
  const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
  const mostrarAhora = ahoraMin >= inicioMin && ahoraMin <= finMin;

  function clickColumna(e: React.MouseEvent<HTMLDivElement>, iso: string) {
    // Solo huecos libres: los bloques de cita detienen la propagación
    const rect = e.currentTarget.getBoundingClientRect();
    const min = inicioMin + (e.clientY - rect.top) / PX_MIN;
    const snapped = Math.round(min / SNAP_MIN) * SNAP_MIN;
    onAgendar(iso, toHHMM(Math.max(inicioMin, Math.min(snapped, finMin - SNAP_MIN))));
  }

  return (
    <Card className="animate-fade-in overflow-hidden">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <div className={cn(dias === 7 && "min-w-[860px]")}>
            {/* Encabezados de día */}
            <div
              className="grid border-b"
              style={{ gridTemplateColumns: `3.5rem repeat(${dias}, 1fr)` }}
            >
              <div />
              {columnas.map(({ iso, dia }) => (
                <button
                  key={iso}
                  onClick={() => onSelectDay(iso)}
                  className={cn(
                    "group flex items-center justify-center gap-2 border-l py-2 text-sm capitalize transition-colors hover:bg-accent",
                    iso === hoy ? "font-semibold text-primary" : "text-muted-foreground"
                  )}
                  title={dias === 7 ? "Ver día" : undefined}
                >
                  {format(dia, dias === 7 ? "EEE d" : "EEEE d 'de' MMMM", { locale: es })}
                  {iso === hoy && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-glow" />
                  )}
                </button>
              ))}
            </div>

            {/* Cuerpo de la grilla */}
            <div
              className="relative grid"
              style={{ gridTemplateColumns: `3.5rem repeat(${dias}, 1fr)`, height: altura }}
            >
              {/* Gutter de horas */}
              <div className="relative">
                {horas.map((h, i) => (
                  <span
                    key={h}
                    className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground tabular-nums"
                    style={{ top: i * 60 * PX_MIN }}
                  >
                    {i > 0 && `${String(h).padStart(2, "0")}:00`}
                  </span>
                ))}
              </div>

              {columnas.map(({ iso }) => {
                const evs = layoutDia(
                  citas.filter((c) => c.fecha === iso),
                  inicioMin
                );
                return (
                  <div
                    key={iso}
                    className="group/col relative cursor-pointer border-l"
                    onClick={(e) => clickColumna(e, iso)}
                    title="Clic en un espacio libre para agendar"
                  >
                    {/* Líneas de hora y media hora */}
                    {horas.map((h, i) => (
                      <div key={h}>
                        {i > 0 && (
                          <div
                            className="absolute inset-x-0 border-t"
                            style={{ top: i * 60 * PX_MIN }}
                          />
                        )}
                        <div
                          className="absolute inset-x-0 border-t border-dashed border-border/50"
                          style={{ top: (i * 60 + 30) * PX_MIN }}
                        />
                      </div>
                    ))}

                    {/* Línea de "ahora" */}
                    {iso === hoy && mostrarAhora && (
                      <div
                        className="pointer-events-none absolute inset-x-0 z-10"
                        style={{ top: (ahoraMin - inicioMin) * PX_MIN }}
                      >
                        <div className="relative border-t-2 border-primary shadow-glow">
                          <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-primary" />
                        </div>
                      </div>
                    )}

                    {/* Eventos */}
                    {evs.map(({ c, top, height, lane, lanes }) => (
                      <Tooltip key={c.id}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDetalle(c);
                            }}
                            className={cn(
                              "absolute z-[5] overflow-hidden rounded-md border border-l-2 px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm transition-all duration-200 hover:z-20 hover:scale-[1.02] hover:shadow-md",
                              APPOINTMENT_STATUS_COLORS[c.status],
                              STATUS_EDGE[c.status],
                              !citaActiva(c) && "opacity-60",
                              c.status === "cancelada" && "line-through"
                            )}
                            style={{
                              top: top + 1,
                              height: Math.max(height - 2, 20),
                              left: `calc(${(lane / lanes) * 100}% + 2px)`,
                              width: `calc(${100 / lanes}% - 4px)`,
                            }}
                          >
                            <span className="font-semibold tabular-nums">
                              {c.hora_inicio.slice(0, 5)}
                            </span>{" "}
                            {c.paciente}
                            {height >= 40 && c.motivo && (
                              <span className="block truncate opacity-75">{c.motivo}</span>
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side={dias === 7 ? "right" : "top"}>
                          <CitaBubble cita={c} />
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Vista lista: agenda del día agrupada por hora
// ─────────────────────────────────────────────────────────────
function ListaView({
  citas,
  onDetalle,
  onReprogramar,
  onCancelar,
}: {
  citas: Cita[];
  onDetalle: (c: Cita) => void;
  onReprogramar: (c: Cita) => void;
  onCancelar: (c: Cita) => void;
}) {
  const porHora = useMemo(() => {
    const map = new Map<number, Cita[]>();
    for (const c of citas) {
      const h = Number(c.hora_inicio.slice(0, 2));
      map.set(h, [...(map.get(h) ?? []), c]);
    }
    return map;
  }, [citas]);

  if (citas.length === 0) {
    return (
      <Card className="animate-fade-in">
        <CardContent className="py-16 text-center">
          <CalendarDays className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Sin citas para este día. Presiona{" "}
            <kbd className="rounded border bg-muted px-1.5 font-mono text-xs">N</kbd> para agendar.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="stagger space-y-1">
      {[...porHora.keys()]
        .sort((a, b) => a - b)
        .map((h) => (
          <div key={h} className="grid grid-cols-[3.5rem_1fr] gap-3">
            <div className="pt-2 text-right text-xs font-medium text-muted-foreground tabular-nums">
              {String(h).padStart(2, "0")}:00
            </div>
            <div className="min-h-9 space-y-2 border-l pl-3 pb-2">
              {(porHora.get(h) ?? []).map((c) => (
                <CitaRow
                  key={c.id}
                  cita={c}
                  onDetalle={onDetalle}
                  onReprogramar={onReprogramar}
                  onCancelar={onCancelar}
                />
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

function CitaRow({
  cita: c,
  onDetalle,
  onReprogramar,
  onCancelar,
}: {
  cita: Cita;
  onDetalle: (c: Cita) => void;
  onReprogramar: (c: Cita) => void;
  onCancelar: (c: Cita) => void;
}) {
  const { pending, setStatus, checkIn } = useCitaActions(c);
  const activa = citaActiva(c);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          onClick={() => onDetalle(c)}
          onKeyDown={(e) => e.key === "Enter" && onDetalle(c)}
          className={cn(
            "flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-l-2 bg-card p-3 shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md",
            STATUS_EDGE[c.status],
            !activa && "opacity-60"
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 text-center">
              <p className="font-mono text-sm font-semibold tabular-nums">
                {c.hora_inicio.slice(0, 5)}
              </p>
              <p className="text-[10px] text-muted-foreground">{c.duracion_min} min</p>
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium">
                {c.paciente}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {c.tipo_documento} {c.numero_documento} · {calcAge(c.fecha_nacimiento)}
                </span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {c.motivo || "Sin motivo registrado"}
                {c.study_ids.length > 0 &&
                  ` · ${c.study_ids.length} estudio${c.study_ids.length !== 1 ? "s" : ""}`}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge className={APPOINTMENT_STATUS_COLORS[c.status]}>
              {APPOINTMENT_STATUS_LABELS[c.status]}
            </Badge>
            <span className="hidden text-xs text-muted-foreground lg:inline">
              {APPOINTMENT_CHANNEL_LABELS[c.canal] ?? c.canal}
            </span>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  {activa && (
                    <>
                      <DropdownMenuItem onClick={checkIn}>
                        <ClipboardList className="h-4 w-4" /> Check-in / Generar orden
                      </DropdownMenuItem>
                      {c.status === "programada" && (
                        <DropdownMenuItem onClick={() => setStatus("confirmada")}>
                          Confirmar asistencia
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => setStatus("en_espera")}>
                        Marcar en espera
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onReprogramar(c)}>
                        Reprogramar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setStatus("no_asistio")}>
                        No asistió
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onCancelar(c)} className="text-red-600">
                        Cancelar cita
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem asChild>
                    <Link href={`/pacientes/${c.patient_id}`}>
                      <User className="h-4 w-4" /> Ver paciente
                    </Link>
                  </DropdownMenuItem>
                  {c.order_id && (
                    <DropdownMenuItem asChild>
                      <Link href={`/ordenes/${c.order_id}`}>
                        <ClipboardList className="h-4 w-4" /> Orden {c.order_codigo}
                      </Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        <CitaBubble cita={c} />
      </TooltipContent>
    </Tooltip>
  );
}

// ─────────────────────────────────────────────────────────────
// Detalle de cita (clic sobre un evento del calendario)
// ─────────────────────────────────────────────────────────────
function DetalleDialog({
  cita: c,
  onClose,
  onReprogramar,
  onCancelar,
}: {
  cita: Cita | null;
  onClose: () => void;
  onReprogramar: (c: Cita) => void;
  onCancelar: (c: Cita) => void;
}) {
  const { pending, setStatus, checkIn } = useCitaActions(c, onClose);
  if (!c) return null;
  const activa = citaActiva(c);
  const fin = toHHMM(toMin(c.hora_inicio) + c.duracion_min);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3 pr-6">
            {c.paciente}
            <Badge className={APPOINTMENT_STATUS_COLORS[c.status]}>
              {APPOINTMENT_STATUS_LABELS[c.status]}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2.5 text-sm">
          <p className="text-xs text-muted-foreground">
            {c.tipo_documento} {c.numero_documento} · {calcAge(c.fecha_nacimiento)}
          </p>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="capitalize">
              {format(new Date(`${c.fecha}T12:00:00`), "EEEE d 'de' MMMM", { locale: es })}
            </span>
            · {c.hora_inicio.slice(0, 5)}–{fin} ({c.duracion_min} min)
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            {APPOINTMENT_CHANNEL_LABELS[c.canal] ?? c.canal}
          </div>
          {c.motivo && (
            <div className="flex items-start gap-2">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              {c.motivo}
            </div>
          )}
          {c.medico_solicitante && (
            <div className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-primary" />
              {c.medico_solicitante}
            </div>
          )}
          {c.telefono && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              {c.telefono}
            </div>
          )}
          {c.notas && <p className="rounded-md bg-muted p-2 text-xs">{c.notas}</p>}
          <p className="text-xs text-muted-foreground">
            {c.study_ids.length > 0
              ? `${c.study_ids.length} estudio${c.study_ids.length !== 1 ? "s" : ""} preseleccionado${c.study_ids.length !== 1 ? "s" : ""}`
              : "Sin estudios preseleccionados"}
          </p>
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/pacientes/${c.patient_id}`}>
                <User className="h-4 w-4" /> Paciente
              </Link>
            </Button>
            {c.order_id && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/ordenes/${c.order_id}`}>
                  <ClipboardList className="h-4 w-4" /> {c.order_codigo}
                </Link>
              </Button>
            )}
          </div>
          {activa && (
            <div className="flex flex-wrap gap-2">
              {c.status === "programada" && (
                <Button variant="outline" size="sm" onClick={() => setStatus("confirmada")} disabled={pending}>
                  Confirmar
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => onReprogramar(c)} disabled={pending}>
                Reprogramar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-600"
                onClick={() => onCancelar(c)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button size="sm" onClick={checkIn} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} Check-in
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Diálogos de reprogramación y cancelación
// ─────────────────────────────────────────────────────────────
function ReprogramarDialog({ cita, onClose }: { cita: Cita | null; onClose: () => void }) {
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (cita) {
      setFecha(cita.fecha);
      setHora(cita.hora_inicio.slice(0, 5));
    }
  }, [cita]);

  function submit() {
    if (!cita || !fecha || !hora) return;
    startTransition(async () => {
      const res = await rescheduleAppointmentAction(cita.id, fecha, hora);
      if ("error" in res && res.error) return void toast.error(res.error);
      toast.success("Cita reprogramada");
      onClose();
    });
  }

  return (
    <Dialog open={!!cita} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reprogramar cita</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{cita?.paciente}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="rep-fecha">Fecha</Label>
            <Input id="rep-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rep-hora">Hora</Label>
            <Input id="rep-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelarDialog({ cita, onClose }: { cita: Cita | null; onClose: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (cita) setMotivo("");
  }, [cita]);

  function submit() {
    if (!cita) return;
    startTransition(async () => {
      const res = await updateAppointmentStatusAction(cita.id, "cancelada", motivo || undefined);
      if ("error" in res && res.error) return void toast.error(res.error);
      toast.success("Cita cancelada");
      onClose();
    });
  }

  return (
    <Dialog open={!!cita} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancelar cita</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {cita?.paciente} · {cita?.fecha} {cita?.hora_inicio.slice(0, 5)}
        </p>
        <div className="space-y-2">
          <Label htmlFor="cancel-motivo">Motivo (opcional)</Label>
          <Textarea
            id="cancel-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej. el paciente reprogramará"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Volver</Button>
          <Button variant="destructive" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Cancelar cita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
