"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  CreateSedeButton,
  EditOrganizationButton,
  EditSedeButton,
  OrgIconBadge,
  PromoteMemberButton,
  DropMemberButton,
  RoleBadge,
  StatusBadge,
  ToggleOrganizationButton,
  ToggleSedeAdminButton,
} from "@/components/admin/org-forms";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Sede = {
  id: string;
  codigo: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  es_procesadora: boolean;
  activo: boolean;
};

type Member = {
  id: string;
  role: string;
  sede_id: string | null;
  activo: boolean;
  profiles: unknown;
  sedes: unknown;
};

type OrgShape = {
  id: string;
  nombre: string;
  slug: string;
  ruc: string | null;
  timezone: string;
  locale: string;
  activo: boolean;
};

export function OrgCard({
  org,
  sedes,
  members,
  defaultOpen = false,
}: {
  org: OrgShape;
  sedes: Sede[];
  members: Member[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={`org-panel-${org.id}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <OrgIconBadge activo={org.activo} />
            <div>
              <CardTitle className="text-base">{org.nombre}</CardTitle>
              <p className="text-xs text-muted-foreground">
                slug <span className="font-mono">{org.slug}</span>
                {org.ruc ? ` · RUC ${org.ruc}` : ""}
                {` · ${org.timezone}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <StatusBadge activo={org.activo} />
            <EditOrganizationButton
              org={{
                id: org.id,
                nombre: org.nombre,
                slug: org.slug,
                ruc: org.ruc,
                logo_url: null,
                timezone: org.timezone,
                locale: org.locale,
                activo: org.activo,
              }}
            />
            <ToggleOrganizationButton orgId={org.id} activo={org.activo} />
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent
          id={`org-panel-${org.id}`}
          className="grid gap-6 lg:grid-cols-2"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Sedes</h4>
              <CreateSedeButton orgId={org.id} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Procesa</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sedes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-xs text-muted-foreground">
                      Sin sedes registradas.
                    </TableCell>
                  </TableRow>
                ) : (
                  sedes.map((sede) => (
                    <TableRow key={sede.id}>
                      <TableCell className="font-mono text-sm">{sede.codigo}</TableCell>
                      <TableCell className="font-medium">{sede.nombre}</TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {sede.es_procesadora ? "Sí" : "No"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge activo={sede.activo} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <EditSedeButton sede={{ ...sede, organization_id: org.id }} />
                          <ToggleSedeAdminButton sedeId={sede.id} activo={sede.activo} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Administradores</h4>
              <PromoteMemberButton
                orgId={org.id}
                sedes={sedes.map((s) => ({ id: s.id, nombre: s.nombre }))}
              />
            </div>
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
                {members.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-xs text-muted-foreground">
                      Sin administradores asignados.
                    </TableCell>
                  </TableRow>
                ) : (
                  members.map((m) => {
                    const profile = m.profiles as { nombre: string; email: string } | null;
                    const sede = m.sedes as { nombre: string } | null;
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <p className="font-medium">{profile?.nombre ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">{profile?.email}</p>
                        </TableCell>
                        <TableCell>
                          <RoleBadge role={m.role} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {sede?.nombre ?? "Toda la organización"}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropMemberButton membershipId={m.id} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}