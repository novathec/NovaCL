"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FlaskConical, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { addStudyToOrderAction } from "@/lib/actions/orders";
import { cn } from "@/lib/utils";

export type StudyOption = { id: string; codigo: string; nombre: string };

/**
 * Add-on test: agregar un examen a una orden ya registrada (ej. el médico
 * pide Vitamina D con la misma muestra dos horas después).
 */
export function AddStudyDialog({
  orderId,
  studies,
}: {
  orderId: string;
  studies: StudyOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [pending, start] = useTransition();

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return studies.slice(0, 30);
    return studies
      .filter((s) => s.nombre.toLowerCase().includes(q) || s.codigo.toLowerCase().includes(q))
      .slice(0, 30);
  }, [studies, filter]);

  function add(studyId: string) {
    start(async () => {
      const res = await addStudyToOrderAction(orderId, studyId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Estudio agregado a la orden");
      if ("warning" in res && res.warning) toast.warning(res.warning, { duration: 8000 });
      setOpen(false);
      setFilter("");
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Agregar estudio
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary" /> Agregar estudio a la orden
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            El estudio se cobra con el precio vigente y, si la orden no tiene una
            muestra compatible, se te avisará para programar una nueva toma.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar por nombre o código…"
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {filtered.map((s) => (
              <button
                key={s.id}
                disabled={pending}
                onClick={() => add(s.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-all duration-200",
                  "hover:border-primary/40 hover:bg-accent disabled:opacity-50"
                )}
              >
                <span className="font-medium">{s.nombre}</span>
                <span className="font-mono text-xs text-muted-foreground">{s.codigo}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sin coincidencias.
              </p>
            )}
          </div>
          {pending && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Agregando estudio…
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
