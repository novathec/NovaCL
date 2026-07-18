import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { requireModuleAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/search-input";
import { PatientDialog } from "@/components/patients/patient-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { calcAge, formatDate } from "@/lib/utils";
import { FileText } from "lucide-react";

export const metadata = { title: "Pacientes" };

export default async function PacientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const ctx = await getSessionContext();
  await requireModuleAccess("pacientes");
  const supabase = await createClient();

  let query = supabase
    .from("LIS_patients")
    .select("*")
    .eq("organization_id", ctx.activeOrgId!)
    .order("created_at", { ascending: false })
    .limit(50);

  if (q) {
    query = query.or(
      `nombres.ilike.%${q}%,apellidos.ilike.%${q}%,numero_documento.ilike.%${q}%`
    );
  }

  const { data: patients } = await query;

  return (
    <>
      <PageHeader title="Pacientes" description="Registro y búsqueda de pacientes de la organización.">
        <PatientDialog />
      </PageHeader>

      <div className="mb-4">
        <SearchInput placeholder="Buscar por nombre o documento..." />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paciente</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Edad</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Registrado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients && patients.length > 0 ? (
                patients.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/pacientes/${p.id}`} className="font-medium text-primary hover:underline">
                        {p.apellidos}, {p.nombres}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {p.sexo === "F" ? "Femenino" : p.sexo === "M" ? "Masculino" : "—"}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.tipo_documento} {p.numero_documento}
                    </TableCell>
                    <TableCell className="text-sm">{calcAge(p.fecha_nacimiento)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.telefono ?? p.email ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(p.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/ordenes/nueva?patient=${p.id}`}>
                          <FileText className="h-4 w-4" /> Atender
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    {q ? "No se encontraron pacientes." : "Aún no hay pacientes registrados."}
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
