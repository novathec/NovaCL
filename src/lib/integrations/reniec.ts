/**
 * Consulta de datos de persona por DNI (RENIEC vía Pale Consultores).
 *
 * Este módulo se importa SOLO desde server actions ("use server"): la llamada
 * lleva un token de servicio que nunca debe llegar al cliente. Devuelve datos
 * normalizados a la forma que usa `LIS_patients` (apellidos ya combinados,
 * fecha de nacimiento en ISO `yyyy-mm-dd`).
 *
 * Nota importante: la API entrega nombres/apellidos y fecha de nacimiento, pero
 * NO sexo, teléfono ni email. Por eso un paciente creado desde el DNI queda
 * "incompleto" (ver src/lib/patients/completeness.ts).
 */

const API_BASE = "https://apis.paleconsultores.com/v2/consultadnis/";
// El token puede sobreescribirse por entorno; se deja un valor por defecto para
// que la integración funcione sin configuración adicional.
const TOKEN = process.env.RENIEC_API_TOKEN ?? "407826";

export type ReniecPerson = {
  dni: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  /** Apellidos combinados: "PATERNO MATERNO". */
  apellidos: string;
  /** ISO `yyyy-mm-dd`, o null si la API no la entrega / es inválida. */
  fechaNacimiento: string | null;
  direccion: string | null;
  codUbigeo: string | null;
};

type RawRow = {
  DNI?: string;
  Apellido_Paterno?: string;
  Apellido_Materno?: string;
  Nombres?: string;
  Direccion?: string;
  Cod_Ubigeo?: string;
  FechaNacimiento?: string;
};

/** Convierte "dd/mm/yyyy" o "dd-mm-yyyy" a ISO `yyyy-mm-dd`. */
function toIsoDate(value?: string): string | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  // La API usa 01/01/1900 como valor centinela cuando no hay dato real.
  if (yyyy === "1900") return null;
  const iso = `${yyyy}-${mm}-${dd}`;
  const t = Date.parse(iso);
  if (Number.isNaN(t) || t > Date.now()) return null;
  return iso;
}

function clean(value?: string): string {
  return (value ?? "").trim();
}

export class ReniecError extends Error {}

/**
 * Consulta un DNI. Devuelve la persona normalizada, o `null` si el DNI no
 * existe / la API no lo encuentra. Lanza `ReniecError` ante fallos de red o
 * respuestas no interpretables (para distinguir "no encontrado" de "no se pudo
 * consultar").
 */
export async function lookupDni(dni: string): Promise<ReniecPerson | null> {
  if (!/^\d{8}$/.test(dni)) return null;

  const url = `${API_BASE}?Token=${encodeURIComponent(TOKEN)}&DNI=${encodeURIComponent(dni)}`;

  let json: {
    Exito?: string;
    Resultado?: RawRow[][] | RawRow[];
  };
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!res.ok) throw new ReniecError(`HTTP ${res.status}`);
    json = await res.json();
  } catch (err) {
    console.error("lookupDni: fallo de red/parsing", err);
    throw new ReniecError("No se pudo conectar con el servicio de consulta de DNI.");
  }

  if (json?.Exito !== "1") return null;

  // Resultado viene anidado: [[{...}]]. Aplanamos defensivamente.
  const resultado = json.Resultado ?? [];
  const first = Array.isArray(resultado[0]) ? resultado[0] : resultado;
  const row = (first as RawRow[])?.[0];
  if (!row || !clean(row.DNI)) return null;

  const apellidoPaterno = clean(row.Apellido_Paterno);
  const apellidoMaterno = clean(row.Apellido_Materno);

  return {
    dni: clean(row.DNI),
    nombres: clean(row.Nombres),
    apellidoPaterno,
    apellidoMaterno,
    apellidos: [apellidoPaterno, apellidoMaterno].filter(Boolean).join(" "),
    fechaNacimiento: toIsoDate(row.FechaNacimiento),
    direccion: clean(row.Direccion) || null,
    codUbigeo: clean(row.Cod_Ubigeo) || null,
  };
}
