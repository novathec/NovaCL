-- ============================================================================
-- 0027 · El ingreso de resultados exige muestra procesada
--
--   El ingreso de resultados es la fase post-analítica: no puede empezar
--   antes de que concluya la analítica. Hasta aquí upsert_result aceptaba
--   valores de estudios cuya muestra ni siquiera fue tomada (item
--   'pendiente'), lo que permitía resultados "fantasma" sin espécimen y
--   rompía la trazabilidad pre-analítica → analítica → post-analítica.
--
--   1) upsert_result: el PRIMER resultado de un estudio exige una muestra
--      vinculada en estado 'procesada'. Si el estudio ya tiene resultados
--      (trabajo iniciado) se permite continuar/corregir: 'procesada' es un
--      estado terminal, así que la condición no se pierde una vez cumplida.
--   2) v_order_overview: nueva columna items_ingresables (estudios vivos
--      no validados cuya muestra está procesada, o con trabajo ya iniciado)
--      para que la UI habilite el botón Ingresar solo cuando hay trabajo
--      real disponible en la orden.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- 1 · upsert_result: guarda de fase post-analítica
-- ─────────────────────────────────────────────────────────────
create or replace function public.upsert_result(
  p_order_item_id uuid,
  p_analyte_id uuid,
  p_valor_num numeric default null,
  p_valor_texto text default null,
  p_nota text default null,
  p_validar boolean default false
) returns public."LIS_results"
language plpgsql security definer set search_path = public
as $$
declare
  v_org        uuid;
  v_patient_id uuid;
  v_order_st   app.order_status;
  v_patient    "LIS_patients"%rowtype;
  v_analyte    "LIS_analytes"%rowtype;
  v_range      "LIS_reference_ranges"%rowtype;
  v_age        int;
  v_flag       app.result_flag;
  v_rango_txt  text;
  v_res        public."LIS_results";
