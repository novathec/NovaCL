"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { savePatientAction, type PatientFormState } from "@/lib/actions/patients";
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

function Submit({ edit }: { edit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {edit ? "Guardar cambios" : "Registrar paciente"}
    </Button>
  );
}

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

  useEffect(() => {
    if (state?.ok && state.id) {
      toast.success(patient ? "Paciente actualizado" : "Paciente registrado");
      if (onDone) onDone(state.id);
      else router.refresh();
    }
  }, [state, onDone, patient, router]);

  const fe = state?.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      {patient && <input type="hidden" name="id" value={patient.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tipo_documento">Tipo de documento</Label>
          <Select name="tipo_documento" defaultValue={patient?.tipo_documento ?? "DNI"}>
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
        </div>
        <div className="space-y-2">
          <Label htmlFor="numero_documento">Número de documento</Label>
          <Input id="numero_documento" name="numero_documento" defaultValue={patient?.numero_documento} required />
          {fe.numero_documento && <p className="text-xs text-destructive">{fe.numero_documento}</p>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nombres">Nombres</Label>
          <Input id="nombres" name="nombres" defaultValue={patient?.nombres} required />
          {fe.nombres && <p className="text-xs text-destructive">{fe.nombres}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="apellidos">Apellidos</Label>
          <Input id="apellidos" name="apellidos" defaultValue={patient?.apellidos} required />
          {fe.apellidos && <p className="text-xs text-destructive">{fe.apellidos}</p>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="fecha_nacimiento">Fecha de nacimiento</Label>
          <Input id="fecha_nacimiento" name="fecha_nacimiento" type="date" defaultValue={patient?.fecha_nacimiento ?? ""} />
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
          <Input id="telefono" name="telefono" defaultValue={patient?.telefono ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={patient?.email ?? ""} />
          {fe.email && <p className="text-xs text-destructive">{fe.email}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="direccion">Dirección</Label>
        <Textarea id="direccion" name="direccion" defaultValue={patient?.direccion ?? ""} />
      </div>

      {/* Datos clínicos y de seguridad */}
      <div className="space-y-4 rounded-lg border p-4">
        <p className="text-sm font-medium">Datos clínicos y de seguridad</p>
        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
        <div className="space-y-2">
          <Label htmlFor="alergias">Alergias conocidas</Label>
          <Textarea
            id="alergias"
            name="alergias"
            defaultValue={patient?.alergias ?? ""}
            placeholder="Ej. penicilina, látex, medio de contraste yodado…"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
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
            />
          </div>
        </div>
      </div>

      {state?.error && !state.fieldErrors && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
      )}

      <div className="flex justify-end">
        <Submit edit={!!patient} />
      </div>
    </form>
  );
}
