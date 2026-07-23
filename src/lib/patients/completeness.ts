/**
 * Completitud del registro de un paciente.
 *
 * Un paciente puede crearse muy rápido (p. ej. autocompletando desde el DNI en
 * "Nueva atención"), y la fuente externa NO aporta todos los datos: sexo,
 * teléfono y —cuando el DNI no lo tiene— fecha de nacimiento quedan vacíos.
 *
 * En lugar de una bandera persistida, derivamos el estado de los propios campos.
 * Así el indicador se "cura" solo en cuanto alguien completa los datos, sin
 * necesidad de tocar la base ni recordar limpiar flags.
 */

export type PatientCompletenessInput = {
  sexo?: string | null;
  fecha_nacimiento?: string | null;
  telefono?: string | null;
};

/** Devuelve las etiquetas de los campos importantes que faltan. */
export function missingPatientFields(p: PatientCompletenessInput): string[] {
  const missing: string[] = [];
  if (!p.sexo || p.sexo === "desconocido") missing.push("Sexo");
  if (!p.fecha_nacimiento) missing.push("Fecha de nacimiento");
  if (!p.telefono) missing.push("Teléfono");
  return missing;
}

export function isPatientIncomplete(p: PatientCompletenessInput): boolean {
  return missingPatientFields(p).length > 0;
}
