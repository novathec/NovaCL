import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { requireModuleAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { InvoiceButton } from "@/components/billing/invoice-button";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata = { title: "Facturación" };

const INVOICE_STATUS: Record<string, string> = {
  borrador: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  emitida: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  pagada: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  anulada: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  error_sync: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

export default async function FacturacionPage() {
  const ctx = await getSessionContext();
  await requireModuleAccess("facturacion");
  const supabase = await createClient();

  let query = supabase
    .from("LIS_orders")
    .select("id, codigo, total, moneda, created_at, patients:LIS_patients(nombres,apellidos), invoices:LIS_invoices(id,serie,numero,status,total)")
    .eq("organization_id", ctx.activeOrgId!)
    .in("status", ["completada", "entregada", "parcial"])
    .order("created_at", { ascending: false })
    .limit(60);
  if (ctx.activeSedeId) query = query.eq("sede_id", ctx.activeSedeId);

  const { data: orders } = await query;
  const { data: integ } = await supabase
    .from("LIS_billing_integrations")
    .select("provider, enabled")
    .eq("organization_id", ctx.activeOrgId!)
    .maybeSingle();

  return (
    <>
      <PageHeader
        title="Facturación"
        description={`Proveedor: ${integ?.provider ?? "Wally"} ${
          integ?.enabled === false ? "(deshabilitado)" : "(demo/simulación si no hay credenciales)"
        }`}
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Orden</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Comprobante</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Total</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders && orders.length > 0 ? (
                orders.map((o) => {
                  const p = o.patients as unknown as { nombres: string; apellidos: string };
                  const inv = (o.invoices as unknown as { id: string; serie: string | null; numero: string | null; status: string; total: number }[])?.[0];
                  return (
                    <TableRow key={o.id}>
                      <TableCell>
                        <Link href={`/ordenes/${o.id}`} className="font-medium text-primary hover:underline">
                          {o.codigo}
                        </Link>
                        <p className="text-xs text-muted-foreground">{formatDate(o.created_at)}</p>
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.nombres} {p.apellidos}
                      </TableCell>
                      <TableCell className="text-sm">
                        {inv ? `${inv.serie ?? ""}-${inv.numero ?? ""}` : "—"}
                      </TableCell>
                      <TableCell>
                        {inv ? (
                          <Badge className={INVOICE_STATUS[inv.status] ?? ""}>{inv.status}</Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">Sin emitir</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{formatMoney(o.total, o.moneda)}</TableCell>
                      <TableCell className="text-right">
                        {!inv || inv.status === "error_sync" ? (
                          <InvoiceButton orderId={o.id} />
                        ) : (
                          <span className="text-xs text-muted-foreground">Emitido</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No hay órdenes por facturar.
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
