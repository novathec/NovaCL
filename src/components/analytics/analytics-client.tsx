"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  Clock,
  Receipt,
  Users,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ColumnChart, HBarList, Meter, type Point } from "@/components/analytics/charts";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { formatMoney } from "@/lib/utils";
import type { InvoiceStatus, OrderStatus } from "@/lib/database.types";

export type AnalyticsData = {
  summary: {
    ordenes?: number;
    ingresos?: number;
    ticket_promedio?: number;
    pacientes_nuevos?: number;
    pacientes_atendidos?: number;
    resultados_criticos?: number;
    tat_horas?: number;
    citas_total?: number;
    citas_atendidas?: number;
    citas_no_asistio?: number;
    citas_canceladas?: number;
  };
  daily: { dia: string; ordenes: number; ingresos: number; citas: number }[];
  topStudies: { codigo: string; nombre: string; cantidad: number; ingresos: number }[];
  byCategory: { categoria: string; cantidad: number; ingresos: number }[];
  orderStatus: { status: OrderStatus; cantidad: number }[];
  bySede: {
    sede_id: string;
    sede: string;
    ordenes: number;
    ingresos: number;
    citas: number;
    tat_horas: number;
  }[];
  billing: { status: InvoiceStatus; cantidad: number; monto: number }[];
};

const RANGO_LABELS: Record<string, string> = {
  "7": "Últimos 7 días",
  "30": "Últimos 30 días",
  "90": "Últimos 90 días",
  "365": "Últimos 12 meses",
};

const INVOICE_LABELS: Record<InvoiceStatus, string> = {
  borrador: "Borrador",
  emitida: "Emitida",
  pagada: "Pagada",
  anulada: "Anulada",
  error_sync: "Error de sincronización",
};

