-- ============================================================================
-- 0017 · Autoría visible + auditoría por sede y ampliada
--
-- 1. El trigger genérico de auditoría ahora captura la SEDE (antes siempre
--    quedaba NULL): permite revisar la actividad de los usuarios en cada sede.
-- 2. La agenda expone quién creó cada cita (nombre del autor).
-- 3. Nueva vista v_order_item_authors: por estudio, qué tecnólogo ingresó el
--    resultado y quién lo validó (con nombre y fecha).
-- 4. Se auditan las demás entidades que generan datos y aún no lo estaban
--    (catálogo, ítems de muestra, sedes, informes, integraciones…).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- Trigger genérico de auditoría, ahora consciente de la sede.
-- Deriva organización y sede de la propia fila o de sus entidades padre
-- (orden, ítem de orden, muestra). Backward-compatible con las tablas que ya
-- lo usan: solo añade el poblado de sede_id y amplía el fallback de org.
-- ─────────────────────────────────────────────────────────────
create or replace function app.audit_trigger()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_old   jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else null end;
  v_new   jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else null end;
  v_row   jsonb := coalesce(v_new, v_old);
  v_org   uuid;
  v_sede  uuid;
  v_id    text;
  v_diff  jsonb := '{}'::jsonb;
  v_key   text;
  v_email text;
begin
  -- organización: directa
  begin v_org := (v_row->>'organization_id')::uuid; exception when others then v_org := null; end;
  -- sede: directa
  begin v_sede := (v_row->>'sede_id')::uuid; exception when others then v_sede := null; end;

  -- Derivar org/sede desde la orden (order_items, samples, appointments…)
  if (v_org is null or v_sede is null) and (v_row ? 'order_id')
     and (v_row->>'order_id') is not null then
    select coalesce(v_org, o.organization_id), coalesce(v_sede, o.sede_id)
      into v_org, v_sede
    from public."LIS_orders" o where o.id = (v_row->>'order_id')::uuid;
  end if;

  -- Derivar desde el ítem de orden → orden (results)
  if (v_org is null or v_sede is null) and (v_row ? 'order_item_id')
     and (v_row->>'order_item_id') is not null then
    select coalesce(v_org, o.organization_id), coalesce(v_sede, o.sede_id)
      into v_org, v_sede
    from public."LIS_order_items" oi
    join public."LIS_orders" o on o.id = oi.order_id
    where oi.id = (v_row->>'order_item_id')::uuid;
  end if;

  -- Derivar desde la muestra → orden (sample_items)
  if (v_org is null or v_sede is null) and (v_row ? 'sample_id')
     and (v_row->>'sample_id') is not null then
    select coalesce(v_org, o.organization_id), coalesce(v_sede, o.sede_id)
      into v_org, v_sede
    from public."LIS_samples" sm
    join public."LIS_orders" o on o.id = sm.order_id
    where sm.id = (v_row->>'sample_id')::uuid;
  end if;

  v_id := coalesce(v_row->>'id', '');

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_new->v_key is distinct from v_old->v_key
         and v_key not in ('updated_at') then
        v_diff := v_diff || jsonb_build_object(
          v_key, jsonb_build_object('de', v_old->v_key, 'a', v_new->v_key)
        );
      end if;
    end loop;
    if v_diff = '{}'::jsonb then
      return coalesce(new, old);
    end if;
  end if;

  select email into v_email from public."LIS_profiles" where id = auth.uid();

  insert into public."LIS_audit_log"(
    organization_id, sede_id, actor_id, actor_email, entidad, entidad_id,
    accion, cambios, estado_anterior, estado_nuevo
  ) values (
    v_org, v_sede, auth.uid(), v_email, tg_table_name, v_id,
    tg_op, nullif(v_diff, '{}'::jsonb), v_old, v_new
  );

  return coalesce(new, old);
end;
$$;

create index if not exists "LIS_idx_audit_sede" on public."LIS_audit_log"(sede_id);

-- ─────────────────────────────────────────────────────────────
-- Agenda: exponer quién creó la cita (created_by → nombre del autor).
--
-- IMPORTANTE: CREATE OR REPLACE VIEW no permite reordenar ni renombrar
-- columnas existentes, solo agregar columnas nuevas al final. Por eso
-- created_by/creado_por se añaden DESPUÉS de order_codigo, preservando el
-- orden y nombre exactos de las 23 columnas originales (definidas en
-- 0011_scheduling.sql).
-- ─────────────────────────────────────────────────────────────
create or replace view public.v_agenda
with (security_invoker = true) as
select
  a.id,
  a.organization_id,
  a.sede_id,
  a.patient_id,
  a.order_id,
  a.fecha,
  a.hora_inicio,
  a.duracion_min,
  a.status,
  a.motivo,
  a.study_ids,
  a.medico_solicitante,
  a.canal,
  a.notas,
  a.created_at,
  s.nombre                             as sede_nombre,
  (p.nombres || ' ' || p.apellidos)    as paciente,
  p.tipo_documento,
  p.numero_documento,
  p.telefono,
  p.sexo,
  p.fecha_nacimiento,
  o.codigo                             as order_codigo,
  a.created_by,
  coalesce(nullif(cb.nombre, ''), cb.email)  as creado_por
