"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Power, Plus, Stethoscope } from "lucide-react";
import { saveProfessionalAction, toggleProfessionalAction } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  PROFESSIONAL_TYPES,
  colegioFor,
  professionalTypeLabel,
  type ProfessionalType,
} from "@/lib/professionals";
import type { Tables } from "@/lib/database.types";

type Professional = Tables<"LIS_professionals">;

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      Guardar
    </Button>
  );
}

function ProfessionalForm({ professional, onDone }: { professional?: Professional; onDone: () => void }) {
  const router = useRouter();
  const [state, action] = useActionState(saveProfessionalAction, undefined as { ok?: boolean; error?: string } | undefined);
  const [tipo, setTipo] = useState<ProfessionalType>((professional?.tipo as ProfessionalType) ?? "medico");

  useEffect(() => {
    if (state?.ok) {
      toast.success("Profesional guardado");
      router.refresh();
      onDone();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router, onDone]);

  return (
    <form action={action} className="space-y-4">
      {professional && <input type="hidden" name="id" value={professional.id} />}
      <div className="space-y-2">
        <Label htmlFor="tipo">Tipo de profesional</Label>
        <Select name="tipo" value={tipo} onValueChange={(v) => setTipo(v as ProfessionalType)}>
          <SelectTrigger id="tipo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PROFESSIONAL_TYPES).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nombres">Nombres</Label>
          <Input id="nombres" name="nombres" defaultValue={professional?.nombres} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="apellidos">Apellidos</Label>
          <Input id="apellidos" name="apellidos" defaultValue={professional?.apellidos} required />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="numero_colegiatura">
            N.º de colegiatura {colegioFor(tipo) !== "—" && `(${colegioFor(tipo)})`}
          </Label>
          <Input
            id="numero_colegiatura"
            name="numero_colegiatura"
            defaultValue={professional?.numero_colegiatura ?? ""}
            placeholder="Ej. 84521"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="colegio">Colegio profesional</Label>
          <Input id="colegio" name="colegio" defaultValue={professional?.colegio ?? colegioFor(tipo)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="especialidad">Especialidad</Label>
          <Input
            id="especialidad"
            name="especialidad"
            defaultValue={professional?.especialidad ?? ""}
            placeholder="Ej. Patología clínica"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="telefono">Teléfono</Label>
          <Input
            id="telefono"
            name="telefono"
            type="tel"
            inputMode="numeric"
            pattern="^9\d{8}$"
            maxLength={9}
            defaultValue={professional?.telefono ?? ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" defaultValue={professional?.email ?? ""} />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="externo"
          defaultChecked={professional?.externo ?? false}
          className="h-4 w-4 accent-[var(--primary)]"
        />
        Profesional externo (solicitante de otra institución)
      </label>

      <div className="flex justify-end">
        <SubmitBtn />
      </div>
    </form>
  );
}

function ToggleProfessional({ id, activo }: { id: string; activo: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await toggleProfessionalAction(id, !activo);
          if (r.error) toast.error(r.error);
          else {
            toast.success(activo ? "Profesional desactivado" : "Profesional activado");
            router.refresh();
          }
        })
      }
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
      {activo ? "Desactivar" : "Activar"}
    </Button>
  );
}

export function ProfessionalsPanel({ professionals }: { professionals: Professional[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Professional | undefined>();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Médicos solicitantes, tecnólogos médicos de laboratorio, patólogos y demás
          personal profesional. Su colegiatura aparece en los informes que firman.
        </p>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setEditing(undefined);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" /> Nuevo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-primary" />
                {editing ? "Editar profesional" : "Registrar profesional"}
              </DialogTitle>
            </DialogHeader>
            <ProfessionalForm
              professional={editing}
              onDone={() => {
                setOpen(false);
                setEditing(undefined);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Profesional</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Colegiatura</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {professionals.length > 0 ? (
              professionals.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <button
                      className="text-left font-medium text-primary hover:underline"
                      onClick={() => {
                        setEditing(p);
                        setOpen(true);
                      }}
                    >
                      {p.apellidos}, {p.nombres}
                    </button>
                    {p.especialidad && (
                      <p className="text-xs text-muted-foreground">{p.especialidad}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {professionalTypeLabel(p.tipo)}
                    {p.externo && (
                      <Badge className="ml-2 bg-muted text-foreground">Externo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.numero_colegiatura ? `${p.colegio ?? ""} ${p.numero_colegiatura}`.trim() : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge className={p.activo ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground"}>
                      {p.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <ToggleProfessional id={p.id} activo={p.activo} />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Aún no hay profesionales registrados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
