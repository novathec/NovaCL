"use client";

import { useTransition } from "react";
import { useTheme } from "next-themes";
import { Building2, MapPin, Moon, Sun, LogOut, ChevronsUpDown, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/misc";
import { setActiveOrg, setActiveSede, signOutAction } from "@/lib/actions/auth";
import { initials } from "@/lib/utils";
import { MobileNav } from "@/components/shell/mobile-nav";
import type { NavSection } from "@/lib/nav";

type Props = {
  sections: NavSection[];
  organizations: { id: string; nombre: string }[];
  sedes: { id: string; nombre: string; codigo: string }[];
  activeOrgId: string | null;
  activeSedeId: string | null;
  user: { email: string; nombre: string };
  roleLabel: string;
};

export function Topbar({
  sections,
  organizations,
  sedes,
  activeOrgId,
  activeSedeId,
  user,
  roleLabel,
}: Props) {
  const { theme, setTheme } = useTheme();
  const [, startTransition] = useTransition();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/80 px-4 backdrop-blur">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-linear-to-r from-transparent via-primary/50 to-transparent"
      />
      <MobileNav sections={sections} />

      {/* Selector de organización (solo si hay más de una) */}
      {organizations.length > 1 && (
        <div className="hidden items-center gap-2 sm:flex">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <Select
            value={activeOrgId ?? undefined}
            onValueChange={(v) => startTransition(() => void setActiveOrg(v))}
          >
            <SelectTrigger className="h-8 w-[180px]">
              <SelectValue placeholder="Organización" />
            </SelectTrigger>
            <SelectContent>
              {organizations.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Selector de sede */}
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <Select
          value={activeSedeId ?? undefined}
          onValueChange={(v) => startTransition(() => void setActiveSede(v))}
        >
          <SelectTrigger className="h-8 w-[190px]">
            <SelectValue placeholder="Selecciona sede" />
          </SelectTrigger>
          <SelectContent>
            {sedes.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.codigo} · {s.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="group"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Cambiar tema"
        >
          <Sun className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90 dark:hidden" />
          <Moon className="hidden h-4 w-4 transition-transform duration-300 group-hover:-rotate-12 dark:block" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-2">
              <Avatar>
                <AvatarFallback>{initials(user.nombre || user.email)}</AvatarFallback>
              </Avatar>
              <div className="hidden text-left sm:block">
                <p className="text-sm font-medium leading-none">{user.nombre || "Usuario"}</p>
                <p className="text-xs text-muted-foreground">{roleLabel}</p>
              </div>
              <ChevronsUpDown className="hidden h-4 w-4 text-muted-foreground sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col">
              <span>{user.nombre || "Usuario"}</span>
              <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/configuracion">
                <UserCircle className="h-4 w-4" /> Mi cuenta
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => startTransition(() => void signOutAction())}
            >
              <LogOut className="h-4 w-4" /> Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
