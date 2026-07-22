-- ============================================================================
-- 0023 · Endurecimiento de flujos (auditoría QA — hallazgos altos)
--
--   A1  upsert_result rechaza escrituras en órdenes entregada/anulada y
--       eval_flag devuelve NULL cuando el analito no tiene rango (antes
--       reportaba "normal" un valor nunca evaluado). Flag cualitativo:
--       valor_texto distinto de texto_normal ⇒ 'anormal'.
--   A3  Máquina de estados en BD: triggers guard para LIS_orders (entregar
--       solo si completada; estados terminales inmutables) y LIS_samples
--       (transiciones ordenadas; rechazo exige motivo). Columna
--       LIS_orders.motivo_anulacion.
--   A6  rollup_order_status ignora items 'rechazado' (una muestra rechazada
--       ya no congela la orden en 'parcial' para siempre).
--   A2  DELETE restringido a admin (policy RESTRICTIVE) en resultados,
--       facturas, pacientes, entregas, muestras e items: la bitácora clínica
--       y fiscal ya no se puede borrar con roles operativos.
--   A3i Se elimina el INSERT directo en LIS_inventory_movements: toda
--       escritura pasa por el RPC atómico (0018/0022).
--   A15 Bucket 'inventory' con límite de tamaño y MIME permitidos.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- A1a · eval_flag: sin rango configurado ⇒ NULL (no "normal")
-- ─────────────────────────────────────────────────────────────
create or replace function app.eval_flag(
  p_valor numeric, p_min numeric, p_max numeric,
  p_cmin numeric, p_cmax numeric
) returns app.result_flag
language sql immutable
as $$
  select case
    when p_valor is null then null
    -- sin rango de referencia: el valor no fue evaluado, no se reporta normal
    when p_min is null and p_max is null and p_cmin is null and p_cmax is null then null
    when p_cmin is not null and p_valor < p_cmin then 'critico_bajo'::app.result_flag
    when p_cmax is not null and p_valor > p_cmax then 'critico_alto'::app.result_flag
    when p_min  is not null and p_valor < p_min  then 'bajo'::app.result_flag
    when p_max  is not null and p_valor > p_max  then 'alto'::app.result_flag
    else 'normal'::app.result_flag
  end;
$$;

