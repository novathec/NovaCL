-- ============================================================================
-- 0001 · Foundation: extensiones, esquema de utilidades y tipos enumerados
-- ============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid, crypt
create extension if not exists "citext";         -- emails case-insensitive
create extension if not exists "pg_trgm";        -- busqueda por similitud

-- Esquema privado para helpers de autorizacion (no expuesto por la API)
create schema if not exists app;

-- ─────────────────────────────────────────────────────────────
-- Tipos enumerados del dominio
-- ─────────────────────────────────────────────────────────────

-- Roles del sistema. Se manejan por sede via memberships.
create type app.role as enum (
  'org_admin',      -- administrador de la organizacion (todas las sedes)
  'sede_admin',     -- administrador de una sede
  'recepcion',      -- registro de pacientes y ordenes
  'toma_muestra',   -- flebotomia / recoleccion de muestras
  'analista',       -- ingreso de resultados
  'validador',      -- validacion / firma de resultados (patologo/bioquimico)
  'facturacion',    -- facturacion e integracion Wally
  'medico',         -- medico solicitante (lectura de resultados)
  'lectura'         -- solo lectura / auditoria
);

create type app.order_status as enum (
  'registrada',     -- creada en recepcion
  'en_toma',        -- en proceso de toma de muestra
  'en_proceso',     -- muestras en laboratorio
  'parcial',        -- algunos resultados listos
  'completada',     -- todos los resultados validados
  'entregada',      -- entregada al paciente
  'anulada'
);

create type app.order_priority as enum ('rutina', 'urgente', 'stat');

create type app.item_status as enum (
  'pendiente',
  'en_proceso',
  'resultado_cargado',
  'validado',
  'rechazado',
  'anulado'
);

create type app.sample_status as enum (
  'pendiente',      -- por tomar
  'tomada',         -- recolectada
  'en_transito',    -- enviada a la sede procesadora
  'recibida',       -- recibida en laboratorio
  'en_analisis',
  'procesada',
  'rechazada'       -- muestra no apta (hemolisis, coagulo, etc.)
);

create type app.result_status as enum (
  'pendiente',
  'preliminar',
  'validado',
  'rechazado',
  'corregido'
);

create type app.result_flag as enum (
  'normal',
  'bajo',
  'alto',
  'critico_bajo',
  'critico_alto',
  'anormal'          -- cualitativo fuera de referencia
);

create type app.value_type as enum ('numerico', 'texto', 'opcion', 'titulo');

create type app.sex as enum ('M', 'F', 'otro', 'desconocido');

create type app.delivery_channel as enum ('portal', 'email', 'sms', 'whatsapp', 'impreso');
create type app.delivery_status as enum ('pendiente', 'enviado', 'visto', 'fallido');

create type app.invoice_status as enum (
  'borrador', 'emitida', 'pagada', 'anulada', 'error_sync'
);

-- ─────────────────────────────────────────────────────────────
-- Utilidad: touch updated_at
-- ─────────────────────────────────────────────────────────────
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
-- ============================================================================
-- 0002 · Multi-tenancy y control de acceso basado en roles (RBAC)
--   organization (cliente/clinica) -> sedes -> memberships por sede
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- Organizacion = tenant (cada clinica que usa el sistema)
-- ─────────────────────────────────────────────────────────────
create table public."LIS_organizations" (
  id            uuid primary key default gen_random_uuid(),
  slug          citext not null unique,
  nombre        text not null,
  ruc           text,                     -- identificacion fiscal
  logo_url      text,
  timezone      text not null default 'America/Lima',
  locale        text not null default 'es-PE',
  activo        boolean not null default true,
  settings      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_org_touch before update on public."LIS_organizations"
  for each row execute function app.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Sedes (sucursales) dentro de una organizacion
-- ─────────────────────────────────────────────────────────────
create table public."LIS_sedes" (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public."LIS_organizations"(id) on delete cascade,
  codigo          text not null,          -- codigo interno de sede
  nombre          text not null,
  direccion       text,
  telefono        text,
  email           citext,
  es_procesadora  boolean not null default true,  -- procesa muestras o solo toma
  activo          boolean not null default true,
  settings        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, codigo)
);
create index "LIS_idx_sedes_org" on public."LIS_sedes"(organization_id);
create trigger trg_sede_touch before update on public."LIS_sedes"
  for each row execute function app.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Perfil de usuario (1:1 con auth.users)
-- ─────────────────────────────────────────────────────────────
create table public."LIS_profiles" (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         citext not null,
  nombre        text not null default '',
  telefono      text,
  avatar_url    text,
  es_superadmin boolean not null default false,   -- soporte de la plataforma
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_profile_touch before update on public."LIS_profiles"
  for each row execute function app.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Membership: un usuario pertenece a una sede con un rol.
--   sede_id NULL => rol a nivel de toda la organizacion (org_admin)
-- ─────────────────────────────────────────────────────────────
create table public."LIS_memberships" (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public."LIS_organizations"(id) on delete cascade,
  sede_id         uuid references public."LIS_sedes"(id) on delete cascade,
  user_id         uuid not null references public."LIS_profiles"(id) on delete cascade,
  role            app.role not null,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, sede_id, user_id, role)
);
create index "LIS_idx_memberships_user" on public."LIS_memberships"(user_id) where activo;
create index "LIS_idx_memberships_org" on public."LIS_memberships"(organization_id);
create index "LIS_idx_memberships_sede" on public."LIS_memberships"(sede_id);
create trigger trg_membership_touch before update on public."LIS_memberships"
  for each row execute function app.touch_updated_at();

-- ============================================================================
-- Helpers de autorizacion (SECURITY DEFINER) usados por las politicas RLS.
--   Evitan recursion consultando memberships con privilegios del owner.
-- ============================================================================

-- ¿Es superadmin de plataforma?
create or replace function app.is_superadmin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select es_superadmin from public."LIS_profiles" where id = auth.uid()),
    false
  );
$$;

-- Organizaciones a las que pertenece el usuario actual
create or replace function app.member_org_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select distinct organization_id
  from public."LIS_memberships"
  where user_id = auth.uid() and activo;
$$;

