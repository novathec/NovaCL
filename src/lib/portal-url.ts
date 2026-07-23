/**
 * Base pública del portal de resultados (ej. `https://tu-dominio.com/portal`).
 * Sin esta variable, un enlace generado en el servidor sería inutilizable
 * para el paciente (apuntaría al host del proceso, no al dominio público),
 * así que se falla explícito en vez de degradar en silencio.
 */
export function getResultsPortalBase(): string {
  const base = process.env.RESULTS_PUBLIC_BASE_URL;
  if (!base) {
    throw new Error(
      "RESULTS_PUBLIC_BASE_URL no está configurada: no se puede generar el enlace del portal de resultados."
    );
  }
  return base;
}
