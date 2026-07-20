-- ============================================================================
-- SEED · Santa Lucia (La Merced) y Ceramed (Cusco + Lima) — Nova Lab
--   Idempotente, autocontenido y seguro para reejecución.
--
--   EJECUCIÓN:
--     1) Haber ejecutado /Users/abel/Nova/LC/supabase/apply_all_schema.sql
--        (o `supabase db reset`).
--     2) Requiere un perfil global con es_superadmin=true (el mismo que
--        detecta seed_nova_clinic.sql). Si no existe, aborta con un error
--        claro.
--     3) psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--          -f supabase/seed_clinicas_demo.sql
--
--   EFECTOS:
--     - Crea "Santa Lucia" con su sede "La Merced".
--     - Crea "Ceramed" con dos sedes (Cusco y Lima). Solo para esta clínica
--       se generan datos semilla: pacientes, órdenes, muestras, resultados,
--       facturas y entradas de auditoría.
--     - Vincula al perfil superadmin con memberships org_admin y sede_admin.
--     - Revierte todo si algo falla (transacción begin/commit).
--
--   REVERTIR MANUALMENTE:
--     delete from public."LIS_organizations" where slug in ('santa-lucia','ceramed');
-- ============================================================================

begin;

do $$
declare
  v_admin uuid;
  v_admin_email text;

  v_sl_org  constant uuid := '73616e74616c75-0000-0000-0000-000000000001';
  v_sl_sede constant uuid := '73616e74616c75-0000-0000-0000-000000000002';

  v_cm_org   constant uuid := '636572616d6564-0000-0000-0000-000000000001';
  v_cm_cusco constant uuid := '636572616d6564-0000-0000-0000-000000000002';
  v_cm_lima  constant uuid := '636572616d6564-0000-0000-0000-000000000003';

  v_sl_cat   constant uuid := '73616e74616c75-0000-0000-0000-000000000010';
  v_sl_a_glu constant uuid := '73616e74616c75-0000-0000-0000-000000000020';
  v_sl_st    constant uuid := '73616e74616c75-0000-0000-0000-000000000030';

  v_cm_cat   constant uuid := '636572616d6564-0000-0000-0000-000000000010';
  v_cm_a_hb  constant uuid := '636572616d6564-0000-0000-0000-000000000020';
  v_cm_a_glu constant uuid := '636572616d6564-0000-0000-0000-000000000021';
  v_cm_a_tgo constant uuid := '636572616d6564-0000-0000-0000-000000000022';
  v_cm_st    constant uuid := '636572616d6564-0000-0000-0000-000000000030';

  v_p_cm_1 constant uuid := '636572616d6564-0000-0000-0000-000000000101';
  v_p_cm_2 constant uuid := '636572616d6564-0000-0000-0000-000000000102';
  v_p_cm_3 constant uuid := '636572616d6564-0000-0000-0000-000000000103';
  v_p_cm_4 constant uuid := '636572616d6564-0000-0000-0000-000000000104';

  v_o_cm_1 constant uuid := '636572616d6564-0000-0000-0000-000000000201';
  v_o_cm_2 constant uuid := '636572616d6564-0000-0000-0000-000000000202';
  v_o_cm_3 constant uuid := '636572616d6564-0000-0000-0000-000000000203';

  v_i_o_cm_1_hem constant uuid := '636572616d6564-0000-0000-0000-000000000301';
  v_i_o_cm_1_glu constant uuid := '636572616d6564-0000-0000-0000-000000000302';
  v_i_o_cm_2_lip constant uuid := '636572616d6564-0000-0000-0000-000000000303';
  v_i_o_cm_3_lip constant uuid := '636572616d6564-0000-0000-0000-000000000304';

  v_smp_cm_1 constant uuid := '636572616d6564-0000-0000-0000-000000000401';
  v_smp_cm_2 constant uuid := '636572616d6564-0000-0000-0000-000000000402';

  v_inv_cm_2 constant uuid := '636572616d6564-0000-0000-0000-000000000501';
  v_inv_cm_3 constant uuid := '636572616d6564-0000-0000-0000-000000000502';
