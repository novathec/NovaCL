import Link from "next/link";
import { FlaskConical, ArrowRight } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { requireModuleAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/search-input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OrderStatusBadge, PriorityBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Resultados" };

export default async function ResultadosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const ctx = await getSessionContext();
  await requireModuleAccess("resultados");
  const supabase = await createClient();

  // Órdenes con trabajo de resultados pendiente. Mismo conjunto de "trabajo
  // activo" que usa el dashboard. Se excluye 'completada' (todos los estudios
  // validados → nada pendiente de ingreso/validación; esas pasan a Entrega) y
  // los terminales 'entregada'/'anulada'.
  // Ojo: el rollup mantiene la orden en 'registrada' hasta validar el primer
  // estudio; tomar la muestra NO cambia el estado de la orden, por eso hay que
  // incluir 'registrada'/'en_toma' o una orden recién puesta en proceso no saldría.
  let query = supabase
    .from("v_order_overview")
    .select("*")
    .eq("organization_id", ctx.activeOrgId!)
    .in("status", ["registrada", "en_toma", "en_proceso", "parcial"])
    .order("prioridad", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(60);

  if (ctx.activeSedeId) query = query.eq("sede_id", ctx.activeSedeId);
  if (q) query = query.or(`codigo.ilike.%${q}%,paciente.ilike.%${q}%`);

  const { data: orders } = await query;

  return (
    <>
      <PageHeader
        title="Resultados"
        description="Órdenes con estudios pendientes de ingreso o validación."
      />
      <div className="mb-4">
        <SearchInput placeholder="Buscar por código o paciente..." />
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
                <TableHead>Ingreso</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders && orders.length > 0 ? (
                orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.codigo}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {o.paciente}
                        <PriorityBadge priority={o.prioridad} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={o.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {o.items_validados}/{o.items_total} validados
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(o.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm">
                        <Link href={`/resultados/${o.id}?from=list`}>
                          <FlaskConical className="h-4 w-4" /> Ingresar <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No hay órdenes pendientes de resultados.
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
