import { Suspense } from "react";
import { FlaskConical } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Ingresar" };

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Panel de marca */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-gradient p-12 text-primary-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/10 blur-3xl"
        />
        <div className="relative flex items-center gap-2 text-lg font-semibold animate-fade-in">
          <FlaskConical className="h-6 w-6" />
          Nova Lab
        </div>
        <div className="relative space-y-4 animate-fade-up">
          <h1 className="text-3xl font-bold leading-tight">
            Sistema de información
            <br /> de laboratorio clínico
          </h1>
          <p className="max-w-md text-primary-foreground/80">
            Gestión multi-sede de pacientes, órdenes, muestras y resultados con
            trazabilidad completa. Diseñado para escalar entre clínicas.
          </p>
        </div>
        <p className="relative text-sm text-primary-foreground/70">
          © {new Date().getFullYear()} Nova Lab · Multi-sede · RBAC · Trazabilidad
        </p>
      </div>

      {/* Formulario */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6 animate-fade-up">
          <div className="space-y-2 text-center lg:hidden">
            <div className="flex items-center justify-center gap-2 text-lg font-semibold">
              <FlaskConical className="h-6 w-6 text-primary" />
              Nova Lab
            </div>
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Bienvenido de nuevo</h2>
            <p className="text-sm text-muted-foreground">
              Ingresa con tu cuenta para continuar.
            </p>
          </div>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
