import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, User, Stethoscope, Calendar, FlaskConical, Printer } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { OrderStatusBadge, PriorityBadge } from "@/components/status-badge";
import { OrderActions } from "@/components/orders/order-actions";
import { SamplesPanel } from "@/components/orders/samples-panel";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { ITEM_STATUS_LABELS, SAMPLE_STATUS_LABELS } from "@/lib/constants";
import { calcAge, formatDate, formatMoney } from "@/lib/utils";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getSessionContext();
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("LIS_orders")
    .select(
      "*, patients:LIS_patients(id,nombres,apellidos,tipo_documento,numero_documento,sexo,fecha_nacimiento,telefono,email), sedes:LIS_sedes(nombre)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();

  const patient = order.patients as unknown as {
    id: string;
    nombres: string;
    apellidos: string;
    tipo_documento: string;
    numero_documento: string;
    sexo: string;
    fecha_nacimiento: string | null;
    telefono: string | null;
    email: string | null;
  };

  const [{ data: items }, { data: samples }, { data: timeline }, { data: reportDocs }] =
    await Promise.all([
      supabase
        .from("LIS_order_items")
        .select("*")
        .eq("order_id", id)
        .order("created_at"),
      supabase
        .from("LIS_samples")
        .select("*, specimen_types:LIS_specimen_types(nombre)")
        .eq("order_id", id)
        .order("created_at"),
      supabase.rpc("order_timeline", { p_order_id: id }),
      supabase
        .from("LIS_report_documents")
        .select("id, version, storage_path, created_at")
        .eq("order_id", id)
        .order("version", { ascending: false }),
    ]);

  // Signed URLs (1 h) para descargar los informes archivados en Storage.
  // El acceso ya está autorizado: la fila de LIS_report_documents pasó RLS.
  const admin = createAdminClient();
  const informes = await Promise.all(
    (reportDocs ?? [])
      .filter((d) => d.storage_path)
      .map(async (d) => {
        const { data } = await admin.storage
          .from("reports")
          .createSignedUrl(d.storage_path!, 3600);
        return { ...d, url: data?.signedUrl ?? null };
      })
  );

  const meta = [
    { icon: User, label: "Paciente", value: `${patient.nombres} ${patient.apellidos}`, sub: `${patient.tipo_documento} ${patient.numero_documento} · ${calcAge(patient.fecha_nacimiento)}`, href: `/pacientes/${patient.id}` },
    { icon: Stethoscope, label: "Médico", value: order.medico_solicitante ?? "—", sub: order.diagnostico ?? "" },
    { icon: Calendar, label: "Fecha", value: formatDate(order.created_at, true), sub: (order.sedes as unknown as { nombre: string }).nombre },
  ];

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/ordenes">
          <ArrowLeft className="h-4 w-4" /> Órdenes
        </Link>
      </Button>

      <PageHeader title={order.codigo} description={`Total: ${formatMoney(order.total, order.moneda)}`}>
        <OrderStatusBadge status={order.status} />
        <PriorityBadge priority={order.prioridad} />
        <Button asChild variant="outline" size="sm">
          <Link href={`/reportes/${order.id}`}>
            <Printer className="h-4 w-4" /> Reporte
          </Link>
        </Button>
        <OrderActions orderId={order.id} status={order.status} roles={ctx.roles} />
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {meta.map((m) => (
          <Card key={m.label}>
            <CardContent className="flex items-start gap-3 p-4">
              <div className="rounded-lg bg-muted p-2 text-primary">
                <m.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{m.label}</p>
                {m.href ? (
                  <Link href={m.href as never} className="font-medium text-primary hover:underline">
                    {m.value}
                  </Link>
                ) : (
                  <p className="truncate font-medium">{m.value}</p>
                )}
                {m.sub && <p className="truncate text-xs text-muted-foreground">{m.sub}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {informes.length > 0 && (
        <Card className="mb-6 animate-fade-in">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FlaskConical className="h-4 w-4 text-primary" /> Informes archivados
            </div>
            {informes.map((doc) => (
              <Button key={doc.id} asChild size="sm" variant="outline" disabled={!doc.url}>
                <a href={doc.url ?? "#"} target="_blank" rel="noreferrer">
                  <Printer className="h-4 w-4" /> v{doc.version} · {formatDate(doc.created_at, true)}
                </a>
              </Button>
            ))}
            <p className="w-full text-xs text-muted-foreground sm:w-auto">
              PDF inmutables generados al validar. Los enlaces expiran en 1 hora.
            </p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="estudios">
        <TabsList>
          <TabsTrigger value="estudios">Estudios</TabsTrigger>
          <TabsTrigger value="muestras">Muestras</TabsTrigger>
          <TabsTrigger value="trazabilidad">Trazabilidad</TabsTrigger>
        </TabsList>

        <TabsContent value="estudios">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Estudios de la orden</CardTitle>
              <Button asChild size="sm" variant="outline">
                <Link href={`/resultados/${order.id}`}>
                  <FlaskConical className="h-4 w-4" /> Ingresar resultados
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Estudio</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items?.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="text-sm">{it.study_codigo}</TableCell>
                      <TableCell className="font-medium">{it.study_nombre}</TableCell>
                      <TableCell>
                        <Badge className="bg-muted text-foreground">
                          {ITEM_STATUS_LABELS[it.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">{formatMoney(it.precio)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="muestras">
          <SamplesPanel
            orderId={order.id}
            items={(items ?? []).map((i) => ({ id: i.id, nombre: i.study_nombre, status: i.status }))}
            samples={(samples ?? []).map((s) => ({
              id: s.id,
              barcode: s.barcode,
              status: s.status,
              statusLabel: SAMPLE_STATUS_LABELS[s.status],
              tipo: (s.specimen_types as unknown as { nombre: string } | null)?.nombre ?? "—",
              tomada_at: s.tomada_at,
            }))}
            roles={ctx.roles}
          />
        </TabsContent>

        <TabsContent value="trazabilidad">
          <OrderTimeline events={timeline ?? []} />
        </TabsContent>
      </Tabs>
    </>
  );
}
