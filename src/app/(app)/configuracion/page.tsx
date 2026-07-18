import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SedeForm, MemberForm, BillingForm, SedeToggle, MemberRemove } from "@/components/admin/config-forms";
import { PermissionsMatrix } from "@/components/admin/permissions-matrix";
import { ROLE_LABELS } from "@/lib/constants";
import type { Role } from "@/lib/database.types";

export const metadata = { title: "Configuración" };

export default async function ConfiguracionPage() {
  const ctx = await requireRole(["org_admin", "sede_admin"]);
  const supabase = await createClient();
  const orgId = ctx.activeOrgId!;

  const [{ data: sedes }, { data: members }, { data: billing }, { data: permRows }] =
    await Promise.all([
      supabase.from("LIS_sedes").select("*").eq("organization_id", orgId).order("codigo"),
      supabase
        .from("LIS_memberships")
        .select("id, role, sede_id, profiles:LIS_profiles(nombre,email), sedes:LIS_sedes(nombre)")
        .eq("organization_id", orgId),
      supabase.from("LIS_billing_integrations").select("*").eq("organization_id", orgId).maybeSingle(),
      supabase
        .from("LIS_role_permissions")
        .select("sede_id, role, module, can_view, can_edit")
        .eq("organization_id", orgId),
    ]);

  const billingConfig =
    (billing?.config as {
      serie?: string;
      igv?: number;
      auto_invoice?: boolean;
      auto_deliver?: boolean;
    }) ?? {};

  return (
    <>
      <PageHeader title="Configuración" description="Sedes, equipo y roles, e integración de facturación." />

      <Tabs defaultValue="sedes">
        <TabsList>
          <TabsTrigger value="sedes">Sedes</TabsTrigger>
          <TabsTrigger value="equipo">Equipo y roles</TabsTrigger>
          <TabsTrigger value="permisos">Permisos</TabsTrigger>
          <TabsTrigger value="facturacion">Facturación</TabsTrigger>
        </TabsList>

        {/* ── Permisos granulares ── */}
        <TabsContent value="permisos">
          <Card className="max-w-3xl">
            <CardHeader>
              <CardTitle className="text-base">Permisos por rol y módulo</CardTitle>
            </CardHeader>
            <CardContent>
              <PermissionsMatrix
                sedes={(sedes ?? []).map((s) => ({ id: s.id, nombre: s.nombre }))}
                rows={(permRows ?? []) as never}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Sedes ── */}
        <TabsContent value="sedes">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Sedes de la organización</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Dirección</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sedes?.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-sm">{s.codigo}</TableCell>
                        <TableCell className="font-medium">{s.nombre}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{s.direccion ?? "—"}</TableCell>
                        <TableCell>
                          <Badge className={s.activo ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground"}>
                            {s.activo ? "Activa" : "Inactiva"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <SedeToggle sedeId={s.id} activo={s.activo} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Nueva sede</CardTitle>
              </CardHeader>
              <CardContent>
                <SedeForm />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Equipo ── */}
        <TabsContent value="equipo">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Miembros y roles</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Sede</TableHead>
                      <TableHead className="text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members?.map((m) => {
                      const profile = m.profiles as unknown as { nombre: string; email: string } | null;
                      const sede = m.sedes as unknown as { nombre: string } | null;
                      return (
                        <TableRow key={m.id}>
                          <TableCell>
                            <p className="font-medium">{profile?.nombre || "—"}</p>
                            <p className="text-xs text-muted-foreground">{profile?.email}</p>
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-primary/10 text-primary">{ROLE_LABELS[m.role as Role]}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {sede?.nombre ?? "Toda la organización"}
                          </TableCell>
                          <TableCell className="text-right">
                            <MemberRemove membershipId={m.id} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Asignar rol</CardTitle>
              </CardHeader>
              <CardContent>
                <MemberForm sedes={(sedes ?? []).map((s) => ({ id: s.id, nombre: s.nombre }))} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Facturación ── */}
        <TabsContent value="facturacion">
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle className="text-base">Integración de facturación</CardTitle>
            </CardHeader>
            <CardContent>
              <BillingForm
                provider={billing?.provider ?? "wally"}
                enabled={billing?.enabled ?? false}
                serie={billingConfig.serie ?? "B001"}
                igv={billingConfig.igv ?? 0.18}
                autoInvoice={billingConfig.auto_invoice === true}
                autoDeliver={billingConfig.auto_deliver === true}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
