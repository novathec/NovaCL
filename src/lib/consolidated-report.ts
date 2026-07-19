import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ResultFlag } from "@/lib/database.types";

type DB = SupabaseClient<Database>;

/**
 * Estructura de informe alineada a ISO 15189 (informes de laboratorio
 * clínico): identificación del paciente, de la(s) muestra(s) con fechas de
 * toma/recepción, método analítico, intervalos de referencia, y quién
 * validó y cuándo. Soporta una o varias órdenes (informe consolidado).
 */
export type IsoAnalyte = {
  nombre: string;
  valor: string;
  unidad: string | null;
  rango: string | null;
  flag: ResultFlag | null;
  metodo: string | null;
};

export type IsoStudy = {
  nombre: string;
  analytes: IsoAnalyte[];
  validadoPor: string | null;
  validadoAt: string | null;
};

export type IsoSample = {
  tipo: string;
  barcode: string | null;
  tomadaAt: string | null;
  recibidaAt: string | null;
};

export type IsoOrder = {
  codigo: string;
  fecha: string;
  medico: string | null;
  diagnostico: string | null;
  samples: IsoSample[];
  studies: IsoStudy[];
};

export type ConsolidatedReport = {
  /** Identificador único del documento emitido (trazable). */
  reportId: string;
  emitidoAt: string;
  organizacion: string;
  sede: string;
  paciente: string;
  documento: string;
  sexo: string;
  fechaNacimiento: string | null;
  preliminar: boolean;
  ordenes: IsoOrder[];
};

/**
 * Construye el informe de una o varias órdenes del MISMO paciente,
 * conservando fechas, muestras y metadatos de cada orden por separado.
 * Devuelve null si las órdenes no existen o pertenecen a pacientes distintos.
 */
export async function buildConsolidatedReport(
  supabase: DB,
  orderIds: string[],
  onlyValidated = true
): Promise<ConsolidatedReport | null> {
  if (orderIds.length === 0) return null;

  const { data: orders } = await supabase
    .from("LIS_orders")
    .select(
      "id, codigo, created_at, medico_solicitante, diagnostico, patient_id, organization_id, organizations:LIS_organizations(nombre), sedes:LIS_sedes(nombre), patients:LIS_patients(nombres,apellidos,numero_documento,tipo_documento,sexo,fecha_nacimiento)"
    )
    .in("id", orderIds)
    .order("created_at");
  if (!orders || orders.length !== orderIds.length) return null;

  // Todas las órdenes deben ser del mismo paciente y organización.
  const patientId = orders[0].patient_id;
  const orgId = orders[0].organization_id;
  if (orders.some((o) => o.patient_id !== patientId || o.organization_id !== orgId)) return null;

  const [{ data: items }, { data: samples }] = await Promise.all([
    supabase
      .from("LIS_order_items")
      .select("id, order_id, study_nombre")
      .in("order_id", orderIds)
      .neq("status", "anulado")
      .order("created_at"),
    supabase
      .from("LIS_samples")
      .select("order_id, barcode, tomada_at, recibida_at, specimen_types:LIS_specimen_types(nombre)")
      .in("order_id", orderIds)
      .order("created_at"),
  ]);

  const itemIds = (items ?? []).map((i) => i.id);
  let results: Database["public"]["Tables"]["LIS_results"]["Row"][] = [];
  if (itemIds.length) {
    let q = supabase.from("LIS_results").select("*").in("order_item_id", itemIds);
    if (onlyValidated) q = q.eq("status", "validado");
    const { data } = await q;
    results = data ?? [];
  }

  // Nombres de los validadores + su credencial profesional (colegiatura),
  // para que el informe cumpla la identificación del responsable (ISO 15189).
  const validatorIds = [...new Set(results.map((r) => r.validado_por).filter((v): v is string => !!v))];
  const validatorNames = new Map<string, string>();
  if (validatorIds.length) {
    const [{ data: profiles }, { data: pros }] = await Promise.all([
      supabase.from("LIS_profiles").select("id, nombre").in("id", validatorIds),
      supabase
        .from("LIS_professionals")
        .select("user_id, colegio, numero_colegiatura")
        .eq("organization_id", orgId)
        .in("user_id", validatorIds),
    ]);
    const credByUser = new Map<string, string>();
    for (const p of pros ?? []) {
      if (p.user_id && p.numero_colegiatura) {
        credByUser.set(p.user_id, `${p.colegio ?? ""} ${p.numero_colegiatura}`.trim());
      }
    }
    for (const p of profiles ?? []) {
      const cred = credByUser.get(p.id);
      validatorNames.set(p.id, cred ? `${p.nombre} (${cred})` : p.nombre);
    }
  }

  const resultsByItem = new Map<string, typeof results>();
  for (const r of results) {
    const arr = resultsByItem.get(r.order_item_id) ?? [];
    arr.push(r);
    resultsByItem.set(r.order_item_id, arr);
  }

  const emitidoAt = new Date().toISOString();
  const ordenes: IsoOrder[] = orders.map((o) => {
    const orderItems = (items ?? []).filter((i) => i.order_id === o.id);
    const studies: IsoStudy[] = orderItems
      .map((it) => {
        const rs = resultsByItem.get(it.id) ?? [];
        const lastValidated = rs
          .filter((r) => r.validado_at)
          .sort((a, b) => (a.validado_at! < b.validado_at! ? 1 : -1))[0];
        return {
          nombre: it.study_nombre,
          analytes: rs.map((r) => ({
            nombre: r.analyte_nombre,
            valor: r.valor_num != null ? String(r.valor_num) : r.valor_texto ?? "",
            unidad: r.analyte_unidad,
            rango: r.rango_texto,
            flag: r.flag,
            metodo: r.metodo,
          })),
          validadoPor: lastValidated?.validado_por
            ? validatorNames.get(lastValidated.validado_por) ?? null
            : null,
          validadoAt: lastValidated?.validado_at ?? null,
        };
      })
      .filter((s) => s.analytes.length > 0);

    return {
      codigo: o.codigo,
      fecha: o.created_at,
      medico: o.medico_solicitante,
      diagnostico: o.diagnostico,
      samples: (samples ?? [])
        .filter((s) => s.order_id === o.id)
        .map((s) => ({
          tipo: (s.specimen_types as unknown as { nombre: string } | null)?.nombre ?? "Muestra",
          barcode: s.barcode,
          tomadaAt: s.tomada_at,
          recibidaAt: s.recibida_at,
        })),
      studies,
    };
  });

  const patient = orders[0].patients as unknown as {
    nombres: string;
    apellidos: string;
    numero_documento: string;
    tipo_documento: string;
    sexo: string;
    fecha_nacimiento: string | null;
  };

  return {
    reportId: `INF-${emitidoAt.slice(0, 10).replaceAll("-", "")}-${createHash("md5")
      .update([...orderIds].sort().join("|") + emitidoAt)
      .digest("hex")
      .slice(0, 6)
      .toUpperCase()}`,
    emitidoAt,
    organizacion: (orders[0].organizations as unknown as { nombre: string }).nombre,
    sede: (orders[0].sedes as unknown as { nombre: string }).nombre,
    paciente: `${patient.nombres} ${patient.apellidos}`,
    documento: `${patient.tipo_documento} ${patient.numero_documento}`,
    sexo: patient.sexo,
    fechaNacimiento: patient.fecha_nacimiento,
    preliminar: !onlyValidated && results.some((r) => r.status !== "validado"),
    ordenes,
  };
}
