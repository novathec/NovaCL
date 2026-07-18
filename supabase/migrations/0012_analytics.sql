-- ============================================================================
-- 0012 · Analitica (RPCs de agregacion)
--   Funciones SECURITY INVOKER: las politicas RLS de las tablas base acotan
--   automaticamente los datos a las organizaciones/sedes del usuario.
--   p_sede_id null = todas las sedes visibles.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- Resumen ejecutivo del periodo (KPIs)
-- ─────────────────────────────────────────────────────────────
create or replace function public.analytics_summary(
  p_desde date,
  p_hasta date,
  p_sede_id uuid default null
) returns jsonb
language sql stable security invoker set search_path = public
as $$
  with ords as (
    select * from public."LIS_orders" o
    where o.created_at >= p_desde
      and o.created_at < p_hasta + 1
      and (p_sede_id is null or o.sede_id = p_sede_id)
      and o.status <> 'anulada'
  ),
  tat as (
    select o.id, extract(epoch from (max(r.validado_at) - o.created_at)) / 3600.0 as horas
    from ords o
    join public."LIS_order_items" oi on oi.order_id = o.id
    join public."LIS_results" r on r.order_item_id = oi.id and r.validado_at is not null
    where o.status in ('completada', 'entregada')
    group by o.id, o.created_at
  ),
  citas as (
    select * from public."LIS_appointments" a
    where a.fecha between p_desde and p_hasta
      and (p_sede_id is null or a.sede_id = p_sede_id)
  )
  select jsonb_build_object(
    'ordenes',            (select count(*) from ords),
    'ingresos',           coalesce((select sum(total) from ords), 0),
    'ticket_promedio',    coalesce((select round(avg(total), 2) from ords), 0),
    'pacientes_nuevos',   (select count(*) from public."LIS_patients" p
                             where p.created_at >= p_desde and p.created_at < p_hasta + 1),
    'pacientes_atendidos',(select count(distinct patient_id) from ords),
    'resultados_criticos',(select count(*) from public."LIS_results" r
                             join public."LIS_order_items" oi on oi.id = r.order_item_id
                             join ords o on o.id = oi.order_id
                             where r.flag in ('critico_alto','critico_bajo')),
    'tat_horas',          coalesce((select round(avg(horas)::numeric, 1) from tat), 0),
    'citas_total',        (select count(*) from citas),
    'citas_atendidas',    (select count(*) from citas where status = 'atendida'),
    'citas_no_asistio',   (select count(*) from citas where status = 'no_asistio'),
    'citas_canceladas',   (select count(*) from citas where status = 'cancelada')
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- Serie diaria: ordenes, ingresos y citas por dia
-- ─────────────────────────────────────────────────────────────
create or replace function public.analytics_daily(
  p_desde date,
  p_hasta date,
  p_sede_id uuid default null
) returns table (dia date, ordenes bigint, ingresos numeric, citas bigint)
language sql stable security invoker set search_path = public
as $$
  select
    d.dia::date,
    coalesce(o.n, 0)    as ordenes,
    coalesce(o.monto, 0) as ingresos,
    coalesce(c.n, 0)    as citas
  from generate_series(p_desde, p_hasta, interval '1 day') as d(dia)
  left join (
    select created_at::date as dia, count(*) as n, sum(total) as monto
    from public."LIS_orders"
    where created_at >= p_desde and created_at < p_hasta + 1
      and status <> 'anulada'
      and (p_sede_id is null or sede_id = p_sede_id)
    group by 1
  ) o on o.dia = d.dia::date
  left join (
    select fecha as dia, count(*) as n
    from public."LIS_appointments"
    where fecha between p_desde and p_hasta
      and (p_sede_id is null or sede_id = p_sede_id)
    group by 1
  ) c on c.dia = d.dia::date
  order by 1;
$$;

-- ─────────────────────────────────────────────────────────────
-- Top de estudios por volumen e ingresos
-- ─────────────────────────────────────────────────────────────
create or replace function public.analytics_top_studies(
  p_desde date,
  p_hasta date,
  p_sede_id uuid default null,
  p_limit integer default 10
) returns table (codigo text, nombre text, cantidad bigint, ingresos numeric)
language sql stable security invoker set search_path = public
as $$
  select oi.study_codigo, oi.study_nombre, count(*) as cantidad,
         sum(oi.precio - oi.descuento) as ingresos
  from public."LIS_order_items" oi
  join public."LIS_orders" o on o.id = oi.order_id
  where o.created_at >= p_desde and o.created_at < p_hasta + 1
    and o.status <> 'anulada' and oi.status <> 'anulado'
    and (p_sede_id is null or o.sede_id = p_sede_id)
  group by 1, 2
  order by cantidad desc, ingresos desc
  limit p_limit;
$$;

-- ─────────────────────────────────────────────────────────────
-- Produccion por categoria del catalogo
-- ─────────────────────────────────────────────────────────────
create or replace function public.analytics_by_category(
  p_desde date,
  p_hasta date,
  p_sede_id uuid default null
) returns table (categoria text, cantidad bigint, ingresos numeric)
language sql stable security invoker set search_path = public
as $$
  select coalesce(tc.nombre, 'Sin categoria') as categoria,
         count(*) as cantidad,
         sum(oi.precio - oi.descuento) as ingresos
  from public."LIS_order_items" oi
  join public."LIS_orders" o on o.id = oi.order_id
  left join public."LIS_studies" st on st.id = oi.study_id
  left join public."LIS_test_categories" tc on tc.id = st.category_id
  where o.created_at >= p_desde and o.created_at < p_hasta + 1
    and o.status <> 'anulada' and oi.status <> 'anulado'
    and (p_sede_id is null or o.sede_id = p_sede_id)
  group by 1
  order by cantidad desc;
$$;

-- ─────────────────────────────────────────────────────────────
-- Distribucion de ordenes por estado
-- ─────────────────────────────────────────────────────────────
create or replace function public.analytics_order_status(
  p_desde date,
  p_hasta date,
  p_sede_id uuid default null
) returns table (status app.order_status, cantidad bigint)
language sql stable security invoker set search_path = public
as $$
  select o.status, count(*)
  from public."LIS_orders" o
  where o.created_at >= p_desde and o.created_at < p_hasta + 1
    and (p_sede_id is null or o.sede_id = p_sede_id)
  group by 1
  order by 2 desc;
$$;

-- ─────────────────────────────────────────────────────────────
-- Comparativa entre sedes (ordenes, ingresos, citas, TAT)
-- ─────────────────────────────────────────────────────────────
create or replace function public.analytics_by_sede(
  p_desde date,
  p_hasta date
) returns table (
  sede_id uuid, sede text, ordenes bigint, ingresos numeric,
  citas bigint, tat_horas numeric
)
language sql stable security invoker set search_path = public
as $$
  select
    s.id,
    s.nombre,
    coalesce(o.n, 0),
    coalesce(o.monto, 0),
    coalesce(c.n, 0),
    coalesce(round(t.horas::numeric, 1), 0)
  from public."LIS_sedes" s
  left join (
    select sede_id, count(*) as n, sum(total) as monto
    from public."LIS_orders"
    where created_at >= p_desde and created_at < p_hasta + 1 and status <> 'anulada'
    group by 1
  ) o on o.sede_id = s.id
  left join (
    select sede_id, count(*) as n
    from public."LIS_appointments"
    where fecha between p_desde and p_hasta
    group by 1
  ) c on c.sede_id = s.id
  left join (
    select ord.sede_id, avg(x.horas) as horas
    from (
      select o2.id, o2.sede_id,
             extract(epoch from (max(r.validado_at) - o2.created_at)) / 3600.0 as horas
      from public."LIS_orders" o2
      join public."LIS_order_items" oi on oi.order_id = o2.id
      join public."LIS_results" r on r.order_item_id = oi.id and r.validado_at is not null
      where o2.created_at >= p_desde and o2.created_at < p_hasta + 1
        and o2.status in ('completada','entregada')
      group by o2.id, o2.sede_id, o2.created_at
    ) x
    join public."LIS_orders" ord on ord.id = x.id
    group by ord.sede_id
  ) t on t.sede_id = s.id
  where s.activo
  order by coalesce(o.monto, 0) desc;
$$;

-- ─────────────────────────────────────────────────────────────
-- Facturacion electronica: comprobantes por estado
-- ─────────────────────────────────────────────────────────────
create or replace function public.analytics_billing(
  p_desde date,
  p_hasta date
) returns table (status app.invoice_status, cantidad bigint, monto numeric)
language sql stable security invoker set search_path = public
as $$
  select i.status, count(*), coalesce(sum(i.total), 0)
  from public."LIS_invoices" i
  where i.created_at >= p_desde and i.created_at < p_hasta + 1
  group by 1
  order by 2 desc;
$$;