-- Sedes a las que el usuario tiene acceso.
--   Un org_admin (sede_id null) tiene acceso a TODAS las sedes de su org.
create or replace function app.member_sede_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select s.id
  from public."LIS_sedes" s
  where s.organization_id in (
    -- orgs donde el usuario es admin de toda la organizacion
    select m.organization_id from public."LIS_memberships" m
    where m.user_id = auth.uid() and m.activo and m.sede_id is null
  )
  union
  select m.sede_id
  from public."LIS_memberships" m
  where m.user_id = auth.uid() and m.activo and m.sede_id is not null;
$$;

-- ¿El usuario tiene alguno de los roles indicados en la organizacion dada?
create or replace function app.has_org_role(p_org uuid, p_roles app.role[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public."LIS_memberships" m
    where m.user_id = auth.uid() and m.activo
      and m.organization_id = p_org
      and m.role = any(p_roles)
  );
$$;

-- ¿El usuario tiene alguno de los roles en la sede dada (o como org_admin)?
create or replace function app.has_sede_role(p_sede uuid, p_roles app.role[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public."LIS_sedes" s
    join public."LIS_memberships" m on m.organization_id = s.organization_id
    where s.id = p_sede and m.user_id = auth.uid() and m.activo
      and (
        (m.sede_id = p_sede and m.role = any(p_roles))
        or (m.sede_id is null and m.role = any(p_roles))  -- rol a nivel org
      )
  );
$$;

-- ¿Puede administrar la organizacion? (org_admin o superadmin)
create or replace function app.can_admin_org(p_org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select app.is_superadmin() or app.has_org_role(p_org, array['org_admin']::app.role[]);
$$;
-- ============================================================================
-- 0003 · Catalogo de laboratorio (modular)
--   Base global (plantillas) + overrides por organizacion.
--   categorias -> analitos -> rangos de referencia
--   estudios/perfiles -> analitos que los componen -> precios por sede
-- ============================================================================

-- Tipos de muestra (sangre, orina, heces, etc.)
create table public."LIS_specimen_types" (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,
  nombre        text not null,
  descripcion   text,
  activo        boolean not null default true
);

-- Categorias de estudios (hematologia, bioquimica, microbiologia, ...)
-- organization_id NULL => plantilla global compartida.
create table public."LIS_test_categories" (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public."LIS_organizations"(id) on delete cascade,
  codigo          text not null,
  nombre          text not null,
  descripcion     text,
  orden           int not null default 0,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (organization_id, codigo)
);
create index "LIS_idx_categories_org" on public."LIS_test_categories"(organization_id);

-- Analitos / parametros individuales (hemoglobina, glucosa, TSH, ...)
create table public."LIS_analytes" (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public."LIS_organizations"(id) on delete cascade,
  category_id     uuid references public."LIS_test_categories"(id) on delete set null,
  codigo          text not null,
  nombre          text not null,
  abreviatura     text,
  loinc_code      text,                       -- estandar internacional
  unidad          text,                       -- g/dL, mg/dL, U/L...
  value_type      app.value_type not null default 'numerico',
  opciones        jsonb,                      -- para value_type='opcion' (positivo/negativo...)
  decimales       int not null default 2,
  metodo          text,                       -- metodo analitico
  orden           int not null default 0,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, codigo)
);
create index "LIS_idx_analytes_org" on public."LIS_analytes"(organization_id);
create index "LIS_idx_analytes_cat" on public."LIS_analytes"(category_id);
create index "LIS_idx_analytes_nombre_trgm" on public."LIS_analytes" using gin (nombre gin_trgm_ops);
create trigger trg_analyte_touch before update on public."LIS_analytes"
  for each row execute function app.touch_updated_at();

-- Rangos de referencia por analito (segun sexo y edad)
create table public."LIS_reference_ranges" (
  id              uuid primary key default gen_random_uuid(),
  analyte_id      uuid not null references public."LIS_analytes"(id) on delete cascade,
  sexo            app.sex not null default 'desconocido',
  edad_min_dias   int,                        -- limite inferior de edad en dias
  edad_max_dias   int,
  valor_min       numeric,
  valor_max       numeric,
  critico_min     numeric,
  critico_max     numeric,
  texto_normal    text,                       -- para cualitativos: "Negativo"
  nota            text,
  created_at      timestamptz not null default now()
);
create index "LIS_idx_refranges_analyte" on public."LIS_reference_ranges"(analyte_id);

-- Estudios / perfiles que se ordenan (Hemograma, Perfil lipidico, ...)
create table public."LIS_studies" (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid references public."LIS_organizations"(id) on delete cascade,
  category_id       uuid references public."LIS_test_categories"(id) on delete set null,
  specimen_type_id  uuid references public."LIS_specimen_types"(id) on delete set null,
  codigo            text not null,
  nombre            text not null,
  descripcion       text,
  loinc_code        text,
  tiempo_entrega_h  int,                       -- TAT objetivo en horas
  requiere_ayuno    boolean not null default false,
  indicaciones      text,                      -- preparacion del paciente
  activo            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, codigo)
);
create index "LIS_idx_studies_org" on public."LIS_studies"(organization_id);
create index "LIS_idx_studies_cat" on public."LIS_studies"(category_id);
create index "LIS_idx_studies_nombre_trgm" on public."LIS_studies" using gin (nombre gin_trgm_ops);
create trigger trg_study_touch before update on public."LIS_studies"
  for each row execute function app.touch_updated_at();

-- Composicion: analitos que integran cada estudio
create table public."LIS_study_analytes" (
  id          uuid primary key default gen_random_uuid(),
  study_id    uuid not null references public."LIS_studies"(id) on delete cascade,
  analyte_id  uuid not null references public."LIS_analytes"(id) on delete cascade,
  orden       int not null default 0,
  formula     text,                            -- para calculados (ej. VLDL = TG/5)
  unique (study_id, analyte_id)
);
create index "LIS_idx_study_analytes_study" on public."LIS_study_analytes"(study_id);

-- Precios por organizacion/sede y moneda
create table public."LIS_study_prices" (
  id          uuid primary key default gen_random_uuid(),
  study_id    uuid not null references public."LIS_studies"(id) on delete cascade,
  sede_id     uuid references public."LIS_sedes"(id) on delete cascade,  -- null => precio base org
  moneda      text not null default 'PEN',
  precio      numeric(12,2) not null default 0,
  vigente_desde date not null default current_date,
  activo      boolean not null default true,
  unique (study_id, sede_id, moneda, vigente_desde)
);
create index "LIS_idx_prices_study" on public."LIS_study_prices"(study_id);
-- ============================================================================
-- 0004 · Pacientes y ordenes de atencion
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- Pacientes (por organizacion, compartidos entre sedes)
-- ─────────────────────────────────────────────────────────────
create table public."LIS_patients" (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public."LIS_organizations"(id) on delete cascade,
  tipo_documento    text not null default 'DNI',
  numero_documento  text not null,
  nombres           text not null,
  apellidos         text not null,
  fecha_nacimiento  date,
  sexo              app.sex not null default 'desconocido',
  telefono          text,
  email             citext,
  direccion         text,
  -- vinculo opcional a una cuenta de portal del paciente
  portal_user_id    uuid references public."LIS_profiles"(id) on delete set null,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, tipo_documento, numero_documento)
);
create index "LIS_idx_patients_org" on public."LIS_patients"(organization_id);
create index "LIS_idx_patients_doc" on public."LIS_patients"(numero_documento);
create index "LIS_idx_patients_nombre_trgm" on public."LIS_patients"
  using gin ((nombres || ' ' || apellidos) gin_trgm_ops);
