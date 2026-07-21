-- ============================================================================
-- 0020 · Privilegios sobre el schema `app`
--
-- Motivo:
--   Las escrituras directas via PostgREST (por ejemplo, INSERT/UPDATE en
--   public."LIS_patients") disparan el trigger app.audit_trigger. Aunque la
--   funcion es SECURITY DEFINER, PostgreSQL igual verifica USAGE sobre el
--   schema y EXECUTE sobre la funcion en el contexto del rol invocador.
--
--   Sin estos grants, el trigger falla con:
--     42501: permission denied for schema app
--   y el error aparece en la app como "No se pudo guardar el paciente (42501)".
--
--   Los flujos que pasan por RPCs SECURITY DEFINER (create_order,
--   get_session_bundle, etc.) no se ven afectados porque corren como el
--   owner del RPC, que si tiene acceso al schema.
--
-- Idempotente: se puede aplicar varias veces sin efecto adicional.
-- ============================================================================

grant usage on schema app to anon, authenticated, service_role;

grant execute on all functions in schema app
  to anon, authenticated, service_role;

-- Nuevos objetos que se creen en `app` heredan los mismos grants.
alter default privileges in schema app
  grant execute on functions to anon, authenticated, service_role;
