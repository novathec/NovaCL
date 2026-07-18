import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/search-input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OrderStatusBadge, PriorityBadge } from "@/components/status-badge";
import { StatusFilter } from "@/components/orders/status-filter";
import { formatDate, formatMoney } from "@/lib/utils";
import type { OrderStatus } from "@/lib/database.types";

export const metadata = { title: "Órdenes" };

export default async function OrdenesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const ctx = await getSessionContext();
  const supabase = await createClient();

  let query = supabase
    .from("v_order_overview")
    .select("*")
    .eq("organization_id", ctx.activeOrgId!)
    .order("created_at", { ascending: false })
    .limit(60);

  if (ctx.activeSedeId) query = query.eq("sede_id", ctx.activeSedeId);
  if (status && status !== "todas") query = query.eq("status", status as OrderStatus);
  if (q) query = query.or(`codigo.ilike.%${q}%,paciente.ilike.%${q}%`);

  const { data: orders } = await query;

  return (
    <>
      <PageHeader title="Órdenes / Atenciones" description="Gestión de atenciones de la sede.">
        <Button asChild>
          <Link href="/ordenes/nueva">
            <ClipboardList className="h-4 w-4" /> Nueva atención
          </Link>
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput placeholder="Buscar por código o paciente..." />
        <StatusFilter />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Progreso</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders && orders.length > 0 ? (
                orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link href={`/ordenes/${o.id}`} className="font-medium text-primary hover:underline">
                        {o.codigo}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{o.paciente}</span>
                        <PriorityBadge priority={o.prioridad} />
                      </div>
                      <p className="text-xs text-muted-foreground">{o.numero_documento}</p>
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={o.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-brand-gradient transition-all duration-500"
                            style={{
                              width: `${
                                o.items_total ? (o.items_validados / o.items_total) * 100 : 0
                              }%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {o.items_validados}/{o.items_total}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{formatMoney(o.total, o.moneda)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(o.created_at, true)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No hay órdenes que coincidan.
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
