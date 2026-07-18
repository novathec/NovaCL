-- ─────────────────────────────────────────────────────────────
-- 0015: Permisos granulares por módulo
--
-- Los administradores (globales o de la organización) pueden ajustar,
-- por rol y por sede, qué módulos se pueden VER y cuáles EDITAR.
-- Sin fila → aplican los permisos por defecto del sistema.
-- Precedencia: sede específica > toda la organización > defaults.
-- El superadmin global ignora esta tabla (acceso total).
-- ─────────────────────────────────────────────────────────────

create table if not exists public."LIS_role_permissions" (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public."LIS_organizations"(id) on delete cascade,
  sede_id          uuid references public."LIS_sedes"(id) on delete cascade, -- null = toda la org
  role             app.role not null,
  module           text not null, -- dashboard|agenda|pacientes|ordenes|muestras|resultados|entrega|analitica|catalogo|facturacion|trazabilidad|configuracion
  can_view         boolean not null default true,
  can_edit         boolean not null default true,
  updated_by       uuid references public."LIS_profiles"(id),
  updated_at       timestamptz not null default now(),
  unique nulls not distinct (organization_id, sede_id, role, module)
);

create index if not exists "LIS_idx_roleperm_org"
  on public."LIS_role_permissions"(organization_id, role);

alter table public."LIS_role_permissions" enable row level security;

-- Todos los miembros leen los permisos de su organización (los necesita el shell)
drop policy if exists roleperm_select on public."LIS_role_permissions";
create policy roleperm_select on public."LIS_role_permissions"
  for select to authenticated
  using (app.is_superadmin() or organization_id in (select app.member_org_ids()));

-- Solo administradores de la organización los modifican
drop policy if exists roleperm_write on public."LIS_role_permissions";
create policy roleperm_write on public."LIS_role_permissions"
  for all to authenticated
  using (app.can_admin_org(organization_id))
  with check (app.can_admin_org(organization_id));

-- Trazabilidad: todo cambio de permisos queda auditado
drop trigger if exists trg_audit_role_permissions on public."LIS_role_permissions";
create trigger trg_audit_role_permissions
  after insert or update or delete on public."LIS_role_permissions"
  for each row execute function app.audit_trigger();