begin
  select o.organization_id, o.patient_id, o.status
    into v_org, v_patient_id, v_order_st
  from public."LIS_order_items" oi
  join public."LIS_orders" o on o.id = oi.order_id
  where oi.id = p_order_item_id;

  if v_org is null then
    raise exception 'order_item % no encontrado', p_order_item_id;
  end if;

  -- no se escriben resultados en ordenes terminales (las correcciones
  -- post-entrega requieren un flujo de informe corregido, no edición directa)
  if v_order_st in ('entregada','anulada') then
    raise exception 'la orden esta %: no se pueden cargar resultados', v_order_st;
  end if;

  select * into v_patient
  from public."LIS_patients"
  where id = v_patient_id;

  -- autorizacion: analista/validador/admin de esa organizacion
  if not (app.is_superadmin() or app.has_org_role(v_org,
       array['org_admin','sede_admin','analista','validador']::app.role[])) then
    raise exception 'no autorizado para cargar resultados';
  end if;

  -- la firma exige rol validador (segregacion de funciones)
  if p_validar and not (app.is_superadmin() or app.has_org_role(v_org,
       array['org_admin','sede_admin','validador']::app.role[])) then
    raise exception 'no autorizado para validar resultados';
  end if;

  -- un resultado validado no se sobrescribe con un guardado sin firma
  if not p_validar and exists (
    select 1 from public."LIS_results" r
    where r.order_item_id = p_order_item_id
      and r.analyte_id = p_analyte_id
      and r.status = 'validado'
  ) then
    raise exception 'el resultado ya esta validado: solo un validador puede corregirlo';
  end if;

  -- fase post-analítica: el primer resultado del estudio exige que su
  -- muestra haya concluido el procesamiento. Los estudios con trabajo ya
  -- iniciado (al menos un resultado cargado) continúan editables: la
  -- muestra procesada es un estado terminal, la condición ya se cumplió.
  if not exists (
    select 1 from public."LIS_results" r
    where r.order_item_id = p_order_item_id
  ) and not exists (
    select 1
    from public."LIS_sample_items" si
    join public."LIS_samples" s on s.id = si.sample_id
    where si.order_item_id = p_order_item_id
      and s.status = 'procesada'
  ) then
    raise exception 'la muestra de este estudio aun no fue procesada: no se pueden cargar resultados';
  end if;

  select * into v_analyte from public."LIS_analytes" where id = p_analyte_id;
  v_age := app.patient_age_days(v_patient.fecha_nacimiento);

  -- seleccionar rango de referencia mas especifico
  select * into v_range from public."LIS_reference_ranges" r
  where r.analyte_id = p_analyte_id
    and (r.sexo = v_patient.sexo or r.sexo = 'desconocido')
    and (r.edad_min_dias is null or v_age is null or v_age >= r.edad_min_dias)
    and (r.edad_max_dias is null or v_age is null or v_age <= r.edad_max_dias)
  order by (r.sexo = v_patient.sexo) desc,
           (r.edad_min_dias is not null) desc
  limit 1;

  if p_valor_num is not null then
    v_flag := app.eval_flag(p_valor_num, v_range.valor_min, v_range.valor_max,
                            v_range.critico_min, v_range.critico_max);
  elsif p_valor_texto is not null and v_range.texto_normal is not null then
    -- evaluación cualitativa contra el texto de referencia
    v_flag := case
      when btrim(lower(p_valor_texto)) = btrim(lower(v_range.texto_normal))
        then 'normal'::app.result_flag
      else 'anormal'::app.result_flag
    end;
  end if;

  if v_range.valor_min is not null or v_range.valor_max is not null then
    v_rango_txt := coalesce(v_range.valor_min::text,'') || ' - ' || coalesce(v_range.valor_max::text,'');
  else
    v_rango_txt := v_range.texto_normal;
  end if;

  insert into public."LIS_results" as r (
    organization_id, order_item_id, analyte_id, analyte_nombre, analyte_unidad,
    valor_num, valor_texto, flag, rango_texto, metodo, nota,
    status, ingresado_por, ingresado_at,
    validado_por, validado_at
  ) values (
    v_org, p_order_item_id, p_analyte_id, v_analyte.nombre, v_analyte.unidad,
    p_valor_num, p_valor_texto, v_flag, v_rango_txt, v_analyte.metodo, p_nota,
    (case when p_validar then 'validado' else 'preliminar' end)::app.result_status,
    auth.uid(), now(),
    case when p_validar then auth.uid() end,
    case when p_validar then now() end
  )
  on conflict (order_item_id, analyte_id) do update set
    valor_num     = excluded.valor_num,
    valor_texto   = excluded.valor_texto,
    flag          = excluded.flag,
    rango_texto   = excluded.rango_texto,
    nota          = excluded.nota,
    status        = case when p_validar then 'validado'
                         when r.status = 'validado' then 'corregido'
                         else 'preliminar' end::app.result_status,
    ingresado_por = auth.uid(),
    ingresado_at  = now(),
    validado_por  = case when p_validar then auth.uid() else r.validado_por end,
    validado_at   = case when p_validar then now() else r.validado_at end,
    updated_at    = now()
  returning * into v_res;

  return v_res;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2 · v_order_overview: items_ingresables (trabajo de resultados real)
--   Estudio ingresable = vivo y no validado, con muestra procesada o con
--   resultados ya iniciados. La lista de Resultados lo usa para habilitar
--   el botón Ingresar solo cuando la orden tiene algo que se puede cargar.
-- ─────────────────────────────────────────────────────────────
create or replace view public.v_order_overview
with (security_invoker = true) as
select
  o.id,
  o.organization_id,
  o.sede_id,
  o.codigo,
  o.status,
  o.prioridad,
  o.total,
  o.moneda,
  o.created_at,
  s.nombre               as sede_nombre,
  p.id                   as patient_id,
  (p.nombres || ' ' || p.apellidos) as paciente,
  p.numero_documento,
  p.sexo,
  p.fecha_nacimiento,
  count(oi.id)                                          as items_total,
  count(oi.id) filter (where oi.status = 'validado')    as items_validados,
  count(oi.id) filter (where oi.status = 'pendiente')   as items_pendientes,
  count(oi.id) filter (
    where oi.status not in ('validado','anulado','rechazado')
      and (
        exists (
          select 1 from public."LIS_results" r
          where r.order_item_id = oi.id
        )
        or exists (
          select 1
          from public."LIS_sample_items" si
          join public."LIS_samples" sm on sm.id = si.sample_id
          where si.order_item_id = oi.id
            and sm.status = 'procesada'
        )
      )
  )                                                     as items_ingresables
from public."LIS_orders" o
join public."LIS_sedes" s      on s.id = o.sede_id
join public."LIS_patients" p   on p.id = o.patient_id
left join public."LIS_order_items" oi on oi.order_id = o.id
group by o.id, s.nombre, p.id;