create trigger trg_patient_touch before update on public."LIS_patients"
  for each row execute function app.touch_updated_at();

-- Edad en dias (para seleccionar rango de referencia)
create or replace function app.patient_age_days(p_fecha_nac date)
returns int
language sql immutable
as $$
  select case when p_fecha_nac is null then null
              else (current_date - p_fecha_nac) end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Secuencia legible de ordenes por organizacion
-- ─────────────────────────────────────────────────────────────
create table public."LIS_order_counters" (
  organization_id uuid primary key references public."LIS_organizations"(id) on delete cascade,
  last_number     bigint not null default 0
);

create or replace function app.next_order_code(p_org uuid)
returns text
language plpgsql
as $$
declare
  n bigint;
begin
  insert into public."LIS_order_counters"(organization_id, last_number)
    values (p_org, 1)
  on conflict (organization_id)
    do update set last_number = public."LIS_order_counters".last_number + 1
  returning last_number into n;
  return 'ORD-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 6, '0');
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Ordenes (una por atencion / visita)
-- ─────────────────────────────────────────────────────────────
create table public."LIS_orders" (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public."LIS_organizations"(id) on delete cascade,
  sede_id           uuid not null references public."LIS_sedes"(id) on delete restrict,
  patient_id        uuid not null references public."LIS_patients"(id) on delete restrict,
  codigo            text not null,
  status            app.order_status not null default 'registrada',
  prioridad         app.order_priority not null default 'rutina',
  medico_solicitante text,
  diagnostico       text,
  observaciones     text,
  motivo_anulacion  text,
  moneda            text not null default 'PEN',
  total             numeric(12,2) not null default 0,
  created_by        uuid references public."LIS_profiles"(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, codigo)
);
create index "LIS_idx_orders_org" on public."LIS_orders"(organization_id);
create index "LIS_idx_orders_sede" on public."LIS_orders"(sede_id);
create index "LIS_idx_orders_patient" on public."LIS_orders"(patient_id);
create index "LIS_idx_orders_status" on public."LIS_orders"(status);
create index "LIS_idx_orders_created" on public."LIS_orders"(created_at desc);
create trigger trg_order_touch before update on public."LIS_orders"
  for each row execute function app.touch_updated_at();

