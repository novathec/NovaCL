import { addDays, format, startOfWeek } from "date-fns";
import { getSessionContext } from "@/lib/auth/session";
import { requireModuleAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { AgendaClient } from "@/components/agenda/agenda-client";

export const metadata = { title: "Agenda" };

function parseFecha(value?: string) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return format(new Date(), "yyyy-MM-dd");
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; vista?: string }>;
}) {
  const params = await searchParams;
  const ctx = await getSessionContext();
  await requireModuleAccess("agenda");
  const supabase = await createClient();
  const orgId = ctx.activeOrgId!;
  const sedeId = ctx.activeSedeId;

  const fecha = parseFecha(params.fecha);
  const vista =
    params.vista === "semana" ? "semana" : params.vista === "lista" ? "lista" : "dia";

  // Rango a consultar: el dia o la semana (lunes a domingo) de la fecha base
  const base = new Date(`${fecha}T12:00:00`);
  const desde =
    vista === "semana" ? format(startOfWeek(base, { weekStartsOn: 1 }), "yyyy-MM-dd") : fecha;
  const hasta =
    vista === "semana"
      ? format(addDays(startOfWeek(base, { weekStartsOn: 1 }), 6), "yyyy-MM-dd")
      : fecha;

  let qCitas = supabase
    .from("v_agenda")
    .select("*")
    .eq("organization_id", orgId)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha")
    .order("hora_inicio");
  if (sedeId) qCitas = qCitas.eq("sede_id", sedeId);

  const [{ data: citas }, { data: studies }] = await Promise.all([
    qCitas,
    supabase
      .from("LIS_studies")
      .select("id,codigo,nombre")
      .eq("activo", true)
      .or(`organization_id.is.null,organization_id.eq.${orgId}`)
      .order("nombre"),
  ]);

  return (
    <AgendaClient
      citas={citas ?? []}
      fecha={fecha}
      vista={vista}
      studies={studies ?? []}
      sedeNombre={ctx.sedes.find((s) => s.id === sedeId)?.nombre ?? "Todas las sedes"}
    />
  );
}
