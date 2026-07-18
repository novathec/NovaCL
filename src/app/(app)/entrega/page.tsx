import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { requireModuleAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OrderStatusBadge } from "@/components/status-badge";
import { DeliveryDialog } from "@/components/delivery/delivery-dialog";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { DELIVERY_STATUS_LABEL } from "@/lib/constants-delivery";

export const metadata = { title: "Entrega de resultados" };

export default async function EntregaPage() {
  const ctx = await getSessionContext();
  await requireModuleAccess("entrega");
  const supabase = await createClient();

  let query = supabase
    .from("LIS_orders")
    .select(
      "id, codigo, status, created_at, patients:LIS_patients(nombres,apellidos,email,telefono), result_deliveries:LIS_result_deliveries(id,canal,status,enviado_at)"
    )
    .eq("organization_id", ctx.activeOrgId!)
    .in("status", ["completada", "entregada"])
    .order("created_at", { ascending: false })
    .limit(60);
  if (ctx.activeSedeId) query = query.eq("sede_id", ctx.activeSedeId);

  const { data: orders } = await query;

  return (
    <>
      <PageHeader
        title="Entrega de resultados"
        description="Envía los resultados validados al paciente por email o mediante enlace al portal."
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Orden</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Envíos</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders && orders.length > 0 ? (
                orders.map((o) => {
                  const p = o.patients as unknown as { nombres: string; apellidos: string; email: string | null; telefono: string | null };
                  const deliveries = (o.result_deliveries as unknown as { id: string; canal: string; status: string }[]) ?? [];
                  return (
                    <TableRow key={o.id}>
                      <TableCell>
                        <Link href={`/ordenes/${o.id}`} className="font-medium text-primary hover:underline">
                          {o.codigo}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.nombres} {p.apellidos}
                        <p className="text-xs text-muted-foreground">{p.email ?? p.telefono ?? "Sin contacto"}</p>
                      </TableCell>
                      <TableCell>
                        <OrderStatusBadge status={o.status} />
                      </TableCell>
                      <TableCell>
                        {deliveries.length === 0 ? (
                          <span className="text-sm text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {deliveries.map((d) => (
                              <Badge key={d.id} className="bg-muted text-foreground">
                                {d.canal}: {DELIVERY_STATUS_LABEL[d.status] ?? d.status}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(o.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <DeliveryDialog
                          orderId={o.id}
                          defaultEmail={p.email ?? ""}
                          defaultPhone={p.telefono ?? ""}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No hay órdenes completadas para entregar.
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
