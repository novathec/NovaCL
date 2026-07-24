import Image from "next/image";
import Link from "next/link";
import { LogOut, User } from "lucide-react";
import { portalLogoutAction } from "@/lib/actions/portal";
import { SessionGuard } from "./session-guard";

/**
 * Cabecera del portal del paciente. `nombre` presente => sesión activa
 * (muestra el nombre y el botón de salir). `expiresAt` (epoch ms) activa el
 * vigilante de caducidad de sesión. No se imprime.
 */
export function PortalTopbar({
  nombre,
  expiresAt,
}: {
  nombre?: string;
  expiresAt?: number;
}) {
  return (
    <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/portal/mis-resultados" className="flex items-center gap-2.5">
          <Image
            src="/logo/logo.png"
            alt="Nova Lab"
            width={132}
            height={34}
            className="h-8 w-auto object-contain"
            priority
          />
          <span className="hidden text-sm font-medium text-slate-400 sm:inline">
            · Portal del paciente
          </span>
        </Link>

        {nombre && (
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="flex items-center gap-2 rounded-full bg-slate-100 py-1 pl-2 pr-3 text-sm font-medium text-slate-700">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--portal-accent,#0f8a8d)] text-white">
                <User className="h-3.5 w-3.5" />
              </span>
              <span className="max-w-[9rem] truncate capitalize sm:max-w-none">
                {nombre.toLowerCase()}
              </span>
            </span>
            <form action={portalLogoutAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </form>
          </div>
        )}
      </div>

      {expiresAt != null && <SessionGuard expiresAt={expiresAt} />}
    </header>
  );
}
