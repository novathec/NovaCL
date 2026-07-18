import { format, subDays } from "date-fns";
import { getSessionContext } from "@/lib/auth/session";
import { requireModuleAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { AnalyticsClient, type AnalyticsData } from "@/components/analytics/analytics-client";

export const metadata = { title: "Analítica" };

const RANGOS = new Set(["7", "30", "90", "365"]);

export default async function AnaliticaPage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string; sede?: string }>;
}) {
  const params = await searchParams;
  const ctx = await getSessionContext();
  await requireModuleAccess("analitica");
  const supabase = await createClient();

  const rango = RANGOS.has(params.rango ?? "") ? params.rango! : "30";
  // Filtro de sede: "todas" o una sede visible; por defecto la sede activa
  const sedeParam = params.sede ?? ctx.activeSedeId ?? "todas";
  const sedeId =
    sedeParam !== "todas" && ctx.sedes.some((s) => s.id === sedeParam) ? sedeParam : null;

  const hoy = new Date();
  const desde = format(subDays(hoy, Number(rango) - 1), "yyyy-MM-dd");
  const hasta = format(hoy, "yyyy-MM-dd");
  const args = { p_desde: desde, p_hasta: hasta, p_sede_id: sedeId };

  const [summary, daily, topStudies, byCategory, orderStatus, bySede, billing] =
    await Promise.all([
      supabase.rpc("analytics_summary", args),
      supabase.rpc("analytics_daily", args),
      supabase.rpc("analytics_top_studies", { ...args, p_limit: 10 }),
      supabase.rpc("analytics_by_category", args),
      supabase.rpc("analytics_order_status", args),
      supabase.rpc("analytics_by_sede", { p_desde: desde, p_hasta: hasta }),
      supabase.rpc("analytics_billing", { p_desde: desde, p_hasta: hasta }),
    ]);

  const data: AnalyticsData = {
    summary: (summary.data ?? {}) as AnalyticsData["summary"],
    daily: daily.data ?? [],
    topStudies: topStudies.data ?? [],
    byCategory: byCategory.data ?? [],
    orderStatus: orderStatus.data ?? [],
    bySede: bySede.data ?? [],
    billing: billing.data ?? [],
  };

  return (
    <AnalyticsClient
      data={data}
      rango={rango}
      sede={sedeId ?? "todas"}
      sedes={ctx.sedes.map((s) => ({ id: s.id, nombre: s.nombre }))}
      desde={desde}
      hasta={hasta}
    />
  );
}
