-- ─────────────────────────────────────────────────────────────
-- 0014: Registro de aviso de valores críticos (ISO 15189)
--
-- Cuando un resultado marca crítico, el validador debe comunicarlo
-- al médico/servicio solicitante y dejar constancia: a quién se
-- avisó, por qué medio, cuándo y qué analitos. Esta tabla es esa
-- constancia, con auditoría automática.
-- ─────────────────────────────────────────────────────────────

create table if not exists public."LIS_critical_notifications" (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public."LIS_organizations"(id) on delete cascade,
  order_id         uuid not null references public."LIS_orders"(id) on delete cascade,
  analitos         jsonb not null default '[]'::jsonb, -- [{analito, valor}]
  notificado_a     text not null,                      -- persona/servicio contactado
  medio            text not null default 'telefono',   -- telefono | email | presencial | otro
  nota             text,
  notificado_por   uuid references public."LIS_profiles"(id),
  created_at       timestamptz not null default now()
);

create index if not exists "LIS_idx_critnotif_order"
  on public."LIS_critical_notifications"(order_id);
create index if not exists "LIS_idx_critnotif_org"
  on public."LIS_critical_notifications"(organization_id, created_at desc);

alter table public."LIS_critical_notifications" enable row level security;

drop policy if exists critnotif_select on public."LIS_critical_notifications";
create policy critnotif_select on public."LIS_critical_notifications"
  for select to authenticated
  using (app.has_org_role(organization_id,
    array['org_admin','sede_admin','validador','analista','recepcion','medico']::app.role[]));

drop policy if exists critnotif_insert on public."LIS_critical_notifications";
create policy critnotif_insert on public."LIS_critical_notifications"
  for insert to authenticated
  with check (app.has_org_role(organization_id,
    array['org_admin','sede_admin','validador','analista']::app.role[]));

-- Trazabilidad: cada registro de aviso queda en la bitácora
drop trigger if exists trg_audit_critical_notifications on public."LIS_critical_notifications";
create trigger trg_audit_critical_notifications
  after insert or update or delete on public."LIS_critical_notifications"
  for each row execute function app.audit_trigger();
