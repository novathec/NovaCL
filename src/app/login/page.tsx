import { Suspense } from "react";
import Image from "next/image";
import { Lock } from "lucide-react";
import { LoginForm } from "./login-form";
import { LogoParticles } from "./logo-particles";

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
        className="pointer-events-none scale-105 object-cover object-[32%_45%] opacity-95"
      />

      {/* Velo de marca: tinte sutil que da elegancia sin ocultar la fotografía */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-linear-to-r from-[#02171c]/70 via-[#054048]/42 to-[#02171c]/52"
      />
      {/* Viñeta radial: oscurece los bordes y concentra la luz en el centro,
          donde vive la tarjeta, para que el vidrio destaque sobre la foto. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 62% 58% at 50% 46%, transparent 40%, rgba(1,10,13,0.62) 100%)",
        }}
      />

      {/* Formulario único y centrado: la marca vive dentro de la tarjeta */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-6 sm:p-10">
        {/* Partículas orbitando alrededor de la tarjeta (elemento dinámico) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div className="relative h-184 w-184">
            <LogoParticles count={30} />
          </div>
        </div>

        {/* Nota: el desplazamiento usa margen (no "transform") para no romper
            el "backdrop-blur" de la tarjeta: un ancestro con transform crea
            su propia raíz de fondo y el vidrio dejaría de ver la foto. */}
        <div className="relative w-full max-w-sm animate-fade-in">
          {/* Sombra en degradado: dos capas suaves (teal → azul → violeta)
              muy desenfocadas por detrás de la tarjeta para simular una
              proyección de color de la luz que pasa por el vidrio. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-8 -z-10 rounded-[2.5rem] opacity-60 blur-3xl"
            style={{
              background:
                "linear-gradient(135deg, rgba(20,184,166,0.5) 0%, rgba(56,189,248,0.3) 45%, rgba(139,92,246,0.3) 100%)",
            }}
          />

          {/* Filo de vidrio: borde en degradado que simula la refracción de luz. */}
          <div className="flex flex-col rounded-[1.75rem] bg-linear-to-br from-white/35 via-white/10 to-black/25 p-px shadow-2xl shadow-black/50">
            {/* Importante: este contenedor NO lleva "background-color" propio.
                Si el elemento con "backdrop-filter" también tiene un fondo
                semitransparente, algunos motores dejan de renderizar el
                desenfoque; por eso el tinte oscuro va en una capa aparte,
                pintada encima del vidrio ya desenfocado. */}
            <div className="relative flex flex-1 flex-col overflow-hidden rounded-[1.7rem] backdrop-blur-3xl backdrop-saturate-150">
              {/* Tinte oscuro sobre el vidrio ya desenfocado: intenso, como
                  la tarjeta negra translúcida de la referencia. */}
              <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/60" />
              {/* Barniz diagonal: luz atravesando el vidrio */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-linear-to-br from-white/10 via-transparent to-black/25"
              />
              {/* Reflejo especular superior */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-6 top-0 h-px bg-linear-to-r from-transparent via-white/60 to-transparent"
              />
              {/* Burbuja de luz */}
              <div
                aria-hidden
                className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-white/20 blur-3xl"
              />
              {/* Tinte de color, como el agua */}
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-primary/30 blur-3xl"
              />

              <div className="relative flex flex-1 flex-col justify-center gap-7 p-8 sm:p-9">
                {/* Marca integrada: isotipo ligeramente oscurecido con halo */}
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="relative animate-logo-float">
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
                      className="relative h-24 w-auto object-contain brightness-90"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 text-center">
                  <h2 className="text-xl font-semibold uppercase tracking-[0.28em] text-white">
                    Iniciar sesión
                  </h2>
                  <p className="text-sm text-white/65">
                    Laboratory Information System
                  </p>
                </div>

                <Suspense>
                  <LoginForm />
                </Suspense>

                <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-white/55">
                  <Lock className="h-3 w-3" />
                  Acceso restringido · Uso profesional
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="absolute inset-x-0 bottom-6 text-center text-xs text-white/50">
          © {new Date().getFullYear()} Nova Lab
        </p>
      </div>
    </div>
  );
}
