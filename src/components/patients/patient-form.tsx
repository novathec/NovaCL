"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import {
  savePatientAction,
  lookupDniAction,
  type PatientFormState,
} from "@/lib/actions/patients";
import { StickyFormActions } from "@/components/forms/sticky-form-actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Tables } from "@/lib/database.types";

const DOC_PATTERNS: Record<string, string> = {
  DNI: "\\d{8}",
  CE: "[A-Za-z0-9]{6,12}",
  PAS: "[A-Za-z0-9]{6,9}",
  OTRO: ".{3,40}",
};

export function PatientForm({
  patient,
  onDone,
}: {
  patient?: Tables<"LIS_patients">;
  onDone?: (id: string) => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState<PatientFormState, FormData>(
    savePatientAction,
    undefined
  );
  const [tipoDoc, setTipoDoc] = useState<string>(patient?.tipo_documento ?? "DNI");
  const today = new Date().toISOString().slice(0, 10);
  const [showClinical, setShowClinical] = useState(false);

  // Campos autocompletables desde el DNI: controlados para poder rellenarlos.
  const [numeroDoc, setNumeroDoc] = useState(patient?.numero_documento ?? "");
  const [nombres, setNombres] = useState(patient?.nombres ?? "");
  const [apellidos, setApellidos] = useState(patient?.apellidos ?? "");
  const [fechaNac, setFechaNac] = useState(patient?.fecha_nacimiento ?? "");
  const [direccion, setDireccion] = useState(patient?.direccion ?? "");
  const [looking, startLookup] = useTransition();

  const canLookup = tipoDoc === "DNI" && /^\d{8}$/.test(numeroDoc);

  function autofillFromDni() {
    startLookup(async () => {
      const res = await lookupDniAction(numeroDoc);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.existing) {
        toast.warning(
          `Ya existe un paciente con DNI ${numeroDoc}: ${res.existing.apellidos}, ${res.existing.nombres}.`
        );
      }
      const p = res.person;
      setNombres(p.nombres);
      setApellidos(p.apellidos);
      if (p.fechaNacimiento) setFechaNac(p.fechaNacimiento);
      if (p.direccion) setDireccion(p.direccion);
      toast.success("Datos autocompletados desde RENIEC. Completa sexo y teléfono.");
    });
  }

  useEffect(() => {
    if (state?.ok && state.id) {
      const msg = state.warning
        ? `Paciente ${patient ? "actualizado" : "registrado"} con advertencia: ${state.warning}`
        : patient
        ? "Paciente actualizado"
        : "Paciente registrado";
      if (state.warning) toast.warning(msg);
      else toast.success(msg);
      if (onDone) onDone(state.id);
      else router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
      if (state.fieldErrors) {
        const first = Object.values(state.fieldErrors)[0];
        if (first) toast.warning(first, { description: "Revisa el campo marcado." });
      }
    }
  }, [state, onDone, patient, router]);

  const fe = state?.fieldErrors ?? {};
  const docPattern = DOC_PATTERNS[tipoDoc];

  return (
    <form action={action} className="space-y-4">
      {patient && <input type="hidden" name="id" value={patient.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tipo_documento">Tipo de documento</Label>
          <Select
            value={tipoDoc}
            onValueChange={setTipoDoc}
          >
            <SelectTrigger id="tipo_documento">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DNI">DNI</SelectItem>
              <SelectItem value="CE">Carné de extranjería</SelectItem>
              <SelectItem value="PAS">Pasaporte</SelectItem>
              <SelectItem value="OTRO">Otro</SelectItem>
            </SelectContent>
          </Select>
          <input type="hidden" name="tipo_documento" value={tipoDoc} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="numero_documento">Número de documento</Label>
          <div className="flex gap-2">
            <Input
              id="numero_documento"
              name="numero_documento"
              value={numeroDoc}
              onChange={(e) => setNumeroDoc(e.target.value)}
              required
              inputMode={tipoDoc === "OTRO" ? "text" : "numeric"}
              pattern={docPattern}
            />
            {tipoDoc === "DNI" && (
              <Button
                type="button"
                variant="outline"
                onClick={autofillFromDni}
                disabled={!canLookup || looking}
                title="Autocompletar con RENIEC"
              >
                {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="hidden sm:inline">Autocompletar</span>
              </Button>
            )}
          </div>
          {tipoDoc === "DNI" && (
            <p className="text-xs text-muted-foreground">
              Ingresa el DNI y pulsa Autocompletar para traer nombres, apellidos y fecha de nacimiento.
            </p>
          )}
          {fe.numero_documento && <p className="text-xs text-destructive">{fe.numero_documento}</p>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nombres">Nombres</Label>
          <Input
            id="nombres"
            name="nombres"
            value={nombres}
            onChange={(e) => setNombres(e.target.value)}
            required
          />
          {fe.nombres && <p className="text-xs text-destructive">{fe.nombres}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="apellidos">Apellidos</Label>
          <Input
            id="apellidos"
            name="apellidos"
            value={apellidos}
            onChange={(e) => setApellidos(e.target.value)}
            required
          />
          {fe.apellidos && <p className="text-xs text-destructive">{fe.apellidos}</p>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="fecha_nacimiento">Fecha de nacimiento</Label>
          <Input
            id="fecha_nacimiento"
            name="fecha_nacimiento"
            type="date"
            value={fechaNac}
            onChange={(e) => setFechaNac(e.target.value)}
            min="1900-01-01"
            max={today}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sexo">Sexo</Label>
          <Select name="sexo" defaultValue={patient?.sexo ?? "desconocido"}>
            <SelectTrigger id="sexo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="F">Femenino</SelectItem>
              <SelectItem value="M">Masculino</SelectItem>
              <SelectItem value="otro">Otro</SelectItem>
              <SelectItem value="desconocido">No especifica</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="telefono">Teléfono</Label>
          <Input
            id="telefono"
            name="telefono"
            type="tel"
            inputMode="numeric"
            pattern="^9\d{8}$"
            maxLength={9}
            defaultValue={patient?.telefono ?? ""}
          />
          {fe.telefono && <p className="text-xs text-destructive">{fe.telefono}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={patient?.email ?? ""} />
          {fe.email && <p className="text-xs text-destructive">{fe.email}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="direccion">Dirección</Label>
        <Textarea
          id="direccion"
          name="direccion"
          value={direccion}
          onChange={(e) => setDireccion(e.target.value)}
        />
      </div>

      {/* Datos clínicos y de seguridad */}
      <div className="space-y-4 rounded-lg border p-4">
        <button
          type="button"
          className="flex w-full items-center justify-between text-sm font-medium hover:underline"
          onClick={() => setShowClinical((v) => !v)}
          aria-expanded={showClinical}
          aria-controls={`clinical-section-${patient?.id ?? "new"}`}
        >
          <span>Datos clínicos y de seguridad</span>
          <span className="text-xs text-muted-foreground">
            {showClinical ? "Ocultar" : "Mostrar"}
          </span>
        </button>
        <p className="text-xs text-muted-foreground">
          Sensibles: solo visibles si los necesitas. Se guardan en el mismo registro.
        </p>
        {showClinical && (
          <div
            id={`clinical-section-${patient?.id ?? "new"}`}
            className="grid gap-4 sm:grid-cols-2"
          >
            <div className="space-y-2">
              <Label htmlFor="grupo_sanguineo">Grupo sanguíneo y Rh</Label>
              <Select name="grupo_sanguineo" defaultValue={patient?.grupo_sanguineo ?? "desconocido"}>
                <SelectTrigger id="grupo_sanguineo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desconocido">No determinado</SelectItem>
                  {["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="seguro">Seguro / financiador</Label>
              <Input
                id="seguro"
                name="seguro"
                defaultValue={patient?.seguro ?? ""}
                placeholder="EsSalud, SIS, EPS, particular…"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="alergias">Alergias conocidas</Label>
              <Textarea
                id="alergias"
                name="alergias"
                defaultValue={patient?.alergias ?? ""}
                placeholder="Ej. penicilina, látex, medio de contraste yodado…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="antecedentes">Antecedentes</Label>
              <Textarea
                id="antecedentes"
                name="antecedentes"
                defaultValue={patient?.antecedentes ?? ""}
                placeholder="Personales / familiares relevantes"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contacto_emergencia">Contacto de emergencia</Label>
              <Input
                id="contacto_emergencia"
                name="contacto_emergencia"
                defaultValue={patient?.contacto_emergencia ?? ""}
                placeholder="Nombre y teléfono"
                maxLength={200}
              />
              {fe.contacto_emergencia && (
                <p className="text-xs text-destructive">{fe.contacto_emergencia}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {state?.error && !state.fieldErrors && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state?.warning && (
        <p className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {state.warning}
        </p>
      )}

      <StickyFormActions
        label={patient ? "Guardar cambios" : "Registrar paciente"}
        busyLabel="Guardando…"
      />
    </form>
  );
}
