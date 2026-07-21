"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, FlaskConical, FolderPlus } from "lucide-react";
import {
  saveCategoryAction,
  saveAnalyteAction,
  saveStudyAction,
} from "@/lib/actions/catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { codeFromName } from "@/lib/text/slug";
import { cn } from "@/lib/utils";

export type Option = { id: string; nombre: string; codigo?: string };
export type AnalyteOption = Option & { unidad: string | null };

function SubmitBtn({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}

function useCloseOnOk(
  state: { ok?: boolean; id?: string; error?: string } | undefined,
  onOk: () => void
) {
  const router = useRouter();
  const lastSigRef = useRef<string | null>(null);
  useEffect(() => {
    if (state?.ok) {
      const sig = `ok:${state.id ?? ""}:${state.error ?? ""}`;
      if (lastSigRef.current !== sig) {
        lastSigRef.current = sig;
        toast.success("Guardado");
        onOk();
        router.refresh();
      }
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, onOk, router]);
}

// ── Categoría ────────────────────────────────────────────────
export function CategoryDialog() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(saveCategoryAction, undefined);
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [codigoTouched, setCodigoTouched] = useState(false);
  useCloseOnOk(state, () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FolderPlus className="h-4 w-4" /> Nueva categoría
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva categoría</DialogTitle>
          <DialogDescription>Agrupa estudios y analitos (p. ej. Serología).</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="codigo">Código</Label>
              <Input
                id="codigo"
                name="codigo"
                placeholder="SER"
                required
                value={codigo}
                onChange={(e) => {
                  setCodigoTouched(true);
                  setCodigo(e.target.value.toUpperCase());
                }}
                title="Sugerencia automática según el nombre"
              />
              {!codigo && nombre && (
                <p className="text-xs text-muted-foreground">
                  Sugerencia: <span className="font-mono">{codeFromName(nombre)}</span>
                </p>
              )}
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="nombre">Nombre</Label>
              <Input
                id="nombre"
                name="nombre"
                placeholder="Serología"
                required
                value={nombre}
                onChange={(e) => {
                  const next = e.target.value;
                  setNombre(next);
                  if (!codigoTouched) setCodigo(codeFromName(next));
                }}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <SubmitBtn>Crear</SubmitBtn>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Analito ──────────────────────────────────────────────────
export function AnalyteDialog({
  categories,
  analyte,
}: {
  categories: Option[];
  analyte?: {
    id: string;
    codigo: string;
    nombre: string;
    unidad: string | null;
    metodo: string | null;
    value_type: string;
    category_id: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(saveAnalyteAction, undefined);
  const [valueType, setValueType] = useState(analyte?.value_type ?? "numerico");
  const [nombre, setNombre] = useState(analyte?.nombre ?? "");
  const [codigo, setCodigo] = useState(analyte?.codigo ?? "");
  const [codigoTouched, setCodigoTouched] = useState(Boolean(analyte));
  useCloseOnOk(state, () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {analyte ? (
          <Button variant="ghost" size="icon">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline">
            <Plus className="h-4 w-4" /> Nuevo analito
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{analyte ? "Editar analito" : "Nuevo analito"}</DialogTitle>
          <DialogDescription>Parámetro medible (p. ej. Hemoglobina).</DialogDescription>
        </DialogHeader>
        <form
          action={action}
          onSubmit={(e) => {
            const form = e.currentTarget;
            const vMin = String((form.elements.namedItem("valor_min") as HTMLInputElement | null)?.value ?? "");
            const vMax = String((form.elements.namedItem("valor_max") as HTMLInputElement | null)?.value ?? "");
            if (vMin && vMax) {
              const minN = Number(vMin);
              const maxN = Number(vMax);
              if (Number.isFinite(minN) && Number.isFinite(maxN) && minN > maxN) {
                e.preventDefault();
                toast.error("Rango inválido");
              }
            }
          }}
          className="space-y-4"
        >
          {analyte && <input type="hidden" name="id" value={analyte.id} />}
          <input type="hidden" name="value_type" value={valueType} />
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="a_codigo">Código</Label>
              <Input
                id="a_codigo"
                name="codigo"
                defaultValue={analyte?.codigo}
                required
                value={codigo}
                onChange={(e) => {
                  setCodigoTouched(true);
                  setCodigo(e.target.value.toUpperCase());
                }}
                title="Sugerencia automática según el nombre"
              />
              {!codigo && nombre && (
                <p className="text-xs text-muted-foreground">
                  Sugerencia: <span className="font-mono">{codeFromName(nombre)}</span>
                </p>
              )}
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="a_nombre">Nombre</Label>
              <Input
                id="a_nombre"
                name="nombre"
                defaultValue={analyte?.nombre}
                required
                value={nombre}
                onChange={(e) => {
                  const next = e.target.value;
                  setNombre(next);
                  if (!codigoTouched) setCodigo(codeFromName(next));
                }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select name="category_id" defaultValue={analyte?.category_id ?? ""}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de valor</Label>
              <Select value={valueType} onValueChange={setValueType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="numerico">Numérico</SelectItem>
                  <SelectItem value="texto">Texto</SelectItem>
                  <SelectItem value="opcion">Opción</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="a_unidad">Unidad</Label>
              <Input id="a_unidad" name="unidad" defaultValue={analyte?.unidad ?? ""} placeholder="mg/dL" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="a_decimales">Decimales</Label>
              <Input id="a_decimales" name="decimales" type="number" defaultValue={2} min={0} max={4} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="a_metodo">Método</Label>
              <Input id="a_metodo" name="metodo" defaultValue={analyte?.metodo ?? ""} />
            </div>
          </div>
          {!analyte && valueType === "numerico" && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
              <div className="col-span-2 text-xs font-medium text-muted-foreground">
                Rango de referencia general (opcional)
              </div>
              <div className="space-y-2">
                <Label htmlFor="valor_min">Mínimo</Label>
                <Input id="valor_min" name="valor_min" type="number" step="any" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="valor_max">Máximo</Label>
                <Input id="valor_max" name="valor_max" type="number" step="any" />
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <SubmitBtn>{analyte ? "Guardar" : "Crear analito"}</SubmitBtn>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Estudio ──────────────────────────────────────────────────
export function StudyDialog({
  categories,
  specimenTypes,
  analytes,
  study,
}: {
  categories: Option[];
  specimenTypes: Option[];
  analytes: AnalyteOption[];
  study?: {
    id: string;
    codigo: string;
    nombre: string;
    category_id: string | null;
    specimen_type_id: string | null;
    tiempo_entrega_h: number | null;
    requiere_ayuno: boolean;
    analyteIds: string[];
    precio: number;
  };
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(saveStudyAction, undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set(study?.analyteIds ?? []));
  const [nombreEstudio, setNombreEstudio] = useState(study?.nombre ?? "");
  const [codigoEstudio, setCodigoEstudio] = useState(study?.codigo ?? "");
  const [codigoTouchedEstudio, setCodigoTouchedEstudio] = useState(Boolean(study));
  useCloseOnOk(state, () => setOpen(false));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {study ? (
          <Button variant="ghost" size="icon">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <FlaskConical className="h-4 w-4" /> Nuevo estudio
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{study ? "Editar estudio" : "Nuevo estudio"}</DialogTitle>
          <DialogDescription>Perfil que se ordena (p. ej. Hemograma completo).</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          {study && <input type="hidden" name="id" value={study.id} />}
          {[...selected].map((id) => (
            <input key={id} type="hidden" name="analyte_ids" value={id} />
          ))}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="s_codigo">Código</Label>
              <Input
                id="s_codigo"
                name="codigo"
                defaultValue={study?.codigo}
                required
                value={codigoEstudio}
                onChange={(e) => {
                  setCodigoTouchedEstudio(true);
                  setCodigoEstudio(e.target.value.toUpperCase());
                }}
                title="Sugerencia automática según el nombre"
              />
              {!codigoEstudio && nombreEstudio && (
                <p className="text-xs text-muted-foreground">
                  Sugerencia: <span className="font-mono">{codeFromName(nombreEstudio)}</span>
                </p>
              )}
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="s_nombre">Nombre</Label>
              <Input
                id="s_nombre"
                name="nombre"
                defaultValue={study?.nombre}
                required
                value={nombreEstudio}
                onChange={(e) => {
                  const next = e.target.value;
                  setNombreEstudio(next);
                  if (!codigoTouchedEstudio) setCodigoEstudio(codeFromName(next));
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select name="category_id" defaultValue={study?.category_id ?? ""}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de muestra</Label>
              <Select name="specimen_type_id" defaultValue={study?.specimen_type_id ?? ""}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {specimenTypes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="s_tat">TAT (horas)</Label>
              <Input id="s_tat" name="tiempo_entrega_h" type="number" defaultValue={study?.tiempo_entrega_h ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s_precio">Precio base (PEN)</Label>
              <Input id="s_precio" name="precio" type="number" step="0.01" defaultValue={study?.precio ?? 0} />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" name="requiere_ayuno" defaultChecked={study?.requiere_ayuno} className="h-4 w-4" />
              Requiere ayuno
            </label>
          </div>

          <div className="space-y-2">
            <Label>Analitos que componen el estudio ({selected.size})</Label>
            <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border p-2">
              {analytes.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggle(a.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm",
                    selected.has(a.id) ? "bg-primary/10 text-primary" : "hover:bg-accent"
                  )}
                >
                  <span>
                    {a.nombre} {a.unidad && <span className="text-muted-foreground">({a.unidad})</span>}
                  </span>
                  <span
                    className={cn(
                      "h-4 w-4 rounded-full border",
                      selected.has(a.id) && "border-primary bg-primary"
                    )}
                  />
                </button>
              ))}
              {analytes.length === 0 && (
                <p className="p-2 text-sm text-muted-foreground">
                  Primero crea analitos para poder componer estudios.
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <SubmitBtn>{study ? "Guardar estudio" : "Crear estudio"}</SubmitBtn>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
