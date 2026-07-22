import { Suspense } from "react";
import Image from "next/image";
import { Lock } from "lucide-react";
import { LoginForm } from "./login-form";
import { LogoParticles } from "./logo-particles";

export default function LoginPage() {
  return (
    // El login siempre usa el tema claro: "theme-light" redeclara las variables
    // de color para que no le afecte el theme (claro/oscuro) del resto de la app.
    <div className="theme-light relative min-h-screen overflow-hidden bg-[#547fb4]">
      {/* Fondo abstracto azul-verde: blobs orgánicos de teal (verde) y azul
          clínico que se funden sobre una base diagonal azul→teal. Registro
          limpio y formal, con la mezcla fluida de la paleta de marca. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 90% at 10% 18%, #2f9a8e 0%, rgba(47,154,142,0) 55%), radial-gradient(ellipse 85% 95% at 92% 88%, #2c66a6 0%, rgba(44,102,166,0) 58%), radial-gradient(ellipse 65% 70% at 82% 12%, #3f93bf 0%, rgba(63,147,191,0) 52%), radial-gradient(ellipse 60% 65% at 30% 95%, #2f8f86 0%, rgba(47,143,134,0) 55%), linear-gradient(145deg, #3d84ac 0%, #35908a 100%)",
        }}
      />
      {/* Rejilla de circuito hexagonal: panal de líneas finas (SVG teselado)
          que evoca la estructura molecular/celular del laboratorio. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "url(data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='28'%20height='49'%20viewBox='0%200%2028%2049'%3E%3Cpath%20d='M13.99%209.25l13%207.5v15l-13%207.5L1%2031.75v-15l12.99-7.5zM3%2017.9v12.7l10.99%206.34%2011-6.35V17.9l-11-6.34L3%2017.9zM0%2015l12.98-7.5V0h-2v6.35L0%2012.69v2.3zm0%2018.5L12.98%2041v8h-2v-6.85L0%2035.81v-2.3zM15%200v7.5L27.99%2015H28v-2.31h-.01L17%206.35V0h-2zm0%2049v-8l12.99-7.5H28v2.31h-.01L17%2042.15V49h-2z'%20fill='%23ffffff'%20fill-opacity='0.24'/%3E%3C/svg%3E)",
          backgroundSize: "48px 84px",
          maskImage:
            "radial-gradient(ellipse 100% 100% at 50% 45%, black 25%, transparent 92%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 100% 100% at 50% 45%, black 25%, transparent 92%)",
        }}
      />
      {/* Nodos luminosos en la rejilla: laten lentamente para dar el pulso
          "eléctrico" del circuito (capa hermana, no ancestro de la tarjeta,
          así que animar su opacidad no rompe el backdrop-blur del vidrio). */}
      <div
        aria-hidden
        className="animate-grid-pulse pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(235,245,255,.55) 0, rgba(235,245,255,0) 2.4px), radial-gradient(circle, rgba(235,245,255,.55) 0, rgba(235,245,255,0) 2.4px)",
          backgroundSize: "48px 84px",
          // La segunda capa va desplazada media celda: los nodos caen en los
          // vértices/centros del panal en lugar de una malla cuadrada.
          backgroundPosition: "0 0, 24px 42px",
          maskImage:
            "radial-gradient(ellipse 85% 85% at 50% 45%, black 8%, transparent 82%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 85% 85% at 50% 45%, black 8%, transparent 82%)",
        }}
      />

      {/* Ambiente: partículas orbitando sobre el fondo oscuro de marca
          (el papel que cumplen las constelaciones en la referencia) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        {/* Radios amplios y variados: las órbitas rodean el panel central y
            cubren más pantalla; el cursor se enlaza con las más cercanas */}
        <div className="relative h-full w-full">
          <LogoParticles count={32} minRadius={280} maxRadius={900} linkCursor />
        </div>
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center p-6 sm:p-10">
        {/* Contenedor unificado: fotografía + formulario en un solo panel.
            La geometría (alto y radios) la delimita el formulario: la tarjeta
            está en el flujo y la imagen es una capa "fill" del panel, así el
            panel nunca crece más allá de lo que mide el formulario. */}
        {/* Ojo: nada de animaciones/transform/opacity en los ancestros de la
            tarjeta — una animación de opacidad promueve el elemento a su
            propia capa y crea un "backdrop root": el vidrio dejaría de ver
            (y desenfocar) la fotografía. El fade-in va en el contenido. */}
        <div className="relative w-full max-w-lg overflow-hidden rounded-[1.25rem] shadow-2xl shadow-slate-900/35 ring-1 ring-white/25 lg:max-w-5xl">
          {/* Fotografía de laboratorio: sin velos ni tintes, ocupa todo el
              panel; a la derecha queda tras el vidrio del formulario. */}
          <Image
            src="/laboratory.png"
            alt=""
            aria-hidden
            fill
            priority
            className="pointer-events-none object-cover object-[32%_45%]"
          />


          {/* Marca sobre la fotografía (solo escritorio): isotipo con enfoque
              radial + mensaje de marca, acomodados en columna para aprovechar
              la altura del panel. En pantallas pequeñas viven en la tarjeta. */}
          <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[calc(100%-32rem)] flex-col items-center justify-center gap-7 px-10 text-center lg:flex">
            {/* Enfoque oscuro radial: oscurece la zona central de la escena
                para que el isotipo y los textos blancos no se pierdan sobre
                las áreas claras de la fotografía */}
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 62% 58% at 50% 50%, rgba(2,15,20,0.68), rgba(2,15,20,0.34) 58%, transparent 80%)",
              }}
            />
            <div className="relative">
              <Image
                src="/isotipo/Isotipo.png"
                alt="NovaLIS"
                width={260}
                height={310}
                priority
                className="relative h-38 w-auto object-contain drop-shadow-[0_16px_36px_rgba(0,0,0,0.55)]"
              />
            </div>
            <div className="relative space-y-3 [text-shadow:0_1px_4px_rgb(0_0_0/0.75)]">
              <h1 className="text-xl font-semibold tracking-tight text-white">
                Sistema de Información para Laboratorios
              </h1>
              {/* Subtítulo secundario en inglés, de menor jerarquía */}
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/65">
                Laboratory Information System
              </p>
              <div aria-hidden className="flex items-center justify-center gap-3">
                <span className="h-px w-12 bg-white/50" />
                <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
                <span className="h-px w-12 bg-white/50" />
              </div>
              <p className="mx-auto max-w-xs text-sm leading-relaxed text-white/90">
                Sistema avanzado para la gestión completa del proceso de
                examen de laboratorio clínico.
              </p>
            </div>
          </div>

          {/* El formulario define la altura del panel y se alinea a la
              derecha; en pantallas pequeñas ocupa todo el ancho. */}
          <div className="relative flex justify-end">
            {/* Tarjeta de vidrio: geometría intacta (max-w-lg, radios,
                disposición interna). El desenfoque toma la fotografía del
                panel que tiene detrás. */}
            <div className="relative w-full max-w-lg">
              <div className="relative overflow-hidden rounded-[1.25rem] backdrop-blur-[18px] backdrop-saturate-125">
                {/* Tinte azul-noche translúcido: conecta con el fondo
                    tecnológico y evita el aspecto grisáceo del negro puro. */}
                <div aria-hidden className="pointer-events-none absolute inset-0 bg-[rgba(20,32,43,0.82)]" />
                {/* Barniz diagonal: luz atravesando el vidrio */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-linear-to-br from-white/10 via-transparent to-black/20"
                />

                {/* "lg:min-h-172" (43rem) conserva la altura que tenía el
                    panel cuando la marca vivía dentro de la tarjeta */}
                <div className="relative flex animate-fade-in flex-col justify-center gap-8 px-9 py-12 sm:px-14 lg:min-h-172">
                  {/* Marca integrada. El isotipo va estático a propósito: en un
                      login profesional el movimiento continuo del logo compite
                      con la tarea y ya hay vida en las partículas del fondo. */}
                  <div className="flex flex-col items-center gap-4 text-center">
                    {/* En escritorio la marca vive en el panel izquierdo;
                        aquí solo se muestra en pantallas pequeñas. */}
                    <div className="relative lg:hidden">
                      {/* Enfoque claro: halo radial detrás del isotipo para que
                          destaque sobre el vidrio oscuro */}
                      <div
                        aria-hidden
                        className="absolute -inset-x-14 -inset-y-8 rounded-full blur-xl"
                        style={{
                          background:
                            "radial-gradient(closest-side, rgba(255,255,255,0.55), rgba(255,255,255,0.22) 55%, transparent 100%)",
                        }}
                      />
                      <Image
                        src="/isotipo/Isotipo cristalB.png"
                        alt="NovaLIS"
                        width={260}
                        height={310}
                        priority
                        className="relative h-32 w-auto object-contain brightness-90"
                      />
                    </div>

                    {/* "lg:-mt-8" eleva el bloque del título dentro de la
                        tarjeta centrada para que se lea claramente como
                        encabezado, separado del formulario. */}
                    <div className="space-y-2 [text-shadow:0_1px_3px_rgb(0_0_0/0.65)] lg:-mt-8">
                      {/* Azul clínico de la paleta (hue de --brand-2) aclarado
                          para mantener contraste sobre el vidrio oscuro; el halo
                          azulado sutil lo separa del fondo y refuerza jerarquía */}
                      <h2 className="mb-5 text-2xl font-black uppercase tracking-[0.12em] text-[oklch(0.82_0.11_232)] [text-shadow:0_1px_3px_rgb(0_0_0/0.75),0_0_24px_rgb(56_189_248/0.4)]">
                        Iniciar sesión
                      </h2>
                      {/* Prompt de credenciales: acompaña siempre al título */}
                      <p className="text-sm text-white/70 [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
                        Ingrese con sus credenciales:
                      </p>
                      {/* En escritorio estos textos viven en el panel
                          izquierdo, junto al isotipo */}
                      <p className="text-sm font-medium text-white/85 lg:hidden">
                        Sistema de Información para Laboratorios
                      </p>
                      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/60 lg:hidden">
                        Laboratory Information System
                      </p>
                      <p className="mx-auto max-w-xs text-xs leading-relaxed text-white/75 lg:hidden">
                        Sistema avanzado para la gestión completa del proceso de
                        examen de laboratorio clínico.
                      </p>
                    </div>
                  </div>

                  <Suspense>
                    <LoginForm />
                  </Suspense>

                  <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-white/75 [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
                    <Lock className="h-3 w-3" />
                    Acceso restringido · Uso profesional
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="absolute inset-x-0 bottom-6 text-center text-xs text-white/70 [text-shadow:0_1px_2px_rgb(0_0_0/0.35)]">
          © {new Date().getFullYear()} Nova Lab. Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
}
