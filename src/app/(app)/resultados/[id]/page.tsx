import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ResultsEntry, type ItemGroup } from "@/components/results/results-entry";
import { hasRole } from "@/lib/auth/session";
import { calcAge } from "@/lib/utils";

export default async function ResultEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const fromList = from === "list";
  const ctx = await getSessionContext();
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("LIS_orders")
    .select("*, patients:LIS_patients(nombres,apellidos,sexo,fecha_nacimiento,numero_documento)")
    .eq("id", id)
    .maybeSingle();
  if (!order) notFound();

  const { data: items } = await supabase
    .from("LIS_order_items")
    .select("id,study_id,study_nombre,status, studies:LIS_studies(study_analytes:LIS_study_analytes(orden, analytes:LIS_analytes(id,nombre,unidad,value_type,decimales,opciones)))")
    .eq("order_id", id)
    .neq("status", "anulado")
    .order("created_at");

  const itemIds = (items ?? []).map((i) => i.id);
  const { data: results } = itemIds.length
    ? await supabase.from("LIS_results").select("*").in("order_item_id", itemIds)
    : { data: [] };

  const resultMap = new Map<string, NonNullable<typeof results>[number]>();
  for (const r of results ?? []) resultMap.set(`${r.order_item_id}:${r.analyte_id}`, r);

  const groups: ItemGroup[] = (items ?? []).map((it) => {
    const sa =
      ((it.studies as unknown as { study_analytes: { orden: number; analytes: { id: string; nombre: string; unidad: string | null; value_type: string; decimales: number; opciones: unknown } }[] } | null)
        ?.study_analytes ?? [])
        .slice()
        .sort((a, b) => a.orden - b.orden);
    return {
      orderItemId: it.id,
      studyNombre: it.study_nombre,
      status: it.status,
      analytes: sa.map((x) => {
        const r = resultMap.get(`${it.id}:${x.analytes.id}`);
        return {
          analyteId: x.analytes.id,
          nombre: x.analytes.nombre,
          unidad: x.analytes.unidad,
          valueType: x.analytes.value_type,
          opciones: (x.analytes.opciones as string[] | null) ?? null,
          valorNum: r?.valor_num ?? null,
          valorTexto: r?.valor_texto ?? null,
          flag: r?.flag ?? null,
          rango: r?.rango_texto ?? null,
          status: r?.status ?? null,
        };
      }),
    };
  });

  const patient = order.patients as unknown as { nombres: string; apellidos: string; sexo: string; fecha_nacimiento: string | null; numero_documento: string };
  const canValidate = hasRole(ctx.roles, ["org_admin", "sede_admin", "validador"]);

  return (
    <>
      {/* Retorno contextual: si se llegó desde la lista, volver a ella (y
          ofrecer el salto a la orden); si se llegó desde la orden, volver a ella. */}
      <div className="mb-2 flex items-center gap-1">
        <Button asChild variant="ghost" size="sm">
          <Link href={fromList ? "/resultados" : `/ordenes/${id}`}>
            <ArrowLeft className="h-4 w-4" /> {fromList ? "Resultados" : `Orden ${order.codigo}`}
          </Link>
        </Button>
        {fromList && (
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link href={`/ordenes/${id}`}>
              <ClipboardList className="h-4 w-4" /> Ver orden {order.codigo}
            </Link>
          </Button>
        )}
      </div>
      <PageHeader
        title={`Resultados · ${order.codigo}`}
        description={`${patient.nombres} ${patient.apellidos} · ${patient.numero_documento} · ${calcAge(patient.fecha_nacimiento)}`}
      />
      <ResultsEntry orderId={id} groups={groups} canValidate={canValidate} />
    </>
  );
}
