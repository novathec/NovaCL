"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, Lock, Mail, type LucideIcon } from "lucide-react";
import { signInAction, type ActionState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="h-11 w-full rounded-full text-sm font-semibold tracking-wide"
      disabled={pending}
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      Ingresar
    </Button>
  );
}

/**
 * Icono + etiqueta de un campo "flotante": en reposo se ven centrados sobre
 * la línea del campo (como un placeholder); al enfocar el input o al tener
 * texto, ambos suben y se reducen para liberar el espacio de escritura.
 */
function FloatingFieldChrome({
  active,
  icon: Icon,
  label,
  htmlFor,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  htmlFor: string;
}) {
  return (
    <>
      <Icon
        aria-hidden
        className={`pointer-events-none absolute left-0 transition-all duration-200 ${
          active
            ? "top-1 h-3.5 w-3.5 text-cyan-300"
            : "top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-white/45"
        }`}
      />
      <label
        htmlFor={htmlFor}
        className={`pointer-events-none absolute left-7 transition-all duration-200 ${
          active
            ? "top-1 text-[10.5px] tracking-wide text-cyan-300/90"
            : "top-1/2 -translate-y-1/2 text-sm text-white/50"
        }`}
      >
        {label}
      </label>
    </>
  );
}

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";
  const [state, formAction] = useActionState<ActionState, FormData>(signInAction, undefined);
  const [showPassword, setShowPassword] = useState(false);

  const [emailFocused, setEmailFocused] = useState(false);
  const [emailHasValue, setEmailHasValue] = useState(false);
  const emailActive = emailFocused || emailHasValue;

  const [passwordFocused, setPasswordFocused] = useState(false);
  const [passwordHasValue, setPasswordHasValue] = useState(false);
  const passwordActive = passwordFocused || passwordHasValue;

  return (
    <form action={formAction} className="space-y-7">
      <input type="hidden" name="next" value={next} />

      {/* Campo de correo: línea inferior, sin caja; icono y etiqueta suben
          al enfocar (o si el campo ya tiene texto, p. ej. autocompletado). */}
      <div
        className={`relative h-12 border-b transition-colors duration-200 ${
          emailFocused ? "border-cyan-300" : "border-white/20"
        }`}
      >
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          onFocus={() => setEmailFocused(true)}
          onBlur={(e) => {
            setEmailFocused(false);
            setEmailHasValue(e.currentTarget.value.length > 0);
          }}
          onChange={(e) => setEmailHasValue(e.currentTarget.value.length > 0)}
          className="liquid-input absolute inset-0 w-full border-0 bg-transparent pb-1 pl-7 pt-5 text-sm text-white outline-none"
        />
        <FloatingFieldChrome active={emailActive} icon={Mail} label="Correo electrónico" htmlFor="email" />
      </div>

      {/* Campo de contraseña: mismo comportamiento, más el botón de
          mostrar/ocultar a la derecha (fijo, no participa de la animación). */}
      <div
        className={`relative h-12 border-b transition-colors duration-200 ${
          passwordFocused ? "border-cyan-300" : "border-white/20"
        }`}
      >
        <input
          id="password"
          name="password"
          type={showPassword ? "text" : "password"}
          required
          autoComplete="current-password"
          onFocus={() => setPasswordFocused(true)}
          onBlur={(e) => {
            setPasswordFocused(false);
            setPasswordHasValue(e.currentTarget.value.length > 0);
          }}
          onChange={(e) => setPasswordHasValue(e.currentTarget.value.length > 0)}
          className="liquid-input absolute inset-0 w-full border-0 bg-transparent py-0 pb-1 pl-7 pr-9 pt-5 text-sm text-white outline-none"
        />
        <FloatingFieldChrome active={passwordActive} icon={Lock} label="Contraseña" htmlFor="password" />
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={showPassword}
          className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-white/45 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {/* Espacio reservado para mensajes de error/advertencia: evita que el
          formulario "salte" de tamaño cuando aparece un mensaje. */}
      <div className="min-h-11" aria-live="polite">
        {state?.error && (
          <p className="rounded-lg border border-red-400/30 bg-red-500/15 px-3 py-2 text-xs text-red-200">
            {state.error}
          </p>
        )}
      </div>
      <SubmitButton />
    </form>
  );
}
