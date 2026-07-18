"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Primitivos de graficos del modulo Analitica.
 * Un solo tono (primary del tema) para magnitud; la identidad la llevan las
 * etiquetas de texto, nunca el color. Grid y ejes recesivos (muted).
 */

export type Point = { label: string; value: number; hint?: string };

function niceMax(max: number) {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  const n = max / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

/** Columnas verticales (series diaria) con tooltip por barra. */
export function ColumnChart({
  data,
  height = 180,
  format = (v: number) => String(v),
}: {
  data: Point[];
  height?: number;
  format?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = useMemo(() => niceMax(Math.max(...data.map((d) => d.value), 0)), [data]);

  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Sin datos en el periodo.</p>;
  }

  const gridLines = [0.25, 0.5, 0.75, 1];
  // Etiquetas del eje x: primera, ultima y ~4 intermedias
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));

  return (
    <div className="relative">
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
        >
          <p className="font-medium">{data[hover].hint ?? data[hover].label}</p>
          <p className="text-muted-foreground tabular-nums">{format(data[hover].value)}</p>
        </div>
      )}
      <div className="relative" style={{ height }}>
        {/* grid horizontal recesivo */}
        {gridLines.map((g) => (
          <div
            key={g}
            className="absolute inset-x-0 border-t border-border/60"
            style={{ bottom: `${g * 100}%` }}
          />
        ))}
        <div className="absolute inset-x-0 bottom-0 border-t border-border" />
        <div className="absolute inset-0 flex items-end gap-px" onMouseLeave={() => setHover(null)}>
          {data.map((d, i) => (
            <div
              key={i}
              className="group relative flex h-full flex-1 items-end justify-center"
              onMouseEnter={() => setHover(i)}
            >
              {/* zona de hover mas grande que la barra */}
              <div
                className={cn(
                  "w-full max-w-6 rounded-t-[3px] bg-primary transition-opacity",
                  hover !== null && hover !== i && "opacity-40"
                )}
                style={{ height: `${max > 0 ? (d.value / max) * 100 : 0}%`, minHeight: d.value > 0 ? 2 : 0 }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex gap-px">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center text-[10px] text-muted-foreground">
            {i % labelEvery === 0 ? d.label : ""}
          </div>
        ))}
      </div>
      <p className="mt-1 text-right text-[10px] text-muted-foreground tabular-nums">
        máx. {format(max)}
      </p>
    </div>
  );
}

/** Barras horizontales etiquetadas (rankings, categorias, estados). */
export function HBarList({
  data,
  format = (v: number) => String(v),
  emptyText = "Sin datos en el periodo.",
}: {
  data: Point[];
  format?: (v: number) => string;
  emptyText?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 0);
  if (data.length === 0 || max === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={i}>
          <div className="mb-0.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{d.label}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {format(d.value)}
              {d.hint && <span className="ml-1.5 text-xs">({d.hint})</span>}
            </span>
          </div>
          <div className="h-2 rounded-[3px] bg-muted">
            <div
              className="h-full rounded-[3px] bg-primary"
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Barra de proporcion simple (usada como medidor 0–100%). */
export function Meter({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded-[3px] bg-muted">
        <div className="h-full rounded-[3px] bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
