begin;

do $$
declare
  v_admin_email text;
  v_admin uuid;
  v_previous_org uuid;
  v_org constant uuid := '4e6f7661-436c-496e-8000-000000000001';
  v_sede constant uuid := '4e6f7661-436c-496e-8000-000000000002';
  v_spec_blood uuid;
  v_spec_serum uuid;
  v_spec_urine uuid;
  v_cat_hem uuid;
  v_cat_bio uuid;
  v_cat_inm uuid;
  v_a_hb uuid;
  v_a_wbc uuid;
  v_a_plt uuid;
  v_a_glu uuid;
  v_a_ct uuid;
  v_a_hdl uuid;
  v_a_ldl uuid;
  v_a_tg uuid;
  v_a_crp uuid;
  v_a_blood_group uuid;
  v_st_hem uuid;
  v_st_glu uuid;
  v_st_lipid uuid;
  v_st_crp uuid;
  v_st_blood_group uuid;
  v_p1 uuid;
  v_p2 uuid;
  v_p3 uuid;
  v_p4 uuid;
  v_p5 uuid;
  v_p6 uuid;
  v_p7 uuid;
  v_o1 uuid;
  v_o2 uuid;
  v_o3 uuid;
  v_o4 uuid;
  v_o5 uuid;
  v_o6 uuid;
  v_o7 uuid;
  v_code1 text := 'ORD-' || to_char(current_date, 'YYYY') || '-000001';
  v_code2 text := 'ORD-' || to_char(current_date, 'YYYY') || '-000002';
  v_code3 text := 'ORD-' || to_char(current_date, 'YYYY') || '-000003';
  v_code4 text := 'ORD-' || to_char(current_date, 'YYYY') || '-000004';
  v_code5 text := 'ORD-' || to_char(current_date, 'YYYY') || '-000005';
  v_code6 text := 'ORD-' || to_char(current_date, 'YYYY') || '-000006';
  v_code7 text := 'ORD-' || to_char(current_date, 'YYYY') || '-000007';
  v_i_o1_hem uuid;
  v_i_o2_glu uuid;
  v_i_o3_crp uuid;
  v_i_o4_hem uuid;
  v_i_o4_glu uuid;
  v_i_o5_lipid uuid;
  v_i_o6_hem uuid;
  v_i_o6_glu uuid;
  v_i_o6_blood_group uuid;
  v_i_o7_crp uuid;
  v_s2 uuid;
  v_s3 uuid;
  v_s4 uuid;
  v_s4_serum uuid;
  v_s5 uuid;
  v_s6 uuid;
  v_s6_serum uuid;
  v_inv4 uuid;
  v_inv5 uuid;
  v_inv6 uuid;
  v_inv7 uuid;
  -- historico para analitica y agenda
  v_pats uuid[];
  v_day int;
  v_j int;
  v_nord int;
  v_ncitas int;
  v_hist int := 0;
  v_code_h text;
  v_o_h uuid;
  v_i_h uuid;
  v_pat uuid;
  v_kind int;
  v_created timestamptz;
  v_valid timestamptz;
  v_estado_h app.order_status;
  v_prio_h app.order_priority;
  v_study_h uuid;
  v_precio_h numeric;
  v_snom_h text;
  v_scod_h text;
  v_val numeric;
  v_flag_h app.result_flag;
  v_sub_h numeric;
  v_cstatus app.appointment_status;
  v_canal_h text;
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

  select id
  into v_previous_org
  from public."LIS_organizations"
  where slug = 'nova-clinic'
  limit 1;

  if exists (
    select 1
    from public."LIS_sedes"
    where id = v_sede
      and organization_id <> v_org
  ) then
    raise exception 'El UUID reservado para la sede Nova Clinic pertenece a otro tenant.';
  end if;

  if v_previous_org is not null then
    if v_previous_org <> v_org or not exists (
      select 1
      from public."LIS_organizations"
      where id = v_org
        and slug = 'nova-clinic'
        and settings @> '{"demo":true}'::jsonb
    ) then
      raise exception 'El slug nova-clinic pertenece a un tenant que no fue creado por este seed.';
    end if;

    delete from public."LIS_audit_log"
    where organization_id = v_previous_org;

    delete from public."LIS_order_items" oi
    using public."LIS_orders" o
    where oi.order_id = o.id
      and o.organization_id = v_previous_org;

    delete from public."LIS_orders"
    where organization_id = v_previous_org;

    delete from public."LIS_organizations"
    where id = v_previous_org;

    delete from public."LIS_audit_log"
    where organization_id = v_previous_org;
  end if;

  if exists (
    select 1
    from public."LIS_organizations"
    where id = v_org
  ) then
    raise exception 'El UUID reservado para Nova Clinic ya pertenece a otra organización.';
  end if;

  insert into public."LIS_profiles" (
    id,
    email,
    nombre,
    telefono,
    avatar_url,
    es_superadmin,
    created_at,
    updated_at
  ) values (
    v_admin,
    v_admin_email,
    'Javier Hinostroza',
    '+51 999 555 010',
    '/demo/nova-clinic/avatar-admin.svg',
    false,
    now() - interval '180 days',
    now()
  )
  on conflict (id) do nothing;

  insert into public."LIS_organizations" (
    id,
    slug,
    nombre,
    ruc,
    logo_url,
    timezone,
    locale,
    activo,
    settings,
    created_at,
    updated_at
  ) values (
    v_org,
    'nova-clinic',
    'Nova Clinic',
    '20609999123',
    '/demo/nova-clinic/logo.svg',
    'America/Lima',
    'es-PE',
    true,
    jsonb_build_object(
      'demo', true,
      'seed', 'nova_clinic_demo',
      'razon_social', 'Nova Clinic S.A.C.',
      'moneda', 'PEN',
      'igv', 0.18,
      'numeracion_ordenes', 'ORD',
      'notificaciones', jsonb_build_object('email', true, 'whatsapp', true),
      'reporte', jsonb_build_object('color_primario', '#2563EB', 'firma_digital', true)
    ),
    now() - interval '180 days',
    now()
  );

  insert into public."LIS_sedes" (
    id,
    organization_id,
    codigo,
    nombre,
    direccion,
    telefono,
    email,
    es_procesadora,
    activo,
    settings,
    created_at,
    updated_at
  ) values (
    v_sede,
    v_org,
    'NOVA-001',
    'Nova Clinic',
    'Av. Javier Prado Este 2450, San Borja, Lima',
    '+51 1 640-9080',
    'sede@nova-clinic.example',
    true,
    true,
    jsonb_build_object(
      'demo', true,
      'horario', jsonb_build_object('lunes_viernes', '07:00-20:00', 'sabado', '07:00-14:00'),
      'capacidad_muestras_dia', 180,
      'impresora_etiquetas', 'Zebra ZD421',
      'procesamiento_urgencias', true
    ),
    now() - interval '180 days',
    now()
  );

  insert into public."LIS_memberships" (
    id,
    organization_id,
    sede_id,
    user_id,
    role,
    activo,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    v_org,
    null,
    v_admin,
    'org_admin',
    true,
    now() - interval '180 days',
    now()
  );

  insert into public."LIS_memberships" (
    id,
    organization_id,
    sede_id,
    user_id,
    role,
    activo,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    v_org,
    v_sede,
    v_admin,
    'sede_admin',
    true,
    now() - interval '180 days',
    now()
  );

  insert into public."LIS_specimen_types" (
    id,
    codigo,
    nombre,
    descripcion,
    activo
  ) values (
    gen_random_uuid(),
    'SANGRE',
    'Sangre total',
    'Sangre total recolectada en tubo EDTA para hematología y tipificación.',
    true
  )
  on conflict (codigo) do nothing;

  select id into v_spec_blood
  from public."LIS_specimen_types"
  where codigo = 'SANGRE';

  insert into public."LIS_specimen_types" (
    id,
    codigo,
    nombre,
    descripcion,
    activo
  ) values (
    gen_random_uuid(),
    'SUERO',
    'Suero',
    'Suero separado en tubo con gel para pruebas bioquímicas e inmunológicas.',
    true
  )
  on conflict (codigo) do nothing;

  select id into v_spec_serum
  from public."LIS_specimen_types"
  where codigo = 'SUERO';

  insert into public."LIS_specimen_types" (
    id,
    codigo,
    nombre,
    descripcion,
    activo
  ) values (
    gen_random_uuid(),
    'ORINA',
    'Orina',
    'Muestra de orina fresca recolectada en frasco estéril.',
    true
  )
  on conflict (codigo) do nothing;

  select id into v_spec_urine
  from public."LIS_specimen_types"
  where codigo = 'ORINA';

  insert into public."LIS_test_categories" (
    id,
    organization_id,
    codigo,
    nombre,
    descripcion,
    orden,
    activo,
    created_at
  ) values (
    gen_random_uuid(),
    v_org,
    'NOVA-HEM',
    'Hematología',
    'Pruebas hematológicas y evaluación de células sanguíneas.',
    10,
    true,
    now() - interval '170 days'
  ) returning id into v_cat_hem;

  insert into public."LIS_test_categories" (
    id,
    organization_id,
    codigo,
    nombre,
    descripcion,
    orden,
    activo,
    created_at
  ) values (
    gen_random_uuid(),
    v_org,
    'NOVA-BIO',
    'Bioquímica',
    'Química sanguínea, metabolismo y perfiles cardiovasculares.',
    20,
    true,
    now() - interval '170 days'
  ) returning id into v_cat_bio;

  insert into public."LIS_test_categories" (
    id,
    organization_id,
    codigo,
    nombre,
    descripcion,
    orden,
    activo,
    created_at
  ) values (
    gen_random_uuid(),
    v_org,
    'NOVA-INM',
    'Inmunología',
    'Marcadores inflamatorios y pruebas inmunohematológicas.',
    30,
    true,
    now() - interval '170 days'
  ) returning id into v_cat_inm;

  insert into public."LIS_analytes" (
    id, organization_id, category_id, codigo, nombre, abreviatura, loinc_code,
    unidad, value_type, opciones, decimales, metodo, orden, activo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_cat_hem, 'NOVA-HB', 'Hemoglobina', 'Hb', '718-7',
    'g/dL', 'numerico', '{"formato":"decimal","precision":1}'::jsonb, 1,
    'Fotometría de cianometahemoglobina', 10, true, now() - interval '165 days', now()
  ) returning id into v_a_hb;

  insert into public."LIS_analytes" (
    id, organization_id, category_id, codigo, nombre, abreviatura, loinc_code,
    unidad, value_type, opciones, decimales, metodo, orden, activo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_cat_hem, 'NOVA-WBC', 'Leucocitos', 'WBC', '6690-2',
    '10^3/uL', 'numerico', '{"formato":"decimal","precision":1}'::jsonb, 1,
    'Citometría de flujo', 20, true, now() - interval '165 days', now()
  ) returning id into v_a_wbc;

  insert into public."LIS_analytes" (
    id, organization_id, category_id, codigo, nombre, abreviatura, loinc_code,
    unidad, value_type, opciones, decimales, metodo, orden, activo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_cat_hem, 'NOVA-PLT', 'Plaquetas', 'PLT', '777-3',
    '10^3/uL', 'numerico', '{"formato":"entero","precision":0}'::jsonb, 0,
    'Impedancia eléctrica', 30, true, now() - interval '165 days', now()
  ) returning id into v_a_plt;

  insert into public."LIS_analytes" (
    id, organization_id, category_id, codigo, nombre, abreviatura, loinc_code,
    unidad, value_type, opciones, decimales, metodo, orden, activo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_cat_bio, 'NOVA-GLU', 'Glucosa', 'GLU', '2345-7',
    'mg/dL', 'numerico', '{"formato":"entero","precision":0}'::jsonb, 0,
    'Hexoquinasa', 10, true, now() - interval '165 days', now()
  ) returning id into v_a_glu;

  insert into public."LIS_analytes" (
    id, organization_id, category_id, codigo, nombre, abreviatura, loinc_code,
    unidad, value_type, opciones, decimales, metodo, orden, activo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_cat_bio, 'NOVA-CT', 'Colesterol total', 'CT', '2093-3',
    'mg/dL', 'numerico', '{"formato":"entero","precision":0}'::jsonb, 0,
    'Enzimático colorimétrico', 20, true, now() - interval '165 days', now()
  ) returning id into v_a_ct;

  insert into public."LIS_analytes" (
    id, organization_id, category_id, codigo, nombre, abreviatura, loinc_code,
    unidad, value_type, opciones, decimales, metodo, orden, activo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_cat_bio, 'NOVA-HDL', 'Colesterol HDL', 'HDL', '2085-9',
    'mg/dL', 'numerico', '{"formato":"entero","precision":0}'::jsonb, 0,
    'Enzimático homogéneo', 30, true, now() - interval '165 days', now()
  ) returning id into v_a_hdl;

  insert into public."LIS_analytes" (
    id, organization_id, category_id, codigo, nombre, abreviatura, loinc_code,
    unidad, value_type, opciones, decimales, metodo, orden, activo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_cat_bio, 'NOVA-LDL', 'Colesterol LDL calculado', 'LDL', '13457-7',
    'mg/dL', 'numerico', '{"formato":"entero","precision":0,"calculado":true}'::jsonb, 0,
    'Fórmula de Friedewald', 40, true, now() - interval '165 days', now()
  ) returning id into v_a_ldl;

  insert into public."LIS_analytes" (
    id, organization_id, category_id, codigo, nombre, abreviatura, loinc_code,
    unidad, value_type, opciones, decimales, metodo, orden, activo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_cat_bio, 'NOVA-TG', 'Triglicéridos', 'TG', '2571-8',
    'mg/dL', 'numerico', '{"formato":"entero","precision":0}'::jsonb, 0,
    'Glicerol fosfato oxidasa', 50, true, now() - interval '165 days', now()
  ) returning id into v_a_tg;

  insert into public."LIS_analytes" (
    id, organization_id, category_id, codigo, nombre, abreviatura, loinc_code,
    unidad, value_type, opciones, decimales, metodo, orden, activo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_cat_inm, 'NOVA-CRP', 'Proteína C Reactiva', 'PCR', '1988-5',
    'mg/L', 'numerico', '{"formato":"decimal","precision":1}'::jsonb, 1,
    'Inmunoturbidimetría', 10, true, now() - interval '165 days', now()
  ) returning id into v_a_crp;

  insert into public."LIS_analytes" (
    id, organization_id, category_id, codigo, nombre, abreviatura, loinc_code,
    unidad, value_type, opciones, decimales, metodo, orden, activo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_cat_inm, 'NOVA-GRH', 'Grupo sanguíneo y factor Rh', 'GR/Rh', '883-9',
    'clasificación', 'opcion', '["A+","A-","B+","B-","AB+","AB-","O+","O-"]'::jsonb, 0,
    'Aglutinación en tarjeta', 20, true, now() - interval '165 days', now()
  ) returning id into v_a_blood_group;

  insert into public."LIS_reference_ranges" (
    id, analyte_id, sexo, edad_min_dias, edad_max_dias, valor_min, valor_max,
    critico_min, critico_max, texto_normal, nota, created_at
  ) values
    (gen_random_uuid(), v_a_hb, 'M', 0, 6569, 11.5, 15.5, 7.0, 20.0, '11.5 - 15.5 g/dL', 'Rango pediátrico masculino demostrativo.', now() - interval '160 days'),
    (gen_random_uuid(), v_a_hb, 'M', 6570, 43800, 13.5, 17.5, 7.0, 20.0, '13.5 - 17.5 g/dL', 'Adultos masculinos; interpretar según contexto clínico.', now() - interval '160 days'),
    (gen_random_uuid(), v_a_hb, 'F', 6570, 43800, 12.0, 16.0, 7.0, 20.0, '12.0 - 16.0 g/dL', 'Adultas no gestantes; interpretar según contexto clínico.', now() - interval '160 days'),
    (gen_random_uuid(), v_a_wbc, 'desconocido', 0, 43800, 4.0, 11.0, 1.0, 30.0, '4.0 - 11.0 10^3/uL', 'Rango general demostrativo.', now() - interval '160 days'),
    (gen_random_uuid(), v_a_plt, 'desconocido', 0, 43800, 150, 450, 20, 1000, '150 - 450 10^3/uL', 'Rango general demostrativo.', now() - interval '160 days'),
    (gen_random_uuid(), v_a_glu, 'desconocido', 0, 43800, 70, 100, 40, 400, '70 - 100 mg/dL', 'Muestra en ayunas.', now() - interval '160 days'),
    (gen_random_uuid(), v_a_ct, 'desconocido', 6570, 43800, 100, 199, 60, 400, 'Deseable: menor de 200 mg/dL', 'Riesgo cardiovascular según guía clínica.', now() - interval '160 days'),
    (gen_random_uuid(), v_a_hdl, 'desconocido', 6570, 43800, 40, 90, 20, 120, '40 - 90 mg/dL', 'Valores altos suelen ser protectores.', now() - interval '160 days'),
    (gen_random_uuid(), v_a_ldl, 'desconocido', 6570, 43800, 0, 129, 0, 300, 'Óptimo: menor de 130 mg/dL', 'Meta ajustable al riesgo cardiovascular.', now() - interval '160 days'),
    (gen_random_uuid(), v_a_tg, 'desconocido', 6570, 43800, 30, 149, 10, 500, '30 - 149 mg/dL', 'Muestra en ayunas de 8 a 12 horas.', now() - interval '160 days'),
    (gen_random_uuid(), v_a_crp, 'desconocido', 0, 43800, 0, 5, 0, 100, '0.0 - 5.0 mg/L', 'Marcador inespecífico de inflamación.', now() - interval '160 days');

  insert into public."LIS_studies" (
    id, organization_id, category_id, specimen_type_id, codigo, nombre, descripcion,
    loinc_code, tiempo_entrega_h, requiere_ayuno, indicaciones, activo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_cat_hem, v_spec_blood, 'NOVA-HEMOG', 'Hemograma automatizado',
    'Evaluación hematológica con hemoglobina, leucocitos y plaquetas.', '57021-8', 4, false,
    'No requiere ayuno. Informar medicamentos y transfusiones recientes.', true,
    now() - interval '155 days', now()
  ) returning id into v_st_hem;

  insert into public."LIS_studies" (
    id, organization_id, category_id, specimen_type_id, codigo, nombre, descripcion,
    loinc_code, tiempo_entrega_h, requiere_ayuno, indicaciones, activo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_cat_bio, v_spec_serum, 'NOVA-GLUCO', 'Glucosa en ayunas',
    'Cuantificación de glucosa sérica para tamizaje metabólico.', '1558-6', 3, true,
    'Ayuno de 8 horas. Solo se permite agua.', true,
    now() - interval '155 days', now()
  ) returning id into v_st_glu;

  insert into public."LIS_studies" (
    id, organization_id, category_id, specimen_type_id, codigo, nombre, descripcion,
    loinc_code, tiempo_entrega_h, requiere_ayuno, indicaciones, activo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_cat_bio, v_spec_serum, 'NOVA-PLIP', 'Perfil lipídico completo',
    'Colesterol total, HDL, LDL calculado y triglicéridos.', '57698-3', 6, true,
    'Ayuno de 10 a 12 horas y evitar alcohol durante 24 horas.', true,
    now() - interval '155 days', now()
  ) returning id into v_st_lipid;

  insert into public."LIS_studies" (
    id, organization_id, category_id, specimen_type_id, codigo, nombre, descripcion,
    loinc_code, tiempo_entrega_h, requiere_ayuno, indicaciones, activo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_cat_inm, v_spec_serum, 'NOVA-PCR', 'Proteína C Reactiva cuantitativa',
    'Determinación cuantitativa de proteína C reactiva.', '1988-5', 4, false,
    'No requiere ayuno. Informar síntomas infecciosos recientes.', true,
    now() - interval '155 days', now()
  ) returning id into v_st_crp;

  insert into public."LIS_studies" (
    id, organization_id, category_id, specimen_type_id, codigo, nombre, descripcion,
    loinc_code, tiempo_entrega_h, requiere_ayuno, indicaciones, activo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_cat_inm, v_spec_blood, 'NOVA-GRH', 'Grupo sanguíneo y factor Rh',
    'Tipificación ABO y determinación del factor Rh.', '883-9', 2, false,
    'No requiere preparación especial. Presentar documento de identidad.', true,
    now() - interval '155 days', now()
  ) returning id into v_st_blood_group;

  insert into public."LIS_study_analytes" (
    id, study_id, analyte_id, orden, formula
  ) values
    (gen_random_uuid(), v_st_hem, v_a_hb, 10, 'valor_directo'),
    (gen_random_uuid(), v_st_hem, v_a_wbc, 20, 'valor_directo'),
    (gen_random_uuid(), v_st_hem, v_a_plt, 30, 'valor_directo'),
    (gen_random_uuid(), v_st_glu, v_a_glu, 10, 'valor_directo'),
    (gen_random_uuid(), v_st_lipid, v_a_ct, 10, 'valor_directo'),
    (gen_random_uuid(), v_st_lipid, v_a_hdl, 20, 'valor_directo'),
    (gen_random_uuid(), v_st_lipid, v_a_tg, 30, 'valor_directo'),
    (gen_random_uuid(), v_st_lipid, v_a_ldl, 40, 'CT - HDL - (TG / 5)'),
    (gen_random_uuid(), v_st_crp, v_a_crp, 10, 'valor_directo'),
    (gen_random_uuid(), v_st_blood_group, v_a_blood_group, 10, 'valor_directo');

  insert into public."LIS_study_prices" (
    id, study_id, sede_id, moneda, precio, vigente_desde, activo
  ) values
    (gen_random_uuid(), v_st_hem, v_sede, 'PEN', 45.00, current_date - 120, true),
    (gen_random_uuid(), v_st_glu, v_sede, 'PEN', 20.00, current_date - 120, true),
    (gen_random_uuid(), v_st_lipid, v_sede, 'PEN', 85.00, current_date - 120, true),
    (gen_random_uuid(), v_st_crp, v_sede, 'PEN', 50.00, current_date - 120, true),
    (gen_random_uuid(), v_st_blood_group, v_sede, 'PEN', 25.00, current_date - 120, true);

  insert into public."LIS_patients" (
    id, organization_id, tipo_documento, numero_documento, nombres, apellidos,
    fecha_nacimiento, sexo, telefono, email, direccion, portal_user_id, metadata,
    created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, 'DNI', '70010001', 'María Elena', 'Quispe Flores',
    '1988-04-12', 'F', '+51 987 100 001', 'maria.quispe@pacientes.example',
    'Jr. Las Magnolias 245, San Borja, Lima', null,
    '{"demo":true,"grupo_sanguineo":"O+","seguro":"Rimac","contacto_emergencia":"+51 987 900 001"}'::jsonb,
    now() - interval '150 days', now() - interval '3 days'
  ) returning id into v_p1;

  insert into public."LIS_patients" (
    id, organization_id, tipo_documento, numero_documento, nombres, apellidos,
    fecha_nacimiento, sexo, telefono, email, direccion, portal_user_id, metadata,
    created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, 'DNI', '70010002', 'Carlos Alberto', 'Mendoza Ruiz',
    '1976-09-23', 'M', '+51 987 100 002', 'carlos.mendoza@pacientes.example',
    'Av. San Luis 1820, San Borja, Lima', null,
    '{"demo":true,"grupo_sanguineo":"A+","seguro":"Pacifico","alergias":["penicilina"]}'::jsonb,
    now() - interval '145 days', now() - interval '4 days'
  ) returning id into v_p2;

  insert into public."LIS_patients" (
    id, organization_id, tipo_documento, numero_documento, nombres, apellidos,
    fecha_nacimiento, sexo, telefono, email, direccion, portal_user_id, metadata,
    created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, 'CE', 'CE-NOVA-003', 'Sofía', 'Rossi Bianchi',
    '1995-02-08', 'F', '+51 987 100 003', 'sofia.rossi@pacientes.example',
    'Calle Los Sauces 451, Surco, Lima', null,
    '{"demo":true,"grupo_sanguineo":"B+","seguro":"Particular","idioma":"es"}'::jsonb,
    now() - interval '120 days', now() - interval '1 day'
  ) returning id into v_p3;

  insert into public."LIS_patients" (
    id, organization_id, tipo_documento, numero_documento, nombres, apellidos,
    fecha_nacimiento, sexo, telefono, email, direccion, portal_user_id, metadata,
    created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, 'DNI', '70010004', 'Luis Fernando', 'Paredes Soto',
    '1982-11-17', 'M', '+51 987 100 004', 'luis.paredes@pacientes.example',
    'Av. Canadá 3280, San Luis, Lima', null,
    '{"demo":true,"grupo_sanguineo":"O-","seguro":"Mapfre","antecedentes":["hipertension"]}'::jsonb,
    now() - interval '90 days', now() - interval '1 day'
  ) returning id into v_p4;

  insert into public."LIS_patients" (
    id, organization_id, tipo_documento, numero_documento, nombres, apellidos,
    fecha_nacimiento, sexo, telefono, email, direccion, portal_user_id, metadata,
    created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, 'DNI', '70010005', 'Rosa Angélica', 'Huamán Díaz',
    '1963-06-30', 'F', '+51 987 100 005', 'rosa.huaman@pacientes.example',
    'Jr. Junín 842, Cercado de Lima, Lima', null,
    '{"demo":true,"grupo_sanguineo":"A-","seguro":"EsSalud","antecedentes":["diabetes tipo 2"]}'::jsonb,
    now() - interval '80 days', now() - interval '2 days'
  ) returning id into v_p5;

  insert into public."LIS_patients" (
    id, organization_id, tipo_documento, numero_documento, nombres, apellidos,
    fecha_nacimiento, sexo, telefono, email, direccion, portal_user_id, metadata,
    created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, 'DNI', '70010006', 'Diego Sebastián', 'Salazar León',
    '2014-03-14', 'M', '+51 987 100 006', 'apoderado.diego@pacientes.example',
    'Calle Las Orquídeas 120, La Molina, Lima', null,
    '{"demo":true,"grupo_sanguineo":"AB+","seguro":"Sanitas","apoderado":"Patricia León"}'::jsonb,
    now() - interval '45 days', now() - interval '3 days'
  ) returning id into v_p6;

  insert into public."LIS_patients" (
    id, organization_id, tipo_documento, numero_documento, nombres, apellidos,
    fecha_nacimiento, sexo, telefono, email, direccion, portal_user_id, metadata,
    created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, 'PASAPORTE', 'PE-NOVA-007', 'Alex', 'Torres Vega',
    '1991-08-05', 'otro', '+51 987 100 007', 'alex.torres@pacientes.example',
    'Av. Arequipa 2244, Lince, Lima', null,
    '{"demo":true,"grupo_sanguineo":"B-","seguro":"Particular","nombre_social":"Alex"}'::jsonb,
    now() - interval '30 days', now() - interval '4 days'
  ) returning id into v_p7;

  insert into public."LIS_orders" (
    id, organization_id, sede_id, patient_id, codigo, status, prioridad,
    medico_solicitante, diagnostico, observaciones, moneda, total, created_by,
    created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_sede, v_p1, v_code1, 'registrada', 'rutina',
    'Dra. Valeria Campos CMP 84521', 'Chequeo preventivo anual',
    'Paciente en ayunas; pendiente de toma de muestra.', 'PEN', 0, v_admin,
    now() - interval '20 minutes', now() - interval '20 minutes'
  ) returning id into v_o1;

  insert into public."LIS_orders" (
    id, organization_id, sede_id, patient_id, codigo, status, prioridad,
    medico_solicitante, diagnostico, observaciones, moneda, total, created_by,
    created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_sede, v_p2, v_code2, 'en_toma', 'urgente',
    'Dr. Martín Reyes CMP 71204', 'Hiperglucemia sintomática',
    'Primera muestra rechazada por hemólisis; requiere nueva toma.', 'PEN', 0, v_admin,
    now() - interval '2 hours', now() - interval '90 minutes'
  ) returning id into v_o2;

  insert into public."LIS_orders" (
    id, organization_id, sede_id, patient_id, codigo, status, prioridad,
    medico_solicitante, diagnostico, observaciones, moneda, total, created_by,
    created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_sede, v_p3, v_code3, 'en_proceso', 'stat',
    'Dra. Camila Núñez CMP 80117', 'Síndrome febril agudo',
    'Procesamiento prioritario; resultado preliminar disponible.', 'PEN', 0, v_admin,
    now() - interval '5 hours', now() - interval '40 minutes'
  ) returning id into v_o3;

  insert into public."LIS_orders" (
    id, organization_id, sede_id, patient_id, codigo, status, prioridad,
    medico_solicitante, diagnostico, observaciones, moneda, total, created_by,
    created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_sede, v_p4, v_code4, 'parcial', 'urgente',
    'Dr. Renato Vargas CMP 66510', 'Fatiga y mareos recurrentes',
    'Hemograma validado; glucosa aún pendiente.', 'PEN', 0, v_admin,
    now() - interval '1 day', now() - interval '6 hours'
  ) returning id into v_o4;

  insert into public."LIS_orders" (
    id, organization_id, sede_id, patient_id, codigo, status, prioridad,
    medico_solicitante, diagnostico, observaciones, moneda, total, created_by,
    created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_sede, v_p5, v_code5, 'completada', 'rutina',
    'Dra. Valeria Campos CMP 84521', 'Control de dislipidemia',
    'Resultados validados y listos para entrega.', 'PEN', 0, v_admin,
    now() - interval '2 days', now() - interval '1 day'
  ) returning id into v_o5;

  insert into public."LIS_orders" (
    id, organization_id, sede_id, patient_id, codigo, status, prioridad,
    medico_solicitante, diagnostico, observaciones, moneda, total, created_by,
    created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_sede, v_p6, v_code6, 'entregada', 'rutina',
    'Dr. Álvaro Peña CMP 59021', 'Evaluación preoperatoria pediátrica',
    'Resultados entregados al apoderado mediante portal seguro.', 'PEN', 0, v_admin,
    now() - interval '3 days', now() - interval '2 days'
  ) returning id into v_o6;

  insert into public."LIS_orders" (
    id, organization_id, sede_id, patient_id, codigo, status, prioridad,
    medico_solicitante, diagnostico, observaciones, moneda, total, created_by,
    created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_sede, v_p7, v_code7, 'anulada', 'rutina',
    'Dra. Mónica Silva CMP 77403', 'Control inflamatorio',
    'Orden anulada por duplicidad antes del procesamiento.', 'PEN', 0, v_admin,
    now() - interval '4 days', now() - interval '4 days'
  ) returning id into v_o7;

  insert into public."LIS_order_items" (
    id, order_id, study_id, status, precio, descuento, study_nombre, study_codigo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_o1, v_st_hem, 'pendiente', 45.00, 0.00,
    'Hemograma automatizado', 'NOVA-HEMOG', now() - interval '20 minutes', now() - interval '20 minutes'
  ) returning id into v_i_o1_hem;

  insert into public."LIS_order_items" (
    id, order_id, study_id, status, precio, descuento, study_nombre, study_codigo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_o2, v_st_glu, 'pendiente', 20.00, 0.00,
    'Glucosa en ayunas', 'NOVA-GLUCO', now() - interval '2 hours', now() - interval '90 minutes'
  ) returning id into v_i_o2_glu;

  insert into public."LIS_order_items" (
    id, order_id, study_id, status, precio, descuento, study_nombre, study_codigo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_o3, v_st_crp, 'en_proceso', 50.00, 0.00,
    'Proteína C Reactiva cuantitativa', 'NOVA-PCR', now() - interval '5 hours', now() - interval '40 minutes'
  ) returning id into v_i_o3_crp;

  insert into public."LIS_order_items" (
    id, order_id, study_id, status, precio, descuento, study_nombre, study_codigo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_o4, v_st_hem, 'en_proceso', 45.00, 5.00,
    'Hemograma automatizado', 'NOVA-HEMOG', now() - interval '1 day', now() - interval '6 hours'
  ) returning id into v_i_o4_hem;

  insert into public."LIS_order_items" (
    id, order_id, study_id, status, precio, descuento, study_nombre, study_codigo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_o4, v_st_glu, 'pendiente', 20.00, 0.00,
    'Glucosa en ayunas', 'NOVA-GLUCO', now() - interval '1 day', now() - interval '6 hours'
  ) returning id into v_i_o4_glu;

  insert into public."LIS_order_items" (
    id, order_id, study_id, status, precio, descuento, study_nombre, study_codigo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_o5, v_st_lipid, 'en_proceso', 85.00, 10.00,
    'Perfil lipídico completo', 'NOVA-PLIP', now() - interval '2 days', now() - interval '1 day'
  ) returning id into v_i_o5_lipid;

  insert into public."LIS_order_items" (
    id, order_id, study_id, status, precio, descuento, study_nombre, study_codigo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_o6, v_st_hem, 'en_proceso', 45.00, 5.00,
    'Hemograma automatizado', 'NOVA-HEMOG', now() - interval '3 days', now() - interval '2 days'
  ) returning id into v_i_o6_hem;

  insert into public."LIS_order_items" (
    id, order_id, study_id, status, precio, descuento, study_nombre, study_codigo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_o6, v_st_glu, 'en_proceso', 20.00, 0.00,
    'Glucosa en ayunas', 'NOVA-GLUCO', now() - interval '3 days', now() - interval '2 days'
  ) returning id into v_i_o6_glu;

  insert into public."LIS_order_items" (
    id, order_id, study_id, status, precio, descuento, study_nombre, study_codigo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_o6, v_st_blood_group, 'en_proceso', 25.00, 0.00,
    'Grupo sanguíneo y factor Rh', 'NOVA-GRH', now() - interval '3 days', now() - interval '2 days'
  ) returning id into v_i_o6_blood_group;

  insert into public."LIS_order_items" (
    id, order_id, study_id, status, precio, descuento, study_nombre, study_codigo, created_at, updated_at
  ) values (
    gen_random_uuid(), v_o7, v_st_crp, 'pendiente', 50.00, 0.00,
    'Proteína C Reactiva cuantitativa', 'NOVA-PCR', now() - interval '4 days', now() - interval '4 days'
  ) returning id into v_i_o7_crp;

  insert into public."LIS_samples" (
    id, organization_id, order_id, specimen_type_id, barcode, status, sede_toma_id,
    sede_proceso_id, tomada_por, tomada_at, recibida_por, recibida_at,
    motivo_rechazo, observaciones, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_o2, v_spec_serum, 'NOVA-CLINIC-DEMO-0002', 'rechazada', v_sede,
    v_sede, v_admin, now() - interval '110 minutes', v_admin, now() - interval '100 minutes',
    'Hemólisis moderada detectada durante la recepción.',
    'Se notificó a toma de muestra y se solicitó una nueva recolección.',
    now() - interval '2 hours', now() - interval '100 minutes'
  ) returning id into v_s2;

  insert into public."LIS_samples" (
    id, organization_id, order_id, specimen_type_id, barcode, status, sede_toma_id,
    sede_proceso_id, tomada_por, tomada_at, recibida_por, recibida_at,
    motivo_rechazo, observaciones, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_o3, v_spec_serum, 'NOVA-CLINIC-DEMO-0003', 'en_analisis', v_sede,
    v_sede, v_admin, now() - interval '4 hours 40 minutes', v_admin, now() - interval '4 hours 20 minutes',
    null, 'Muestra priorizada en analizador por solicitud STAT.',
    now() - interval '5 hours', now() - interval '40 minutes'
  ) returning id into v_s3;

  insert into public."LIS_samples" (
    id, organization_id, order_id, specimen_type_id, barcode, status, sede_toma_id,
    sede_proceso_id, tomada_por, tomada_at, recibida_por, recibida_at,
    motivo_rechazo, observaciones, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_o4, v_spec_blood, 'NOVA-CLINIC-DEMO-0004', 'procesada', v_sede,
    v_sede, v_admin, now() - interval '23 hours', v_admin, now() - interval '22 hours 40 minutes',
    null, 'Muestra íntegra; procesamiento de hemograma completado.',
    now() - interval '1 day', now() - interval '6 hours'
  ) returning id into v_s4;

  insert into public."LIS_samples" (
    id, organization_id, order_id, specimen_type_id, barcode, status, sede_toma_id,
    sede_proceso_id, tomada_por, tomada_at, recibida_por, recibida_at,
    motivo_rechazo, observaciones, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_o4, v_spec_serum, 'NOVA-CLINIC-DEMO-0004-S', 'recibida', v_sede,
    v_sede, v_admin, now() - interval '23 hours', v_admin, now() - interval '22 hours 35 minutes',
    null, 'Suero recibido y conservado para procesamiento de glucosa pendiente.',
    now() - interval '1 day', now() - interval '6 hours'
  ) returning id into v_s4_serum;

  insert into public."LIS_samples" (
    id, organization_id, order_id, specimen_type_id, barcode, status, sede_toma_id,
    sede_proceso_id, tomada_por, tomada_at, recibida_por, recibida_at,
    motivo_rechazo, observaciones, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_o5, v_spec_serum, 'NOVA-CLINIC-DEMO-0005', 'procesada', v_sede,
    v_sede, v_admin, now() - interval '47 hours', v_admin, now() - interval '46 hours 45 minutes',
    null, 'Suero sin interferencias visibles; perfil lipídico completado.',
    now() - interval '2 days', now() - interval '1 day'
  ) returning id into v_s5;

  insert into public."LIS_samples" (
    id, organization_id, order_id, specimen_type_id, barcode, status, sede_toma_id,
    sede_proceso_id, tomada_por, tomada_at, recibida_por, recibida_at,
    motivo_rechazo, observaciones, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_o6, v_spec_blood, 'NOVA-CLINIC-DEMO-0006', 'procesada', v_sede,
    v_sede, v_admin, now() - interval '71 hours', v_admin, now() - interval '70 hours 45 minutes',
    null, 'Muestra pediátrica procesada con volumen adecuado.',
    now() - interval '3 days', now() - interval '2 days'
  ) returning id into v_s6;

  insert into public."LIS_samples" (
    id, organization_id, order_id, specimen_type_id, barcode, status, sede_toma_id,
    sede_proceso_id, tomada_por, tomada_at, recibida_por, recibida_at,
    motivo_rechazo, observaciones, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_o6, v_spec_serum, 'NOVA-CLINIC-DEMO-0006-S', 'procesada', v_sede,
    v_sede, v_admin, now() - interval '71 hours', v_admin, now() - interval '70 hours 40 minutes',
    null, 'Suero pediátrico sin hemólisis procesado para glucosa.',
    now() - interval '3 days', now() - interval '2 days'
  ) returning id into v_s6_serum;

  insert into public."LIS_sample_items" (
    id, sample_id, order_item_id
  ) values
    (gen_random_uuid(), v_s2, v_i_o2_glu),
    (gen_random_uuid(), v_s3, v_i_o3_crp),
    (gen_random_uuid(), v_s4, v_i_o4_hem),
    (gen_random_uuid(), v_s4_serum, v_i_o4_glu),
    (gen_random_uuid(), v_s5, v_i_o5_lipid),
    (gen_random_uuid(), v_s6, v_i_o6_hem),
    (gen_random_uuid(), v_s6_serum, v_i_o6_glu),
    (gen_random_uuid(), v_s6, v_i_o6_blood_group);

  insert into public."LIS_results" (
    id, organization_id, order_item_id, analyte_id, analyte_nombre, analyte_unidad,
    valor_num, valor_texto, flag, rango_texto, status, metodo, ingresado_por,
    ingresado_at, validado_por, validado_at, nota, created_at, updated_at
  ) values
    (gen_random_uuid(), v_org, v_i_o3_crp, v_a_crp, 'Proteína C Reactiva', 'mg/L',
     18.4, '18.4', 'alto', '0.0 - 5.0 mg/L', 'preliminar', 'Inmunoturbidimetría', v_admin,
     now() - interval '50 minutes', null, null, 'Resultado preliminar correlacionado con cuadro febril.',
     now() - interval '50 minutes', now() - interval '40 minutes'),
    (gen_random_uuid(), v_org, v_i_o4_hem, v_a_hb, 'Hemoglobina', 'g/dL',
     13.8, '13.8', 'normal', '13.5 - 17.5 g/dL', 'validado', 'Fotometría de cianometahemoglobina', v_admin,
     now() - interval '7 hours', v_admin, now() - interval '6 hours', 'Resultado verificado sin observaciones.',
     now() - interval '7 hours', now() - interval '6 hours'),
    (gen_random_uuid(), v_org, v_i_o4_hem, v_a_wbc, 'Leucocitos', '10^3/uL',
     12.7, '12.7', 'alto', '4.0 - 11.0 10^3/uL', 'validado', 'Citometría de flujo', v_admin,
     now() - interval '7 hours', v_admin, now() - interval '6 hours', 'Leucocitosis leve; correlacionar clínicamente.',
     now() - interval '7 hours', now() - interval '6 hours'),
    (gen_random_uuid(), v_org, v_i_o4_hem, v_a_plt, 'Plaquetas', '10^3/uL',
     280, '280', 'normal', '150 - 450 10^3/uL', 'validado', 'Impedancia eléctrica', v_admin,
     now() - interval '7 hours', v_admin, now() - interval '6 hours', 'Conteo plaquetario dentro de rango.',
     now() - interval '7 hours', now() - interval '6 hours'),
    (gen_random_uuid(), v_org, v_i_o5_lipid, v_a_ct, 'Colesterol total', 'mg/dL',
     245, '245', 'alto', 'Deseable: menor de 200 mg/dL', 'validado', 'Enzimático colorimétrico', v_admin,
     now() - interval '26 hours', v_admin, now() - interval '25 hours', 'Valor elevado confirmado en repetición.',
     now() - interval '26 hours', now() - interval '25 hours'),
    (gen_random_uuid(), v_org, v_i_o5_lipid, v_a_hdl, 'Colesterol HDL', 'mg/dL',
     38, '38', 'bajo', '40 - 90 mg/dL', 'validado', 'Enzimático homogéneo', v_admin,
     now() - interval '26 hours', v_admin, now() - interval '25 hours', 'HDL discretamente disminuido.',
     now() - interval '26 hours', now() - interval '25 hours'),
    (gen_random_uuid(), v_org, v_i_o5_lipid, v_a_tg, 'Triglicéridos', 'mg/dL',
     620, '620', 'critico_alto', '30 - 149 mg/dL', 'validado', 'Glicerol fosfato oxidasa', v_admin,
     now() - interval '26 hours', v_admin, now() - interval '25 hours', 'Valor crítico comunicado telefónicamente al médico solicitante.',
     now() - interval '26 hours', now() - interval '25 hours'),
    (gen_random_uuid(), v_org, v_i_o5_lipid, v_a_ldl, 'Colesterol LDL calculado', 'mg/dL',
     null, 'No calculable: TG >= 400 mg/dL', 'anormal', 'Óptimo: menor de 130 mg/dL', 'validado', 'Fórmula de Friedewald', v_admin,
     now() - interval '26 hours', v_admin, now() - interval '25 hours', 'No se informa LDL calculado porque los triglicéridos superan 400 mg/dL.',
     now() - interval '26 hours', now() - interval '25 hours'),
    (gen_random_uuid(), v_org, v_i_o6_hem, v_a_hb, 'Hemoglobina', 'g/dL',
     11.2, '11.2', 'bajo', '11.5 - 15.5 g/dL', 'validado', 'Fotometría de cianometahemoglobina', v_admin,
     now() - interval '50 hours', v_admin, now() - interval '49 hours', 'Hemoglobina discretamente baja para el rango pediátrico.',
     now() - interval '50 hours', now() - interval '49 hours'),
    (gen_random_uuid(), v_org, v_i_o6_hem, v_a_wbc, 'Leucocitos', '10^3/uL',
     7.4, '7.4', 'normal', '4.0 - 11.0 10^3/uL', 'validado', 'Citometría de flujo', v_admin,
     now() - interval '50 hours', v_admin, now() - interval '49 hours', 'Resultado dentro de rango.',
     now() - interval '50 hours', now() - interval '49 hours'),
    (gen_random_uuid(), v_org, v_i_o6_hem, v_a_plt, 'Plaquetas', '10^3/uL',
     315, '315', 'normal', '150 - 450 10^3/uL', 'validado', 'Impedancia eléctrica', v_admin,
     now() - interval '50 hours', v_admin, now() - interval '49 hours', 'Resultado dentro de rango.',
     now() - interval '50 hours', now() - interval '49 hours'),
    (gen_random_uuid(), v_org, v_i_o6_glu, v_a_glu, 'Glucosa', 'mg/dL',
     92, '92', 'normal', '70 - 100 mg/dL', 'validado', 'Hexoquinasa', v_admin,
     now() - interval '50 hours', v_admin, now() - interval '49 hours', 'Muestra en ayunas adecuada.',
     now() - interval '50 hours', now() - interval '49 hours'),
    (gen_random_uuid(), v_org, v_i_o6_blood_group, v_a_blood_group, 'Grupo sanguíneo y factor Rh', 'clasificación',
     null, 'AB+', 'normal', 'Sistema ABO/Rh', 'validado', 'Aglutinación en tarjeta', v_admin,
     now() - interval '50 hours', v_admin, now() - interval '49 hours', 'Doble lectura concordante.',
     now() - interval '50 hours', now() - interval '49 hours');

  update public."LIS_order_items"
  set status = 'anulado'
  where id = v_i_o7_crp;

  update public."LIS_orders"
  set status = case id
    when v_o1 then 'registrada'::app.order_status
    when v_o2 then 'en_toma'::app.order_status
    when v_o3 then 'en_proceso'::app.order_status
    when v_o4 then 'parcial'::app.order_status
    when v_o5 then 'completada'::app.order_status
    when v_o6 then 'entregada'::app.order_status
    when v_o7 then 'anulada'::app.order_status
    else status
  end
  where id in (v_o1, v_o2, v_o3, v_o4, v_o5, v_o6, v_o7);

  insert into public."LIS_order_counters" (
    organization_id,
    last_number
  ) values (
    v_org,
    7
  )
  on conflict (organization_id) do update set
    last_number = greatest(public."LIS_order_counters".last_number, excluded.last_number);

  insert into public."LIS_report_documents" (
    id, organization_id, order_id, storage_path, version, hash, generado_por, created_at
  ) values
    (gen_random_uuid(), v_org, v_o5, 'nova-clinic/reportes/' || v_code5 || '-v1.pdf', 1,
     encode(digest(v_code5 || '-v1', 'sha256'), 'hex'), v_admin, now() - interval '24 hours'),
    (gen_random_uuid(), v_org, v_o6, 'nova-clinic/reportes/' || v_code6 || '-v1.pdf', 1,
     encode(digest(v_code6 || '-v1', 'sha256'), 'hex'), v_admin, now() - interval '48 hours');

  insert into public."LIS_result_deliveries" (
    id, organization_id, order_id, canal, destino, status, access_token,
    token_expira_at, enviado_at, visto_at, enviado_por, error_detalle, created_at, updated_at
  ) values
    (gen_random_uuid(), v_org, v_o4, 'whatsapp', '+51 987 100 004', 'fallido',
     encode(gen_random_bytes(24), 'hex'), now() + interval '5 days', now() - interval '5 hours', null,
     v_admin, 'Número sin cuenta activa de WhatsApp; se requiere canal alternativo.',
     now() - interval '5 hours', now() - interval '5 hours'),
    (gen_random_uuid(), v_org, v_o5, 'email', 'rosa.huaman@pacientes.example', 'enviado',
     encode(gen_random_bytes(24), 'hex'), now() + interval '6 days', now() - interval '23 hours', null,
     v_admin, null, now() - interval '23 hours', now() - interval '23 hours'),
    (gen_random_uuid(), v_org, v_o6, 'portal', 'apoderado.diego@pacientes.example', 'visto',
     encode(gen_random_bytes(24), 'hex'), now() + interval '4 days', now() - interval '47 hours',
     now() - interval '46 hours', v_admin, null, now() - interval '47 hours', now() - interval '46 hours');

  insert into public."LIS_billing_integrations" (
    id, organization_id, provider, enabled, config, credential_ref, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, 'wally', true,
    jsonb_build_object(
      'modo', 'simulacion',
      'endpoint', 'https://billing.nova-clinic.example/sandbox',
      'serie_factura', 'F001',
      'serie_boleta', 'B001',
      'igv_incluido', true,
      'moneda', 'PEN'
    ),
    'vault:nova-clinic-wally-demo',
    now() - interval '120 days',
    now()
  );

  insert into public."LIS_invoices" (
    id, organization_id, order_id, provider, external_id, serie, numero, status,
    moneda, subtotal, impuestos, total, pdf_url, xml_url, payload, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_o4, 'wally', 'WALLY-DEMO-000004', 'B001', '000004', 'error_sync',
    'PEN', 50.85, 9.15, 60.00, '/demo/nova-clinic/comprobantes/B001-000004.pdf',
    '/demo/nova-clinic/comprobantes/B001-000004.xml',
    '{"demo":true,"codigo_error":"TIMEOUT","reintento_pendiente":true}'::jsonb,
    now() - interval '5 hours', now() - interval '4 hours 50 minutes'
  ) returning id into v_inv4;

  insert into public."LIS_invoices" (
    id, organization_id, order_id, provider, external_id, serie, numero, status,
    moneda, subtotal, impuestos, total, pdf_url, xml_url, payload, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_o5, 'wally', 'WALLY-DEMO-000005', 'F001', '000005', 'emitida',
    'PEN', 63.56, 11.44, 75.00, '/demo/nova-clinic/comprobantes/F001-000005.pdf',
    '/demo/nova-clinic/comprobantes/F001-000005.xml',
    '{"demo":true,"sunat_estado":"ACEPTADO","medio_pago":"tarjeta"}'::jsonb,
    now() - interval '25 hours', now() - interval '24 hours'
  ) returning id into v_inv5;

  insert into public."LIS_invoices" (
    id, organization_id, order_id, provider, external_id, serie, numero, status,
    moneda, subtotal, impuestos, total, pdf_url, xml_url, payload, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_o6, 'wally', 'WALLY-DEMO-000006', 'B001', '000006', 'pagada',
    'PEN', 72.03, 12.97, 85.00, '/demo/nova-clinic/comprobantes/B001-000006.pdf',
    '/demo/nova-clinic/comprobantes/B001-000006.xml',
    '{"demo":true,"sunat_estado":"ACEPTADO","medio_pago":"yape","pagado":true}'::jsonb,
    now() - interval '50 hours', now() - interval '48 hours'
  ) returning id into v_inv6;

  insert into public."LIS_invoices" (
    id, organization_id, order_id, provider, external_id, serie, numero, status,
    moneda, subtotal, impuestos, total, pdf_url, xml_url, payload, created_at, updated_at
  ) values (
    gen_random_uuid(), v_org, v_o7, 'wally', 'WALLY-DEMO-000007', 'B001', '000007', 'anulada',
    'PEN', 42.37, 7.63, 50.00, '/demo/nova-clinic/comprobantes/B001-000007-anulada.pdf',
    '/demo/nova-clinic/comprobantes/B001-000007-anulada.xml',
    '{"demo":true,"motivo_anulacion":"Orden duplicada","sunat_estado":"ANULADO"}'::jsonb,
    now() - interval '4 days', now() - interval '4 days'
  ) returning id into v_inv7;

  insert into public."LIS_invoice_events" (
    id, invoice_id, tipo, detalle, created_at
  ) values
    (gen_random_uuid(), v_inv5, 'request',
     '{"demo":true,"operacion":"emitir","serie":"F001","numero":"000005"}'::jsonb,
     now() - interval '25 hours'),
    (gen_random_uuid(), v_inv5, 'response',
     '{"demo":true,"http_status":201,"estado":"emitida","sunat":"aceptado"}'::jsonb,
     now() - interval '24 hours 59 minutes'),
    (gen_random_uuid(), v_inv6, 'webhook',
     '{"demo":true,"evento":"payment.confirmed","medio":"yape","monto":85.00}'::jsonb,
     now() - interval '48 hours'),
    (gen_random_uuid(), v_inv4, 'error',
     '{"demo":true,"codigo":"TIMEOUT","mensaje":"Proveedor no respondió dentro del tiempo esperado","reintento":1}'::jsonb,
     now() - interval '4 hours 50 minutes'),
    (gen_random_uuid(), v_inv7, 'response',
     '{"demo":true,"operacion":"anular","estado":"anulada","motivo":"Orden duplicada"}'::jsonb,
     now() - interval '4 days');

  -- ─────────────────────────────────────────────────────────────
  -- Historico de ~90 dias: ordenes completadas/entregadas con
  -- resultados validados y facturas. Alimenta el modulo Analitica
  -- (series diarias, TAT, top de estudios, finanzas).
  -- ─────────────────────────────────────────────────────────────
  v_pats := array[v_p1, v_p2, v_p3, v_p4, v_p5, v_p6, v_p7];

  for v_day in reverse 90..5 loop
    -- volumen segun dia de semana: domingo cerrado, sabado reducido
    v_nord := case extract(dow from (current_date - v_day))::int
      when 0 then 0
      when 6 then 1 + (v_day % 2)
      else 2 + ((v_day * 7) % 3)
    end;

    for v_j in 1..v_nord loop
      v_hist := v_hist + 1;
      v_code_h := 'ORD-' || to_char(current_date - v_day, 'YYYY') || '-' || lpad((1000 + v_hist)::text, 6, '0');
      v_pat := v_pats[1 + ((v_day + v_j * 3) % 7)];
      v_kind := (v_day + v_j) % 4;  -- 0 hemograma, 1 glucosa, 2 lipidico, 3 pcr
      v_created := ((current_date - v_day) + time '08:15')::timestamptz + (v_j * interval '52 minutes');
      -- TAT variable: 3 a 24 horas hasta la validacion
      v_valid := v_created + interval '3 hours' + (((v_day * 11 + v_j * 5) % 22)) * interval '1 hour';
      v_estado_h := case when (v_day + v_j) % 3 = 0
        then 'completada'::app.order_status else 'entregada'::app.order_status end;
      v_prio_h := case when (v_day + v_j) % 9 = 0
        then 'urgente'::app.order_priority else 'rutina'::app.order_priority end;

      if v_kind = 0 then
        v_study_h := v_st_hem;    v_precio_h := 45.00; v_snom_h := 'Hemograma automatizado';          v_scod_h := 'NOVA-HEMOG';
      elsif v_kind = 1 then
        v_study_h := v_st_glu;    v_precio_h := 20.00; v_snom_h := 'Glucosa en ayunas';               v_scod_h := 'NOVA-GLUCO';
      elsif v_kind = 2 then
        v_study_h := v_st_lipid;  v_precio_h := 85.00; v_snom_h := 'Perfil lipídico completo';        v_scod_h := 'NOVA-PLIP';
      else
        v_study_h := v_st_crp;    v_precio_h := 50.00; v_snom_h := 'Proteína C Reactiva cuantitativa'; v_scod_h := 'NOVA-PCR';
      end if;

      insert into public."LIS_orders" (
        id, organization_id, sede_id, patient_id, codigo, status, prioridad,
        medico_solicitante, diagnostico, observaciones, moneda, total, created_by,
        created_at, updated_at
      ) values (
        gen_random_uuid(), v_org, v_sede, v_pat, v_code_h, 'registrada', v_prio_h,
        'Dra. Valeria Campos CMP 84521', 'Atención demostrativa (histórico)',
        null, 'PEN', 0, v_admin, v_created, v_valid
      ) returning id into v_o_h;

      insert into public."LIS_order_items" (
        id, order_id, study_id, status, precio, descuento, study_nombre, study_codigo, created_at, updated_at
      ) values (
        gen_random_uuid(), v_o_h, v_study_h, 'validado', v_precio_h, 0.00,
        v_snom_h, v_scod_h, v_created, v_valid
      ) returning id into v_i_h;

      if v_kind = 0 then
        v_val := round(11.5 + ((v_hist * 7) % 50) / 10.0, 1);
        insert into public."LIS_results" (
          id, organization_id, order_item_id, analyte_id, analyte_nombre, analyte_unidad,
          valor_num, valor_texto, flag, rango_texto, status, metodo, ingresado_por,
          ingresado_at, validado_por, validado_at, nota, created_at, updated_at
        ) values
          (gen_random_uuid(), v_org, v_i_h, v_a_hb, 'Hemoglobina', 'g/dL',
           v_val, v_val::text,
           case when v_val < 13.5 then 'bajo'::app.result_flag else 'normal'::app.result_flag end,
           '13.5 - 17.5 g/dL', 'validado',
           'Fotometría de cianometahemoglobina', v_admin, v_valid - interval '1 hour',
           v_admin, v_valid, null, v_valid - interval '1 hour', v_valid),
          (gen_random_uuid(), v_org, v_i_h, v_a_wbc, 'Leucocitos', '10^3/uL',
           round(4.5 + ((v_hist * 3) % 70) / 10.0, 1), (round(4.5 + ((v_hist * 3) % 70) / 10.0, 1))::text,
           case when round(4.5 + ((v_hist * 3) % 70) / 10.0, 1) > 11.0 then 'alto'::app.result_flag else 'normal'::app.result_flag end,
           '4.0 - 11.0 10^3/uL', 'validado', 'Citometría de flujo', v_admin, v_valid - interval '1 hour',
           v_admin, v_valid, null, v_valid - interval '1 hour', v_valid),
          (gen_random_uuid(), v_org, v_i_h, v_a_plt, 'Plaquetas', '10^3/uL',
           160 + ((v_hist * 13) % 240), (160 + ((v_hist * 13) % 240))::text, 'normal',
           '150 - 450 10^3/uL', 'validado', 'Impedancia eléctrica', v_admin, v_valid - interval '1 hour',
           v_admin, v_valid, null, v_valid - interval '1 hour', v_valid);
      elsif v_kind = 1 then
        if v_hist % 29 = 0 then v_val := 348; v_flag_h := 'critico_alto';
        else
          v_val := 72 + ((v_hist * 5) % 55);
          v_flag_h := case when v_val > 100 then 'alto'::app.result_flag else 'normal'::app.result_flag end;
        end if;
        insert into public."LIS_results" (
          id, organization_id, order_item_id, analyte_id, analyte_nombre, analyte_unidad,
          valor_num, valor_texto, flag, rango_texto, status, metodo, ingresado_por,
          ingresado_at, validado_por, validado_at, nota, created_at, updated_at
        ) values (
          gen_random_uuid(), v_org, v_i_h, v_a_glu, 'Glucosa', 'mg/dL',
          v_val, v_val::text, v_flag_h, '70 - 100 mg/dL', 'validado', 'Hexoquinasa',
          v_admin, v_valid - interval '1 hour', v_admin, v_valid,
          case when v_flag_h = 'critico_alto' then 'Valor crítico comunicado al médico solicitante.' end,
          v_valid - interval '1 hour', v_valid);
      elsif v_kind = 2 then
        v_val := 150 + ((v_hist * 11) % 110);
        insert into public."LIS_results" (
          id, organization_id, order_item_id, analyte_id, analyte_nombre, analyte_unidad,
          valor_num, valor_texto, flag, rango_texto, status, metodo, ingresado_por,
          ingresado_at, validado_por, validado_at, nota, created_at, updated_at
        ) values
          (gen_random_uuid(), v_org, v_i_h, v_a_ct, 'Colesterol total', 'mg/dL',
           v_val, v_val::text,
           case when v_val >= 200 then 'alto'::app.result_flag else 'normal'::app.result_flag end,
           'Deseable: menor de 200 mg/dL', 'validado', 'Enzimático colorimétrico', v_admin,
           v_valid - interval '1 hour', v_admin, v_valid, null, v_valid - interval '1 hour', v_valid),
          (gen_random_uuid(), v_org, v_i_h, v_a_hdl, 'Colesterol HDL', 'mg/dL',
           35 + ((v_hist * 3) % 40), (35 + ((v_hist * 3) % 40))::text,
           case when 35 + ((v_hist * 3) % 40) < 40 then 'bajo'::app.result_flag else 'normal'::app.result_flag end,
           '40 - 90 mg/dL', 'validado', 'Enzimático homogéneo', v_admin, v_valid - interval '1 hour',
           v_admin, v_valid, null, v_valid - interval '1 hour', v_valid),
          (gen_random_uuid(), v_org, v_i_h, v_a_tg, 'Triglicéridos', 'mg/dL',
           90 + ((v_hist * 17) % 160), (90 + ((v_hist * 17) % 160))::text,
           case when 90 + ((v_hist * 17) % 160) >= 150 then 'alto'::app.result_flag else 'normal'::app.result_flag end,
           '30 - 149 mg/dL', 'validado', 'Glicerol fosfato oxidasa', v_admin, v_valid - interval '1 hour',
           v_admin, v_valid, null, v_valid - interval '1 hour', v_valid);
      else
        if v_hist % 31 = 0 then v_val := 96.0; v_flag_h := 'alto';
        else
          v_val := round(((v_hist * 9) % 48) / 10.0, 1);
          v_flag_h := case when v_val > 5 then 'alto'::app.result_flag else 'normal'::app.result_flag end;
        end if;
        insert into public."LIS_results" (
          id, organization_id, order_item_id, analyte_id, analyte_nombre, analyte_unidad,
          valor_num, valor_texto, flag, rango_texto, status, metodo, ingresado_por,
          ingresado_at, validado_por, validado_at, nota, created_at, updated_at
        ) values (
          gen_random_uuid(), v_org, v_i_h, v_a_crp, 'Proteína C Reactiva', 'mg/L',
          v_val, v_val::text, v_flag_h, '0.0 - 5.0 mg/L', 'validado', 'Inmunoturbidimetría',
          v_admin, v_valid - interval '1 hour', v_admin, v_valid, null,
          v_valid - interval '1 hour', v_valid);
      end if;

      update public."LIS_orders"
      set status = v_estado_h, updated_at = v_valid
      where id = v_o_h;

      -- Facturacion del historico: 1 de cada 3 pagada, 1 de cada 7 emitida
      if v_hist % 3 = 0 or v_hist % 7 = 0 then
        v_sub_h := round(v_precio_h / 1.18, 2);
        insert into public."LIS_invoices" (
          id, organization_id, order_id, provider, external_id, serie, numero, status,
          moneda, subtotal, impuestos, total, pdf_url, xml_url, payload, created_at, updated_at
        ) values (
          gen_random_uuid(), v_org, v_o_h, 'wally', 'WALLY-DEMO-H' || lpad(v_hist::text, 5, '0'),
          'B001', lpad((100 + v_hist)::text, 6, '0'),
          case when v_hist % 3 = 0 then 'pagada'::app.invoice_status else 'emitida'::app.invoice_status end,
          'PEN', v_sub_h, v_precio_h - v_sub_h, v_precio_h,
          null, null, '{"demo":true,"historico":true}'::jsonb, v_valid, v_valid
        );
      end if;
    end loop;
  end loop;

  insert into public."LIS_order_counters" (organization_id, last_number)
  values (v_org, 1000 + v_hist)
  on conflict (organization_id) do update set
    last_number = greatest(public."LIS_order_counters".last_number, excluded.last_number);

  -- ─────────────────────────────────────────────────────────────
  -- Agenda: citas historicas (30 dias) para las metricas de
  -- asistencia + citas de hoy y proximas para operar el modulo
  -- ─────────────────────────────────────────────────────────────
  for v_day in reverse 30..1 loop
    if extract(dow from (current_date - v_day))::int <> 0 then
      v_ncitas := 2 + ((v_day * 5) % 3);
      for v_j in 1..v_ncitas loop
        v_cstatus := case
          when (v_day + v_j) % 8 = 0 then 'no_asistio'::app.appointment_status
          when (v_day + v_j) % 11 = 0 then 'cancelada'::app.appointment_status
          else 'atendida'::app.appointment_status
        end;
        v_canal_h := (array['presencial','telefono','whatsapp','web'])[1 + ((v_day + v_j) % 4)];
        insert into public."LIS_appointments" (
          id, organization_id, sede_id, patient_id, fecha, hora_inicio, duracion_min,
          status, motivo, study_ids, canal, cancel_motivo, created_by, created_at, updated_at
        ) values (
          gen_random_uuid(), v_org, v_sede, v_pats[1 + ((v_day * 2 + v_j) % 7)],
          current_date - v_day, time '08:30' + (v_j * interval '45 minutes'),
          15, v_cstatus, 'Toma de muestra programada',
          case (v_day + v_j) % 4
            when 0 then array[v_st_hem]
            when 1 then array[v_st_glu]
            when 2 then array[v_st_lipid]
            else array[v_st_crp]
          end,
          v_canal_h,
          case when v_cstatus = 'cancelada' then 'Reprogramación solicitada por el paciente.' end,
          v_admin,
          ((current_date - v_day - 2) + time '10:00')::timestamptz,
          ((current_date - v_day) + time '18:00')::timestamptz
        );
      end loop;
    end if;
  end loop;

  -- Citas de hoy: una ya atendida (enlazada a la orden registrada),
  -- una en espera, una confirmada y dos programadas
  insert into public."LIS_appointments" (
    id, organization_id, sede_id, patient_id, order_id, fecha, hora_inicio, duracion_min,
    status, motivo, study_ids, medico_solicitante, canal, notas, created_by, created_at, updated_at
  ) values
    (gen_random_uuid(), v_org, v_sede, v_p1, v_o1, current_date, '07:40', 15,
     'atendida', 'Chequeo preventivo anual', array[v_st_hem],
     'Dra. Valeria Campos CMP 84521', 'presencial', 'Check-in realizado en recepción.',
     v_admin, now() - interval '3 days', now() - interval '20 minutes'),
    (gen_random_uuid(), v_org, v_sede, v_p5, null, current_date, '08:45', 20,
     'en_espera', 'Control de dislipidemia', array[v_st_lipid],
     'Dra. Valeria Campos CMP 84521', 'telefono', 'Paciente en sala de espera; ayuno confirmado.',
     v_admin, now() - interval '2 days', now() - interval '10 minutes'),
    (gen_random_uuid(), v_org, v_sede, v_p2, null, current_date, '10:30', 15,
     'confirmada', 'Control de glucosa', array[v_st_glu],
     'Dr. Martín Reyes CMP 71204', 'whatsapp', 'Confirmó por WhatsApp; recordar ayuno de 8 horas.',
     v_admin, now() - interval '2 days', now() - interval '1 hour'),
    (gen_random_uuid(), v_org, v_sede, v_p3, null, current_date, '12:00', 15,
     'programada', 'Control de PCR post tratamiento', array[v_st_crp],
     'Dra. Camila Núñez CMP 80117', 'web', null,
     v_admin, now() - interval '1 day', now() - interval '1 day'),
    (gen_random_uuid(), v_org, v_sede, v_p7, null, current_date, '16:15', 15,
     'programada', 'Perfil lipídico de control', array[v_st_lipid],
     null, 'presencial', 'Prefiere atención por la tarde.',
     v_admin, now() - interval '6 hours', now() - interval '6 hours');

  -- Citas proximas (siguientes dias)
  insert into public."LIS_appointments" (
    id, organization_id, sede_id, patient_id, fecha, hora_inicio, duracion_min,
    status, motivo, study_ids, medico_solicitante, canal, notas, created_by, created_at, updated_at
  ) values
    (gen_random_uuid(), v_org, v_sede, v_p4, current_date + 1, '08:30', 20,
     'confirmada', 'Perfil lipídico y glucosa de control', array[v_st_lipid, v_st_glu],
     'Dr. Renato Vargas CMP 66510', 'telefono', 'Ayuno de 10 a 12 horas indicado.',
     v_admin, now() - interval '1 day', now() - interval '2 hours'),
    (gen_random_uuid(), v_org, v_sede, v_p6, current_date + 1, '10:15', 15,
     'programada', 'Hemograma de control pediátrico', array[v_st_hem],
     'Dr. Álvaro Peña CMP 59021', 'presencial', 'Acude con apoderado.',
     v_admin, now() - interval '5 hours', now() - interval '5 hours'),
    (gen_random_uuid(), v_org, v_sede, v_p5, current_date + 2, '09:00', 15,
     'programada', 'Glucosa en ayunas de control', array[v_st_glu],
     'Dra. Valeria Campos CMP 84521', 'whatsapp', null,
     v_admin, now() - interval '4 hours', now() - interval '4 hours'),
    (gen_random_uuid(), v_org, v_sede, v_p2, current_date + 3, '08:45', 15,
     'programada', 'Evaluación por definir con el médico', array[]::uuid[],
     null, 'web', 'Sin estudios preseleccionados: el check-in deriva a nueva orden.',
     v_admin, now() - interval '2 hours', now() - interval '2 hours');

  update public."LIS_audit_log"
  set sede_id = coalesce(sede_id, v_sede),
      actor_id = coalesce(actor_id, v_admin),
      actor_email = coalesce(actor_email, v_admin_email),
      contexto = coalesce(contexto, '{}'::jsonb) || jsonb_build_object(
        'origen', 'seed_nova_clinic',
        'demo', true,
        'sede', 'Nova Clinic'
      )
  where organization_id = v_org;

  insert into public."LIS_audit_log" (
    organization_id,
    sede_id,
    actor_id,
    actor_email,
    entidad,
    entidad_id,
    accion,
    cambios,
    estado_anterior,
    estado_nuevo,
    contexto,
    created_at
  ) values (
    v_org,
    v_sede,
    v_admin,
    v_admin_email,
    'LIS_orders',
    v_o6::text,
    'UPDATE',
    '{"status":{"de":"completada","a":"entregada"},"canal_entrega":{"de":null,"a":"portal"}}'::jsonb,
    jsonb_build_object('id', v_o6, 'codigo', v_code6, 'status', 'completada'),
    jsonb_build_object('id', v_o6, 'codigo', v_code6, 'status', 'entregada'),
    jsonb_build_object(
      'origen', 'seed_nova_clinic',
      'demo', true,
      'ip', '192.0.2.10',
      'user_agent', 'Nova Clinic Demo Console',
      'motivo', 'Entrega confirmada al apoderado'
    ),
    now()
  );

  raise notice 'Seed Nova Clinic completado para el usuario % y la sede %: % ordenes historicas, agenda con citas de 30 dias + hoy y proximas.', v_admin_email, v_sede, v_hist;
end
$$;

commit;
