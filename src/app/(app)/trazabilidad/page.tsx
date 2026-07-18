import { requireRole } from "@/lib/auth/session";
import { requireModuleAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Trazabilidad" };

const ENTITY_LABEL: Record<string, string> = {
  LIS_orders: "Orden",
  LIS_order_items: "Estudio",
  LIS_samples: "Muestra",
  LIS_results: "Resultado",
  LIS_result_deliveries: "Entrega",
  LIS_invoices: "Factura",
  LIS_patients: "Paciente",
  LIS_memberships: "Usuario/rol",
};

const ACTION_COLOR: Record<string, string> = {
  INSERT: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  UPDATE: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  DELETE: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export default async function TrazabilidadPage() {
  const ctx = await requireRole(["org_admin", "sede_admin", "lectura"]);
  await requireModuleAccess("trazabilidad");
  const supabase = await createClient();

  const { data: logs } = await supabase
    .from("LIS_audit_log")
    .select("*")
    .eq("organization_id", ctx.activeOrgId!)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <>
      <PageHeader
        title="Trazabilidad"
        description="Registro de auditoría de la organización. Cada cambio queda registrado con su autor."
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Entidad</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Cambios</TableHead>
                <TableHead>Autor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs && logs.length > 0 ? (
                logs.map((l) => {
                  const cambios = l.cambios as Record<string, { de: unknown; a: unknown }> | null;
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(l.created_at, true)}
                      </TableCell>
                      <TableCell className="text-sm">{ENTITY_LABEL[l.entidad] ?? l.entidad}</TableCell>
                      <TableCell>
                        <Badge className={ACTION_COLOR[l.accion] ?? ""}>{l.accion}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs text-xs text-muted-foreground">
                        {cambios
                          ? Object.entries(cambios)
                              .slice(0, 3)
                              .map(([k, v]) => `${k}: ${String(v.de ?? "—")} → ${String(v.a ?? "—")}`)
                              .join(" · ")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{l.actor_email ?? "sistema"}</TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    Sin eventos de auditoría todavía.
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
