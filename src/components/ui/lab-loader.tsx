import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Loader homogéneo de la app: un tubo de ensayo al que le caen gotas del
 * gradiente de marca; el líquido reacciona con un leve rebote y burbujea.
 * Debajo, la descripción de lo que se está cargando con tres puntos de
 * progreso escalonados. Respeta prefers-reduced-motion vía las reglas
 * globales de animación.
 */
export function LabLoader({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  const uid = useId();
  const gradId = `lab-liquid-${uid}`;
  const clipId = `lab-tube-${uid}`;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center justify-center gap-3 py-10", className)}
    >
      <svg viewBox="0 0 48 84" className="h-20 w-12" aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--brand-2)" />
          </linearGradient>
          <clipPath id={clipId}>
            <path d="M16 14 h16 v50 a8 8 0 0 1 -16 0 z" />
          </clipPath>
        </defs>

        {/* Gotas vertiéndose al tubo */}
        <circle cx="24" cy="6" r="2.6" fill="var(--primary)" className="animate-drop-fall" />
        <circle
          cx="24"
          cy="6"
          r="2"
          fill="var(--brand-2)"
          className="animate-drop-fall"
          style={{ animationDelay: "0.8s" }}
        />

        {/* Líquido con rebote + burbujas internas */}
        <g clipPath={`url(#${clipId})`}>
          <rect
            x="16"
            y="42"
            width="16"
            height="32"
            fill={`url(#${gradId})`}
            className="animate-liquid-wobble"
            style={{ transformOrigin: "center bottom", transformBox: "fill-box" }}
          />
          <circle
            cx="21"
            cy="66"
            r="1.6"
            fill="oklch(1 0 0 / 0.55)"
            className="animate-bubble-rise"
          />
          <circle
            cx="27"
            cy="68"
            r="1.2"
            fill="oklch(1 0 0 / 0.45)"
            className="animate-bubble-rise"
            style={{ animationDelay: "0.6s" }}
          />
          <circle
            cx="24"
            cy="70"
            r="1"
            fill="oklch(1 0 0 / 0.4)"
            className="animate-bubble-rise"
            style={{ animationDelay: "1.1s" }}
          />
        </g>

        {/* Vidrio del tubo */}
        <path
          d="M15 12 v52 a9 9 0 0 0 18 0 v-52"
          fill="none"
          stroke="var(--muted-foreground)"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.55"
        />
        <line
          x1="11"
          y1="12"
          x2="37"
          y2="12"
          stroke="var(--muted-foreground)"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.55"
        />
        {/* Brillo del vidrio */}
        <line
          x1="19"
          y1="20"
          x2="19"
          y2="54"
          stroke="oklch(1 0 0 / 0.5)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>

      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="flex items-center gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-primary animate-dot-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
