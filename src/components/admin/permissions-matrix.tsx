"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  savePermissionsAction,
  resetPermissionsAction,
  type PermissionEntry,
} from "@/lib/actions/admin";
import {
  MODULES,
  MODULE_LABELS,
  defaultPermsFor,
  type ModuleKey,
} from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/constants";
import type { Role } from "@/lib/database.types";
import { cn } from "@/lib/utils";

export type PermRow = {
  sede_id: string | null;
  role: Role;
  module: string;
  can_view: boolean;
  can_edit: boolean;
};

const ROLES = Object.keys(ROLE_LABELS) as Role[];

/**
 * Matriz granular de permisos: por rol y alcance (toda la organización o una
 * sede), define qué módulos se ven y cuáles se editan. Sin sobrescritura
 * aplican los defaults del sistema; "Restaurar defaults" las elimina.
 */
export function PermissionsMatrix({
  sedes,
  rows,
}: {
  sedes: { id: string; nombre: string }[];
  rows: PermRow[];
}) {
  const [scope, setScope] = useState<string>("org"); // "org" | sedeId
  const [role, setRole] = useState<Role>("recepcion");
  const [pending, start] = useTransition();

  const sedeId = scope === "org" ? null : scope;

  // Estado inicial de la matriz: override exacto > override org (si el
  // alcance es una sede) > default del rol.
  const initial = useMemo(() => {
    const defaults = defaultPermsFor([role]);
    const map = {} as Record<ModuleKey, { view: boolean; edit: boolean }>;
    for (const m of MODULES) {
      const exact = rows.find((r) => r.role === role && r.sede_id === sedeId && r.module === m);
      const orgWide =
        sedeId !== null
          ? rows.find((r) => r.role === role && r.sede_id === null && r.module === m)
          : undefined;
      const src = exact ?? orgWide;
      map[m] = src ? { view: src.can_view, edit: src.can_edit } : { ...defaults[m] };
    }
    return map;
  }, [rows, role, sedeId]);

  const [matrix, setMatrix] = useState(initial);
  // Al cambiar rol o alcance, recargar la matriz desde el estado persistido
  const [lastKey, setLastKey] = useState(`${role}:${scope}`);
  if (lastKey !== `${role}:${scope}`) {
    setLastKey(`${role}:${scope}`);
    setMatrix(initial);
  }

  const hasOverrides = rows.some((r) => r.role === role && r.sede_id === sedeId);

  function toggle(m: ModuleKey, field: "view" | "edit") {
    setMatrix((prev) => {
      const cur = prev[m];
      const next =
        field === "view"
          ? { view: !cur.view, edit: !cur.view ? cur.edit : false }
          : { view: cur.view, edit: !cur.edit };
      return { ...prev, [m]: next };
    });
  }

  function save() {
    const entries: PermissionEntry[] = MODULES.map((m) => ({
      module: m,
      view: matrix[m].view,
      edit: matrix[m].edit,
    }));
    start(async () => {
      const r = await savePermissionsAction(sedeId, role, entries);
      if ("error" in r && r.error) toast.error(r.error);
      else toast.success(`Permisos de ${ROLE_LABELS[role]} guardados`);
    });
  }

  function reset() {
    start(async () => {
      const r = await resetPermissionsAction(sedeId, role);
      if ("error" in r && r.error) toast.error(r.error);
      else {
        toast.success("Sobrescrituras eliminadas: aplican los defaults");
        setMatrix(defaultPermsFor([role]));
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={role} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="org">Toda la organización</SelectItem>
            {sedes.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                Solo sede: {s.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasOverrides ? (
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
            Personalizado
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Usando defaults del sistema</span>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left font-semibold">Módulo</th>
              <th className="w-24 px-3 py-2 text-center font-semibold">Ver</th>
              <th className="w-24 px-3 py-2 text-center font-semibold">Editar</th>
            </tr>
          </thead>
          <tbody>
            {MODULES.map((m) => (
              <tr key={m} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                <td className={cn("px-3 py-2", !matrix[m].view && "text-muted-foreground line-through")}>
                  {MODULE_LABELS[m]}
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--primary)]"
                    checked={matrix[m].view}
                    onChange={() => toggle(m, "view")}
                    aria-label={`Ver ${MODULE_LABELS[m]}`}
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--primary)]"
                    checked={matrix[m].edit}
                    disabled={!matrix[m].view}
                    onChange={() => toggle(m, "edit")}
                    aria-label={`Editar ${MODULE_LABELS[m]}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Guardar permisos
        </Button>
        <Button variant="outline" onClick={reset} disabled={pending || !hasOverrides}>
          <RotateCcw className="h-4 w-4" /> Restaurar defaults
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Precedencia: sede específica &gt; toda la organización &gt; defaults del sistema.
        Los cambios se aplican de inmediato al menú y al acceso directo por URL de cada
        usuario con ese rol. El superadmin global no se ve afectado.
      </p>
    </div>
  );
}
