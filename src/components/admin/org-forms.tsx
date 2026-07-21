"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Power, Building2 } from "lucide-react";
import {
  createOrganizationAction,
  updateOrganizationAction,
  toggleOrganizationAction,
  createSedeForOrgAction,
  updateSedeAction,
  toggleSedeForOrgAction,
  promoteToOrgAdminAction,
  dropMembershipAction,
  type OrgFormState,
  type SedeFormState,
} from "@/lib/actions/admin-orgs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ROLE_OPTIONS, ROLE_LABELS } from "@/lib/constants";

function SubmitBtn({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}

function useToastEffect(
  state: OrgFormState | SedeFormState | undefined,
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function codeFromName(value: string) {
  const tokens = slugify(value)
    .split("-")
    .filter(Boolean);
  if (tokens.length === 0) return "";
  const left = tokens[0].slice(0, 3).toUpperCase();
  if (tokens.length === 1) return left.slice(0, 6);
  const right = tokens[1].slice(0, 3).toUpperCase();
  return `${left}-${right}`;
}

const TIMEZONES = [
  { value: "America/Lima", label: "America/Lima (UTC-5)" },
  { value: "America/Bogota", label: "America/Bogota (UTC-5)" },
  { value: "America/Mexico_City", label: "America/Mexico_City (UTC-6)" },
  { value: "America/Buenos_Aires", label: "America/Buenos_Aires (UTC-3)" },
  { value: "America/Santiago", label: "America/Santiago (UTC-4)" },
  { value: "America/Madrid", label: "America/Madrid (UTC+1/+2)" },
];

const LOCALES = [
  { value: "es-PE", label: "es-PE" },
  { value: "es-CO", label: "es-CO" },
  { value: "es-MX", label: "es-MX" },
  { value: "es-AR", label: "es-AR" },
  { value: "es-CL", label: "es-CL" },
  { value: "es-ES", label: "es-ES" },
];

export function CreateOrganizationButton() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<OrgFormState, FormData>(
    createOrganizationAction,
    undefined,
  );
  const [nombre, setNombre] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  useToastEffect(state, "Organización creada", () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Nueva organización
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Crear organización</DialogTitle>
          <DialogDescription>
            Da de alta una clínica nueva. El slug se autocompleta a partir del nombre.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="nombre">Nombre comercial</Label>
            <Input
              id="nombre"
              name="nombre"
              required
              placeholder="Clinica San Felipe"
              value={nombre}
              onChange={(e) => {
                const next = e.target.value;
                setNombre(next);
                if (!slugTouched) setSlug(slugify(next));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              name="slug"
              placeholder="clinica-san-felipe"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
              onBlur={(e) => setSlug(slugify(e.target.value))}
              title="Sugerencia automática según el nombre comercial"
            />
            {!slug && nombre && (
              <p className="text-xs text-muted-foreground">
                Sugerencia: <span className="font-mono">{slugify(nombre)}</span>
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ruc">RUC / Identificación fiscal</Label>
            <Input id="ruc" name="ruc" placeholder="20123456789" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="logo_url">Logo (URL)</Label>
            <Input id="logo_url" name="logo_url" placeholder="https://…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timezone">Zona horaria</Label>
            <select
              id="timezone"
              name="timezone"
              defaultValue="America/Lima"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              {TIMEZONES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="locale">Locale</Label>
            <select
              id="locale"
              name="locale"
              defaultValue="es-PE"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              {LOCALES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
          <input type="hidden" name="activo" value="on" />
          <div className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              id="activo-check"
              type="checkbox"
              defaultChecked
              className="h-4 w-4"
              onChange={(e) => {
                const hidden = (e.currentTarget.form?.elements.namedItem(
                  "activo",
                ) ?? null) as HTMLInputElement | null;
                if (hidden) hidden.value = e.currentTarget.checked ? "on" : "off";
              }}
            />
            <label htmlFor="activo-check">Activa al crear</label>
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitBtn>Crear</SubmitBtn>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditOrganizationButton({
  org,
}: {
  org: {
    id: string;
    nombre: string;
    slug: string;
    ruc: string | null;
    logo_url: string | null;
    timezone: string;
    locale: string;
    activo: boolean;
  };
}) {
  const [open, setOpen] = useState(false);
  const bound = updateOrganizationAction.bind(null, org.id);
  const [state, action] = useActionState<OrgFormState, FormData>(bound, undefined);
  useToastEffect(state, "Cambios guardados", () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar organización</DialogTitle>
          <DialogDescription>{org.nombre}</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`nombre-${org.id}`}>Nombre comercial</Label>
            <Input id={`nombre-${org.id}`} name="nombre" required defaultValue={org.nombre} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`slug-${org.id}`}>Slug</Label>
            <Input id={`slug-${org.id}`} name="slug" required defaultValue={org.slug} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`ruc-${org.id}`}>RUC</Label>
            <Input id={`ruc-${org.id}`} name="ruc" defaultValue={org.ruc ?? ""} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`logo-${org.id}`}>Logo (URL)</Label>
            <Input id={`logo-${org.id}`} name="logo_url" defaultValue={org.logo_url ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`tz-${org.id}`}>Zona horaria</Label>
            <select
              id={`tz-${org.id}`}
              name="timezone"
              defaultValue={org.timezone}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              {TIMEZONES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`loc-${org.id}`}>Locale</Label>
            <select
              id={`loc-${org.id}`}
              name="locale"
              defaultValue={org.locale}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              {LOCALES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
          <input type="hidden" name="activo" value={org.activo ? "on" : "off"} />
          <div className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              id={`activo-edit-${org.id}`}
              type="checkbox"
              defaultChecked={org.activo}
              className="h-4 w-4"
              onChange={(e) => {
                const hidden = (e.currentTarget.form?.elements.namedItem(
                  "activo",
                ) ?? null) as HTMLInputElement | null;
                if (hidden) hidden.value = e.currentTarget.checked ? "on" : "off";
              }}
            />
            <label htmlFor={`activo-edit-${org.id}`}>Activa</label>
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitBtn>Guardar</SubmitBtn>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ToggleOrganizationButton({
  orgId,
  activo,
}: {
  orgId: string;
  activo: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await toggleOrganizationAction(orgId, !activo);
          if (r?.error) toast.error(r.error);
          else router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
      {activo ? "Desactivar" : "Activar"}
    </Button>
  );
}

export function CreateSedeButton({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<SedeFormState, FormData>(
    createSedeForOrgAction,
    undefined,
  );
  const [nombreSede, setNombreSede] = useState("");
  const [codigo, setCodigo] = useState("");
  const [codigoTouched, setCodigoTouched] = useState(false);
  useToastEffect(state, "Sede creada", () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4" /> Nueva sede
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Crear sede</DialogTitle>
          <DialogDescription>
            Se creará dentro de la organización seleccionada.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="organization_id" value={orgId} />
          <div className="space-y-1.5">
            <Label htmlFor={`codigo-${orgId}`}>Código</Label>
            <Input
              id={`codigo-${orgId}`}
              name="codigo"
              required
              placeholder="S001"
              value={codigo}
              onChange={(e) => {
                setCodigoTouched(true);
                setCodigo(e.target.value.toUpperCase());
              }}
              title="Sugerencia automática según el nombre de la sede"
            />
            {!codigo && nombreSede && (
              <p className="text-xs text-muted-foreground">
                Sugerencia: <span className="font-mono">{codeFromName(nombreSede)}</span>
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`nombre-sede-${orgId}`}>Nombre</Label>
            <Input
              id={`nombre-sede-${orgId}`}
              name="nombre"
              required
              placeholder="Sede Central"
              value={nombreSede}
              onChange={(e) => {
                const next = e.target.value;
                setNombreSede(next);
                if (!codigoTouched) setCodigo(codeFromName(next));
              }}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`dir-${orgId}`}>Dirección</Label>
            <Input id={`dir-${orgId}`} name="direccion" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`tel-${orgId}`}>Teléfono</Label>
            <Input id={`tel-${orgId}`} name="telefono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`mail-${orgId}`}>Email</Label>
            <Input id={`mail-${orgId}`} name="email" type="email" />
          </div>
          <input type="hidden" name="es_procesadora" value="on" />
          <input type="hidden" name="activo" value="on" />
          <div className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              id={`procesa-${orgId}`}
              type="checkbox"
              defaultChecked
              className="h-4 w-4"
              onChange={(e) => {
                const hidden = (e.currentTarget.form?.elements.namedItem(
                  "es_procesadora",
                ) ?? null) as HTMLInputElement | null;
                if (hidden) hidden.value = e.currentTarget.checked ? "on" : "off";
              }}
            />
            <label htmlFor={`procesa-${orgId}`}>Procesa muestras (sede con laboratorio)</label>
          </div>
          <div className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              id={`activa-${orgId}`}
              type="checkbox"
              defaultChecked
              className="h-4 w-4"
              onChange={(e) => {
                const hidden = (e.currentTarget.form?.elements.namedItem(
                  "activo",
                ) ?? null) as HTMLInputElement | null;
                if (hidden) hidden.value = e.currentTarget.checked ? "on" : "off";
              }}
            />
            <label htmlFor={`activa-${orgId}`}>Activa</label>
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitBtn>Crear</SubmitBtn>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditSedeButton({
  sede,
}: {
  sede: {
    id: string;
    organization_id: string;
    codigo: string;
    nombre: string;
    direccion: string | null;
    telefono: string | null;
    email: string | null;
    es_procesadora: boolean;
    activo: boolean;
  };
}) {
  const [open, setOpen] = useState(false);
  const bound = updateSedeAction.bind(null, sede.id);
  const [state, action] = useActionState<SedeFormState, FormData>(bound, undefined);
  useToastEffect(state, "Sede actualizada", () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar sede</DialogTitle>
          <DialogDescription>{sede.nombre}</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="organization_id" value={sede.organization_id} />
          <div className="space-y-1.5">
            <Label htmlFor={`cod-${sede.id}`}>Código</Label>
            <Input id={`cod-${sede.id}`} name="codigo" required defaultValue={sede.codigo} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`nom-${sede.id}`}>Nombre</Label>
            <Input id={`nom-${sede.id}`} name="nombre" required defaultValue={sede.nombre} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`dr-${sede.id}`}>Dirección</Label>
            <Input id={`dr-${sede.id}`} name="direccion" defaultValue={sede.direccion ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`tl-${sede.id}`}>Teléfono</Label>
            <Input id={`tl-${sede.id}`} name="telefono" defaultValue={sede.telefono ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`em-${sede.id}`}>Email</Label>
            <Input id={`em-${sede.id}`} name="email" type="email" defaultValue={sede.email ?? ""} />
          </div>
          <input
            type="hidden"
            name="es_procesadora"
            value={sede.es_procesadora ? "on" : "off"}
          />
          <input type="hidden" name="activo" value={sede.activo ? "on" : "off"} />
          <div className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              id={`procesa-${sede.id}`}
              type="checkbox"
              defaultChecked={sede.es_procesadora}
              className="h-4 w-4"
              onChange={(e) => {
                const hidden = (e.currentTarget.form?.elements.namedItem(
                  "es_procesadora",
                ) ?? null) as HTMLInputElement | null;
                if (hidden) hidden.value = e.currentTarget.checked ? "on" : "off";
              }}
            />
            <label htmlFor={`procesa-${sede.id}`}>Procesa muestras</label>
          </div>
          <div className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              id={`activa-${sede.id}`}
              type="checkbox"
              defaultChecked={sede.activo}
              className="h-4 w-4"
              onChange={(e) => {
                const hidden = (e.currentTarget.form?.elements.namedItem(
                  "activo",
                ) ?? null) as HTMLInputElement | null;
                if (hidden) hidden.value = e.currentTarget.checked ? "on" : "off";
              }}
            />
            <label htmlFor={`activa-${sede.id}`}>Activa</label>
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitBtn>Guardar</SubmitBtn>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ToggleSedeAdminButton({
  sedeId,
  activo,
}: {
  sedeId: string;
  activo: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await toggleSedeForOrgAction(sedeId, !activo);
          if (r?.error) toast.error(r.error);
          else router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
      {activo ? "Desactivar" : "Activar"}
    </Button>
  );
}

export function OrgIconBadge({ activo }: { activo: boolean }) {
  return (
    <div
      className={`flex h-9 w-9 items-center justify-center rounded-lg shadow-glow ${
        activo ? "bg-brand-gradient text-primary-foreground" : "bg-muted text-muted-foreground"
      }`}
    >
      <Building2 className="h-4 w-4" />
    </div>
  );
}

export function PromoteMemberButton({
  orgId,
  sedes,
}: {
  orgId: string;
  sedes: { id: string; nombre: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"org_admin" | "sede_admin">("sede_admin");
  const [sedeId, setSedeId] = useState<string>("");
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4" /> Asignar admin
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asignar administrador</DialogTitle>
          <DialogDescription>
            El usuario ya debe existir en Supabase Auth. Se crea una membership directa.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await promoteToOrgAdminAction(
                orgId,
                email,
                role,
                sedeId || null,
              );
              if (r?.error) toast.error(r.error);
              else {
                toast.success("Administrador asignado");
                setOpen(false);
                setEmail("");
                router.refresh();
              }
            });
          }}
          className="grid gap-3"
        >
          <div className="space-y-1.5">
            <Label>Email del usuario</Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@clinica.example"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Rol</Label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="sede_admin">{ROLE_LABELS.sede_admin}</option>
              <option value="org_admin">{ROLE_LABELS.org_admin}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Sede (opcional)</Label>
            <select
              value={sedeId}
              onChange={(e) => setSedeId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="">Toda la organización</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !email}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Asignar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DropMemberButton({ membershipId }: { membershipId: string }) {
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
          const r = await dropMembershipAction(membershipId);
          if (r?.error) toast.error(r.error);
          else {
            toast.success("Rol removido");
            router.refresh();
          }
        })
      }
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
    </Button>
  );
}

export function StatusBadge({ activo }: { activo: boolean }) {
  return (
    <Badge
      className={
        activo
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-muted text-muted-foreground"
      }
    >
      {activo ? "Activa" : "Inactiva"}
    </Badge>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const labels: Record<string, string> = ROLE_LABELS as never;
  return (
    <Badge className="bg-primary/10 text-primary">
      {labels[role] ?? role}
    </Badge>
  );
}

export function OrgAdminNotice() {
  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
      Módulo de plataforma. Solo superadmins pueden crear, editar y desactivar organizaciones. Las acciones se ejecutan con service role fuera de RLS.
    </div>
  );
}

export const ORGANIZATION_FORM_OPTIONS = { TIMEZONES, LOCALES, ROLE_OPTIONS };