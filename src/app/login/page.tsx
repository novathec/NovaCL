import { Suspense } from "react";
import Image from "next/image";
import { Lock } from "lucide-react";
import { LoginForm } from "./login-form";
import { LogoParticles } from "./logo-particles";

export const metadata = { title: "Ingresar · NovaLIS" };

export default function LoginPage() {
  return (
    // El login siempre usa el tema claro: "theme-light" redeclara las variables
    // de color para que no le afecte el theme (claro/oscuro) del resto de la app.
    <div className="theme-light relative min-h-screen overflow-hidden bg-[#03181d]">
      {/* Fotografía de laboratorio: escena de fondo general */}
      <Image
        src="/laboratory.png"
        alt=""
        aria-hidden
        fill
        priority
        className="pointer-events-none object-cover object-[32%_45%] opacity-95"
      />

      {/* Velo de marca: tinte sutil que da elegancia sin ocultar la fotografía */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-linear-to-r from-[#02171c]/70 via-[#054048]/42 to-[#02171c]/52"
      />
      {/* Foco: refuerza contraste detrás del isotipo (columna de marca) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 hidden w-full lg:block lg:w-[56%]"
        style={{
          background:
            "radial-gradient(ellipse 55% 52% at 32% 42%, rgba(1,10,13,0.85), transparent 68%)",
        }}
      />

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
        {/* Panel de marca */}
        <div className="relative hidden flex-col items-center justify-center p-10 text-primary-foreground lg:flex xl:p-14">
          {/* Retícula sutil */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
              backgroundSize: "42px 42px",
              maskImage:
                "radial-gradient(ellipse 60% 55% at 35% 45%, black 40%, transparent 80%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 60% 55% at 35% 45%, black 40%, transparent 80%)",
            }}
          />

          {/* Isotipo y mensaje: centrados y ligeramente desplazados hacia
              arriba para compensar visualmente el copyright inferior */}
          <div className="relative z-10 flex -translate-y-6 flex-col items-center gap-9 text-center">
          <div className="relative flex h-104 w-104 items-center justify-center">
            <LogoParticles count={34} />
            {/* Halo detrás del logo */}
            <div
              aria-hidden
              className="absolute h-64 w-64 rounded-full bg-white/25 blur-3xl animate-halo-breathe"
            />
            <div
              aria-hidden
              className="absolute h-40 w-40 rounded-full bg-white/40 blur-2xl"
            />
            {/* Isotipo prominente */}
            <div className="relative animate-logo-float">
              <Image
                src="/isotipo/Isotipo.png"
                alt="NovaLIS"
                width={520}
                height={620}
                priority
                className="relative z-10 h-64 w-auto object-contain drop-shadow-[0_18px_45px_rgba(0,0,0,0.35)]"
              />
            </div>
          </div>

          {/* Mensaje de marca: centrado bajo el isotipo */}
          <div className="max-w-md space-y-4 animate-fade-up">
            <h1 className="text-2xl font-semibold tracking-tight xl:text-3xl">
              Laboratory Information System
            </h1>
            <div aria-hidden className="flex items-center justify-center gap-3">
              <span className="h-px w-14 bg-white/30" />
              <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
              <span className="h-px w-14 bg-white/30" />
            </div>
            <p className="text-sm leading-relaxed text-white/70 xl:text-base">
              Sistema avanzado para la gestión completa del proceso de examen
              de laboratorio clínico.
            </p>
          </div>
        </div>

        <p className="absolute inset-x-0 bottom-8 z-10 text-center text-xs text-primary-foreground/50 xl:bottom-10">
          © {new Date().getFullYear()} Nova Lab
        </p>
      </div>

      {/* Formulario: tarjeta de vidrio líquido */}
      <div className="relative flex items-center justify-center p-6 sm:p-10">
        {/* Nota: el desplazamiento usa margen (no "transform") para no romper
            el "backdrop-blur" de la tarjeta: un ancestro con transform crea
            su propia raíz de fondo y el vidrio dejaría de ver la foto. */}
        <div className="relative -mt-6 w-full max-w-sm animate-fade-in">
          {/* Resplandor ambiental bajo la tarjeta */}
          <div
            aria-hidden
            className="absolute -inset-6 -z-10 rounded-4xl bg-primary/30 blur-3xl"
          />

          {/* Filo de vidrio: borde en degradado que simula la refracción de luz */}
          <div className="flex min-h-[min(46rem,80vh)] flex-col rounded-[1.75rem] bg-linear-to-br from-white/35 via-white/10 to-black/20 p-px shadow-2xl shadow-black/45">
            {/* Importante: este contenedor NO lleva "background-color" propio.
                Si el elemento con "backdrop-filter" también tiene un fondo
                semitransparente, algunos motores dejan de renderizar el
                desenfoque; por eso el tinte oscuro va en una capa aparte,
                pintada encima del vidrio ya desenfocado. */}
            <div className="relative flex flex-1 flex-col overflow-hidden rounded-[1.7rem] backdrop-blur-3xl backdrop-saturate-150">
              {/* Tinte oscuro sobre el vidrio ya desenfocado: algo más
                  transparente para dejar entrever mejor la foto de fondo. */}
              <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/30" />
              {/* Barniz diagonal: luz atravesando el vidrio */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-linear-to-br from-white/12 via-transparent to-black/20"
              />
              {/* Reflejo especular superior */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-6 top-0 h-px bg-linear-to-r from-transparent via-white/60 to-transparent"
              />
              {/* Burbuja de luz */}
              <div
                aria-hidden
                className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-white/25 blur-3xl"
              />
              {/* Tinte de color, como el agua */}
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-primary/35 blur-3xl"
              />

              <div className="relative flex flex-1 flex-col justify-center space-y-6 p-8 sm:p-9">
                {/* Isotipo compacto en móvil */}
                <div className="flex flex-col items-center gap-3 text-center lg:hidden">
                  <div className="relative">
                    <div
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-primary/25 blur-2xl"
                    />
                    <Image
                      src="/isotipo/Isotipo.png"
                      alt="NovaLIS"
                      width={260}
                      height={310}
                      priority
                      className="relative h-24 w-auto object-contain"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 text-center lg:text-left">
                  <h2 className="text-2xl font-semibold tracking-tight text-white">
                    Iniciar sesión
                  </h2>
                  <p className="text-sm text-white/65">
                    Accede con tus credenciales corporativas.
                  </p>
                </div>

                <Suspense>
                  <LoginForm />
                </Suspense>

                <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-white/55 lg:justify-start">
                  <Lock className="h-3 w-3" />
                  Acceso restringido · Uso profesional
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
