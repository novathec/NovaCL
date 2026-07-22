-- ============================================================================
-- 0022 · Correcciones críticas de seguridad e integridad (auditoría QA)
--
-- Cubre los hallazgos críticos de la auditoría 2026-07:
--   C1  El perfil no puede auto-editarse es_superadmin/email (escalación).
--   C2  upsert_result exige rol validador cuando p_validar = true.
--   C8  Un guardado sin validar no puede tocar un resultado ya validado.
--   C9  El item solo pasa a "validado" cuando TODOS los analitos esperados
--       del estudio están validados (no basta con los resultados cargados).
--   C3  create_order verifica que el paciente (y el estudio) pertenezcan a
--       la organización de la sede (fuga cross-tenant).
--   C12 inventory_register_movement valida la sede destino dentro de la org
--       y serializa movimientos por artículo (race condition de stock).
--   C10 LIS_invoices: unicidad de comprobante activo por orden y de
--       (org, proveedor, serie, número) — sin duplicados fiscales.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- C1 · Proteger campos sensibles del perfil
-- La policy profile_update_self (0009) permite UPDATE de cualquier columna
-- de la propia fila; este trigger impide que un usuario se otorgue
-- es_superadmin o cambie su email. El service role (auth.uid() is null) y
-- los superadmin existentes conservan la capacidad (consola de plataforma).
-- ─────────────────────────────────────────────────────────────
create or replace function app.protect_profile_sensitive()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and not app.is_superadmin() then
    if new.es_superadmin is distinct from old.es_superadmin
       or new.email is distinct from old.email then
      raise exception 'no autorizado para modificar campos sensibles del perfil';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profile_protect on public."LIS_profiles";
create trigger trg_profile_protect
  before update on public."LIS_profiles"
  for each row execute function app.protect_profile_sensitive();

-- ─────────────────────────────────────────────────────────────
-- C9 · Rollup del item contra los analitos esperados del estudio
-- Antes contaba solo las filas existentes en LIS_results: validar 1 de 8
-- analitos marcaba el item "validado" y completaba la orden. Ahora el item
-- es "validado" únicamente cuando todos los analitos configurados en
-- LIS_study_analytes tienen resultado validado.
-- ─────────────────────────────────────────────────────────────
create or replace function app.rollup_item_status()
returns trigger
language plpgsql
as $$
declare
  v_item      uuid := coalesce(new.order_item_id, old.order_item_id);
  v_expected  int;
  v_validados int;
  v_cargados  int;
begin
  -- analitos esperados según la composición del estudio del item
  select count(*) into v_expected
  from public."LIS_study_analytes" sa
  join public."LIS_order_items" oi on oi.study_id = sa.study_id
  where oi.id = v_item;

  -- validados que corresponden a analitos del estudio + total cargados
  select count(*) filter (where sa.analyte_id is not null and r.status = 'validado'),
         count(*) filter (where r.status in ('preliminar','validado','corregido'))
    into v_validados, v_cargados
  from public."LIS_results" r
  left join public."LIS_study_analytes" sa
    on sa.analyte_id = r.analyte_id
   and sa.study_id = (select oi.study_id from public."LIS_order_items" oi where oi.id = v_item)
  where r.order_item_id = v_item;

  update public."LIS_order_items" oi
  set status = case
    when v_expected = 0 and v_cargados = 0 then 'pendiente'
    when v_expected > 0 and v_validados >= v_expected then 'validado'
    when v_cargados > 0 then 'resultado_cargado'
    else 'en_proceso'
  end::app.item_status
  where oi.id = v_item and oi.status not in ('anulado','rechazado');

  return coalesce(new, old);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- C2 + C8 · upsert_result endurecido
--  · p_validar = true exige rol validador (antes bastaba con analista).
--  · Guardar sin validar sobre un resultado ya validado se rechaza:
--    una corrección exige pasar de nuevo por la firma (p_validar = true).
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
  v_patient    "LIS_patients"%rowtype;
  v_analyte    "LIS_analytes"%rowtype;
  v_range      "LIS_reference_ranges"%rowtype;
  v_age        int;
  v_flag       app.result_flag;
  v_rango_txt  text;
  v_res        public."LIS_results";