-- ─────────────────────────────────────────────────────────────
-- A1b + A4 · upsert_result: orden terminal bloqueada + flag cualitativo
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

  -- A1: no se escriben resultados en ordenes terminales (las correcciones
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
    -- A4: evaluación cualitativa contra el texto de referencia
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
    case when p_validar then 'validado' else 'preliminar' end,
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
-- A6 · rollup de orden: los items rechazados no bloquean el cierre
-- ─────────────────────────────────────────────────────────────
create or replace function app.rollup_order_status()
returns trigger
language plpgsql
as $$
declare
  v_order uuid := coalesce(new.order_id, old.order_id);
  v_total int;
  v_validados int;
  v_pendientes int;
  v_cur app.order_status;
begin
  select status into v_cur from public."LIS_orders" where id = v_order;
  -- no sobreescribir estados terminales/manuales
  if v_cur in ('anulada','entregada') then
    return coalesce(new, old);
  end if;

  select count(*),
         count(*) filter (where status = 'validado'),
         count(*) filter (where status in ('pendiente','en_proceso','resultado_cargado'))
    into v_total, v_validados, v_pendientes
  from public."LIS_order_items"
  where order_id = v_order and status not in ('anulado','rechazado');

  update public."LIS_orders" o
  set status = case
    when v_total = 0 then 'registrada'
    when v_validados = v_total then 'completada'
    when v_validados > 0 then 'parcial'
    else o.status
  end::app.order_status
  where o.id = v_order;

  return coalesce(new, old);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- A3a · Máquina de estados de la orden + motivo de anulación
--  · entregada solo desde completada; estados terminales inmutables.
--  · El rollup interno (registrada/parcial/completada) sigue funcionando.
-- ─────────────────────────────────────────────────────────────
alter table public."LIS_orders"
  add column if not exists motivo_anulacion text;

create or replace function app.guard_order_status()
returns trigger
language plpgsql
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if old.status in ('entregada','anulada') then
    raise exception 'una orden % no puede cambiar de estado', old.status;
  end if;
  if new.status = 'entregada' and old.status <> 'completada' then
    raise exception 'solo se puede entregar una orden completada';
  end if;
  if new.status = 'anulada' and (new.motivo_anulacion is null or btrim(new.motivo_anulacion) = '') then
    raise exception 'anular una orden requiere un motivo';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_order_status_guard on public."LIS_orders";
create trigger trg_order_status_guard
  before update of status on public."LIS_orders"
  for each row execute function app.guard_order_status();

-- ─────────────────────────────────────────────────────────────
-- A3b · Máquina de estados de la muestra (flujo pre-analítico)
--  pendiente → tomada → (en_transito) → recibida → en_analisis → procesada
--  cualquier estado vivo puede pasar a rechazada, siempre con motivo.
-- ─────────────────────────────────────────────────────────────
create or replace function app.guard_sample_status()
returns trigger
language plpgsql
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if old.status in ('procesada','rechazada') then
    raise exception 'una muestra % no puede cambiar de estado', old.status;
  end if;
  if new.status = 'rechazada'
     and (new.motivo_rechazo is null or btrim(new.motivo_rechazo) = '') then
    raise exception 'el rechazo de una muestra requiere un motivo';
  end if;
  if not (
       (old.status = 'pendiente'   and new.status in ('tomada','rechazada'))
    or (old.status = 'tomada'      and new.status in ('en_transito','recibida','rechazada'))
    or (old.status = 'en_transito' and new.status in ('recibida','rechazada'))
    or (old.status = 'recibida'    and new.status in ('en_analisis','rechazada'))
    or (old.status = 'en_analisis' and new.status in ('procesada','rechazada'))
  ) then
    raise exception 'transicion de muestra no permitida: % → %', old.status, new.status;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sample_status_guard on public."LIS_samples";
create trigger trg_sample_status_guard
  before update of status on public."LIS_samples"
  for each row execute function app.guard_sample_status();

-- ─────────────────────────────────────────────────────────────
-- A2 · DELETE restringido a administración en entidades críticas
-- Policies RESTRICTIVE: se combinan con AND sobre las permisivas `*_write`
-- (que son FOR ALL). El service_role (portal, webhooks) no se ve afectado.
-- ─────────────────────────────────────────────────────────────
drop policy if exists patient_delete_admin on public."LIS_patients";
create policy patient_delete_admin on public."LIS_patients"
  as restrictive for delete to authenticated
  using (app.can_admin_org(organization_id));

drop policy if exists orderitem_delete_admin on public."LIS_order_items";
create policy orderitem_delete_admin on public."LIS_order_items"
  as restrictive for delete to authenticated
  using (app.can_admin_org((select o.organization_id from public."LIS_orders" o where o.id = order_id)));

drop policy if exists sample_delete_admin on public."LIS_samples";
create policy sample_delete_admin on public."LIS_samples"
  as restrictive for delete to authenticated
  using (app.can_admin_org(organization_id));

drop policy if exists result_delete_admin on public."LIS_results";
create policy result_delete_admin on public."LIS_results"
  as restrictive for delete to authenticated
  using (app.can_admin_org(organization_id));

drop policy if exists delivery_delete_admin on public."LIS_result_deliveries";
create policy delivery_delete_admin on public."LIS_result_deliveries"
  as restrictive for delete to authenticated
  using (app.can_admin_org(organization_id));

drop policy if exists invoice_delete_admin on public."LIS_invoices";
create policy invoice_delete_admin on public."LIS_invoices"
  as restrictive for delete to authenticated
  using (app.can_admin_org(organization_id));

-- ─────────────────────────────────────────────────────────────
-- A3i · Los movimientos de inventario solo nacen del RPC atómico
-- (el RPC es SECURITY DEFINER: sigue pudiendo insertar sin la policy)
-- ─────────────────────────────────────────────────────────────
drop policy if exists inv_mov_insert on public."LIS_inventory_movements";

-- ─────────────────────────────────────────────────────────────
-- A15 · Bucket de imágenes de inventario: tamaño y tipos permitidos
-- ─────────────────────────────────────────────────────────────
update storage.buckets
set file_size_limit = 8388608,              -- 8 MB
    allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'inventory';
