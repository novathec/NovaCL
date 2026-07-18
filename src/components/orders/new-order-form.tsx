"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Check, X, Loader2, UserCheck, ClipboardCheck, FlaskConical } from "lucide-react";
import { searchPatientsAction } from "@/lib/actions/patients";
import { createOrderAction } from "@/lib/actions/orders";
import { linkOrderToAppointmentAction } from "@/lib/actions/appointments";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn, formatMoney, calcAge } from "@/lib/utils";
import type { OrderPriority } from "@/lib/database.types";

export type StudyOption = {
  id: string;
  codigo: string;
  nombre: string;
  categoria: string;
  requiere_ayuno: boolean;
  precio: number;
};

type PatientLite = {
  id: string;
  nombres: string;
  apellidos: string;
  tipo_documento: string;
  numero_documento: string;
  sexo: string;
  fecha_nacimiento: string | null;
};

export function NewOrderForm({
  studies,
  initialPatient,
  citaId = null,
}: {
  studies: StudyOption[];
  initialPatient: PatientLite | null;
  citaId?: string | null;
}) {
  const router = useRouter();
  const [patient, setPatient] = useState<PatientLite | null>(initialPatient);
  const [results, setResults] = useState<PatientLite[]>([]);
  const [searching, startSearch] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [prioridad, setPrioridad] = useState<OrderPriority>("rutina");
  const [medico, setMedico] = useState("");
  const [diagnostico, setDiagnostico] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [saving, startSaving] = useTransition();

  const byCategory = useMemo(() => {
    const map = new Map<string, StudyOption[]>();
    for (const s of studies) {
      const arr = map.get(s.categoria) ?? [];
      arr.push(s);
      map.set(s.categoria, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [studies]);

  const total = useMemo(
    () => studies.filter((s) => selected.has(s.id)).reduce((sum, s) => sum + s.precio, 0),
    [studies, selected]
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSearch(q: string) {
    startSearch(async () => {
      setResults(await searchPatientsAction(q));
    });
  }

  function submit() {
    if (!patient) return toast.error("Selecciona un paciente");
    if (selected.size === 0) return toast.error("Selecciona al menos un estudio");
    startSaving(async () => {
      const res = await createOrderAction({
        patientId: patient.id,
        studyIds: [...selected],
        prioridad,
        medico,
        diagnostico,
        observaciones,
      });
      if (!("ok" in res)) {
        toast.error(res.error);
        return;
      }
      if (citaId && res.orderId) await linkOrderToAppointmentAction(citaId, res.orderId);
      toast.success(`Orden ${res.codigo} creada`);
      router.push(`/ordenes/${res.orderId}` as never);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {/* Paso 1: paciente */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCheck className="h-4 w-4 text-primary" /> 1. Paciente
            </CardTitle>
          </CardHeader>
          <CardContent>
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
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar por nombre o documento..."
                    onChange={(e) => onSearch(e.target.value)}
                  />
                  {searching && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
                <div className="max-h-60 space-y-1 overflow-y-auto">
                  {results.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setPatient(p);
                        setResults([]);
                      }}
                      className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span>
                        {p.apellidos}, {p.nombres}
                      </span>
                      <span className="text-muted-foreground">{p.numero_documento}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Paso 2: estudios */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-4 w-4 text-primary" /> 2. Estudios
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {byCategory.map(([categoria, items]) => (
              <div key={categoria}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {categoria}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {items.map((s) => {
                    const active = selected.has(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggle(s.id)}
                        className={cn(
                          "flex items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors",
                          active ? "border-primary bg-primary/5" : "hover:bg-accent"
                        )}
                      >
                        <div>
                          <p className="font-medium">{s.nombre}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.codigo}
                            {s.requiere_ayuno && " · Requiere ayuno"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{formatMoney(s.precio)}</span>
                          <span
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded-full border",
                              active ? "border-primary bg-primary text-primary-foreground" : "border-muted"
                            )}
                          >
                            {active && <Check className="h-3 w-3" />}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {studies.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No hay estudios en el catálogo. Configúralos en la sección Catálogo.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Resumen lateral */}
      <div className="space-y-6">
        <Card className="lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle className="text-base">Resumen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Prioridad</Label>
              <Select value={prioridad} onValueChange={(v) => setPrioridad(v as OrderPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rutina">Rutina</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                  <SelectItem value="stat">STAT (crítico)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="medico">Médico solicitante</Label>
              <Input id="medico" value={medico} onChange={(e) => setMedico(e.target.value)} placeholder="Dr(a)." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="diag">Diagnóstico / motivo</Label>
              <Input id="diag" value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="obs">Observaciones</Label>
              <Textarea id="obs" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm text-muted-foreground">
                {selected.size} estudio{selected.size !== 1 && "s"}
              </span>
              <Badge className="bg-primary/10 text-primary">{formatMoney(total)}</Badge>
            </div>

            <Button className="w-full" onClick={submit} disabled={saving}>
              {saving && <FlaskConical className="h-4 w-4 animate-flask-swirl" />}
              {saving ? "Registrando orden…" : "Crear orden"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