begin
  select o.organization_id, o.patient_id into v_org, v_patient_id
  from public."LIS_order_items" oi
  join public."LIS_orders" o on o.id = oi.order_id
  where oi.id = p_order_item_id;

  if v_org is null then
    raise exception 'order_item % no encontrado', p_order_item_id;
  end if;

  select * into v_patient
  from public."LIS_patients"
  where id = v_patient_id;

  -- autorizacion: analista/validador/admin de esa organizacion
  if not (app.is_superadmin() or app.has_org_role(v_org,
       array['org_admin','sede_admin','analista','validador']::app.role[])) then
    raise exception 'no autorizado para cargar resultados';
  end if;

  -- C2: la firma exige rol validador (segregacion de funciones)
  if p_validar and not (app.is_superadmin() or app.has_org_role(v_org,
       array['org_admin','sede_admin','validador']::app.role[])) then
    raise exception 'no autorizado para validar resultados';
  end if;

  -- C8: un resultado validado no se sobrescribe con un guardado sin firma
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
-- C3 · create_order: validar paciente y estudios de la organización
-- Antes se podía crear una orden en la Org A con un patient_id de la Org B
-- (fuga cross-tenant vía v_order_overview). También se aceptaban estudios
-- ajenos o inactivos.
-- ─────────────────────────────────────────────────────────────
create or replace function public.create_order(
  p_sede_id uuid,
  p_patient_id uuid,
  p_items jsonb,
  p_prioridad app.order_priority default 'rutina',
  p_medico text default null,
  p_medico_id uuid default null,
  p_diagnostico text default null,
  p_observaciones text default null
) returns public."LIS_orders"
language plpgsql security definer set search_path = public
as $$
declare
  v_org    uuid;
  v_order  public."LIS_orders";
  v_item   jsonb;
  v_study  public."LIS_studies";
  v_precio numeric;
begin
  select organization_id into v_org from public."LIS_sedes" where id = p_sede_id;
  if v_org is null then
    raise exception 'sede % no existe', p_sede_id;
  end if;

  -- autorizacion: recepcion/admin de esa sede
  if not (app.is_superadmin() or app.has_sede_role(p_sede_id,
       array['org_admin','sede_admin','recepcion']::app.role[])) then
    raise exception 'no autorizado para crear ordenes en esta sede';
  end if;

  -- C3: el paciente debe pertenecer a la organización de la sede
  if not exists (
    select 1 from public."LIS_patients" p
    where p.id = p_patient_id and p.organization_id = v_org
  ) then
    raise exception 'paciente % no pertenece a la organizacion', p_patient_id;
  end if;

  -- Si llega medico_id, validamos que pertenezca a la misma organización.
  if p_medico_id is not null then
    if not exists (
      select 1 from public."LIS_professionals" p
      where p.id = p_medico_id and p.organization_id = v_org
    ) then
      raise exception 'profesional % no pertenece a la organizacion', p_medico_id;
    end if;
  end if;

  insert into public."LIS_orders"(
    organization_id, sede_id, patient_id, codigo, prioridad,
    medico_solicitante, medico_solicitante_id,
    diagnostico, observaciones, created_by
  ) values (
    v_org, p_sede_id, p_patient_id, app.next_order_code(v_org), p_prioridad,
    p_medico, p_medico_id,
    p_diagnostico, p_observaciones, auth.uid()
  ) returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_study from public."LIS_studies" where id = (v_item->>'study_id')::uuid;
    -- el estudio debe existir, estar activo y ser global o de la organización
    if v_study.id is null
       or (v_study.organization_id is not null and v_study.organization_id <> v_org)
       or not v_study.activo then
      raise exception 'estudio % no existe o no esta disponible', v_item->>'study_id';
    end if;

    select precio into v_precio from public."LIS_study_prices"
    where study_id = v_study.id
      and (sede_id = p_sede_id or sede_id is null)
      and activo
    order by (sede_id = p_sede_id) desc, vigente_desde desc
    limit 1;

    insert into public."LIS_order_items"(
      order_id, study_id, precio, study_nombre, study_codigo
    ) values (
      v_order.id, v_study.id, coalesce(v_precio, 0), v_study.nombre, v_study.codigo
    );
  end loop;

  return v_order;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- C12 · inventory_register_movement: destino dentro de la org + lock
--  · La transferencia exige que la sede destino pertenezca a la misma
--    organización del artículo (antes se podía mover stock a otra org).
--  · Se bloquea la fila del artículo (FOR UPDATE) para serializar
--    movimientos concurrentes y evitar actualizaciones perdidas de stock.
-- ─────────────────────────────────────────────────────────────
create or replace function public.inventory_register_movement(
  p_item_id         uuid,
  p_sede_id         uuid,
  p_tipo            app.inventory_movement_type,
  p_cantidad        numeric,
  p_lote            text default null,
  p_vencimiento     date default null,
  p_motivo          text default null,
  p_referencia      text default null,
  p_sede_destino_id uuid default null,
  p_costo_unitario  numeric default null
) returns public."LIS_inventory_movements"
language plpgsql security definer set search_path = public
as $$
declare
  v_org       uuid;
  v_actual    numeric(12,2);
  v_delta     numeric(12,2);
  v_nuevo     numeric(12,2);
  v_mov       public."LIS_inventory_movements";
