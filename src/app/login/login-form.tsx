"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { signInAction, type ActionState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      Ingresar
    </Button>
  );
}

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";
  const [state, formAction] = useActionState<ActionState, FormData>(signInAction, undefined);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <Label htmlFor="email" className="text-white/85">Correo electrónico</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="tu@clinica.com"
          required
          autoComplete="email"
          className="border-white/20 bg-white/10 text-white placeholder:text-white/40 focus-visible:bg-white/15 focus-visible:ring-white/40"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-white/85">Contraseña</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            className="border-white/20 bg-white/10 pr-10 text-white placeholder:text-white/40 focus-visible:bg-white/15 focus-visible:ring-white/40"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex h-9 w-9 items-center justify-center rounded-r-md text-white/50 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
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
