import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  ResultFlag,
  OrderStatus,
  SampleStatus,
  ItemStatus,
} from "@/lib/database.types";

type DB = SupabaseClient<Database>;

// Progreso relativo de una muestra (para elegir la menos avanzada de la orden).
const SAMPLE_RANK: Record<SampleStatus, number> = {
  pendiente: 0,
  tomada: 1,
  en_transito: 2,
  recibida: 3,
  en_analisis: 4,
  procesada: 5,
  rechazada: -1, // se ignora en el agregado
};

/**
 * Estado representativo de la muestra de una orden = la muestra NO rechazada
 * menos avanzada. Refleja "hasta dónde llegó todo lo necesario para la orden";
 * null si no hay muestras o todas fueron rechazadas.
 */
function representativeSample(
  statuses: SampleStatus[]
): SampleStatus | null {
  let best: SampleStatus | null = null;
  let bestRank = Infinity;
  for (const s of statuses) {
    const r = SAMPLE_RANK[s];
    if (r < 0) continue; // rechazada
    if (r < bestRank) {
      bestRank = r;
      best = s;
    }
  }
  return best;
}

export type PortalOrderCard = {
  id: string;
  codigo: string;
  fecha: string;
  organizacion: string;
  sede: string;
  medico: string | null;
  /** Estado de la orden (para el seguimiento / timeline). */
  status: OrderStatus;
  /** Estudios vivos de la orden. */
  estudiosTotal: number;
  /** Estudios con al menos un resultado validado. */
  estudiosListos: number;
  /** Hay al menos un resultado validado para ver. */
  reportReady: boolean;
  /** Analitos validados fuera de rango (flag distinto de normal). */
  anormales: number;
  /** Hay algún valor en rango crítico. */
  critico: boolean;
  /** Fecha del último resultado validado (para "listo desde"). */
  validadoAt: string | null;
  /** Estado representativo de la muestra (afina el seguimiento). */
  sampleStatus: SampleStatus | null;
  /** Desglose por estudio (cada examen avanza a su ritmo). */
  studies: PortalStudy[];
};

const CRITICAL_FLAGS: ResultFlag[] = ["critico_alto", "critico_bajo"];

/**
 * Lista TODAS las órdenes activas del paciente (por ids de registro), listas o
 * en proceso, con un resumen para las tarjetas y el seguimiento del portal.
 * Solo se exponen resultados firmados: nada preliminar llega al paciente, pero
 * sí se muestra en qué etapa está cada examen para dar tranquilidad.
 *
 * Usa el cliente admin (service role) porque el portal es anónimo respecto a
 * RLS; el filtrado por identidad lo garantiza `pids`, derivado de la sesión
 * firmada del paciente.
 */
export async function getPortalOrders(
  admin: DB,
  pids: string[]
): Promise<PortalOrderCard[]> {
  if (pids.length === 0) return [];

  const { data: orders } = await admin
    .from("LIS_orders")
    .select(
      "id, codigo, status, created_at, medico_solicitante, organizations:LIS_organizations(nombre), sedes:LIS_sedes(nombre)"
    )
    .in("patient_id", pids)
    .neq("status", "anulada")
    .order("created_at", { ascending: false });

  if (!orders || orders.length === 0) return [];
  const orderIds = orders.map((o) => o.id);

  // Ítems vivos de esas órdenes (un ítem = un estudio).
  const { data: items } = await admin
    .from("LIS_order_items")
    .select("id, order_id, study_nombre, status, created_at")
    .in("order_id", orderIds)
    .neq("status", "anulado")
    .order("created_at");

  const itemToOrder = new Map<string, string>();
  const itemsByOrder = new Map<string, typeof items>();
  for (const it of items ?? []) {
    itemToOrder.set(it.id, it.order_id);
    const arr = itemsByOrder.get(it.order_id) ?? [];
    arr.push(it);
    itemsByOrder.set(it.order_id, arr);
  }
  const itemIds = [...itemToOrder.keys()];

  // Muestra representativa POR ESTUDIO (vía sample_items) -> el seguimiento por
  // estudio y, agregando, el de la orden.
  const sampleByItem = new Map<string, SampleStatus[]>();
  if (itemIds.length) {
    const { data: links } = await admin
      .from("LIS_sample_items")
      .select("order_item_id, LIS_samples(status)")
      .in("order_item_id", itemIds);
    for (const link of links ?? []) {
      const st = (link.LIS_samples as unknown as { status: SampleStatus } | null)?.status;
      if (!st) continue;
      const arr = sampleByItem.get(link.order_item_id) ?? [];
      arr.push(st);
      sampleByItem.set(link.order_item_id, arr);
    }
  }

  let results: { order_item_id: string; flag: ResultFlag | null; validado_at: string | null }[] = [];
  if (itemIds.length) {
    const { data } = await admin
      .from("LIS_results")
      .select("order_item_id, flag, validado_at")
      .in("order_item_id", itemIds)
      .eq("status", "validado");
    results = data ?? [];
  }

  type Agg = { listos: Set<string>; anormales: number; critico: boolean; validadoAt: string | null };
  const byOrder = new Map<string, Agg>();

  for (const r of results) {
    const orderId = itemToOrder.get(r.order_item_id);
    if (!orderId) continue;
    const agg =
      byOrder.get(orderId) ??
      { listos: new Set<string>(), anormales: 0, critico: false, validadoAt: null };
    agg.listos.add(r.order_item_id);
    if (r.flag && r.flag !== "normal") agg.anormales += 1;
    if (r.flag && CRITICAL_FLAGS.includes(r.flag)) agg.critico = true;
    if (r.validado_at && (!agg.validadoAt || r.validado_at > agg.validadoAt)) {
      agg.validadoAt = r.validado_at;
    }
    byOrder.set(orderId, agg);
  }
  const validatedItems = new Set(results.map((r) => r.order_item_id));

  return orders.map((o) => {
    const agg = byOrder.get(o.id);
    const estudiosListos = agg?.listos.size ?? 0;
    const orderItems = itemsByOrder.get(o.id) ?? [];

    const studies: PortalStudy[] = orderItems.map((it) => ({
      id: it.id,
      nombre: it.study_nombre,
      itemStatus: it.status,
      sampleStatus: representativeSample(sampleByItem.get(it.id) ?? []),
      hasValidated: validatedItems.has(it.id),
    }));

    // Muestra representativa de la orden = la menos avanzada entre sus estudios.
    const allSamples = orderItems.flatMap((it) => sampleByItem.get(it.id) ?? []);

    return {
      id: o.id,
      codigo: o.codigo,
      fecha: o.created_at,
      organizacion: (o.organizations as unknown as { nombre: string } | null)?.nombre ?? "",
      sede: (o.sedes as unknown as { nombre: string } | null)?.nombre ?? "",
      medico: o.medico_solicitante,
      status: o.status,
      estudiosTotal: orderItems.length,
      estudiosListos,
      reportReady: estudiosListos > 0,
      anormales: agg?.anormales ?? 0,
      critico: agg?.critico ?? false,
      validadoAt: agg?.validadoAt ?? null,
      sampleStatus: representativeSample(allSamples),
      studies,
    };
  });
}

