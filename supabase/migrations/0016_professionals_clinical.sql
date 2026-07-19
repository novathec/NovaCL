-- ─────────────────────────────────────────────────────────────
-- 0016: Directorio de profesionales + campos clínicos del paciente
--
-- Pieza del "núcleo compartido" de la suite: una identidad de
-- profesional (médico solicitante, tecnólogo médico de laboratorio,
-- patólogo, químico farmacéutico, etc.) reutilizable por LIS y por
-- los futuros módulos (historia clínica, agendamiento).
--
-- Además promueve campos clínicos de seguridad del paciente que hoy
-- viven como metadata suelta (grupo sanguíneo, alergias, seguro) a
-- columnas estructuradas.
-- ─────────────────────────────────────────────────────────────

-- ── Directorio de profesionales ──────────────────────────────
create table if not exists public."LIS_professionals" (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public."LIS_organizations"(id) on delete cascade,
  user_id             uuid references public."LIS_profiles"(id) on delete set null, -- si además es usuario del sistema
  tipo                text not null default 'medico',
    -- medico | tecnologo_medico | patologo | quimico_farmaceutico | biologo | enfermero | otro
  nombres             text not null,
  apellidos           text not null,
  numero_colegiatura  text,          -- CMP, CTMP, CQFP, CBP, CEP…
  colegio             text,          -- sigla del colegio profesional
  especialidad        text,
  telefono            text,
  email               text,
  externo             boolean not null default false, -- médico solicitante de otra institución
  activo              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists "LIS_idx_prof_org" on public."LIS_professionals"(organization_id, activo);
create index if not exists "LIS_idx_prof_user" on public."LIS_professionals"(user_id);

drop trigger if exists trg_prof_touch on public."LIS_professionals";
create trigger trg_prof_touch before update on public."LIS_professionals"
  for each row execute function app.touch_updated_at();

alter table public."LIS_professionals" enable row level security;

drop policy if exists prof_select on public."LIS_professionals";
create policy prof_select on public."LIS_professionals"
  for select to authenticated
  using (app.is_superadmin() or organization_id in (select app.member_org_ids()));

drop policy if exists prof_write on public."LIS_professionals";
create policy prof_write on public."LIS_professionals"
  for all to authenticated
  using (app.can_admin_org(organization_id))
  with check (app.can_admin_org(organization_id));

drop trigger if exists trg_audit_professionals on public."LIS_professionals";
create trigger trg_audit_professionals
  after insert or update or delete on public."LIS_professionals"
  for each row execute function app.audit_trigger();

-- Referencia opcional del médico solicitante en la orden (se conserva
-- el texto libre para solicitantes externos no registrados).
alter table public."LIS_orders"
  add column if not exists medico_solicitante_id uuid references public."LIS_professionals"(id) on delete set null;

-- ── Campos clínicos de seguridad del paciente ────────────────
alter table public."LIS_patients"
  add column if not exists grupo_sanguineo    text,   -- A+, O-, AB+, …
  add column if not exists alergias           text,   -- texto clínico (safety)
  add column if not exists antecedentes       text,   -- personales/familiares
  add column if not exists seguro             text,   -- financiador: EsSalud, SIS, EPS, particular…
  add column if not exists contacto_emergencia text;

comment on column public."LIS_patients".alergias is
  'Alergias conocidas: dato de seguridad, se muestra destacado y viaja al futuro módulo de historia clínica.';