from public."LIS_appointments" a
join public."LIS_sedes" s    on s.id = a.sede_id
join public."LIS_patients" p on p.id = a.patient_id
left join public."LIS_orders" o    on o.id = a.order_id
left join public."LIS_profiles" cb on cb.id = a.created_by;

-- ─────────────────────────────────────────────────────────────
-- Autoría del examen por estudio: qué tecnólogo ingresó el resultado
-- (analista) y quién lo validó, con nombre y fecha. Se toma el registro
-- más reciente de cada rol entre los analitos del estudio.
-- ─────────────────────────────────────────────────────────────
create or replace view public.v_order_item_authors
with (security_invoker = true) as
select
  oi.id                          as order_item_id,
  oi.order_id,
  ing.uid                        as ingresado_por,
  coalesce(nullif(ip.nombre, ''), ip.email) as analista_nombre,
  ing.at                         as ingresado_at,
  val.uid                        as validado_por,
  coalesce(nullif(vp.nombre, ''), vp.email) as validador_nombre,
  val.at                         as validado_at
from public."LIS_order_items" oi
left join lateral (
  select r.ingresado_por as uid, r.ingresado_at as at
  from public."LIS_results" r
  where r.order_item_id = oi.id and r.ingresado_por is not null
  order by r.ingresado_at desc nulls last
  limit 1
) ing on true
left join lateral (
  select r.validado_por as uid, r.validado_at as at
  from public."LIS_results" r
  where r.order_item_id = oi.id and r.validado_por is not null
  order by r.validado_at desc nulls last
  limit 1
) val on true
left join public."LIS_profiles" ip on ip.id = ing.uid
left join public."LIS_profiles" vp on vp.id = val.uid;

-- ─────────────────────────────────────────────────────────────
-- Auditar las demás entidades que generan datos.
--   · Vínculo muestra–estudio (qué estudios cubre cada muestra)
--   · Catálogo (estudios, analitos, rangos, precios, categorías, tipos)
--   · Sedes y organización (estructura del tenant)
--   · Informes archivados e integración de facturación
-- ─────────────────────────────────────────────────────────────
drop trigger if exists trg_audit_sample_items on public."LIS_sample_items";
create trigger trg_audit_sample_items
  after insert or update or delete on public."LIS_sample_items"
  for each row execute function app.audit_trigger();

drop trigger if exists trg_audit_studies on public."LIS_studies";
create trigger trg_audit_studies
  after insert or update or delete on public."LIS_studies"
  for each row execute function app.audit_trigger();
drop trigger if exists trg_audit_study_analytes on public."LIS_study_analytes";
create trigger trg_audit_study_analytes
  after insert or update or delete on public."LIS_study_analytes"
  for each row execute function app.audit_trigger();
drop trigger if exists trg_audit_study_prices on public."LIS_study_prices";
create trigger trg_audit_study_prices
  after insert or update or delete on public."LIS_study_prices"
  for each row execute function app.audit_trigger();
drop trigger if exists trg_audit_analytes on public."LIS_analytes";
create trigger trg_audit_analytes
  after insert or update or delete on public."LIS_analytes"
  for each row execute function app.audit_trigger();
drop trigger if exists trg_audit_reference_ranges on public."LIS_reference_ranges";
create trigger trg_audit_reference_ranges
  after insert or update or delete on public."LIS_reference_ranges"
  for each row execute function app.audit_trigger();
drop trigger if exists trg_audit_test_categories on public."LIS_test_categories";
create trigger trg_audit_test_categories
  after insert or update or delete on public."LIS_test_categories"
  for each row execute function app.audit_trigger();
drop trigger if exists trg_audit_specimen_types on public."LIS_specimen_types";
create trigger trg_audit_specimen_types
  after insert or update or delete on public."LIS_specimen_types"
  for each row execute function app.audit_trigger();

drop trigger if exists trg_audit_sedes on public."LIS_sedes";
create trigger trg_audit_sedes
  after insert or update or delete on public."LIS_sedes"
  for each row execute function app.audit_trigger();
drop trigger if exists trg_audit_organizations on public."LIS_organizations";
create trigger trg_audit_organizations
  after insert or update or delete on public."LIS_organizations"
  for each row execute function app.audit_trigger();

drop trigger if exists trg_audit_report_documents on public."LIS_report_documents";
create trigger trg_audit_report_documents
  after insert or update or delete on public."LIS_report_documents"
  for each row execute function app.audit_trigger();
drop trigger if exists trg_audit_billing_integrations on public."LIS_billing_integrations";
create trigger trg_audit_billing_integrations
  after insert or update or delete on public."LIS_billing_integrations"
  for each row execute function app.audit_trigger();