begin
  select u.id, u.email
    into v_admin, v_admin_email
    from auth.users u
    join public."LIS_profiles" p on p.id = u.id
   where p.es_superadmin
   order by p.created_at
   limit 1;

  if v_admin is null then
    raise exception 'No existe un perfil global con es_superadmin=true. Crea o promueve un administrador antes de ejecutar este seed.';
  end if;

  perform 1
    from public."LIS_sedes"
   where id in (v_sl_sede, v_cm_cusco, v_cm_lima)
     and organization_id not in (v_sl_org, v_cm_org);

  if found then
    raise exception 'Algún UUID reservado pertenece a otra organización.';
  end if;

  perform 1
    from public."LIS_organizations"
   where id in (v_sl_org, v_cm_org);

  if found then
    raise exception 'Algún UUID reservado ya pertenece a otra organización.';
  end if;

  if exists (select 1 from public."LIS_organizations" where slug = 'santa-lucia') then
    delete from public."LIS_audit_log"
     where organization_id = (select id from public."LIS_organizations" where slug = 'santa-lucia');
    delete from public."LIS_order_items" oi
      using public."LIS_orders" o
      where oi.order_id = o.id
        and o.organization_id = (select id from public."LIS_organizations" where slug = 'santa-lucia');
    delete from public."LIS_orders"
     where organization_id = (select id from public."LIS_organizations" where slug = 'santa-lucia');
    delete from public."LIS_organizations" where slug = 'santa-lucia';
  end if;

  if exists (select 1 from public."LIS_organizations" where slug = 'ceramed') then
    delete from public."LIS_audit_log"
     where organization_id = (select id from public."LIS_organizations" where slug = 'ceramed');
    delete from public."LIS_order_items" oi
      using public."LIS_orders" o
      where oi.order_id = o.id
        and o.organization_id = (select id from public."LIS_organizations" where slug = 'ceramed');
    delete from public."LIS_orders"
     where organization_id = (select id from public."LIS_organizations" where slug = 'ceramed');
    delete from public."LIS_organizations" where slug = 'ceramed';
  end if;

  -- ============================================================
  -- Santa Lucia (La Merced)
  -- ============================================================
  insert into public."LIS_organizations" (
    id, slug, nombre, ruc, logo_url, timezone, locale, activo, settings
  ) values (
    v_sl_org,
    'santa-lucia',
    'Santa Lucia',
    '20448888991',
    '/demo/santa-lucia/logo.svg',
    'America/Lima',
    'es-PE',
    true,
    jsonb_build_object(
      'demo', true,
      'seed', 'clinicas_demo',
      'razon_social', 'Centro Medico Santa Lucia S.A.C.',
      'moneda', 'PEN',
      'igv', 0.18,
      'numeracion_ordenes', 'SLU',
      'ubicacion', 'Selva central',
      'ciudad', 'La Merced'
    )
  );

  insert into public."LIS_sedes" (
    id, organization_id, codigo, nombre, direccion, telefono, email,
    es_procesadora, activo, settings
  ) values (
    v_sl_sede,
    v_sl_org,
    'SLU-MER',
    'Santa Lucia La Merced',
    'Jr. San Carlos 215, La Merced, Chanchamayo, Junín',
    '+51 64 530 100',
    'lamerced@santa-lucia.example',
    true,
    true,
    jsonb_build_object(
      'demo', true,
      'horario', jsonb_build_object(
        'lunes_viernes', '07:00-18:00',
        'sabado', '07:00-13:00'
      ),
      'capacidad_muestras_dia', 60,
      'region', 'Selva central'
    )
  );

  insert into public."LIS_memberships" (
    id, organization_id, sede_id, user_id, role, activo
  ) values
    (gen_random_uuid(), v_sl_org, null, v_admin, 'org_admin', true),
    (gen_random_uuid(), v_sl_org, v_sl_sede, v_admin, 'sede_admin', true);

  -- ============================================================
  -- Ceramed (Cusco + Lima)
  -- ============================================================
  insert into public."LIS_organizations" (
    id, slug, nombre, ruc, logo_url, timezone, locale, activo, settings
  ) values (
    v_cm_org,
    'ceramed',
    'Ceramed',
    '20557777992',
    '/demo/ceramed/logo.svg',
    'America/Lima',
    'es-PE',
    true,
    jsonb_build_object(
      'demo', true,
      'seed', 'clinicas_demo',
      'razon_social', 'Ceramed S.A.',
      'moneda', 'PEN',
      'igv', 0.18,
      'numeracion_ordenes', 'CER',
      'multisede', true,
      'region_principal', 'Cusco'
    )
  );

  insert into public."LIS_sedes" (
    id, organization_id, codigo, nombre, direccion, telefono, email,
    es_procesadora, activo, settings
  ) values
    (
      v_cm_cusco,
      v_cm_org,
      'CER-CUS',
      'Ceramed Cusco',
      'Av. El Sol 410, Cusco, Cusco',
      '+51 84 235 600',
      'cusco@ceramed.example',
      true,
      true,
      jsonb_build_object(
        'demo', true,
        'horario', jsonb_build_object(
          'lunes_sabado', '06:30-19:00'
        ),
        'capacidad_muestras_dia', 220,
        'altitud_msnm', 3399,
        'cobertura', 'Cusco, Valle Sagrado, Sicuani'
      )
    ),
    (
      v_cm_lima,
      v_cm_org,
      'CER-LIM',
      'Ceramed Lima',
      'Av. Javier Prado Oeste 1234, Magdalena del Mar, Lima',
      '+51 1 460 1100',
      'lima@ceramed.example',
      false,
      true,
      jsonb_build_object(
        'demo', true,
        'horario', jsonb_build_object(
          'lunes_viernes', '07:00-20:00'
        ),
        'capacidad_muestras_dia', 90,
        'cobertura', 'Lima Metropolitana'
      )
    );

  insert into public."LIS_memberships" (
    id, organization_id, sede_id, user_id, role, activo
  ) values
    (gen_random_uuid(), v_cm_org, null, v_admin, 'org_admin', true),
    (gen_random_uuid(), v_cm_org, v_cm_cusco, v_admin, 'sede_admin', true),
    (gen_random_uuid(), v_cm_org, v_cm_lima, v_admin, 'sede_admin', true);

  -- ============================================================
  -- Catálogo propio de Ceramed (analitos + estudios + rangos)
  -- ============================================================
  insert into public."LIS_test_categories" (
    id, organization_id, codigo, nombre, orden
  ) values
    (v_cm_cat, v_cm_org, 'CER-CORE', 'Core clínico Ceramed', 10);

  insert into public."LIS_analytes" (
    id, organization_id, category_id, codigo, nombre, abreviatura, loinc_code,
    unidad, value_type, decimales, metodo, orden, activo, created_at, updated_at
  ) values
    (v_cm_a_hb,  v_cm_org, v_cm_cat, 'CER-HB',  'Hemoglobina', 'Hb',  '718-7',  'g/dL',   'numerico', 1, 'Cianometahemoglobina',  10, true, now() - interval '40 days', now()),
    (v_cm_a_glu, v_cm_org, v_cm_cat, 'CER-GLU', 'Glucosa',     'Glu', '2345-7', 'mg/dL',  'numerico', 0, 'Hexoquinasa',           20, true, now() - interval '40 days', now()),
    (v_cm_a_tgo, v_cm_org, v_cm_cat, 'CER-TGO', 'TGO (AST)',  'AST', '1920-8', 'U/L',    'numerico', 0, 'Cinetico UV',           30, true, now() - interval '40 days', now());

  insert into public."LIS_reference_ranges" (
    analyte_id, sexo, valor_min, valor_max, critico_min, critico_max
  ) values
    (v_cm_a_hb,  'desconocido', 12, 16, 7, 20),
    (v_cm_a_glu, 'desconocido', 70, 100, 40, 400),
    (v_cm_a_tgo, 'desconocido', 5, 40, 0, 1000);

  insert into public."LIS_studies" (
    id, organization_id, category_id, codigo, nombre,
    tiempo_entrega_h, requiere_ayuno, activo, created_at, updated_at
  ) values
    (v_cm_st, v_cm_org, v_cm_cat, 'CER-PERFIL', 'Perfil basal Ceramed',
     6, true, true, now() - interval '30 days', now());

  insert into public."LIS_study_analytes" (
    study_id, analyte_id, orden
  ) values
    (v_cm_st, v_cm_a_hb, 10),
    (v_cm_st, v_cm_a_glu, 20),
    (v_cm_st, v_cm_a_tgo, 30);

  insert into public."LIS_study_prices" (
    study_id, sede_id, moneda, precio, vigente_desde, activo
  ) values
    (v_cm_st, v_cm_cusco, 'PEN', 75, current_date - 30, true),
    (v_cm_st, v_cm_lima,  'PEN', 110, current_date - 30, true);

  -- ============================================================
  -- Pacientes y órdenes demo de Ceramed
  -- ============================================================
  insert into public."LIS_patients" (
    id, organization_id, tipo_documento, numero_documento, nombres, apellidos,
    fecha_nacimiento, sexo, telefono, email, direccion, metadata
  ) values
    (v_p_cm_1, v_cm_org, 'DNI', '70441111', 'Ana Lucia', 'Quispe Mamani',
     '1992-08-12', 'F', '+51 984 411 111', 'ana.quispe@ceramed-demo.example',
     'Av. Cultura 245, Cusco',
     jsonb_build_object('demo', true, 'grupo_sanguineo', 'O+', 'seguro', 'Particular')),
    (v_p_cm_2, v_cm_org, 'DNI', '70441112', 'Jorge Luis', 'Huaman Cardenas',
     '1985-03-04', 'M', '+51 984 411 112', 'jorge.huaman@ceramed-demo.example',
     'Av. La Cultura 512, Cusco',
     jsonb_build_object('demo', true, 'grupo_sanguineo', 'A+', 'seguro', 'EsSalud')),
    (v_p_cm_3, v_cm_org, 'DNI', '70441113', 'Maria Fernanda', 'Lozano Quispe',
     '1998-12-22', 'F', '+51 984 411 113', 'maria.lozano@ceramed-demo.example',
     'Calle Santa Catalina 312, Cusco',
     jsonb_build_object('demo', true, 'grupo_sanguineo', 'B-', 'seguro', 'Pacifico')),
    (v_p_cm_4, v_cm_org, 'CE', 'CE-CER-0014', 'Sebastian', 'Torres Mendoza',
     '1979-06-30', 'M', '+51 984 411 114', 'sebastian.torres@ceramed-demo.example',
     'Av. Pardo y Aliaga 480, San Isidro, Lima',
     jsonb_build_object('demo', true, 'grupo_sanguineo', 'AB+', 'seguro', 'Particular'));

  insert into public."LIS_orders" (
    id, organization_id, sede_id, patient_id, codigo, status, prioridad,
    medico_solicitante, observaciones, created_by
  ) values
    (v_o_cm_1, v_cm_org, v_cm_cusco, v_p_cm_1, 'CER-' || to_char(current_date, 'YYYY') || '-000001',
     'en_proceso', 'rutina', 'Dra. Carmen Tito CMP 88912', 'Chequeo preventivo anual', v_admin),
    (v_o_cm_2, v_cm_org, v_cm_cusco, v_p_cm_2, 'CER-' || to_char(current_date, 'YYYY') || '-000002',
     'completada', 'rutina', 'Dr. Jose Pillco CMP 80923', 'Control de salud previo a campana', v_admin),
    (v_o_cm_3, v_cm_org, v_cm_lima, v_p_cm_4, 'CER-' || to_char(current_date, 'YYYY') || '-000003',
     'parcial', 'urgente', 'Dra. Lucia Ramos CMP 91240', 'Seguimiento hepatico trimestral', v_admin);

  insert into public."LIS_order_items" (
    id, order_id, study_id, status, precio, study_nombre, study_codigo
  ) values
    (v_i_o_cm_1_hem, v_o_cm_1, v_cm_st, 'en_proceso', 75.00, 'Perfil basal Ceramed', 'CER-PERFIL'),
    (v_i_o_cm_1_glu, v_o_cm_1, v_cm_st, 'pendiente', 75.00, 'Perfil basal Ceramed', 'CER-PERFIL'),
    (v_i_o_cm_2_lip, v_o_cm_2, v_cm_st, 'validado',   75.00, 'Perfil basal Ceramed', 'CER-PERFIL'),
    (v_i_o_cm_3_lip, v_o_cm_3, v_cm_st, 'en_proceso', 110.00, 'Perfil basal Ceramed', 'CER-PERFIL');

  insert into public."LIS_samples" (
    id, organization_id, order_id, specimen_type_id, barcode, status,
    sede_toma_id, sede_proceso_id, tomada_por, tomada_at, recibida_por, recibida_at,
    observaciones
  ) values
    (v_smp_cm_1, v_cm_org, v_o_cm_2,
     (select id from public."LIS_specimen_types" where codigo = 'SUERO'),
     'CER-CUS-000002', 'procesada',
     v_cm_cusco, v_cm_cusco, v_admin, now() - interval '2 days',
     v_admin, now() - interval '47 hours',
     'Muestra de control previo a campana de altura'),
    (v_smp_cm_2, v_cm_org, v_o_cm_3,
     (select id from public."LIS_specimen_types" where codigo = 'SUERO'),
     'CER-LIM-000003', 'procesada',
     v_cm_lima, v_cm_lima, v_admin, now() - interval '26 hours',
     v_admin, now() - interval '25 hours',
     'Muestra tomada en sede Lima y procesada localmente');

  insert into public."LIS_sample_items" (sample_id, order_item_id)
  values
    (v_smp_cm_1, v_i_o_cm_2_lip),
    (v_smp_cm_2, v_i_o_cm_3_lip);

  insert into public."LIS_results" (
    organization_id, order_item_id, analyte_id, analyte_nombre, analyte_unidad,
    valor_num, valor_texto, flag, rango_texto, status, metodo,
    ingresado_por, validado_por, nota
  ) values
    (v_cm_org, v_i_o_cm_2_lip, v_cm_a_hb,  'Hemoglobina', 'g/dL',
     14.6, '14.6', 'normal', '12 - 16 g/dL', 'validado', 'Cianometahemoglobina',
     v_admin, v_admin, 'Resultado dentro de rango; paciente aclimatado.'),
    (v_cm_org, v_i_o_cm_2_lip, v_cm_a_glu, 'Glucosa', 'mg/dL',
     92, '92', 'normal', '70 - 100 mg/dL', 'validado', 'Hexoquinasa',
     v_admin, v_admin, 'Ayuno confirmado por el paciente.'),
    (v_cm_org, v_i_o_cm_2_lip, v_cm_a_tgo, 'TGO (AST)', 'U/L',
     55, '55', 'alto', '5 - 40 U/L', 'validado', 'Cinetico UV',
     v_admin, v_admin, 'Valor elevado; repetir en 30 dias y correlacionar.');

  insert into public."LIS_result_deliveries" (
    organization_id, order_id, canal, destino, status, enviado_por
  ) values
    (v_cm_org, v_o_cm_2, 'email', 'jorge.huaman@ceramed-demo.example', 'enviado', v_admin);

  insert into public."LIS_billing_integrations" (
    organization_id, provider, enabled, config, credential_ref
  ) values
    (v_cm_org, 'wally', false,
     jsonb_build_object('modo', 'simulacion', 'igv_incluido', true, 'moneda', 'PEN'),
     'vault:ceramed-wally-demo');

  insert into public."LIS_invoices" (
    id, organization_id, order_id, provider, serie, numero, status,
    moneda, subtotal, impuestos, total
  ) values
    (v_inv_cm_2, v_cm_org, v_o_cm_2, 'wally', 'F001', '000002', 'pagada',
     'PEN', 63.56, 11.44, 75.00),
    (v_inv_cm_3, v_cm_org, v_o_cm_3, 'wally', 'F001', '000003', 'emitida',
     'PEN', 93.22, 16.78, 110.00);

  insert into public."LIS_invoice_events" (invoice_id, tipo, detalle)
  values
    (v_inv_cm_2, 'request',
     '{"demo":true,"operacion":"emitir","serie":"F001","numero":"000002"}'::jsonb),
    (v_inv_cm_2, 'response',
     '{"demo":true,"estado":"emitida","sunat":"aceptado"}'::jsonb),
    (v_inv_cm_2, 'webhook',
     '{"demo":true,"evento":"payment.confirmed","medio":"transferencia"}'::jsonb);

  -- ============================================================
  -- Atribuir audit log residual al superadmin para Ceramed
  -- ============================================================
  update public."LIS_audit_log"
     set sede_id = coalesce(sede_id, v_cm_cusco),
         actor_id = coalesce(actor_id, v_admin),
         actor_email = coalesce(actor_email, v_admin_email),
         contexto = coalesce(contexto, '{}'::jsonb) || jsonb_build_object(
           'origen', 'seed_clinicas_demo',
           'clinica', 'Ceramed'
         )
   where organization_id = v_cm_org;

  raise notice 'Seed completo: Santa Lucia (La Merced) y Ceramed (Cusco + Lima) listos.';
  raise notice 'Usuario superadmin vinculado: % (%)', v_admin_email, v_admin;
end
$$;

commit;