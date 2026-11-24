import { TEXT_SCALE_OPTIONS, useTextScale } from "@/lib/textSize";
import { cn } from "@/lib/utils";
import { ALargeSmall, Check } from "lucide-react";

export function TextSizeControl({
  contextLabel = "Se aplica en toda la plataforma y se guarda en este teléfono.",
}: {
  contextLabel?: string;
}) {
  const { scaleId, select } = useTextScale();

  return (
    <section
      aria-label="Tamaño de la letra"
      className="surface-raised w-full max-w-full min-w-0 overflow-x-clip rounded-3xl p-5 sm:p-6"
    >
      <div className="flex min-w-0 flex-wrap items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <ALargeSmall className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="break-words font-display text-lg font-bold">
            Tamaño de la letra
          </h2>
          <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">
            Elegí qué tan grande se ve el texto. {contextLabel}
          </p>
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label="Tamaño de la letra"
        className="mt-4 grid w-full max-w-full min-w-0 grid-cols-2 gap-2 overflow-x-clip sm:grid-cols-5"
      >
        {TEXT_SCALE_OPTIONS.map((option) => {
          const active = option.id === scaleId;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => select(option.id)}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-center transition-colors",
                active
                  ? "border-accent/50 bg-accent/[0.1] text-foreground"
                  : "border-border/70 bg-black/20 text-muted-foreground hover:border-accent/30 hover:text-foreground",
              )}
            >
              <span
                aria-hidden
                className="font-display font-extrabold leading-none"
                style={{
                  fontSize:
                    option.id === "small"
                      ? "15px"
                      : option.id === "normal"
                        ? "17px"
                        : option.id === "large"
                          ? "20px"
                          : option.id === "xl"
                            ? "23px"
                            : "26px",
                }}
              >
                Aa
              </span>
              <span className="flex min-w-0 items-center gap-1 break-words text-xs font-semibold">
                {active && <Check className="size-3.5 shrink-0 text-accent" />}
                <span className="truncate">{option.label}</span>
              </span>
              <span className="break-words text-[10px] leading-tight">
                {option.hint}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-black/25 p-3.5">
        <p className="break-words text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Vista previa
        </p>
        <p className="mt-1.5 break-words leading-relaxed">
          Así se ve el texto con el tamaño elegido. Todo el contenido se mantiene
          dentro del ancho del celular, sin salirse por los lados.
        </p>
      </div>
    </section>
  );
}
