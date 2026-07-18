import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { ReportData, ReportStudy } from "@/components/results/results-report";

type DB = SupabaseClient<Database>;

/**
 * Construye la estructura de reporte de resultados de una orden.
 * `onlyValidated` limita a resultados firmados (para entrega al paciente).
 */
export async function buildOrderReport(
  supabase: DB,
  orderId: string,
  onlyValidated = true
): Promise<ReportData | null> {
  const { data: order } = await supabase
    .from("LIS_orders")
    .select(
      "codigo, created_at, medico_solicitante, organizations:LIS_organizations(nombre), sedes:LIS_sedes(nombre), patients:LIS_patients(nombres,apellidos,numero_documento,tipo_documento,sexo,fecha_nacimiento)"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return null;

  const { data: items } = await supabase
    .from("LIS_order_items")
    .select("id, study_nombre")
    .eq("order_id", orderId)
    .neq("status", "anulado")
    .order("created_at");

  const itemIds = (items ?? []).map((i) => i.id);
  let results: Database["public"]["Tables"]["LIS_results"]["Row"][] = [];
  if (itemIds.length) {
    let q = supabase.from("LIS_results").select("*").in("order_item_id", itemIds);
    if (onlyValidated) q = q.eq("status", "validado");
    const { data } = await q;
    results = data ?? [];
  }

  const byItem = new Map<string, typeof results>();
  for (const r of results) {
    const arr = byItem.get(r.order_item_id) ?? [];
    arr.push(r);
    byItem.set(r.order_item_id, arr);
  }

  const studies: ReportStudy[] = (items ?? [])
    .map((it) => ({
      nombre: it.study_nombre,
      analytes: (byItem.get(it.id) ?? []).map((r) => ({
        nombre: r.analyte_nombre,
        valor: r.valor_num != null ? String(r.valor_num) : r.valor_texto ?? "",
        unidad: r.analyte_unidad,
        rango: r.rango_texto,
        flag: r.flag,
      })),
    }))
    .filter((s) => s.analytes.length > 0);

  const patient = order.patients as unknown as {
    nombres: string;
    apellidos: string;
    numero_documento: string;
    tipo_documento: string;
    sexo: string;
    fecha_nacimiento: string | null;
  };

  return {
    organizacion: (order.organizations as unknown as { nombre: string }).nombre,
    sede: (order.sedes as unknown as { nombre: string }).nombre,
    // Con borradores incluidos, marca el reporte como preliminar si algún
    // resultado impreso aún no está validado.
    preliminar: !onlyValidated && results.some((r) => r.status !== "validado"),
    codigo: order.codigo,
    fecha: order.created_at,
    paciente: `${patient.nombres} ${patient.apellidos}`,
    documento: `${patient.tipo_documento} ${patient.numero_documento}`,
    sexo: patient.sexo,
    edad: null,
    fechaNacimiento: patient.fecha_nacimiento,
    medico: order.medico_solicitante,
    studies,
  };
}
