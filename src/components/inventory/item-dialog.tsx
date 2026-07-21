"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { ImageUploader } from "@/components/inventory/image-uploader";
import { saveItemAction } from "@/lib/actions/inventory";
import { INVENTORY_TYPE_LABELS } from "@/lib/constants";
import type { InventoryItemType, Tables } from "@/lib/database.types";

type Item = Tables<"LIS_inventory_items">;

export function ItemDialog({ orgId, item }: { orgId: string; item?: Item }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [codigo, setCodigo] = useState(item?.codigo ?? "");
  const [codigoBarras, setCodigoBarras] = useState(item?.codigo_barras ?? "");
  const [nombre, setNombre] = useState(item?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(item?.descripcion ?? "");
  const [categoria, setCategoria] = useState(item?.categoria ?? "");
  const [tipo, setTipo] = useState<InventoryItemType>(item?.tipo ?? "insumo");
  const [unidad, setUnidad] = useState(item?.unidad ?? "unidad");
  const [stockMin, setStockMin] = useState(item?.stock_minimo ?? 0);
  const [ubicacion, setUbicacion] = useState(item?.ubicacion ?? "");
  const [proveedor, setProveedor] = useState(item?.proveedor ?? "");
  const [refrig, setRefrig] = useState(item?.requiere_refrigeracion ?? false);
  const [imagenes, setImagenes] = useState<string[]>(
    (item?.imagenes as string[] | null) ?? []
  );

  function guardar() {
    startTransition(async () => {
      const res = await saveItemAction({
        id: item?.id,
        codigo,
        codigo_barras: codigoBarras,
        nombre,
        descripcion,
        categoria,
        tipo,
        unidad,
        stock_minimo: Number(stockMin) || 0,
        ubicacion,
        proveedor,
        requiere_refrigeracion: refrig,
        imagenes,
      });
      if (res.ok) {
        toast.success(item ? "Artículo actualizado." : "Artículo creado.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {item ? (
          <Button variant="ghost" size="icon" aria-label="Editar">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="h-4 w-4" /> Nuevo artículo
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? "Editar artículo" : "Nuevo artículo"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Código</Label>
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="RE-001" />
          </div>
          <div className="space-y-2">
            <Label>Código de barras</Label>
            <Input
              value={codigoBarras}
              onChange={(e) => setCodigoBarras(e.target.value)}
              placeholder="EAN-13, GS1, etc."
            />
          </div>
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as InventoryItemType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(INVENTORY_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Categoría</Label>
            <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Hematología" />
          </div>
          <div className="space-y-2">
            <Label>Unidad de medida</Label>
            <Input value={unidad} onChange={(e) => setUnidad(e.target.value)} placeholder="caja, mL, unidad" />
          </div>
          <div className="space-y-2">
            <Label>Stock mínimo (alerta)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={stockMin}
              onChange={(e) => setStockMin(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label>Ubicación</Label>
            <Input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Estante A-3" />
          </div>
          <div className="space-y-2">
            <Label>Proveedor</Label>
            <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Descripción</Label>
            <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--primary)]"
              checked={refrig}
              onChange={(e) => setRefrig(e.target.checked)}
            />
            Requiere refrigeración (cadena de frío)
          </label>
          <div className="space-y-2 sm:col-span-2">
            <Label>Imágenes del artículo</Label>
            <ImageUploader orgId={orgId} value={imagenes} onChange={setImagenes} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={pending || !codigo.trim() || !nombre.trim()}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
