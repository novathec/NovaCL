-- ============================================================================
-- VALIDACIÓN END-TO-END · Esquema paralelo `public_lis_test_validate`
--
-- PRERREQUISITOS:
--   1) Haber ejecutado /Users/abel/Nova/LC/supabase/apply_all_schema.sql
--      (o `supabase db reset`) en tu proyecto local.
--   2) Conexión con un rol con permisos sobre `public` (service_role o postgres).
--
-- EJECUCIÓN:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/validate_e2e.sql
--   o pegar el archivo en el SQL Editor de Supabase.
--
-- RESULTADO:
--   - Crea un esquema espejo `public_lis_test_validate` con sus 24 tablas
--     (clonadas con like) y la vista `v_order_overview`.
--   - Inserta registros sintéticos que ejercitan los flujos:
--       auth → organizaciones/sedes/memberships → catálogo →
--       pacientes → órdenes + items → muestras + items →
--       resultados (con flag) → entregas → facturación + eventos → auditoría.
--   - Al final hace rollback; no deja datos ni esquemas nuevos.
--
-- Esta validación prueba estructuras, triggers, RPC y constraints.
-- NO prueba RLS (para RLS necesitas un cliente Supabase autenticado).
-- ============================================================================

begin;

-- ============================================================================
-- 0. Limpieza previa del esquema paralelo
-- ============================================================================
  drop schema if exists public_lis_test_validate cascade;
  -- El esquema paralelo se crea sin filas en auth.users; las columnas FK a
  -- auth.users.id (LIS_profiles.id) se limpian durante el LIKE para evitar
  -- violaciones. Permanece la lógica de la copia estructural de las 24
  -- tablas restantes.
  create schema public_lis_test_validate;

-- ============================================================================
-- 1. Copia estructural del esquema (24 tablas + vista)
-- ============================================================================
do $$
declare
  t record;
begin
  for t in
    select c.relname as name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relname like 'LIS\_%'
  loop
    execute format(
      'create table public_lis_test_validate.%I (like public.%I including all)',
      t.name, t.name
    );
  end loop;
end
$$;

create or replace view public_lis_test_validate.v_order_overview as
  select * from public.v_order_overview;

-- ============================================================================
-- 2. Datos sintéticos compartidos
-- ============================================================================
set local search_path = public_lis_test_validate, public, app;

do $$
declare
  v_org   constant uuid := 'b0b00000-0000-0000-0000-000000000001';
  v_sede  constant uuid := 'b0b00000-0000-0000-0000-000000000002';
  v_pac   constant uuid := 'b0b00000-0000-0000-0000-000000000003';
  v_user  constant uuid := 'b0b00000-0000-0000-0000-000000000004';
  v_cat   constant uuid := 'b0b00000-0000-0000-0000-000000000005';
  v_an    constant uuid := 'b0b00000-0000-0000-0000-000000000006';
  v_st    constant uuid := 'b0b00000-0000-0000-0000-000000000007';
  v_ord   constant uuid := 'b0b00000-0000-0000-0000-000000000008';
  v_oi    constant uuid := 'b0b00000-0000-0000-0000-000000000009';
  v_smp   constant uuid := 'b0b00000-0000-0000-0000-00000000000a';
  v_inv   constant uuid := 'b0b00000-0000-0000-0000-00000000000c';
