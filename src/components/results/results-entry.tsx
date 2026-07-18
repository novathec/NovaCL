"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, ShieldCheck, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  saveResultsAction,
  validateResultsAction,
  type CriticalValue,
  type ResultInput,
} from "@/lib/actions/results";
import type { FinalizeSummary } from "@/lib/automation";
import { FLAG_LABELS, FLAG_COLORS, ITEM_STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ItemStatus, ResultFlag, ResultStatus } from "@/lib/database.types";

export type AnalyteRow = {
  analyteId: string;
  nombre: string;
  unidad: string | null;
  valueType: string;
  opciones: string[] | null;
  valorNum: number | null;
  valorTexto: string | null;
  flag: ResultFlag | null;
  rango: string | null;
  status: ResultStatus | null;
};

export type ItemGroup = {
  orderItemId: string;
  studyNombre: string;
  status: ItemStatus;
  analytes: AnalyteRow[];
};

export function ResultsEntry({
  orderId,
  groups,
  canValidate,
}: {
  orderId: string;
  groups: ItemGroup[];
  canValidate: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [criticos, setCriticos] = useState<CriticalValue[]>([]);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const g of groups) {
      for (const a of g.analytes) {
        const key = `${g.orderItemId}:${a.analyteId}`;
        init[key] = a.valueType === "numerico"
          ? a.valorNum?.toString() ?? ""
          : a.valorTexto ?? "";
      }
    }
    return init;
  });

  function collect(): ResultInput[] {
    const inputs: ResultInput[] = [];
    for (const g of groups) {
      for (const a of g.analytes) {
        const key = `${g.orderItemId}:${a.analyteId}`;
        const raw = values[key]?.trim() ?? "";
        if (raw === "") continue;
        inputs.push({
          orderItemId: g.orderItemId,
          analyteId: a.analyteId,
          valorNum: a.valueType === "numerico" ? Number(raw) : null,
          valorTexto: a.valueType === "numerico" ? null : raw,
        });
      }
    }
    return inputs;
  }

  function run(validate: boolean) {
    const inputs = collect();
    if (inputs.length === 0) {
      toast.error("Ingresa al menos un valor");
      return;
    }
    start(async () => {
      const res = validate
        ? await validateResultsAction(orderId, inputs)
        : await saveResultsAction(orderId, inputs);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(validate ? "Resultados validados" : "Resultados guardados");

      // Alerta activa de valores críticos: requiere confirmación explícita.
      if (res.criticos && res.criticos.length > 0) setCriticos(res.criticos);

      // Efectos de la automatización al completar la orden
      const auto = ("automation" in res ? res.automation : undefined) as
        | FinalizeSummary
        | undefined;
      if (auto?.reportVersion) {
        toast.success(`Informe v${auto.reportVersion} archivado en el repositorio`);
      }
      if (auto?.reportError) {
        toast.warning(`Informe no archivado: ${auto.reportError}`);
      }
      if (auto?.invoice === "emitida") toast.success("Comprobante emitido automáticamente");
      if (auto?.invoice === "error") toast.warning("La auto-facturación falló; emite manualmente desde Facturación");
      if (auto?.delivery === "enviada") toast.success("Resultados enviados al paciente");
      if (auto?.delivery === "error") toast.warning("La auto-entrega falló; envía manualmente desde Entrega");

      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <Card key={g.orderItemId}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{g.studyNombre}</CardTitle>
            <Badge className="bg-muted text-foreground">{ITEM_STATUS_LABELS[g.status]}</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[32%]">Analito</TableHead>
                  <TableHead className="w-[24%]">Resultado</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Indicador</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.analytes.map((a) => {
                  const key = `${g.orderItemId}:${a.analyteId}`;
                  const locked = a.status === "validado";
                  return (
                    <TableRow key={a.analyteId}>
                      <TableCell className="font-medium">{a.nombre}</TableCell>
                      <TableCell>
                        {a.valueType === "opcion" && a.opciones ? (
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
                            value={values[key] ?? ""}
                            disabled={locked}
                            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                          >
                            <option value="">—</option>
                            {a.opciones.map((op) => (
                              <option key={op} value={op}>
                                {op}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            type={a.valueType === "numerico" ? "number" : "text"}
                            step="any"
                            value={values[key] ?? ""}
                            disabled={locked}
                            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                            className={cn(locked && "opacity-70")}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.unidad ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.rango ?? "—"}</TableCell>
                      <TableCell>
                        {a.flag ? (
                          <span className={cn("text-sm", FLAG_COLORS[a.flag])}>{FLAG_LABELS[a.flag]}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {g.analytes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-4 text-center text-sm text-muted-foreground">
                      Este estudio no tiene analitos configurados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      <div className="sticky bottom-4 flex justify-end gap-2 rounded-lg border bg-card/90 p-3 shadow-lg backdrop-blur">
        <Button variant="outline" onClick={() => run(false)} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar borrador
        </Button>
        {canValidate && (
          <Button onClick={() => run(true)} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Validar y firmar
          </Button>
        )}
      </div>

      {/* Alerta bloqueante de valores críticos */}
      <Dialog open={criticos.length > 0} onOpenChange={(o) => !o && setCriticos([])}>
        <DialogContent className="max-w-md border-red-300 dark:border-red-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5 animate-pulse-glow rounded-full" />
              Valores críticos detectados
            </DialogTitle>
          </DialogHeader>
          <ul className="space-y-2">
            {criticos.map((c, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm dark:border-red-900 dark:bg-red-950/40"
              >
                <span className="font-medium">{c.analito}</span>
                <span className="font-mono text-red-700 dark:text-red-300">{c.valor}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            El protocolo de valores críticos exige comunicar estos resultados al médico
            solicitante de inmediato y dejar constancia en la nota del resultado.
          </p>
          <DialogFooter>
            <Button variant="destructive" onClick={() => setCriticos([])}>
              Entendido, notificaré al médico
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
