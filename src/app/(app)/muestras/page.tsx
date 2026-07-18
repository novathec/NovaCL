import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { requireModuleAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SampleRowActions } from "@/components/orders/sample-row-actions";
import { SAMPLE_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Muestras" };

export default async function MuestrasPage() {
  const ctx = await getSessionContext();
  await requireModuleAccess("muestras");
  const supabase = await createClient();

  const { data: samples } = await supabase
    .from("LIS_samples")
    .select("*, orders:LIS_orders(codigo, patients:LIS_patients(nombres,apellidos)), specimen_types:LIS_specimen_types(nombre)")
    .eq("organization_id", ctx.activeOrgId!)
    .in("status", ["tomada", "en_transito", "recibida", "en_analisis"])
    .order("created_at", { ascending: false })
    .limit(80);

  return (
    <>
      <PageHeader title="Muestras" description="Worklist de muestras en proceso." />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código de barras</TableHead>
                <TableHead>Orden</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Tomada</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {samples && samples.length > 0 ? (
                samples.map((s) => {
                  const order = s.orders as unknown as { codigo: string; patients: { nombres: string; apellidos: string } } | null;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-sm">{s.barcode}</TableCell>
                      <TableCell>
                        <Link href={`/ordenes/${s.order_id}`} className="text-primary hover:underline">
                          {order?.codigo}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        {order?.patients ? `${order.patients.nombres} ${order.patients.apellidos}` : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {(s.specimen_types as unknown as { nombre: string } | null)?.nombre ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-muted text-foreground">{SAMPLE_STATUS_LABELS[s.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(s.tomada_at, true)}
                      </TableCell>
                      <TableCell className="text-right">
                        <SampleRowActions sampleId={s.id} status={s.status} />
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No hay muestras en proceso.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
