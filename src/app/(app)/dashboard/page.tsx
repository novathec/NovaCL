import Link from "next/link";
import {
  ClipboardList,
  FlaskConical,
  Clock,
  AlertTriangle,
  Users,
  ArrowRight,
} from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OrderStatusBadge, PriorityBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Panel" };

function StatCard({
  title,
  value,
  icon: Icon,
  hint,
  accent = "text-primary",
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  hint?: string;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className={`rounded-lg bg-muted p-3 ${accent}`}>
          <Icon className="h-6 w-6" />
        </div>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const ctx = await getSessionContext();
  const supabase = await createClient();
  const orgId = ctx.activeOrgId!;
  const sedeId = ctx.activeSedeId;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  let qToday = supabase
    .from("LIS_orders")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .gte("created_at", todayISO);
  if (sedeId) qToday = qToday.eq("sede_id", sedeId);

  let qPend = supabase
    .from("LIS_orders")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .in("status", ["registrada", "en_toma", "en_proceso", "parcial"]);
  if (sedeId) qPend = qPend.eq("sede_id", sedeId);

  let qRecientes = supabase
    .from("v_order_overview")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(8);
  if (sedeId) qRecientes = qRecientes.eq("sede_id", sedeId);

  const [ordersToday, pendientes, criticos, pacientes, recientes] = await Promise.all([
    qToday,
    qPend,
    supabase
      .from("LIS_results")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .in("flag", ["critico_alto", "critico_bajo"])
      .neq("status", "validado"),
    supabase
      .from("LIS_patients")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    qRecientes,
  ]);

  const stats = [
    { title: "Órdenes hoy", value: ordersToday.count ?? 0, icon: ClipboardList, accent: "text-primary" },
    { title: "En proceso", value: pendientes.count ?? 0, icon: Clock, accent: "text-blue-600" },
    { title: "Valores críticos", value: criticos.count ?? 0, icon: AlertTriangle, accent: "text-red-600", hint: "Pendientes de validar" },
    { title: "Pacientes", value: pacientes.count ?? 0, icon: Users, accent: "text-emerald-600" },
  ];

  return (
    <>
      <PageHeader
        title={`Hola, ${ctx.profile?.nombre?.split(" ")[0] ?? "bienvenido"}`}
        description="Resumen operativo de la sede seleccionada."
      >
        <Button asChild>
          <Link href="/ordenes/nueva">
            <ClipboardList className="h-4 w-4" /> Nueva atención
          </Link>
        </Button>
      </PageHeader>

      <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.title} {...s} />
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-primary" /> Órdenes recientes
          </CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/ordenes">
              Ver todas <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recientes.data && recientes.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Progreso</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recientes.data.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link href={`/ordenes/${o.id}`} className="font-medium text-primary hover:underline">
                        {o.codigo}
                      </Link>
                    </TableCell>
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
                      {o.items_validados}/{o.items_total} estudios
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(o.created_at, true)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aún no hay órdenes en esta sede. Crea la primera atención.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
