import { FlaskConical, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function LabLoader({
  icon: Icon = FlaskConical,
  label,
  className,
}: {
  icon?: LucideIcon;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center justify-center gap-4 py-10", className)}
    >
      <div className="relative">
        {/* Burbujas que emergen del matraz */}
        <span className="absolute -top-2 left-2 h-1.5 w-1.5 rounded-full bg-primary animate-bubble-rise" />
        <span
          className="absolute -top-2 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-primary/80 animate-bubble-rise"
          style={{ animationDelay: "0.5s" }}
        />
        <span
          className="absolute -top-2 right-2 h-1.5 w-1.5 rounded-full bg-primary/60 animate-bubble-rise"
          style={{ animationDelay: "1s" }}
        />
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient text-primary-foreground shadow-glow animate-flask-swirl">
          <Icon className="h-6 w-6" />
        </div>
      </div>
      {label && <p className="text-sm text-muted-foreground animate-pulse">{label}</p>}
    </div>
  );
}