begin
  -- Lock del artículo: serializa los movimientos sobre su stock
  select organization_id into v_org
  from public."LIS_inventory_items"
  where id = p_item_id
  for update;
  if v_org is null then raise exception 'Artículo no encontrado'; end if;

  -- Autorización: el usuario debe poder administrar/operar la sede
  if not app.has_sede_role(p_sede_id,
        array['org_admin','sede_admin','analista','toma_muestra','recepcion']::app.role[]) then
    raise exception 'No autorizado para mover inventario en esta sede';
  end if;
  if p_cantidad is null or p_cantidad < 0 then
    raise exception 'La cantidad debe ser positiva';
  end if;

  -- La sede origen debe pertenecer a la organización del artículo
  if not exists (
    select 1 from public."LIS_sedes" s
    where s.id = p_sede_id and s.organization_id = v_org
  ) then
    raise exception 'La sede no pertenece a la organización del artículo';
  end if;

  -- Existencia actual del renglón (item+sede+lote+vencimiento)
  select cantidad into v_actual
  from public."LIS_inventory_stock"
  where item_id = p_item_id and sede_id = p_sede_id
    and lote is not distinct from p_lote
    and vencimiento is not distinct from p_vencimiento;
  v_actual := coalesce(v_actual, 0);

  -- Efecto según el tipo de movimiento
  if p_tipo = 'entrada' then
    v_delta := p_cantidad;
  elsif p_tipo in ('salida', 'merma') then
    v_delta := -p_cantidad;
  elsif p_tipo = 'transferencia' then
    if p_sede_destino_id is null or p_sede_destino_id = p_sede_id then
      raise exception 'La transferencia requiere una sede destino distinta';
    end if;
    -- C12: la sede destino debe ser de la misma organización
    if not exists (
      select 1 from public."LIS_sedes" s
      where s.id = p_sede_destino_id and s.organization_id = v_org
    ) then
      raise exception 'La sede destino no pertenece a la organización';
    end if;
    v_delta := -p_cantidad;
  elsif p_tipo = 'ajuste' then
    -- Ajuste fija el valor absoluto contado
    v_delta := p_cantidad - v_actual;
  else
    raise exception 'Tipo de movimiento no soportado';
  end if;

  v_nuevo := v_actual + v_delta;
  if v_nuevo < 0 then
    raise exception 'Existencia insuficiente: hay % y se intentó retirar %', v_actual, p_cantidad;
  end if;

  -- Actualizar existencia de la sede origen
  insert into public."LIS_inventory_stock"(organization_id, item_id, sede_id, lote, vencimiento, cantidad)
  values (v_org, p_item_id, p_sede_id, p_lote, p_vencimiento, v_nuevo)
  on conflict (item_id, sede_id, lote, vencimiento)
  do update set cantidad = v_nuevo, updated_at = now();

  -- Transferencia: sumar en la sede destino
  if p_tipo = 'transferencia' then
    insert into public."LIS_inventory_stock"(organization_id, item_id, sede_id, lote, vencimiento, cantidad)
    values (v_org, p_item_id, p_sede_destino_id, p_lote, p_vencimiento, p_cantidad)
    on conflict (item_id, sede_id, lote, vencimiento)
    do update set cantidad = public."LIS_inventory_stock".cantidad + p_cantidad, updated_at = now();
  end if;

  insert into public."LIS_inventory_movements"(
    organization_id, item_id, sede_id, tipo, cantidad, delta, stock_resultante,
    lote, vencimiento, motivo, referencia, sede_destino_id, costo_unitario, created_by
  ) values (
    v_org, p_item_id, p_sede_id, p_tipo, p_cantidad, v_delta, v_nuevo,
    p_lote, p_vencimiento, p_motivo, p_referencia, p_sede_destino_id, p_costo_unitario, auth.uid()
  ) returning * into v_mov;

  return v_mov;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- C10 · LIS_invoices: impedir comprobantes duplicados
--  · Un solo comprobante ACTIVO por orden (borrador/emitida/pagada).
--    Las filas anuladas o en error_sync no bloquean el reintento.
--  · Correlativo único por (org, proveedor, serie, número): dos emisiones
--    concurrentes ya no pueden compartir número (la segunda recibe 23505).
-- ─────────────────────────────────────────────────────────────
create unique index if not exists "LIS_invoices_order_activa"
  on public."LIS_invoices"(order_id)
  where status not in ('anulada','error_sync');

create unique index if not exists "LIS_invoices_serie_numero"
  on public."LIS_invoices"(organization_id, provider, serie, numero)
  where serie is not null and numero is not null
    and status not in ('anulada','error_sync');