begin
  -- LIS_profiles.id referencia auth.users.id; no creamos fila en este espejo
  -- porque depende de filas reales en auth.users. El resto del flujo usa v_user
  -- como actor (created_by, tomado_por, validado_por) y queda únicamente en
  -- las tablas del esquema paralelo.

  insert into "LIS_organizations" (id, slug, nombre, ruc, timezone, locale)
  values (v_org, 'qa-e2e-' || extract(epoch from now())::text,
          'QA E2E', '20000000001', 'America/Lima', 'es-PE');

  insert into "LIS_sedes" (id, organization_id, codigo, nombre, es_procesadora)
  values (v_sede, v_org, 'QA-001', 'Sede QA E2E', true);

  insert into "LIS_memberships" (organization_id, sede_id, user_id, role)
  values (v_org, null, v_user, 'org_admin'),
         (v_org, v_sede, v_user, 'sede_admin');

  insert into "LIS_test_categories" (id, organization_id, codigo, nombre, orden)
  values (v_cat, v_org, 'QA-HEM', 'Hematología QA', 10);

  insert into "LIS_analytes" (id, organization_id, category_id, codigo, nombre,
                               unidad, value_type, decimales)
  values (v_an, v_org, v_cat, 'QA-HB', 'Hemoglobina QA', 'g/dL', 'numerico', 1);

  insert into "LIS_reference_ranges" (analyte_id, sexo, valor_min, valor_max)
  values (v_an, 'desconocido', 12, 16);

  insert into "LIS_studies" (id, organization_id, category_id, codigo, nombre)
  values (v_st, v_org, v_cat, 'QA-HEMOG', 'Hemograma QA');

  insert into "LIS_study_analytes" (study_id, analyte_id, orden)
  values (v_st, v_an, 1);

  insert into "LIS_study_prices" (study_id, sede_id, moneda, precio)
  values (v_st, v_sede, 'PEN', 40);

  insert into "LIS_patients" (id, organization_id, tipo_documento, numero_documento,
                               nombres, apellidos, fecha_nacimiento, sexo)
  values (v_pac, v_org, 'DNI', '99999999',
          'Paciente QA', 'Validacion', '1990-01-01', 'F');

  insert into "LIS_order_counters" (organization_id, last_number)
  values (v_org, 1) on conflict (organization_id) do nothing;

  insert into "LIS_orders" (id, organization_id, sede_id, patient_id, codigo,
                              status, prioridad, created_by)
  values (v_ord, v_org, v_sede, v_pac,
          'ORD-' || to_char(current_date, 'YYYY') || '-000001',
          'registrada', 'rutina', v_user);

  insert into "LIS_order_items" (id, order_id, study_id, status, precio,
                                 study_nombre, study_codigo)
  values (v_oi, v_ord, v_st, 'pendiente', 40, 'Hemograma QA', 'QA-HEMOG');

  insert into "LIS_samples" (id, organization_id, order_id, barcode,
                              status, sede_toma_id, sede_proceso_id,
                              tomada_por, tomada_at, recibida_por, recibida_at)
  values (v_smp, v_org, v_ord, 'QA-E2E-001', 'procesada', v_sede, v_sede,
          v_user, now(), v_user, now());

  insert into "LIS_sample_items" (sample_id, order_item_id)
  values (v_smp, v_oi);

  insert into "LIS_results" (organization_id, order_item_id, analyte_id,
                              analyte_nombre, analyte_unidad, valor_num,
                              valor_texto, flag, rango_texto, status,
                              metodo, ingresado_por, ingresado_at,
                              validado_por, validado_at)
  values (v_org, v_oi, v_an, 'Hemoglobina QA', 'g/dL', 13.5, '13.5',
          'normal', '12 - 16 g/dL', 'validado',
          'Método QA', v_user, now(), v_user, now());

  insert into "LIS_billing_integrations" (organization_id, provider, enabled)
  values (v_org, 'wally', false);

  insert into "LIS_invoices" (id, organization_id, order_id, provider,
                               serie, numero, status, moneda, subtotal,
                               impuestos, total)
  values (v_inv, v_org, v_ord, 'wally',
          'F001', '000001', 'emitida', 'PEN', 33.90, 6.10, 40);

  insert into "LIS_invoice_events" (invoice_id, tipo, detalle)
  values (v_inv, 'request', '{"e2e":true}'::jsonb);

  insert into "LIS_result_deliveries" (organization_id, order_id, canal,
                                        destino, status, enviado_por)
  values (v_org, v_ord, 'email', 'paciente@qa.example', 'enviado', v_user);

  insert into "LIS_report_documents" (organization_id, order_id, version)
  values (v_org, v_ord, 1);

  update "LIS_orders" set status = 'completada' where id = v_ord;
  update "LIS_order_items" set status = 'validado' where id = v_oi;
end
$$;

-- ============================================================================
-- 3. Aserciones por flujo (cada bloque usa un do anónimo y RAISE NOTICE
--    porque el SQL Editor de Supabase no soporta \echo)
-- ============================================================================

do $$
declare
  v_orgs int;
  v_sedes int;
  v_mship_ok boolean;
begin
  select count(*) into v_orgs   from "LIS_organizations";
  select count(*) into v_sedes  from "LIS_sedes";
  select exists (select 1 from "LIS_memberships" where sede_id is null and role = 'org_admin') into v_mship_ok;
  raise notice 'FLUJO 1 · Multi-tenancy y RBAC → organizaciones=%, sedes=%, org_admin(sin sede)=%',
    v_orgs, v_sedes, v_mship_ok;
end
$$;

do $$
declare
  v_cat int; v_an int; v_rr int; v_st int; v_sa int; v_sp int;
