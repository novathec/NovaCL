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
