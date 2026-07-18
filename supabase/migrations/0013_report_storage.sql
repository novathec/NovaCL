-- ─────────────────────────────────────────────────────────────
-- 0013: Almacenamiento de informes en Supabase Storage
--
-- Bucket privado `reports` con estructura por tenant:
--   reports/{organization_id}/{order_id}/v{version}.pdf
--
-- Escritura: solo el servidor con service role (omite RLS).
-- Lectura: miembros de la organización (o vía signed URL emitida
-- por el servidor para el portal del paciente).
-- ─────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

-- Miembros del tenant pueden leer los informes de su organización.
-- El primer segmento del path es el organization_id.
drop policy if exists "reports_read_org_members" on storage.objects;
create policy "reports_read_org_members"
on storage.objects for select to authenticated
using (
  bucket_id = 'reports'
  and (split_part(name, '/', 1))::uuid in (select app.member_org_ids())
);

-- Sin políticas de insert/update/delete para authenticated:
-- la escritura queda reservada al service role del servidor.
