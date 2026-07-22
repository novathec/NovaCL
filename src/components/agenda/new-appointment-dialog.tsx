"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Search, X } from "lucide-react";
import { searchPatientsAction } from "@/lib/actions/patients";
import { createAppointmentAction } from "@/lib/actions/appointments";
import { Button } from "@/components/ui/button";
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
import { ProfessionalPicker } from "@/components/professionals/professional-picker";
import { cn, calcAge } from "@/lib/utils";

export type StudyLite = { id: string; codigo: string; nombre: string };

type PatientLite = {
  id: string;
  nombres: string;
  apellidos: string;
  tipo_documento: string;
  numero_documento: string;
  sexo: string;
  fecha_nacimiento: string | null;
};

const DURACIONES = [10, 15, 20, 30, 45, 60];

export function NewAppointmentDialog({
  open,
  onOpenChange,
  fechaInicial,
  horaInicial,
  studies,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fechaInicial: string;
  horaInicial?: string;
  studies: StudyLite[];
}) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  // Paso 1: paciente (búsqueda navegable con teclado)
  const [patient, setPatient] = useState<PatientLite | null>(null);
  const [results, setResults] = useState<PatientLite[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [searching, startSearch] = useTransition();

  // Paso 2: detalle de la cita
  const [fecha, setFecha] = useState(fechaInicial);
  const [hora, setHora] = useState("09:00");
  const [duracion, setDuracion] = useState("15");
  const [canal, setCanal] = useState("presencial");
  const [motivo, setMotivo] = useState("");
  const [medico, setMedico] = useState("");
  const [medicoId, setMedicoId] = useState<string | null>(null);
  const [notas, setNotas] = useState("");
  const [studyFilter, setStudyFilter] = useState("");
  const [selStudies, setSelStudies] = useState<Set<string>>(new Set());
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (open) {
      setPatient(null);
      setResults([]);
      setActiveIdx(0);
      setFecha(fechaInicial);
      setHora(horaInicial ?? "09:00");
      setDuracion("15");
      setCanal("presencial");
      setMotivo("");
      setMedico("");
      setMedicoId(null);
      setNotas("");
      setStudyFilter("");
      setSelStudies(new Set());
      // enfocar la búsqueda al abrir (tras montar el dialog)
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open, fechaInicial, horaInicial]);

  function onSearch(q: string) {
    startSearch(async () => {
      setResults(await searchPatientsAction(q));
      setActiveIdx(0);
    });
  }

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = results[activeIdx];
      if (p) {
        setPatient(p);
        setResults([]);
      }
    }
  }

  const filteredStudies = useMemo(() => {
    const q = studyFilter.trim().toLowerCase();
    const list = q
      ? studies.filter(
          (s) => s.nombre.toLowerCase().includes(q) || s.codigo.toLowerCase().includes(q)
        )
      : studies;
    return list.slice(0, 30);
  }, [studies, studyFilter]);

  function toggleStudy(id: string) {
    setSelStudies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    if (!patient) return void toast.error("Selecciona un paciente");
    if (!fecha || !hora) return void toast.error("Completa fecha y hora");
    startSaving(async () => {
      const res = await createAppointmentAction({
        patient_id: patient.id,
        fecha,
        hora_inicio: hora,
        duracion_min: Number(duracion),
        canal: canal as "presencial" | "telefono" | "whatsapp" | "web",
        motivo,
        medico_solicitante: medico,
        medico_solicitante_id: medicoId ?? "",
        notas,
        study_ids: [...selStudies],
      });
      if ("error" in res && res.error) return void toast.error(res.error);
      if ("overlap" in res && res.overlap) {
        toast.warning("Cita creada, pero se solapa con otra cita del mismo horario.");
      } else {
        toast.success("Cita agendada");
      }
      onOpenChange(false);
      router.push(`/agenda?fecha=${fecha}&vista=dia` as never);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva cita</DialogTitle>
        </DialogHeader>

        {/* Paciente */}
        {patient ? (
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
            <div>
              <p className="font-medium">
                {patient.nombres} {patient.apellidos}
              </p>
              <p className="text-sm text-muted-foreground">
                {patient.tipo_documento} {patient.numero_documento} · {calcAge(patient.fecha_nacimiento)}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setPatient(null)}>
              <X className="h-4 w-4" /> Cambiar
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                className="pl-9"
                placeholder="Buscar paciente por nombre o documento… (↑↓ y Enter)"
                onChange={(e) => onSearch(e.target.value)}
                onKeyDown={onSearchKey}
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            {results.length > 0 && (
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-1">
                {results.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPatient(p);
                      setResults([]);
                    }}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm",
                      i === activeIdx ? "bg-accent" : "hover:bg-accent/50"
                    )}
                  >
                    <span>
                      {p.apellidos}, {p.nombres}
                    </span>
                    <span className="text-muted-foreground">{p.numero_documento}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              ¿Paciente nuevo? Regístralo primero en la sección Pacientes.
            </p>
          </div>
        )}

        {/* Fecha / hora / duración / canal */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="cita-fecha">Fecha</Label>
            <Input id="cita-fecha" type="date" min={new Date().toLocaleDateString("en-CA")} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cita-hora">Hora</Label>
            <Input id="cita-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Duración</Label>
            <Select value={duracion} onValueChange={setDuracion}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURACIONES.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d} min
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Canal</Label>
            <Select value={canal} onValueChange={setCanal}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="presencial">Presencial</SelectItem>
                <SelectItem value="telefono">Teléfono</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="web">Web</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="cita-motivo">Motivo</Label>
            <Input
              id="cita-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. perfil lipídico anual"
            />
          </div>
          <div className="space-y-2">
            <Label>Médico solicitante</Label>
            <ProfessionalPicker
              value={medicoId}
              onChange={(id) => setMedicoId(id)}
              freeText={medico}
              onFreeTextChange={(t) => setMedico(t)}
            />
            <Input
              value={medico}
              onChange={(e) => setMedico(e.target.value)}
              placeholder="O escribe manualmente…"
              className="text-sm"
            />
          </div>
        </div>

        {/* Estudios preseleccionados (opcional) */}
        <div className="space-y-2">
          <Label>
            Estudios (opcional{selStudies.size > 0 && ` · ${selStudies.size} seleccionados`})
          </Label>
          <Input
            value={studyFilter}
            onChange={(e) => setStudyFilter(e.target.value)}
            placeholder="Filtrar estudios…"
          />
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-1">
            {filteredStudies.map((s) => {
              const active = selStudies.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleStudy(s.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm",
                    active ? "bg-primary/10 text-primary" : "hover:bg-accent"
                  )}
                >
                  <span className="truncate">{s.nombre}</span>
                  <span className="ml-2 flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {s.codigo}
                    {active && <Check className="h-3.5 w-3.5 text-primary" />}
                  </span>
                </button>
              );
            })}
            {filteredStudies.length === 0 && (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">Sin coincidencias.</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Si preseleccionas estudios, el check-in genera la orden automáticamente.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cita-notas">Notas internas</Label>
          <Textarea
            id="cita-notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Indicaciones de ayuno, preparación, etc."
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Agendar cita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
