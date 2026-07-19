import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Mail, Phone, MapPin, IdCard, Shield, Droplet, AlertTriangle } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { PatientDialog } from "@/components/patients/patient-dialog";
import { ConsolidatedReportCard } from "@/components/patients/consolidated-report-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OrderStatusBadge } from "@/components/status-badge";
import { calcAge, formatDate } from "@/lib/utils";

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getSessionContext();
  const supabase = await createClient();

  const { data: patient } = await supabase
    .from("LIS_patients")
    .select("*")
    .eq("id", id)
    .eq("organization_id", ctx.activeOrgId!)
    .maybeSingle();

  if (!patient) notFound();

  const { data: orders } = await supabase
    .from("v_order_overview")
    .select("*")
    .eq("patient_id", id)
    .order("created_at", { ascending: false });

  const info = [
    { icon: IdCard, label: "Documento", value: `${patient.tipo_documento} ${patient.numero_documento}` },
    { icon: Phone, label: "Teléfono", value: patient.telefono ?? "—" },
    { icon: Mail, label: "Email", value: patient.email ?? "—" },
    { icon: MapPin, label: "Dirección", value: patient.direccion ?? "—" },
    { icon: Shield, label: "Seguro", value: patient.seguro ?? "—" },
    {
      icon: Droplet,
      label: "Grupo sanguíneo",
      value:
        patient.grupo_sanguineo && patient.grupo_sanguineo !== "desconocido"
          ? patient.grupo_sanguineo
          : "—",
    },
  ];

  // Órdenes elegibles para el informe consolidado: con resultados validados
  const elegibles = (orders ?? [])
    .filter((o) => o.items_validados > 0 && o.status !== "anulada")
    .map((o) => ({
      id: o.id,
      codigo: o.codigo,
      created_at: o.created_at,
      items_validados: o.items_validados,
      items_total: o.items_total,
    }));

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/pacientes">
          <ArrowLeft className="h-4 w-4" /> Pacientes
        </Link>
      </Button>

      <PageHeader
        title={`${patient.nombres} ${patient.apellidos}`}
        description={`${calcAge(patient.fecha_nacimiento)} · ${
          patient.sexo === "F" ? "Femenino" : patient.sexo === "M" ? "Masculino" : "Sexo no especificado"
        }`}
      >
        <PatientDialog patient={patient} trigger={<Button variant="outline">Editar</Button>} />
        <Button asChild>
          <Link href={`/ordenes/nueva?patient=${patient.id}`}>
            <FileText className="h-4 w-4" /> Nueva atención
          </Link>
        </Button>
      </PageHeader>

      {patient.alergias && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm dark:border-red-900 dark:bg-red-950/40">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          <div>
            <p className="font-semibold text-red-700 dark:text-red-300">Alergias conocidas</p>
            <p className="text-red-700/90 dark:text-red-300/90">{patient.alergias}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Datos de contacto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {info.map((i) => (
                <div key={i.label} className="flex items-start gap-3">
                  <i.icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">{i.label}</p>
                    <p className="text-sm">{i.value}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <ConsolidatedReportCard patientId={patient.id} orders={elegibles} />
        </div>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Historial de atenciones</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Estudios</TableHead>
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
                        <OrderStatusBadge status={o.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {o.items_validados}/{o.items_total}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(o.created_at)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      Sin atenciones registradas.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