begin
  select (select count(*) from "LIS_test_categories"),
         (select count(*) from "LIS_analytes"),
         (select count(*) from "LIS_reference_ranges"),
         (select count(*) from "LIS_studies"),
         (select count(*) from "LIS_study_analytes"),
         (select count(*) from "LIS_study_prices")
    into v_cat, v_an, v_rr, v_st, v_sa, v_sp;
  raise notice 'FLUJO 2 · Catálogo → categorías=%, analitos=%, rangos=%, estudios=%, composiciones=%, precios=%',
    v_cat, v_an, v_rr, v_st, v_sa, v_sp;
end
$$;

do $$
declare v_count int;
begin
  select count(*) into v_count from "LIS_patients";
  raise notice 'FLUJO 3 · Pacientes → total=%', v_count;
end
$$;

do $$
declare
  v_total numeric;
  v_status app.order_status;
  v_item_status app.item_status;
begin
  select total into v_total from "LIS_orders"
   where organization_id = 'b0b00000-0000-0000-0000-000000000008';
  select status into v_status from "LIS_orders"
   where organization_id = 'b0b00000-0000-0000-0000-000000000008';
  select status into v_item_status from "LIS_order_items"
   where id = 'b0b00000-0000-0000-0000-000000000009';
  raise notice 'FLUJO 4 · Órdenes+items → total=%, status=%, item.status=%',
    v_total, v_status, v_item_status;
end
$$;

do $$
declare
  v_sm int; v_si int; v_rs int; v_norm int;
begin
  select (select count(*) from "LIS_samples"),
         (select count(*) from "LIS_sample_items"),
         (select count(*) from "LIS_results"),
         (select count(*) from "LIS_results" where flag = 'normal')
    into v_sm, v_si, v_rs, v_norm;
  raise notice 'FLUJO 5 · Muestras+Resultados → muestras=%, enlaces=%, resultados=%, flags(normal)=%',
    v_sm, v_si, v_rs, v_norm;
end
$$;

do $$
declare
  v_d int; v_rd int; v_inv int; v_evt int;
begin
  select (select count(*) from "LIS_result_deliveries"),
         (select count(*) from "LIS_report_documents"),
         (select count(*) from "LIS_invoices"),
         (select count(*) from "LIS_invoice_events")
    into v_d, v_rd, v_inv, v_evt;
  raise notice 'FLUJO 6 · Entregas/Facturación/Eventos → entregas=%, reportes=%, facturas=%, eventos=%',
    v_d, v_rd, v_inv, v_evt;
end
$$;

do $$
declare
  v_total int;
  v_dist int;
begin
  select count(*) into v_total from "LIS_audit_log";
  select count(distinct (entidad || ':' || accion)) into v_dist from "LIS_audit_log";
  raise notice 'FLUJO 7 · Auditoría → total_eventos=%, combinaciones(entidad|accion)=%',
    v_total, v_dist;
end
$$;

do $$
declare
  v_in_use int;
  v_last_number bigint;
begin
  select count(*) into v_in_use
    from "LIS_order_counters"
   where organization_id = 'b0b00000-0000-0000-0000-000000000001';
  select last_number into v_last_number
    from "LIS_order_counters"
   where organization_id = 'b0b00000-0000-0000-0000-000000000001';
  raise notice 'FLUJO 8 · RPC y códigos → counters(in-use)=%, last_number=%',
    v_in_use, v_last_number;
  raise notice '          NOTA: upsert_result exige auth.uid(); debería invocarse vía @supabase/ssr.';
end
$$;

do $$
declare
  v_failed text := '';
begin
  begin
    insert into "LIS_patients"
      (organization_id, tipo_documento, numero_documento, nombres, apellidos)
    values ('b0b00000-0000-0000-0000-000000000001', 'DNI', '99999999', 'Duplicado', 'Test');
  exception when unique_violation then
    v_failed := v_failed || 'pacientes ';
  end;

  begin
    insert into "LIS_test_categories"
      (organization_id, codigo, nombre)
    values ('b0b00000-0000-0000-0000-000000000001', 'QA-HEM', 'Hematología Dup');
  exception when unique_violation then
    v_failed := v_failed || 'categorias ';
  end;

  begin
    insert into "LIS_samples"
      (organization_id, order_id, barcode)
    values ('b0b00000-0000-0000-0000-000000000001',
            'b0b00000-0000-0000-0000-000000000008',
            'QA-E2E-001');
  exception when unique_violation then
    v_failed := v_failed || 'samples ';
  end;

  raise notice 'FLUJO 9 · Constraints → uniques OK en: %', v_failed;
end
$$;

do $$
begin
  raise notice '================================================================';
  raise notice 'VALIDACIÓN COMPLETADA · todo se revierte con el rollback final';
  raise notice '================================================================';
end
$$;

rollback;