-- Items de la orden (un estudio ordenado)
create table public."LIS_order_items" (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public."LIS_orders"(id) on delete cascade,
  study_id      uuid not null references public."LIS_studies"(id) on delete restrict,
  status        app.item_status not null default 'pendiente',
  precio        numeric(12,2) not null default 0,
  descuento     numeric(12,2) not null default 0,
  -- snapshot para reportes historicos
  study_nombre  text not null,
  study_codigo  text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index "LIS_idx_order_items_order" on public."LIS_order_items"(order_id);
create index "LIS_idx_order_items_study" on public."LIS_order_items"(study_id);
create index "LIS_idx_order_items_status" on public."LIS_order_items"(status);
create trigger trg_order_item_touch before update on public."LIS_order_items"
  for each row execute function app.touch_updated_at();
-- ============================================================================
-- 0005 · Muestras y resultados (nucleo de trazabilidad analitica)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- Muestras (con codigo de barras para trazabilidad)
-- ─────────────────────────────────────────────────────────────
create table public."LIS_samples" (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public."LIS_organizations"(id) on delete cascade,
  order_id          uuid not null references public."LIS_orders"(id) on delete cascade,
  specimen_type_id  uuid references public."LIS_specimen_types"(id) on delete set null,
  barcode           text not null unique,
  status            app.sample_status not null default 'pendiente',
  sede_toma_id      uuid references public."LIS_sedes"(id) on delete set null,
  sede_proceso_id   uuid references public."LIS_sedes"(id) on delete set null,
  tomada_por        uuid references public."LIS_profiles"(id) on delete set null,
  tomada_at         timestamptz,
  recibida_por      uuid references public."LIS_profiles"(id) on delete set null,
  recibida_at       timestamptz,
  motivo_rechazo    text,
  observaciones     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index "LIS_idx_samples_org" on public."LIS_samples"(organization_id);
create index "LIS_idx_samples_order" on public."LIS_samples"(order_id);
create index "LIS_idx_samples_status" on public."LIS_samples"(status);
create trigger trg_sample_touch before update on public."LIS_samples"
  for each row execute function app.touch_updated_at();

-- Relacion muestra <-> item de orden (una muestra puede cubrir varios estudios)
create table public."LIS_sample_items" (
  id            uuid primary key default gen_random_uuid(),
  sample_id     uuid not null references public."LIS_samples"(id) on delete cascade,
  order_item_id uuid not null references public."LIS_order_items"(id) on delete cascade,
  unique (sample_id, order_item_id)
);
create index "LIS_idx_sample_items_sample" on public."LIS_sample_items"(sample_id);
create index "LIS_idx_sample_items_item" on public."LIS_sample_items"(order_item_id);

-- ─────────────────────────────────────────────────────────────
-- Resultados (un valor por analito por item de orden)
-- ─────────────────────────────────────────────────────────────
create table public."LIS_results" (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public."LIS_organizations"(id) on delete cascade,
  order_item_id     uuid not null references public."LIS_order_items"(id) on delete cascade,
  analyte_id        uuid not null references public."LIS_analytes"(id) on delete restrict,
  -- snapshots para reporte historico
  analyte_nombre    text not null,
  analyte_unidad    text,
  valor_num         numeric,
  valor_texto       text,
  flag              app.result_flag,
  rango_texto       text,                       -- rango de referencia mostrado
  status            app.result_status not null default 'pendiente',
  metodo            text,
  ingresado_por     uuid references public."LIS_profiles"(id) on delete set null,
  ingresado_at      timestamptz,
  validado_por      uuid references public."LIS_profiles"(id) on delete set null,
  validado_at       timestamptz,
  nota              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (order_item_id, analyte_id)
);
create index "LIS_idx_results_org" on public."LIS_results"(organization_id);
create index "LIS_idx_results_item" on public."LIS_results"(order_item_id);
create index "LIS_idx_results_status" on public."LIS_results"(status);
create trigger trg_result_touch before update on public."LIS_results"
  for each row execute function app.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Evaluacion de flag segun rango de referencia
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
-- ============================================================================
-- 0006 · Entrega de resultados y facturacion (Wally)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- Documentos de reporte generados (PDF en Storage)
-- ─────────────────────────────────────────────────────────────
create table public."LIS_report_documents" (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public."LIS_organizations"(id) on delete cascade,
  order_id        uuid not null references public."LIS_orders"(id) on delete cascade,
  storage_path    text,                      -- ruta en el bucket 'reports'
  version         int not null default 1,
  hash            text,                      -- integridad del documento
  generado_por    uuid references public."LIS_profiles"(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index "LIS_idx_reportdocs_order" on public."LIS_report_documents"(order_id);

-- ─────────────────────────────────────────────────────────────
-- Entregas de resultados al paciente (multi-canal + token de acceso)
-- ─────────────────────────────────────────────────────────────
create table public."LIS_result_deliveries" (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public."LIS_organizations"(id) on delete cascade,
  order_id        uuid not null references public."LIS_orders"(id) on delete cascade,
  canal           app.delivery_channel not null,
  destino         text,                      -- email o telefono
  status          app.delivery_status not null default 'pendiente',
  access_token    text unique default encode(gen_random_bytes(24), 'hex'),
  token_expira_at timestamptz,
  enviado_at      timestamptz,
  visto_at        timestamptz,
  enviado_por     uuid references public."LIS_profiles"(id) on delete set null,
  error_detalle   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index "LIS_idx_deliveries_order" on public."LIS_result_deliveries"(order_id);
create index "LIS_idx_deliveries_token" on public."LIS_result_deliveries"(access_token);
create trigger trg_delivery_touch before update on public."LIS_result_deliveries"
  for each row execute function app.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Configuracion de integracion de facturacion por organizacion
-- ─────────────────────────────────────────────────────────────
create table public."LIS_billing_integrations" (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public."LIS_organizations"(id) on delete cascade,
  provider        text not null default 'wally',   -- 'wally' | 'manual' | otros
  enabled         boolean not null default false,
  config          jsonb not null default '{}'::jsonb,  -- endpoints, serie, etc.
  -- credenciales referenciadas por nombre a variables de entorno / vault
  credential_ref  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, provider)
);
create trigger trg_billing_touch before update on public."LIS_billing_integrations"
  for each row execute function app.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Facturas (espejo local del documento emitido por el proveedor)
-- ─────────────────────────────────────────────────────────────
create table public."LIS_invoices" (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public."LIS_organizations"(id) on delete cascade,
  order_id        uuid not null references public."LIS_orders"(id) on delete cascade,
  provider        text not null default 'wally',
  external_id     text,                      -- id del documento en Wally
  serie           text,
  numero          text,
  status          app.invoice_status not null default 'borrador',
  moneda          text not null default 'PEN',
  subtotal        numeric(12,2) not null default 0,
  impuestos       numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  pdf_url         text,
  xml_url         text,
  payload         jsonb,                     -- respuesta cruda del proveedor
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index "LIS_idx_invoices_order" on public."LIS_invoices"(order_id);
create index "LIS_idx_invoices_org" on public."LIS_invoices"(organization_id);
-- Un solo comprobante activo por orden; correlativo único por serie
-- (las filas anuladas o en error_sync no bloquean el reintento).
create unique index "LIS_invoices_order_activa"
  on public."LIS_invoices"(order_id)
  where status not in ('anulada','error_sync');
create unique index "LIS_invoices_serie_numero"
  on public."LIS_invoices"(organization_id, provider, serie, numero)
  where serie is not null and numero is not null
    and status not in ('anulada','error_sync');
create trigger trg_invoice_touch before update on public."LIS_invoices"
  for each row execute function app.touch_updated_at();

-- Bitacora de sincronizacion con el proveedor de facturacion
create table public."LIS_invoice_events" (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public."LIS_invoices"(id) on delete cascade,
  tipo        text not null,                 -- 'request','response','webhook','error'
  detalle     jsonb,
  created_at  timestamptz not null default now()
);
create index "LIS_idx_invoice_events_invoice" on public."LIS_invoice_events"(invoice_id);
-- ============================================================================
-- 0007 · Trazabilidad completa (bitacora de auditoria append-only)
--   Registra cada INSERT/UPDATE/DELETE de las tablas criticas con actor,
--   estado anterior y nuevo. Permite reconstruir el historial de una orden.
-- ============================================================================

create table public."LIS_audit_log" (
  id              bigint generated always as identity primary key,
  organization_id uuid,
  sede_id         uuid,
  actor_id        uuid,                      -- auth.uid() al momento del cambio
  actor_email     text,
  entidad         text not null,             -- nombre de la tabla
  entidad_id      text,                      -- pk afectada
  accion          text not null,             -- INSERT | UPDATE | DELETE
  cambios         jsonb,                     -- diff de campos modificados
  estado_anterior jsonb,
  estado_nuevo    jsonb,
  contexto        jsonb,                     -- info adicional opcional
  created_at      timestamptz not null default now()
);
create index "LIS_idx_audit_org" on public."LIS_audit_log"(organization_id);
create index "LIS_idx_audit_entidad" on public."LIS_audit_log"(entidad, entidad_id);
create index "LIS_idx_audit_created" on public."LIS_audit_log"(created_at desc);
create index "LIS_idx_audit_actor" on public."LIS_audit_log"(actor_id);

-- ─────────────────────────────────────────────────────────────
-- Trigger generico de auditoria
-- ─────────────────────────────────────────────────────────────
create or replace function app.audit_trigger()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_old       jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else null end;
  v_new       jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else null end;
  v_row       jsonb := coalesce(v_new, v_old);
  v_org       uuid;
  v_id        text;
  v_diff      jsonb := '{}'::jsonb;
  v_key       text;
  v_email     text;
begin
  -- organizacion (si la tabla la tiene)
  begin v_org := (v_row->>'organization_id')::uuid; exception when others then v_org := null; end;
  -- fallback para tablas sin organization_id (p.ej. order_items): via order_id
  if v_org is null and (v_row ? 'order_id') then
    select o.organization_id into v_org
    from public."LIS_orders" o where o.id = (v_row->>'order_id')::uuid;
  end if;
  v_id := coalesce(v_row->>'id', '');

  -- diff de campos cambiados en UPDATE
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
      return coalesce(new, old);  -- sin cambios reales, no registrar
    end if;
  end if;

  select email into v_email from public."LIS_profiles" where id = auth.uid();

  insert into public."LIS_audit_log"(
    organization_id, actor_id, actor_email, entidad, entidad_id,
    accion, cambios, estado_anterior, estado_nuevo
  ) values (
    v_org, auth.uid(), v_email, tg_table_name, v_id,
    tg_op, nullif(v_diff, '{}'::jsonb), v_old, v_new
  );

  return coalesce(new, old);
end;
$$;

-- Adjuntar el trigger a las tablas criticas para trazabilidad
create trigger trg_audit_orders after insert or update or delete on public."LIS_orders"
  for each row execute function app.audit_trigger();
create trigger trg_audit_order_items after insert or update or delete on public."LIS_order_items"
  for each row execute function app.audit_trigger();
create trigger trg_audit_samples after insert or update or delete on public."LIS_samples"
  for each row execute function app.audit_trigger();
create trigger trg_audit_results after insert or update or delete on public."LIS_results"
  for each row execute function app.audit_trigger();
create trigger trg_audit_deliveries after insert or update or delete on public."LIS_result_deliveries"
  for each row execute function app.audit_trigger();
create trigger trg_audit_invoices after insert or update or delete on public."LIS_invoices"
  for each row execute function app.audit_trigger();
create trigger trg_audit_patients after insert or update or delete on public."LIS_patients"
  for each row execute function app.audit_trigger();
create trigger trg_audit_memberships after insert or update or delete on public."LIS_memberships"
  for each row execute function app.audit_trigger();
-- ============================================================================
-- 0008 · Logica de negocio: perfiles, totales y rollup de estados
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- Crear profile automaticamente al registrar un usuario en auth
-- ─────────────────────────────────────────────────────────────
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public."LIS_profiles"(id, email, nombre)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists "LIS_on_auth_user_created" on auth.users;
create trigger "LIS_on_auth_user_created"
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- Recalcular total de la orden cuando cambian sus items
-- ─────────────────────────────────────────────────────────────
create or replace function app.recalc_order_total()
returns trigger
language plpgsql
as $$
declare
  v_order uuid := coalesce(new.order_id, old.order_id);
begin
  update public."LIS_orders" o
  set total = coalesce((
    select sum(oi.precio - oi.descuento)
    from public."LIS_order_items" oi
    where oi.order_id = v_order and oi.status <> 'anulado'
  ), 0)
  where o.id = v_order;
  return coalesce(new, old);
end;
$$;

create trigger trg_recalc_order_total
  after insert or update of precio, descuento, status or delete on public."LIS_order_items"
  for each row execute function app.recalc_order_total();

-- ─────────────────────────────────────────────────────────────
-- Rollup: estado del item segun sus resultados
-- El item solo es "validado" cuando TODOS los analitos configurados en
-- LIS_study_analytes tienen resultado validado (no basta con los cargados).
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

create trigger trg_rollup_item_status
  after insert or update of status or delete on public."LIS_results"
  for each row execute function app.rollup_item_status();

-- ─────────────────────────────────────────────────────────────
-- Rollup: estado de la orden segun sus items
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

create trigger trg_rollup_order_status
  after insert or update of status or delete on public."LIS_order_items"
  for each row execute function app.rollup_order_status();

-- ─────────────────────────────────────────────────────────────
-- Máquina de estados de la orden: entregar solo si completada,
-- anular siempre con motivo, estados terminales inmutables.
-- ─────────────────────────────────────────────────────────────
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
-- Máquina de estados de la muestra (flujo pre-analítico ordenado;
-- rechazo siempre con motivo).
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
-- RPC: guardar un resultado calculando flag y rango automaticamente
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

  -- no se escriben resultados en ordenes terminales
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
-- ============================================================================
-- 0009 · Row Level Security (aislamiento multi-tenant por organizacion/sede)
--   Regla base: cada fila pertenece a una organizacion; un usuario solo ve
--   filas de sus organizaciones. Las escrituras exigen el rol adecuado.
--   Las funciones SECURITY DEFINER (triggers, RPC) omiten RLS por diseno.
-- ============================================================================

-- Habilitar RLS en todas las tablas del dominio
alter table public."LIS_organizations"       enable row level security;
alter table public."LIS_sedes"               enable row level security;
alter table public."LIS_profiles"            enable row level security;
alter table public."LIS_memberships"         enable row level security;
alter table public."LIS_specimen_types"      enable row level security;
alter table public."LIS_test_categories"     enable row level security;
alter table public."LIS_analytes"            enable row level security;
alter table public."LIS_reference_ranges"    enable row level security;
alter table public."LIS_studies"             enable row level security;
alter table public."LIS_study_analytes"      enable row level security;
alter table public."LIS_study_prices"        enable row level security;
alter table public."LIS_patients"            enable row level security;
alter table public."LIS_order_counters"      enable row level security;
alter table public."LIS_orders"              enable row level security;
alter table public."LIS_order_items"         enable row level security;
alter table public."LIS_samples"             enable row level security;
alter table public."LIS_sample_items"        enable row level security;
alter table public."LIS_results"             enable row level security;
alter table public."LIS_report_documents"    enable row level security;
alter table public."LIS_result_deliveries"   enable row level security;
alter table public."LIS_billing_integrations" enable row level security;
alter table public."LIS_invoices"            enable row level security;
alter table public."LIS_invoice_events"      enable row level security;
alter table public."LIS_audit_log"           enable row level security;

-- ─────────────────────────────────────────────────────────────
-- organizations
-- ─────────────────────────────────────────────────────────────
create policy org_select on public."LIS_organizations" for select to authenticated
  using (app.is_superadmin() or id in (select app.member_org_ids()));
create policy org_update on public."LIS_organizations" for update to authenticated
  using (app.can_admin_org(id)) with check (app.can_admin_org(id));
create policy org_insert on public."LIS_organizations" for insert to authenticated
  with check (app.is_superadmin());

-- ─────────────────────────────────────────────────────────────
-- sedes
-- ─────────────────────────────────────────────────────────────
create policy sede_select on public."LIS_sedes" for select to authenticated
  using (app.is_superadmin() or organization_id in (select app.member_org_ids()));
create policy sede_write on public."LIS_sedes" for all to authenticated
  using (app.can_admin_org(organization_id))
  with check (app.can_admin_org(organization_id));

-- ─────────────────────────────────────────────────────────────
-- profiles: cada quien ve su perfil y el de colegas de su organizacion
-- ─────────────────────────────────────────────────────────────
create policy profile_select_self on public."LIS_profiles" for select to authenticated
  using (
    id = auth.uid()
    or app.is_superadmin()
    or id in (
      select m.user_id from public."LIS_memberships" m
      where m.organization_id in (select app.member_org_ids())
    )
  );
create policy profile_update_self on public."LIS_profiles" for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Proteccion de campos sensibles del perfil (es_superadmin / email):
-- la policy anterior permite UPDATE de la propia fila; este trigger impide
-- que un usuario se auto-otorgue superadmin o cambie su email.
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
-- memberships
-- ─────────────────────────────────────────────────────────────
create policy membership_select on public."LIS_memberships" for select to authenticated
  using (
    user_id = auth.uid()
    or app.is_superadmin()
    or organization_id in (select app.member_org_ids())
  );
create policy membership_write on public."LIS_memberships" for all to authenticated
  using (app.can_admin_org(organization_id))
  with check (app.can_admin_org(organization_id));

-- ─────────────────────────────────────────────────────────────
-- Catalogo: lectura de plantillas globales (org null) + propias.
--   Escritura solo admins de la organizacion propietaria.
-- ─────────────────────────────────────────────────────────────
create policy specimen_select on public."LIS_specimen_types" for select to authenticated using (true);
create policy specimen_write on public."LIS_specimen_types" for all to authenticated
  using (app.is_superadmin()) with check (app.is_superadmin());

-- Macro reutilizable via patron: categorias, analitos, estudios
create policy category_select on public."LIS_test_categories" for select to authenticated
  using (organization_id is null or organization_id in (select app.member_org_ids()));
create policy category_write on public."LIS_test_categories" for all to authenticated
  using (organization_id is not null and app.can_admin_org(organization_id))
  with check (organization_id is not null and app.can_admin_org(organization_id));

create policy analyte_select on public."LIS_analytes" for select to authenticated
  using (organization_id is null or organization_id in (select app.member_org_ids()));
create policy analyte_write on public."LIS_analytes" for all to authenticated
  using (organization_id is not null and app.can_admin_org(organization_id))
  with check (organization_id is not null and app.can_admin_org(organization_id));

create policy study_select on public."LIS_studies" for select to authenticated
  using (organization_id is null or organization_id in (select app.member_org_ids()));
create policy study_write on public."LIS_studies" for all to authenticated
  using (organization_id is not null and app.can_admin_org(organization_id))
  with check (organization_id is not null and app.can_admin_org(organization_id));

-- Hijos del catalogo: heredan visibilidad del padre
create policy refrange_select on public."LIS_reference_ranges" for select to authenticated
  using (exists (select 1 from public."LIS_analytes" a where a.id = analyte_id
    and (a.organization_id is null or a.organization_id in (select app.member_org_ids()))));
create policy refrange_write on public."LIS_reference_ranges" for all to authenticated
  using (exists (select 1 from public."LIS_analytes" a where a.id = analyte_id
    and a.organization_id is not null and app.can_admin_org(a.organization_id)))
  with check (exists (select 1 from public."LIS_analytes" a where a.id = analyte_id
    and a.organization_id is not null and app.can_admin_org(a.organization_id)));

create policy studyanalyte_select on public."LIS_study_analytes" for select to authenticated
  using (exists (select 1 from public."LIS_studies" s where s.id = study_id
    and (s.organization_id is null or s.organization_id in (select app.member_org_ids()))));
create policy studyanalyte_write on public."LIS_study_analytes" for all to authenticated
  using (exists (select 1 from public."LIS_studies" s where s.id = study_id
    and s.organization_id is not null and app.can_admin_org(s.organization_id)))
  with check (exists (select 1 from public."LIS_studies" s where s.id = study_id
    and s.organization_id is not null and app.can_admin_org(s.organization_id)));

create policy studyprice_select on public."LIS_study_prices" for select to authenticated
  using (exists (select 1 from public."LIS_studies" s where s.id = study_id
    and (s.organization_id is null or s.organization_id in (select app.member_org_ids()))));
create policy studyprice_write on public."LIS_study_prices" for all to authenticated
  using (exists (select 1 from public."LIS_studies" s where s.id = study_id
    and s.organization_id is not null and app.can_admin_org(s.organization_id)))
  with check (exists (select 1 from public."LIS_studies" s where s.id = study_id
    and s.organization_id is not null and app.can_admin_org(s.organization_id)));

-- ─────────────────────────────────────────────────────────────
-- Pacientes (org-scoped). Escritura: recepcion/admin.
-- ─────────────────────────────────────────────────────────────
create policy patient_select on public."LIS_patients" for select to authenticated
  using (organization_id in (select app.member_org_ids()));
create policy patient_write on public."LIS_patients" for all to authenticated
  using (app.has_org_role(organization_id,
    array['org_admin','sede_admin','recepcion']::app.role[]))
  with check (app.has_org_role(organization_id,
    array['org_admin','sede_admin','recepcion']::app.role[]));

-- ─────────────────────────────────────────────────────────────
-- order_counters: solo lectura para miembros; escritura via RPC definer
-- ─────────────────────────────────────────────────────────────
create policy counter_select on public."LIS_order_counters" for select to authenticated
  using (organization_id in (select app.member_org_ids()));

-- ─────────────────────────────────────────────────────────────
-- Ordenes (scope por sede). Escritura: recepcion/admin.
-- ─────────────────────────────────────────────────────────────
create policy order_select on public."LIS_orders" for select to authenticated
  using (sede_id in (select app.member_sede_ids()));
create policy order_write on public."LIS_orders" for all to authenticated
  using (app.has_sede_role(sede_id,
    array['org_admin','sede_admin','recepcion','facturacion']::app.role[]))
  with check (app.has_sede_role(sede_id,
    array['org_admin','sede_admin','recepcion','facturacion']::app.role[]));

-- order_items: heredan de la orden
create policy orderitem_select on public."LIS_order_items" for select to authenticated
  using (exists (select 1 from public."LIS_orders" o where o.id = order_id
    and o.sede_id in (select app.member_sede_ids())));
create policy orderitem_write on public."LIS_order_items" for all to authenticated
  using (exists (select 1 from public."LIS_orders" o where o.id = order_id
    and app.has_sede_role(o.sede_id,
      array['org_admin','sede_admin','recepcion','analista','validador']::app.role[])))
  with check (exists (select 1 from public."LIS_orders" o where o.id = order_id
    and app.has_sede_role(o.sede_id,
      array['org_admin','sede_admin','recepcion','analista','validador']::app.role[])));

-- ─────────────────────────────────────────────────────────────
-- Muestras y resultados (org-scoped; roles de laboratorio)
-- ─────────────────────────────────────────────────────────────
create policy sample_select on public."LIS_samples" for select to authenticated
  using (organization_id in (select app.member_org_ids()));
create policy sample_write on public."LIS_samples" for all to authenticated
  using (app.has_org_role(organization_id,
    array['org_admin','sede_admin','recepcion','toma_muestra','analista','validador']::app.role[]))
  with check (app.has_org_role(organization_id,
    array['org_admin','sede_admin','recepcion','toma_muestra','analista','validador']::app.role[]));

create policy sampleitem_select on public."LIS_sample_items" for select to authenticated
  using (exists (select 1 from public."LIS_samples" s where s.id = sample_id
    and s.organization_id in (select app.member_org_ids())));
create policy sampleitem_write on public."LIS_sample_items" for all to authenticated
  using (exists (select 1 from public."LIS_samples" s where s.id = sample_id
    and app.has_org_role(s.organization_id,
      array['org_admin','sede_admin','toma_muestra','analista']::app.role[])))
  with check (exists (select 1 from public."LIS_samples" s where s.id = sample_id
    and app.has_org_role(s.organization_id,
      array['org_admin','sede_admin','toma_muestra','analista']::app.role[])));

create policy result_select on public."LIS_results" for select to authenticated
  using (organization_id in (select app.member_org_ids()));
create policy result_write on public."LIS_results" for all to authenticated
  using (app.has_org_role(organization_id,
    array['org_admin','sede_admin','analista','validador']::app.role[]))
  with check (app.has_org_role(organization_id,
    array['org_admin','sede_admin','analista','validador']::app.role[]));

-- ─────────────────────────────────────────────────────────────
-- Reportes, entregas, facturacion (org-scoped)
-- ─────────────────────────────────────────────────────────────
create policy reportdoc_select on public."LIS_report_documents" for select to authenticated
  using (organization_id in (select app.member_org_ids()));
create policy reportdoc_write on public."LIS_report_documents" for all to authenticated
  using (app.has_org_role(organization_id,
    array['org_admin','sede_admin','analista','validador','recepcion']::app.role[]))
  with check (app.has_org_role(organization_id,
    array['org_admin','sede_admin','analista','validador','recepcion']::app.role[]));

create policy delivery_select on public."LIS_result_deliveries" for select to authenticated
  using (organization_id in (select app.member_org_ids()));
create policy delivery_write on public."LIS_result_deliveries" for all to authenticated
  using (app.has_org_role(organization_id,
    array['org_admin','sede_admin','recepcion','validador']::app.role[]))
  with check (app.has_org_role(organization_id,
    array['org_admin','sede_admin','recepcion','validador']::app.role[]));

create policy billing_select on public."LIS_billing_integrations" for select to authenticated
  using (organization_id in (select app.member_org_ids()));
create policy billing_write on public."LIS_billing_integrations" for all to authenticated
  using (app.can_admin_org(organization_id))
  with check (app.can_admin_org(organization_id));

create policy invoice_select on public."LIS_invoices" for select to authenticated
  using (organization_id in (select app.member_org_ids()));
create policy invoice_write on public."LIS_invoices" for all to authenticated
  using (app.has_org_role(organization_id,
    array['org_admin','sede_admin','facturacion']::app.role[]))
  with check (app.has_org_role(organization_id,
    array['org_admin','sede_admin','facturacion']::app.role[]));

create policy invoiceevent_select on public."LIS_invoice_events" for select to authenticated
  using (exists (select 1 from public."LIS_invoices" i where i.id = invoice_id
    and i.organization_id in (select app.member_org_ids())));

-- ─────────────────────────────────────────────────────────────
-- DELETE restringido a administración en entidades críticas
-- (policies RESTRICTIVE: se combinan con AND sobre las `*_write`)
-- ─────────────────────────────────────────────────────────────
create policy patient_delete_admin on public."LIS_patients"
  as restrictive for delete to authenticated
  using (app.can_admin_org(organization_id));
create policy orderitem_delete_admin on public."LIS_order_items"
  as restrictive for delete to authenticated
  using (app.can_admin_org((select o.organization_id from public."LIS_orders" o where o.id = order_id)));
create policy sample_delete_admin on public."LIS_samples"
  as restrictive for delete to authenticated
  using (app.can_admin_org(organization_id));
create policy result_delete_admin on public."LIS_results"
  as restrictive for delete to authenticated
  using (app.can_admin_org(organization_id));
create policy delivery_delete_admin on public."LIS_result_deliveries"
  as restrictive for delete to authenticated
  using (app.can_admin_org(organization_id));
create policy invoice_delete_admin on public."LIS_invoices"
  as restrictive for delete to authenticated
  using (app.can_admin_org(organization_id));

-- ─────────────────────────────────────────────────────────────
-- Auditoria: lectura para admins/lectura; nunca escritura via API
-- ─────────────────────────────────────────────────────────────
create policy audit_select on public."LIS_audit_log" for select to authenticated
  using (
    app.is_superadmin()
    or app.has_org_role(organization_id, array['org_admin','sede_admin','lectura']::app.role[])
  );
-- ============================================================================
-- 0010 · Vistas de consulta y RPC de alto nivel
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- Vista: resumen de ordenes con paciente y progreso
--   (hereda RLS de las tablas base; usa security_invoker)
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
  count(oi.id) filter (where oi.status = 'pendiente')   as items_pendientes
from public."LIS_orders" o
join public."LIS_sedes" s      on s.id = o.sede_id
join public."LIS_patients" p   on p.id = o.patient_id
left join public."LIS_order_items" oi on oi.order_id = o.id
group by o.id, s.nombre, p.id;

-- ─────────────────────────────────────────────────────────────
-- RPC: crear una orden con sus items (recepcion)
--   p_items: jsonb array de { study_id }
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

  -- el paciente debe pertenecer a la organización de la sede
  if not exists (
    select 1 from public."LIS_patients" p
    where p.id = p_patient_id and p.organization_id = v_org
  ) then
    raise exception 'paciente % no pertenece a la organizacion', p_patient_id;
  end if;

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
-- RPC: bootstrap de una organizacion con su admin (setup inicial)
-- ─────────────────────────────────────────────────────────────
create or replace function public.bootstrap_organization(
  p_slug text,
  p_nombre text,
  p_sede_nombre text default 'Sede Principal'
) returns public."LIS_organizations"
language plpgsql security definer set search_path = public
as $$
declare
  v_org  public."LIS_organizations";
  v_sede public."LIS_sedes";
begin
  if auth.uid() is null then
    raise exception 'requiere autenticacion';
  end if;

  insert into public."LIS_organizations"(slug, nombre)
  values (p_slug, p_nombre) returning * into v_org;

  insert into public."LIS_sedes"(organization_id, codigo, nombre)
  values (v_org.id, 'S001', p_sede_nombre) returning * into v_sede;

  -- el creador queda como administrador de la organizacion
  insert into public."LIS_memberships"(organization_id, sede_id, user_id, role)
  values (v_org.id, null, auth.uid(), 'org_admin');

  return v_org;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- RPC: trazabilidad de una orden (linea de tiempo de auditoria)
-- ─────────────────────────────────────────────────────────────
create or replace function public.order_timeline(p_order_id uuid)
returns setof public."LIS_audit_log"
language sql stable security definer set search_path = public
as $$
  select a.*
  from public."LIS_audit_log" a
  where a.organization_id in (select app.member_org_ids())
    and (
      (a.entidad = 'LIS_orders' and a.entidad_id = p_order_id::text)
      or (a.entidad = 'LIS_order_items' and a.entidad_id in (
            select oi.id::text from public."LIS_order_items" oi where oi.order_id = p_order_id))
      or (a.entidad = 'LIS_samples' and a.entidad_id in (
            select s.id::text from public."LIS_samples" s where s.order_id = p_order_id))
      or (a.entidad = 'LIS_results' and a.entidad_id in (
            select r.id::text from public."LIS_results" r
            join public."LIS_order_items" oi on oi.id = r.order_item_id
            where oi.order_id = p_order_id))
      or (a.entidad = 'LIS_result_deliveries' and a.entidad_id in (
            select d.id::text from public."LIS_result_deliveries" d where d.order_id = p_order_id))
    )
  order by a.created_at asc;
$$;
-- ============================================================================
-- 0011 · Agendamiento de citas (modulo Agenda)
--   Citas por sede con paciente, estudios preseleccionados y ciclo de vida
--   completo: programada → confirmada → en_espera → atendida (genera orden).
-- ============================================================================

create type app.appointment_status as enum (
  'programada',     -- creada en agenda
  'confirmada',     -- paciente confirmo asistencia
  'en_espera',      -- paciente llego a la sede (sala de espera)
  'atendida',       -- se genero la orden / atencion
  'no_asistio',     -- no se presento
  'cancelada'
);

create table public."LIS_appointments" (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public."LIS_organizations"(id) on delete cascade,
  sede_id          uuid not null references public."LIS_sedes"(id) on delete cascade,
  patient_id       uuid not null references public."LIS_patients"(id) on delete cascade,
  order_id         uuid references public."LIS_orders"(id) on delete set null,
  fecha            date not null,
  hora_inicio      time not null,
  duracion_min     integer not null default 15 check (duracion_min between 5 and 480),
  status           app.appointment_status not null default 'programada',
  motivo           text,
  study_ids        uuid[] not null default '{}',   -- estudios preseleccionados (snapshot ligero)
  medico_solicitante text,
  medico_solicitante_id uuid references public."LIS_professionals"(id) on delete set null,
  canal            text not null default 'presencial',  -- presencial | telefono | whatsapp | web
  notas            text,
  recordatorio_at  timestamptz,                    -- ultimo recordatorio enviado
  cancel_motivo    text,
  created_by       uuid references public."LIS_profiles"(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index "LIS_idx_appt_sede_fecha" on public."LIS_appointments"(sede_id, fecha, hora_inicio);
create index "LIS_idx_appt_patient"    on public."LIS_appointments"(patient_id);
create index "LIS_idx_appt_status"     on public."LIS_appointments"(status);
create index "LIS_idx_appt_org"        on public."LIS_appointments"(organization_id);

create trigger trg_touch_appointments before update on public."LIS_appointments"
  for each row execute function app.touch_updated_at();

-- Trazabilidad: cada cambio de cita queda en la bitacora
create trigger trg_audit_appointments after insert or update or delete on public."LIS_appointments"
  for each row execute function app.audit_trigger();

-- ─────────────────────────────────────────────────────────────
-- Vista: agenda con datos del paciente listos para pintar
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
  o.codigo                             as order_codigo
from public."LIS_appointments" a
join public."LIS_sedes" s    on s.id = a.sede_id
join public."LIS_patients" p on p.id = a.patient_id
left join public."LIS_orders" o on o.id = a.order_id;

-- ─────────────────────────────────────────────────────────────
-- RLS (scope por sede; escritura recepcion/admin)
-- ─────────────────────────────────────────────────────────────
alter table public."LIS_appointments" enable row level security;

create policy appt_select on public."LIS_appointments" for select to authenticated
  using (sede_id in (select app.member_sede_ids()));
create policy appt_write on public."LIS_appointments" for all to authenticated
  using (app.has_sede_role(sede_id,
    array['org_admin','sede_admin','recepcion','medico']::app.role[]))
  with check (app.has_sede_role(sede_id,
    array['org_admin','sede_admin','recepcion','medico']::app.role[]));
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
