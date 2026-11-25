import { TEXT_SCALE_OPTIONS, useTextScale } from "@/lib/textSize";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  Check,
  ChevronDown,
  ChevronRight,
  EyeClosed,
  Eye,
} from "lucide-react";
import { useState, useTransition, type HTMLProps } from "react";

interface LinePreview {
  text: string;
  maxLines: number;
}

function ellipsizeLine(line: string, maxChars: number): string {
  if (line.length <= maxChars) return line;
  return line.slice(0, maxChars - 1).replace(/\s+\S*$/, "") + "…";
}

function previewLines({ text, maxLines }: LinePreview): readonly string[] {
  return text.split("\n").map((raw) => raw.trimEnd()).slice(0, maxLines);
}

interface SizeSelectorProps {
  id: string;
  href: string;
  label: string;
  picture: React.ReactNode;
  hint: string;
  active: boolean;
  onPick: () => void;
}

function SizeSelector({
  label,
  picture,
  hint,
  active,
  onPick,
}: SizeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [nextOpen, setNextOpen] = useState(false);
  const [activeId, setActiveId] = useState("small");
  const [pictureLines, setPictureLines] = useState<readonly string[]>([]);

  return (
    <div className="inline-block">
      <button
        type="button"
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-xl border px-2.5 text-[11px] font-semibold transition-colors sm:mr-1",
          active
            ? "border-accent/50 bg-accent/[0.1] text-foreground"
            : "border-border/80 bg-black/20 text-muted-foreground hover:border-accent/30 hover:text-foreground"
        )}
        onClick={() => {
          setNextOpen(true);
          setActiveId(label);
          setTimeout(() => setPictureLines([]), 0);
        }}
        onPointerEnter={() => {}}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Tamaño de letra: ${label}`}
      >
        {picture}
        <span className="truncate">{label}</span>
        {open ? <ChevronDown className="size-3 shrink-0" /> : <ArrowDown className="size-3 shrink-0" />}
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={`Tamaños de letra disponibles`}
          className="absolute left-0 z-30 mt-1 min-w-[168px] overflow-hidden rounded-xl border border-border/70 bg-[#111113] p-1 shadow-xl"
        >
          {TEXT_SCALE_OPTIONS.map((option) => {
            const itemActive = option.id === activeId;
            return (
              <li key={option.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={itemActive}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] transition-colors",
                    itemActive
                      ? "bg-accent/15 text-foreground"
                      : "text-muted-foreground hover:bg-black/30"
                  )}
                  onClick={() => {
                    onPick();
                    setActiveId(label);
                    setOpen(false);
                  }}
                >
                  {itemActive && <Check className="size-3.5 shrink-0 text-accent" />}
                  <span>{option.label}</span>
                  <span className="margin-left-auto text-[10px] text-muted-foreground">
                    {option.hint}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function TextSizeControl({
  contextLabel = "Se aplica en toda la plataforma y se guarda en este teléfono.",
}: {
  contextLabel?: string;
}) {
  const { scaleId, select } = useTextScale();

  return (
    <section
      aria-label="Tamaño de la letra"
      className="surface-raised w-full max-w-full min-w-0 overflow-x-clip rounded-3xl p-5"
    >
      <div className="flex min-w-0 flex-wrap items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <Eye className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold">
            Tamaño de la letra
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Elegí qué tan grande se ve el texto. {contextLabel}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 overflow-hidden">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Tamaño
        </span>
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
          {TEXT_SCALE_OPTIONS.map((option) => {
            const active = option.id === scaleId;
            return (
              <SizeSelector
                key={option.id}
                id={option.id}
                href=""
                label={option.label}
                picture={
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
                }
                hint={option.hint}
                active={active}
                onPick={() => select(option.id)}
              />
            );
          })}
        </div>
      </div>

      <div className="mt-4 w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-black/25 p-3.5">
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          <Eye className="size-3.5 shrink-0" />
          Vista previa
        </p>
        <p className="mt-1 leading-snug">
          Así se ve el texto con el tamaño elegido. Todo el contenido se mantiene
          dentro del ancho del celular, sin salirse por los lados.
        </p>
      </div>
    </section>
  );
}