function StatTile({
  title,
  value,
  icon: Icon,
  hint,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="h-4 w-4" /> {title}
        </div>
        <p className="mt-1.5 text-2xl font-semibold tracking-tight">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function AnalyticsClient({
  data,
  rango,
  sede,
  sedes,
  desde,
  hasta,
}: {
  data: AnalyticsData;
  rango: string;
  sede: string;
  sedes: { id: string; nombre: string }[];
  desde: string;
  hasta: string;
}) {
  const router = useRouter();
  const s = data.summary;

  function setFilter(next: { rango?: string; sede?: string }) {
    const r = next.rango ?? rango;
    const sd = next.sede ?? sede;
    router.push(`/analitica?rango=${r}&sede=${sd}` as never);
  }

  const dailyOrdenes: Point[] = useMemo(
    () =>
      data.daily.map((d) => ({
        label: format(new Date(`${d.dia}T12:00:00`), "d/M"),
        hint: format(new Date(`${d.dia}T12:00:00`), "EEE d MMM", { locale: es }),
        value: d.ordenes,
      })),
    [data.daily]
  );
  const dailyIngresos: Point[] = useMemo(
    () =>
      data.daily.map((d) => ({
        label: format(new Date(`${d.dia}T12:00:00`), "d/M"),
        hint: format(new Date(`${d.dia}T12:00:00`), "EEE d MMM", { locale: es }),
        value: Number(d.ingresos),
      })),
    [data.daily]
  );
  const dailyCitas: Point[] = useMemo(
    () =>
      data.daily.map((d) => ({
        label: format(new Date(`${d.dia}T12:00:00`), "d/M"),
        hint: format(new Date(`${d.dia}T12:00:00`), "EEE d MMM", { locale: es }),
        value: d.citas,
      })),
    [data.daily]
  );

  const citasTotal = s.citas_total ?? 0;
  const pctAtendidas = citasTotal > 0 ? ((s.citas_atendidas ?? 0) / citasTotal) * 100 : 0;
  const pctNoAsistio = citasTotal > 0 ? ((s.citas_no_asistio ?? 0) / citasTotal) * 100 : 0;

  return (
    <>
      <PageHeader
        title="Analítica"
        description={`Del ${format(new Date(`${desde}T12:00:00`), "d MMM yyyy", { locale: es })} al ${format(new Date(`${hasta}T12:00:00`), "d MMM yyyy", { locale: es })}`}
      />

      {/* Filtros: rango y sede en una sola fila */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Select value={rango} onValueChange={(v) => setFilter({ rango: v })}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(RANGO_LABELS).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sede} onValueChange={(v) => setFilter({ sede: v })}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las sedes</SelectItem>
            {sedes.map((sd) => (
              <SelectItem key={sd.id} value={sd.id}>
                {sd.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="resumen">
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="produccion">Producción</TabsTrigger>
          <TabsTrigger value="finanzas">Finanzas</TabsTrigger>
          <TabsTrigger value="sedes">Sedes</TabsTrigger>
        </TabsList>

        {/* ── Resumen: vista general ── */}
        <TabsContent value="resumen" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile title="Órdenes" value={s.ordenes ?? 0} icon={Activity} />
            <StatTile title="Ingresos" value={formatMoney(Number(s.ingresos ?? 0))} icon={Wallet} />
            <StatTile
              title="Pacientes atendidos"
              value={s.pacientes_atendidos ?? 0}
              icon={Users}
              hint={`${s.pacientes_nuevos ?? 0} nuevos en el periodo`}
            />
            <StatTile
              title="Tiempo de entrega (TAT)"
              value={`${s.tat_horas ?? 0} h`}
              icon={Clock}
              hint="Promedio de orden creada → validada"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCard title="Órdenes por día">
                <ColumnChart data={dailyOrdenes} />
              </ChartCard>
            </div>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarCheck className="h-4 w-4 text-primary" /> Agendamiento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {citasTotal} citas en el periodo · {s.citas_canceladas ?? 0} canceladas
                </p>
                <Meter value={pctAtendidas} label="Citas atendidas" />
                <Meter value={pctNoAsistio} label="Inasistencia (no-show)" />
                <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                  <span>
                    <strong>{s.resultados_criticos ?? 0}</strong> resultados críticos en el periodo
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Producción: detalle operativo ── */}
        <TabsContent value="produccion" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Estudios más solicitados">
              <HBarList
                data={data.topStudies.map((t) => ({
                  label: `${t.nombre} (${t.codigo})`,
                  value: Number(t.cantidad),
                  hint: formatMoney(Number(t.ingresos)),
                }))}
              />
            </ChartCard>
            <ChartCard title="Producción por categoría">
              <HBarList
                data={data.byCategory.map((c) => ({
                  label: c.categoria,
                  value: Number(c.cantidad),
                  hint: formatMoney(Number(c.ingresos)),
                }))}
              />
            </ChartCard>
            <ChartCard title="Órdenes por estado">
              <HBarList
                data={data.orderStatus.map((o) => ({
                  label: ORDER_STATUS_LABELS[o.status] ?? o.status,
                  value: Number(o.cantidad),
                }))}
              />
            </ChartCard>
            <ChartCard title="Citas por día">
              <ColumnChart data={dailyCitas} />
            </ChartCard>
          </div>
        </TabsContent>

        {/* ── Finanzas ── */}
        <TabsContent value="finanzas" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile title="Ingresos del periodo" value={formatMoney(Number(s.ingresos ?? 0))} icon={Wallet} />
            <StatTile
              title="Ticket promedio"
              value={formatMoney(Number(s.ticket_promedio ?? 0))}
              icon={BarChart3}
            />
            <StatTile
              title="Comprobantes emitidos"
              value={data.billing
                .filter((b) => b.status !== "borrador" && b.status !== "anulada")
                .reduce((sum, b) => sum + Number(b.cantidad), 0)}
              icon={Receipt}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Ingresos por día">
              <ColumnChart data={dailyIngresos} format={(v) => formatMoney(v)} />
            </ChartCard>
            <ChartCard title="Facturación electrónica por estado">
              <HBarList
                data={data.billing.map((b) => ({
                  label: INVOICE_LABELS[b.status] ?? b.status,
                  value: Number(b.monto),
                  hint: `${b.cantidad} comprobante${Number(b.cantidad) !== 1 ? "s" : ""}`,
                }))}
                format={(v) => formatMoney(v)}
                emptyText="Sin comprobantes en el periodo."
              />
            </ChartCard>
          </div>
        </TabsContent>

        {/* ── Sedes: comparativa ── */}
        <TabsContent value="sedes" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Comparativa entre sedes</CardTitle>
            </CardHeader>
            <CardContent>
              {data.bySede.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Sin datos.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sede</TableHead>
                      <TableHead className="text-right">Órdenes</TableHead>
                      <TableHead className="text-right">Ingresos</TableHead>
                      <TableHead className="text-right">Citas</TableHead>
                      <TableHead className="text-right">TAT (h)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.bySede.map((sd) => (
                      <TableRow key={sd.sede_id}>
                        <TableCell className="font-medium">{sd.sede}</TableCell>
                        <TableCell className="text-right tabular-nums">{sd.ordenes}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(Number(sd.ingresos))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{sd.citas}</TableCell>
                        <TableCell className="text-right tabular-nums">{sd.tat_horas}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <ChartCard title="Ingresos por sede">
            <HBarList
              data={data.bySede.map((sd) => ({
                label: sd.sede,
                value: Number(sd.ingresos),
                hint: `${sd.ordenes} órdenes`,
              }))}
              format={(v) => formatMoney(v)}
            />
          </ChartCard>
        </TabsContent>
      </Tabs>
    </>
  );
}
