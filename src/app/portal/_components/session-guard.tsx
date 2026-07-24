"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ShieldAlert, Loader2 } from "lucide-react";
import {
  refreshPortalSessionAction,
  portalLogoutAction,
} from "@/lib/actions/portal";

/** Segundos antes del cierre en que aparece el aviso discreto. */
const WARN_SECONDS = 15;

/**
 * Vigila la caducidad de la sesión del portal (10 min). Cuando faltan 15
 * segundos muestra un aviso discreto con cuenta regresiva y la opción de
 * mantener la sesión; si el tiempo llega a cero, cierra la sesión.
 *
 * La seguridad real la impone el servidor (el token firmado caduca y se
 * rechaza); este componente es la capa de UX que acompaña ese cierre.
 */
export function SessionGuard({ expiresAt: initialExpiresAt }: { expiresAt: number }) {
  const [expiresAt, setExpiresAt] = useState(initialExpiresAt);
  const [remaining, setRemaining] = useState(() => initialExpiresAt - Date.now());
  const [keeping, startKeep] = useTransition();
  const logoutRef = useRef<HTMLFormElement>(null);
  const loggingOut = useRef(false);

  // Si el servidor entrega un nuevo `exp` (p. ej. al navegar), lo adoptamos.
  useEffect(() => {
    setExpiresAt(initialExpiresAt);
  }, [initialExpiresAt]);

  useEffect(() => {
    const tick = () => {
      const rem = expiresAt - Date.now();
      setRemaining(rem);
      if (rem <= 0 && !loggingOut.current) {
        loggingOut.current = true;
        logoutRef.current?.requestSubmit();
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [expiresAt]);

  const secondsLeft = Math.max(0, Math.ceil(remaining / 1000));
  const showWarning = remaining > 0 && remaining <= WARN_SECONDS * 1000;

  const keep = () => {
    startKeep(async () => {
      const res = await refreshPortalSessionAction();
      if (res) {
        loggingOut.current = false;
        setExpiresAt(res.exp * 1000);
      } else if (!loggingOut.current) {
        loggingOut.current = true;
        logoutRef.current?.requestSubmit();
      }
    });
  };

  return (
    <>
      {/* Formulario oculto para el cierre real (usa el redirect del server action) */}
      <form ref={logoutRef} action={portalLogoutAction} className="hidden" />

      {showWarning && (
        <div
          role="alertdialog"
          aria-live="assertive"
          aria-label="Tu sesión está por cerrarse"
          className="no-print fixed inset-x-4 bottom-4 z-50 animate-fade-in sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[22rem]"
        >
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
            <div className="flex items-start gap-3 p-4">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  ¿Sigues ahí?
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                  Por tu seguridad, cerraremos tu sesión en{" "}
                  <span className="font-semibold tabular-nums text-slate-700">
                    {secondsLeft}s
                  </span>
                  .
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={keep}
                    disabled={keeping}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[var(--portal-accent,#0f8a8d)] px-3.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-70"
                  >
                    {keeping && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Mantener sesión
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (loggingOut.current) return;
                      loggingOut.current = true;
                      logoutRef.current?.requestSubmit();
                    }}
                    className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    Salir
                  </button>
                </div>
              </div>
            </div>
            {/* Barra que se agota como refuerzo visual del tiempo restante */}
            <div className="h-1 w-full bg-slate-100">
              <div
                className="h-full bg-amber-400 transition-[width] duration-500 ease-linear"
                style={{ width: `${(secondsLeft / WARN_SECONDS) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
