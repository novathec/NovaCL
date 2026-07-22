"use client";

import { useEffect, useRef, useState } from "react";

interface Particle {
  id: number;
  radius: number;
  angleStart: number;
  duration: number;
  size: number;
  minOpacity: number;
  maxOpacity: number;
  pulseDuration: number;
  delay: number;
  reverse: boolean;
  rgb: string;
}

function generate(
  count: number,
  palette: string[],
  minRadius: number,
  maxRadius: number
): Particle[] {
  return Array.from({ length: count }, (_, id) => {
    // ~30% son "grandes": círculos amplios y suaves (bokeh) que ocupan más
    // espacio; el resto son puntos pequeños y nítidos. Sobre el fondo azul
    // medio ambos se leen claros gracias a la paleta brillante.
    const big = Math.random() < 0.3;
    const size = big ? 12 + Math.random() * 12 : 2 + Math.random() * 5.5;
    // Los grandes van más tenues (halo ambiental); los pequeños, más vivos.
    const minOpacity = big
      ? 0.05 + Math.random() * 0.08
      : 0.32 + Math.random() * 0.3;
    const radius = minRadius + Math.random() * (maxRadius - minRadius);
    // Velocidad LINEAL objetivo (px/s) con algo de variación por partícula.
    // El período se deriva del radio (T = 2πr/v): si fuese aleatorio, la
    // velocidad angular sería ~constante y las órbitas internas se verían
    // lentas frente a las externas.
    const speed = 20 + Math.random() * 16;
    return {
      id,
      radius,
      angleStart: Math.random() * 360,
      duration: (2 * Math.PI * radius) / speed,
      size,
      minOpacity,
      maxOpacity: Math.min(big ? 0.3 : 0.95, minOpacity + 0.3 + Math.random() * 0.25),
      pulseDuration: 2.4 + Math.random() * 4.5,
      delay: -Math.random() * 30,
      reverse: Math.random() > 0.5,
      rgb: palette[Math.floor(Math.random() * palette.length)],
    };
  });
}

// Cianes y teals claros (sky-300, cyan-300, teal-200, sky-400): brillantes
// sobre el fondo azul-verde medio, se leen con claridad. Coherentes con la
// familia --primary/--brand-2 pero desplazados al extremo luminoso.
const DEFAULT_PALETTE = ["125,211,252", "103,232,249", "153,246,228", "56,189,248"];

/** Distancia (px) máxima cursor→partícula para dibujar el enlace. */
const LINK_DISTANCE = 260;

interface LogoParticlesProps {
  count?: number;
  className?: string;
  /** Colores (r,g,b) posibles; cada partícula toma uno al azar. */
  palette?: string[];
  /** Rango de radios orbitales (px) alrededor del centro del contenedor. */
  minRadius?: number;
  maxRadius?: number;
  /** Dibuja líneas entre el cursor y las partículas cercanas. */
  linkCursor?: boolean;
}

/**
 * Cloud of particles that orbit around the center with random size, radius,
 * angular velocity and pulsing opacity. Rendered only on the client to avoid
 * SSR hydration mismatches with Math.random().
 *
 * With `linkCursor`, a canvas overlay draws "constellation" lines from the
 * pointer to nearby particles: positions are read per-frame from the DOM
 * (getBoundingClientRect), so the lines follow the CSS orbit animation.
 */
export function LogoParticles({
  count = 32,
  className,
  palette = DEFAULT_PALETTE,
  minRadius = 110,
  maxRadius = 340,
  linkCursor = false,
}: LogoParticlesProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotsRef = useRef(new Map<number, HTMLSpanElement>());

  useEffect(() => {
    setParticles(generate(count, palette, minRadius, maxRadius));
    // La paleta por defecto es una constante de módulo; no la incluimos en
    // las dependencias para no regenerar por un array literal nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, minRadius, maxRadius]);

  useEffect(() => {
    if (!linkCursor || particles.length === 0) return;
    // Sin puntero fino (táctil) no hay cursor que enlazar.
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!container || !canvas || !ctx) return;

    const mouse = { x: -1e4, y: -1e4 };
    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    const onLeave = () => {
      mouse.x = -1e4;
      mouse.y = -1e4;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);

    let raf = 0;
    const draw = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const mx = mouse.x - rect.left;
      const my = mouse.y - rect.top;
      dotsRef.current.forEach((el) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2 - rect.left;
        const cy = r.top + r.height / 2 - rect.top;
        const dist = Math.hypot(cx - mx, cy - my);
        if (dist < LINK_DISTANCE) {
          // La línea se desvanece con la distancia
          const alpha = (1 - dist / LINK_DISTANCE) * 0.7;
          ctx.strokeStyle = `rgba(165,243,252,${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(mx, my);
          ctx.lineTo(cx, cy);
          ctx.stroke();
        }
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [linkCursor, particles.length]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden ${className ?? ""}`}
    >
      {linkCursor && <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute animate-orbit"
          style={{
            width: p.radius * 2,
            height: p.radius * 2,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            animationDirection: p.reverse ? "reverse" : "normal",
            ["--orbit-start" as string]: `${p.angleStart}deg`,
          }}
        >
          <span
            ref={(el) => {
              if (el) dotsRef.current.set(p.id, el);
              else dotsRef.current.delete(p.id);
            }}
            className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full animate-particle-pulse"
            style={{
              width: p.size,
              height: p.size,
              backgroundColor: `rgb(${p.rgb})`,
              boxShadow: `0 0 ${Math.max(6, p.size * 2.5)}px rgba(${p.rgb},${p.maxOpacity * 0.9})`,
              animationDuration: `${p.pulseDuration}s`,
              animationDelay: `${p.delay}s`,
              ["--min-opacity" as string]: p.minOpacity,
              ["--max-opacity" as string]: p.maxOpacity,
            }}
          />
        </div>
      ))}
    </div>
  );
}
