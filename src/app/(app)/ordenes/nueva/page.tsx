import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { NewOrderForm, type StudyOption } from "@/components/orders/new-order-form";

export const metadata = { title: "Nueva atención" };

export default async function NuevaOrdenPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string; cita?: string }>;
}) {
  const { patient, cita } = await searchParams;
  const ctx = await getSessionContext();
  const supabase = await createClient();
  const orgId = ctx.activeOrgId!;
  const sedeId = ctx.activeSedeId;

  // Catálogo visible: plantillas globales + estudios propios de la organización
  const [{ data: studies }, { data: prices }, { data: initialPatient }] = await Promise.all([
    supabase
      .from("LIS_studies")
      .select("id,codigo,nombre,requiere_ayuno,tiempo_entrega_h, test_categories:LIS_test_categories(nombre)")
      .eq("activo", true)
      .or(`organization_id.is.null,organization_id.eq.${orgId}`)
      .order("nombre"),
    supabase.from("LIS_study_prices").select("study_id,sede_id,precio,moneda").eq("activo", true),
    patient
      ? supabase
          .from("LIS_patients")
          .select("id,nombres,apellidos,tipo_documento,numero_documento,sexo,fecha_nacimiento,telefono")
          .eq("id", patient)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Precio: preferir el de la sede activa, si no el base (sede null)
  const priceMap = new Map<string, number>();
  for (const p of prices ?? []) {
    const key = p.study_id;
    if (p.sede_id === sedeId) priceMap.set(key, p.precio);
    else if (p.sede_id === null && !priceMap.has(key)) priceMap.set(key, p.precio);
  }

  const studyOptions: StudyOption[] = (studies ?? []).map((s) => ({
    id: s.id,
    codigo: s.codigo,
    nombre: s.nombre,
    categoria: (s.test_categories as unknown as { nombre: string } | null)?.nombre ?? "General",
    requiere_ayuno: s.requiere_ayuno,
    precio: priceMap.get(s.id) ?? 0,
  }));

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/ordenes">
          <ArrowLeft className="h-4 w-4" /> Órdenes
        </Link>
      </Button>
      <PageHeader
        title="Nueva atención"
        description={`Sede: ${ctx.sedes.find((s) => s.id === sedeId)?.nombre ?? "—"}`}
      />
      <NewOrderForm studies={studyOptions} initialPatient={initialPatient ?? null} citaId={cita ?? null} />
    </>
  );
}
