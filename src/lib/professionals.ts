/**
 * Tipos de profesional de salud y su colegio profesional en Perú.
 * Compartido entre el LIS y los futuros módulos de la suite.
 */
export const PROFESSIONAL_TYPES = {
  medico: { label: "Médico", colegio: "CMP" },
  tecnologo_medico: { label: "Tecnólogo médico de laboratorio", colegio: "CTMP" },
  patologo: { label: "Médico patólogo clínico", colegio: "CMP" },
  quimico_farmaceutico: { label: "Químico farmacéutico", colegio: "CQFP" },
  biologo: { label: "Biólogo", colegio: "CBP" },
  enfermero: { label: "Enfermero(a)", colegio: "CEP" },
  otro: { label: "Otro profesional", colegio: "—" },
} as const;

export type ProfessionalType = keyof typeof PROFESSIONAL_TYPES;

export function professionalTypeLabel(tipo: string): string {
  return (PROFESSIONAL_TYPES as Record<string, { label: string }>)[tipo]?.label ?? tipo;
}

export function colegioFor(tipo: string): string {
  return (PROFESSIONAL_TYPES as Record<string, { colegio: string }>)[tipo]?.colegio ?? "";
}
