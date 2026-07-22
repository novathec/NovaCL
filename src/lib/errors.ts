/**
 * Traduce errores de Postgres/PostgREST a mensajes de dominio en español.
 * El detalle crudo (constraint, SQLSTATE, stack de PostgREST) solo se
 * registra en el log del servidor — nunca se expone al usuario.
 */
export type DbErrorLike = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

export function friendlyDbError(
  error: DbErrorLike,
  fallback = "No se pudo completar la operación. Inténtalo de nuevo."
): string {
  // Log servidor para depuración (sin datos personales del payload).
  console.error("[db-error]", error.code ?? "sin-codigo", error.message ?? "");

  switch (error.code) {
    case "23505":
      return "Ya existe un registro con esos datos (duplicado).";
    case "23503":
      return "La operación referencia datos que no existen o están en uso.";
    case "23514":
      return "Un valor no cumple las restricciones permitidas.";
    case "22003":
      return "Un número excede el rango permitido.";
    case "22P02":
      return "Un identificador tiene formato inválido.";
    case "42501":
      return "No tienes permisos para esta operación.";
    case "PGRST116":
      return "Registro no encontrado.";
    default:
      break;
  }

  const msg = error.message ?? "";
  // Excepciones de negocio lanzadas por los RPC (raise exception en español)
  if (msg.includes("row-level security")) {
    return "No tienes permisos para esta operación.";
  }
  return fallback;
}

/**
 * Mensaje de error para excepciones de RPC de dominio: las funciones SQL del
 * sistema lanzan `raise exception` en español; esos mensajes sí son aptos
 * para el usuario. Errores técnicos se reemplazan por el fallback.
 */
export function rpcError(error: DbErrorLike, fallback = "No se pudo completar la operación."): string {
  console.error("[rpc-error]", error.code ?? "sin-codigo", error.message ?? "");
  const msg = error.message ?? "";
  // Las excepciones de dominio vienen sin prefijo técnico conocido
  const tecnico =
    msg.includes("duplicate key") ||
    msg.includes("violates") ||
    msg.includes("row-level security") ||
    msg.includes("permission denied") ||
    msg.includes("syntax error") ||
    msg.includes("PGRST");
  if (!msg || tecnico) return friendlyDbError(error, fallback);
  return msg;
}
