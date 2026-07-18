"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FileStack, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { generateConsolidatedReportAction } from "@/lib/actions/reports";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type EligibleOrder = {
  id: string;
  codigo: string;
  created_at: string;
  items_validados: number;
  items_total: number;
};

/**
 * Selección de órdenes con resultados validados para emitir un único PDF
 * consolidado (formato ISO 15189) que conserva fechas y metadatos por orden.
 */
export function ConsolidatedReportCard({
  patientId,
  orders,
}: {
  patientId: string;
  orders: EligibleOrder[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (orders.length === 0) return null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function generate() {
    start(async () => {
      const res = await generateConsolidatedReportAction(patientId, [...selected]);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("url" in res && res.url) {
        setLastUrl(res.url);
        toast.success(`Informe ${res.reportId} generado`);
        window.open(res.url, "_blank", "noopener");
      }
    });
  }

  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileStack className="h-4 w-4 text-primary" /> Informe consolidado
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Combina los resultados validados de varias atenciones en un solo PDF,
          conservando la fecha, muestras y validación de cada orden.
        </p>
        <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
          {orders.map((o) => (
            <label
              key={o.id}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-all duration-200",
                selected.has(o.id)
                  ? "border-primary bg-accent shadow-glow"
                  : "hover:border-primary/40"
              )}
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--primary)]"
                  checked={selected.has(o.id)}
                  onChange={() => toggle(o.id)}
                />
                <span className="font-mono text-xs font-semibold">{o.codigo}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDate(o.created_at)} · {o.items_validados}/{o.items_total} validados
              </span>
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={generate} disabled={pending || selected.size === 0}>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileStack className="h-4 w-4" />
            )}
            Generar PDF ({selected.size})
          </Button>
          {lastUrl && (
            <Button asChild size="sm" variant="ghost">
              <a href={lastUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" /> Abrir último informe
              </a>
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          El enlace de descarga es válido por 7 días. Los informes por orden
          siguen archivados de forma inmutable en cada atención.
        </p>
      </CardContent>
    </Card>
  );
}
