import { requireSuperadmin } from "@/lib/auth/session";
import {
  listAllOrganizationsAction,
  listOrgMembersAction,
  listSedesForOrgAction,
} from "@/lib/actions/admin-orgs";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { OrgCard } from "@/components/admin/org-card";
import { CreateOrganizationButton, OrgAdminNotice } from "@/components/admin/org-forms";

export const metadata = { title: "Admin · Organizaciones" };

export default async function AdminOrganizacionesPage() {
  await requireSuperadmin();

  const organizations = await listAllOrganizationsAction();
  const membershipsByOrg = await Promise.all(
    organizations.map(async (org) => ({
      orgId: org.id,
      members: await listOrgMembersAction(org.id),
    })),
  );
  const sedesByOrg = await Promise.all(
    organizations.map(async (org) => ({
      orgId: org.id,
      sedes: await listSedesForOrgAction(org.id),
    })),
  );

  const membershipMap = new Map(membershipsByOrg.map((x) => [x.orgId, x.members]));
  const sedesMap = new Map(sedesByOrg.map((x) => [x.orgId, x.sedes]));

  return (
    <>
      <PageHeader
        title="Administración de organizaciones"
        description="Da de alta clínicas, gestiona sus sedes y asigna administradores. Solo superadmins."
      />

      <div className="mb-6 flex items-center justify-between gap-3">
        <OrgAdminNotice />
        <CreateOrganizationButton />
      </div>

      <div className="grid gap-6">
        {organizations.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Aún no hay organizaciones. Crea la primera con el botón superior derecho.
            </CardContent>
          </Card>
        )}

        {organizations.map((org) => (
          <OrgCard
            key={org.id}
            org={{
              id: org.id,
              nombre: org.nombre,
              slug: org.slug,
              ruc: org.ruc,
              timezone: org.timezone,
              locale: org.locale,
              activo: org.activo,
            }}
            sedes={sedesMap.get(org.id) ?? []}
            members={(membershipMap.get(org.id) ?? []).map((m) => ({
              id: m.id,
              role: m.role,
              sede_id: m.sede_id,
              activo: m.activo,
              profiles: m.profiles,
              sedes: m.sedes,
            }))}
            defaultOpen={false}
          />
        ))}
      </div>
    </>
  );
}