export type PortalOrderMeta = {
  status: OrderStatus;
  codigo: string;
  reportReady: boolean;
  sampleStatus: SampleStatus | null;
};

/**
 * Devuelve el estado de una orden si pertenece a la identidad del portal, o
 * null si no le pertenece (sirve a la vez de control de autorización).
 */
export async function getPortalOrder(
  admin: DB,
  orderId: string,
  pids: string[]
): Promise<PortalOrderMeta | null> {
  if (pids.length === 0) return null;
  const { data: order } = await admin
    .from("LIS_orders")
    .select("id, codigo, status")
    .eq("id", orderId)
    .in("patient_id", pids)
    .maybeSingle();
  if (!order) return null;

  // ¿Hay al menos un resultado validado en la orden? (para habilitar el reporte)
  const { data: itemRows } = await admin
    .from("LIS_order_items")
    .select("id")
    .eq("order_id", orderId)
    .neq("status", "anulado");
  const itemIds = (itemRows ?? []).map((i) => i.id);

  let reportReady = false;
  if (itemIds.length) {
    const { count } = await admin
      .from("LIS_results")
      .select("id", { count: "exact", head: true })
      .in("order_item_id", itemIds)
      .eq("status", "validado");
    reportReady = (count ?? 0) > 0;
  }

  // Estado representativo de la muestra de la orden.
  const { data: samples } = await admin
    .from("LIS_samples")
    .select("status")
    .eq("order_id", orderId);
  const sampleStatus = representativeSample((samples ?? []).map((s) => s.status));

  return { status: order.status, codigo: order.codigo, reportReady, sampleStatus };
}

export type PortalStudy = {
  id: string;
  nombre: string;
  itemStatus: ItemStatus;
  sampleStatus: SampleStatus | null;
  hasValidated: boolean;
};

/**
 * Estado por estudio (order_item) de una orden. Cada estudio avanza por su
 * cuenta: devuelve su estado de ítem, el estado representativo de SU muestra
 * (vía sample_items) y si ya tiene resultado validado. Excluye anulados.
 * Verifica pertenencia por `pids` (autorización).
 */
export async function getPortalOrderStudies(
  admin: DB,
  orderId: string,
  pids: string[]
): Promise<PortalStudy[]> {
  if (pids.length === 0) return [];
  const { data: owner } = await admin
    .from("LIS_orders")
    .select("id")
    .eq("id", orderId)
    .in("patient_id", pids)
    .maybeSingle();
  if (!owner) return [];

  const { data: items } = await admin
    .from("LIS_order_items")
    .select("id, study_nombre, status, created_at")
    .eq("order_id", orderId)
    .neq("status", "anulado")
    .order("created_at");
  if (!items || items.length === 0) return [];
  const itemIds = items.map((i) => i.id);

  // Muestras por estudio (vía sample_items): estado representativo (menos
  // avanzado, ignorando rechazadas) de las muestras que cubren cada estudio.
  const { data: sampleLinks } = await admin
    .from("LIS_sample_items")
    .select("order_item_id, LIS_samples(status)")
    .in("order_item_id", itemIds);

  const samplesByItem = new Map<string, SampleStatus[]>();
  for (const link of sampleLinks ?? []) {
    const st = (link.LIS_samples as unknown as { status: SampleStatus } | null)?.status;
    if (!st) continue;
    const arr = samplesByItem.get(link.order_item_id) ?? [];
    arr.push(st);
    samplesByItem.set(link.order_item_id, arr);
  }

  // Estudios con al menos un resultado validado.
  const { data: validated } = await admin
    .from("LIS_results")
    .select("order_item_id")
    .in("order_item_id", itemIds)
    .eq("status", "validado");
  const validatedItems = new Set((validated ?? []).map((r) => r.order_item_id));

  return items.map((it) => ({
    id: it.id,
    nombre: it.study_nombre,
    itemStatus: it.status,
    sampleStatus: representativeSample(samplesByItem.get(it.id) ?? []),
    hasValidated: validatedItems.has(it.id),
  }));
}
