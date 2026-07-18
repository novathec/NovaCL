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

export function SampleRowActions({ sampleId, status }: { sampleId: string; status: SampleStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [openReject, setOpenReject] = useState(false);
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
    if (!motivo.trim()) {
      toast.error("Indica el motivo del rechazo");
      return;
    }
    start(async () => {
      const r = await updateSampleStatusAction(sampleId, "rechazada", motivo.trim());
      if (r.error) toast.error(r.error);
      else {
        toast.success("Muestra rechazada; solicita nueva toma");
        setOpenReject(false);
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
            <Label htmlFor="motivo-rechazo">Motivo del rechazo</Label>
            <Textarea
              id="motivo-rechazo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. hemólisis, volumen insuficiente, tubo incorrecto…"
              autoFocus
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
