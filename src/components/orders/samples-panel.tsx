"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TestTube2, Plus, Loader2, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createSampleAction, updateSampleStatusAction } from "@/lib/actions/orders";
import { hasRole } from "@/lib/auth/roles";
import { cn, formatDate } from "@/lib/utils";
import type { ItemStatus, Role } from "@/lib/database.types";

type Item = { id: string; nombre: string; status: ItemStatus };
type Sample = {
  id: string;
  barcode: string;
  status: string;
  statusLabel: string;
  tipo: string;
  tomada_at: string | null;
};

export function SamplesPanel({
  orderId,
  items,
  samples,
  roles,
}: {
  orderId: string;
  items: Item[];
  samples: Sample[];
  roles: Role[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const canTake = hasRole(roles, ["org_admin", "sede_admin", "recepcion", "toma_muestra", "analista"]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function createSample() {
    if (selected.size === 0) return toast.error("Selecciona estudios para la muestra");
    start(async () => {
      const r = await createSampleAction(orderId, [...selected]);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Muestra registrada");
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  function advance(sampleId: string, status: "recibida" | "en_analisis" | "procesada") {
    start(async () => {
      const r = await updateSampleStatusAction(sampleId, status);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Muestra actualizada");
        router.refresh();
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {canTake && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TestTube2 className="h-4 w-4 text-primary" /> Registrar toma de muestra
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Selecciona los estudios que cubre esta muestra.
            </p>
            <div className="space-y-2">
              {items.map((it) => (
                <button
                  key={it.id}
                  onClick={() => toggle(it.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm",
                    selected.has(it.id) ? "border-primary bg-primary/5" : "hover:bg-accent"
                  )}
                >
                  {it.nombre}
                  <span
                    className={cn(
                      "h-4 w-4 rounded-full border",
                      selected.has(it.id) && "border-primary bg-primary"
                    )}
                  />
                </button>
              ))}
            </div>
            <Button onClick={createSample} disabled={pending} className="w-full">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Generar muestra
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className={cn(!canTake && "lg:col-span-2")}>
        <CardHeader>
          <CardTitle className="text-base">Muestras de la orden</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {samples.length === 0 && (
            <p className="text-sm text-muted-foreground">Aún no se han tomado muestras.</p>
          )}
          {samples.map((s) => (
            <div key={s.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-mono text-sm">
                  <PackageCheck className="h-4 w-4 text-muted-foreground" />
                  {s.barcode}
                </div>
                <Badge className="bg-muted text-foreground">{s.statusLabel}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {s.tipo} · {formatDate(s.tomada_at, true)}
              </p>
              {canTake && s.status !== "procesada" && s.status !== "rechazada" && (
                <div className="mt-2 flex gap-2">
                  {(s.status === "tomada" || s.status === "en_transito") && (
                    <Button size="sm" variant="outline" onClick={() => advance(s.id, "recibida")} disabled={pending}>
                      Recibir
                    </Button>
                  )}
                  {s.status === "recibida" && (
                    <Button size="sm" variant="outline" onClick={() => advance(s.id, "en_analisis")} disabled={pending}>
                      En análisis
                    </Button>
                  )}
                  {s.status === "en_analisis" && (
                    <Button size="sm" variant="outline" onClick={() => advance(s.id, "procesada")} disabled={pending}>
                      Procesada
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
