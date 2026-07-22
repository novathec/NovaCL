"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreVertical, Ban, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { anularOrderAction, marcarEntregadaAction } from "@/lib/actions/orders";
import { hasRole } from "@/lib/auth/roles";
import type { OrderStatus, Role } from "@/lib/database.types";

export function OrderActions({
  orderId,
  status,
  roles,
}: {
  orderId: string;
  status: OrderStatus;
  roles: Role[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [anularOpen, setAnularOpen] = useState(false);
  const [motivo, setMotivo] = useState("");

  const canAdmin = hasRole(roles, ["org_admin", "sede_admin", "recepcion"]);
  const canDeliver = hasRole(roles, ["org_admin", "sede_admin", "recepcion", "validador"]);
  if (!canAdmin && !canDeliver) return null;

  const isTerminal = status === "anulada" || status === "entregada";

  function confirmAnular() {
    if (!motivo.trim()) {
      toast.error("Indica el motivo de la anulación");
      return;
    }
    start(async () => {
      const r = await anularOrderAction(orderId, motivo);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Orden anulada");
        setAnularOpen(false);
        setMotivo("");
        router.refresh();
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canDeliver && status === "completada" && (
            <DropdownMenuItem
              onSelect={() =>
                start(async () => {
                  const r = await marcarEntregadaAction(orderId);
                  if (r.error) toast.error(r.error);
                  else {
                    toast.success("Orden marcada como entregada");
                    router.refresh();
                  }
                })
              }
            >
              <CheckCircle2 className="h-4 w-4" /> Marcar entregada
            </DropdownMenuItem>
          )}
          {canAdmin && !isTerminal && (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => setAnularOpen(true)}
            >
              <Ban className="h-4 w-4" /> Anular orden
            </DropdownMenuItem>
          )}
          {isTerminal && (
            <DropdownMenuItem disabled>Sin acciones disponibles</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Anular es destructivo: exige confirmación y motivo (trazabilidad) */}
      <Dialog open={anularOpen} onOpenChange={(o) => { setAnularOpen(o); if (!o) setMotivo(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Anular orden</DialogTitle>
            <DialogDescription>
              La orden y sus estudios pendientes quedarán anulados. Los resultados ya
              validados se conservan como historia clínica. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-anulacion">Motivo de la anulación *</Label>
            <textarea
              id="motivo-anulacion"
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              maxLength={500}
              placeholder="Ej. el paciente no se presentó a la cita"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnularOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmAnular} disabled={pending || !motivo.trim()}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Anular orden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
