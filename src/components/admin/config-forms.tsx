"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2, Power } from "lucide-react";
import {
  createSedeAction,
  toggleSedeAction,
  addMemberAction,
  removeMemberAction,
  saveBillingAction,
} from "@/lib/actions/admin";
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
import { ROLE_OPTIONS } from "@/lib/constants";
import { codeFromName } from "@/lib/text/slug";

function SubmitBtn({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}

function useToastAction(
  state: { ok?: boolean; id?: string; error?: string } | undefined,
  okMsg: string,
  onOk?: () => void,
) {
  const router = useRouter();
  const lastOkIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (state?.ok) {
      const sig = `${okMsg}:${state.id ?? ""}`;
      if (lastOkIdRef.current !== sig) {
        lastOkIdRef.current = sig;
        toast.success(okMsg);
        onOk?.();
        router.refresh();
      }
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, okMsg, router, onOk]);
}

export function SedeForm() {
  const [state, action] = useActionState(createSedeAction, undefined);
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [codigoTouched, setCodigoTouched] = useState(false);
  useToastAction(state, "Sede creada");
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="codigo">Código</Label>
        <Input
          id="codigo"
          name="codigo"
          placeholder="S003"
          required
          value={codigo}
          onChange={(e) => {
            setCodigoTouched(true);
            setCodigo(e.target.value.toUpperCase());
          }}
          title="Sugerencia automática según el nombre de la sede"
        />
        {!codigo && nombre && (
          <p className="text-xs text-muted-foreground">
            Sugerencia: <span className="font-mono">{codeFromName(nombre)}</span>
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre</Label>
        <Input
          id="nombre"
          name="nombre"
          placeholder="Sede Sur"
          required
          value={nombre}
          onChange={(e) => {
            const next = e.target.value;
            setNombre(next);
            if (!codigoTouched) setCodigo(codeFromName(next));
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="direccion">Dirección</Label>
        <Input id="direccion" name="direccion" />
      </div>
      <SubmitBtn>Crear sede</SubmitBtn>
    </form>
  );
}

export function SedeToggle({ sedeId, activo }: { sedeId: string; activo: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await toggleSedeAction(sedeId, !activo);
          if (r.error) toast.error(r.error);
          else router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
      {activo ? "Desactivar" : "Activar"}
    </Button>
  );
}

export function MemberForm({ sedes }: { sedes: { id: string; nombre: string }[] }) {
  const [state, action] = useActionState(addMemberAction, undefined);
  useToastAction(state, "Rol asignado");
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="email">Email del usuario</Label>
        <Input id="email" name="email" type="email" placeholder="colega@clinica.com" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="role">Rol</Label>
        <Select name="role" defaultValue="recepcion">
          <SelectTrigger id="role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="sede_id">Sede</Label>
        <Select name="sede_id" defaultValue="">
          <SelectTrigger id="sede_id">
            <SelectValue placeholder="Toda la organización" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Toda la organización</SelectItem>
            {sedes.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SubmitBtn>Asignar rol</SubmitBtn>
    </form>
  );
}

export function MemberRemove({ membershipId }: { membershipId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-destructive"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await removeMemberAction(membershipId);
          if (r.error) toast.error(r.error);
          else {
            toast.success("Rol removido");
            router.refresh();
          }
        })
      }
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </Button>
  );
}

export function BillingForm({
  provider,
  enabled,
  serie,
  igv,
  autoInvoice,
  autoDeliver,
}: {
  provider: string;
  enabled: boolean;
  serie: string;
  igv: number;
  autoInvoice: boolean;
  autoDeliver: boolean;
}) {
  const [state, action] = useActionState(saveBillingAction, undefined);
  useToastAction(state, "Configuración guardada");
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="provider">Proveedor</Label>
        <Select name="provider" defaultValue={provider}>
          <SelectTrigger id="provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nubefact">NubeFact (SUNAT Perú)</SelectItem>
            <SelectItem value="wally">Wally</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="serie">Serie</Label>
          <Input id="serie" name="serie" defaultValue={serie} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="igv">IGV (ej. 0.18)</Label>
          <Input
            id="igv"
            name="igv"
            type="number"
            step="0.01"
            min={0}
            max={1}
            defaultValue={igv}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="h-4 w-4" />
        Integración habilitada
      </label>

      <div className="space-y-2 rounded-lg border p-3">
        <p className="text-sm font-medium">Automatización al completar una orden</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="auto_invoice" defaultChecked={autoInvoice} className="h-4 w-4" />
          Emitir comprobante automáticamente
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="auto_deliver" defaultChecked={autoDeliver} className="h-4 w-4" />
          Enviar resultados al paciente automáticamente
        </label>
        <p className="text-xs text-muted-foreground">
          El informe PDF siempre se archiva en el repositorio al validar; estos
          toggles encadenan además la factura y la entrega sin intervención manual.
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        Las credenciales (API key) se toman de variables de entorno del servidor
        (WALLY_API_KEY). Sin credenciales, la emisión funciona en modo simulación.
      </p>
      <SubmitBtn>Guardar</SubmitBtn>
    </form>
  );
}
