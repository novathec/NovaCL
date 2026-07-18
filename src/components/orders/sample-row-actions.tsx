"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateSampleStatusAction } from "@/lib/actions/orders";
import type { SampleStatus } from "@/lib/database.types";

const NEXT: Partial<Record<SampleStatus, { to: "recibida" | "en_analisis" | "procesada"; label: string }>> = {
  tomada: { to: "recibida", label: "Recibir" },
  en_transito: { to: "recibida", label: "Recibir" },
  recibida: { to: "en_analisis", label: "En análisis" },
  en_analisis: { to: "procesada", label: "Procesar" },
};

// Una muestra puede rechazarse mientras no haya terminado su procesamiento.
const REJECTABLE: SampleStatus[] = ["tomada", "en_transito", "recibida", "en_analisis"];

// Catálogo estandarizado de motivos de rechazo pre-analítico (CLSI GP33)
const REJECT_REASONS = [
  "Muestra hemolizada",
  "Muestra coagulada",
  "Volumen insuficiente",
  "Tubo incorrecto",
  "Sin identificación / mal rotulada",
  "Muestra derramada o contaminada",
  "Tiempo de traslado excedido",
  "Ayuno no cumplido",
  "Otro",
] as const;

export function SampleRowActions({ sampleId, status }: { sampleId: string; status: SampleStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [openReject, setOpenReject] = useState(false);
  const [razon, setRazon] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const next = NEXT[status];
  const rejectable = REJECTABLE.includes(status);
  if (!next && !rejectable) return null;

  function advance() {
    if (!next) return;
    start(async () => {
      const r = await updateSampleStatusAction(sampleId, next.to);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Muestra actualizada");
        router.refresh();
      }
    });
  }

  function reject() {
    if (!razon) {
      toast.error("Selecciona el motivo del rechazo");
      return;
    }
    if (razon === "Otro" && !motivo.trim()) {
      toast.error("Describe el motivo del rechazo");
      return;
    }
    const detalle =
      razon === "Otro" ? motivo.trim() : motivo.trim() ? `${razon} — ${motivo.trim()}` : razon;
    start(async () => {
      const r = await updateSampleStatusAction(sampleId, "rechazada", detalle);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Muestra rechazada; solicita nueva toma");
        setOpenReject(false);
        setRazon("");
        setMotivo("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      {next && (
        <Button size="sm" variant="outline" disabled={pending} onClick={advance}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {next.label}
        </Button>
      )}
      {rejectable && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => setOpenReject(true)}
          className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
          title="Rechazar muestra"
        >
          <XCircle className="h-4 w-4" /> Rechazar
        </Button>
      )}

      <Dialog open={openReject} onOpenChange={(o) => !o && setOpenReject(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <XCircle className="h-5 w-5" /> Rechazar muestra
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            La muestra quedará marcada como rechazada y el equipo de toma deberá
            recolectar una nueva. El motivo queda registrado en la trazabilidad.
          </p>
          <div className="space-y-2">
            <Label htmlFor="razon-rechazo">Motivo del rechazo</Label>
            <select
              id="razon-rechazo"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={razon}
              onChange={(e) => setRazon(e.target.value)}
              autoFocus
            >
              <option value="">Selecciona un motivo…</option>
              {REJECT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="motivo-rechazo">
              {razon === "Otro" ? "Describe el motivo" : "Detalle adicional (opcional)"}
            </Label>
            <Textarea
              id="motivo-rechazo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={
                razon === "Otro"
                  ? "Describe el motivo del rechazo…"
                  : "Ej. hemólisis visible tras centrifugado…"
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenReject(false)}>
              Volver
            </Button>
            <Button variant="destructive" onClick={reject} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Rechazar muestra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
