import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ResultFlag, OrderStatus } from "@/lib/database.types";

type DB = SupabaseClient<Database>;

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

  // Ítems vivos de esas órdenes -> total de estudios y mapeo resultado→orden.
  const { data: items } = await admin
    .from("LIS_order_items")
    .select("id, order_id")
    .in("order_id", orderIds)
    .neq("status", "anulado");

  const itemToOrder = new Map<string, string>();
  const totalByOrder = new Map<string, number>();
  for (const it of items ?? []) {
    itemToOrder.set(it.id, it.order_id);
    totalByOrder.set(it.order_id, (totalByOrder.get(it.order_id) ?? 0) + 1);
  }
  const itemIds = [...itemToOrder.keys()];

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

  return orders.map((o) => {
    const agg = byOrder.get(o.id);
    const estudiosListos = agg?.listos.size ?? 0;
    return {
      id: o.id,
      codigo: o.codigo,
      fecha: o.created_at,
      organizacion: (o.organizations as unknown as { nombre: string } | null)?.nombre ?? "",
      sede: (o.sedes as unknown as { nombre: string } | null)?.nombre ?? "",
      medico: o.medico_solicitante,
      status: o.status,
      estudiosTotal: totalByOrder.get(o.id) ?? 0,
      estudiosListos,
      reportReady: estudiosListos > 0,
      anormales: agg?.anormales ?? 0,
      critico: agg?.critico ?? false,
      validadoAt: agg?.validadoAt ?? null,
    };
  });
}

export type PortalOrderMeta = {
  status: OrderStatus;
  codigo: string;
  reportReady: boolean;
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

  return { status: order.status, codigo: order.codigo, reportReady };
}
