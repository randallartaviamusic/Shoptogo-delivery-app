import {
  TEXT_SCALE_OPTIONS,
  TITLE_SCALE_OPTIONS,
  useTextScale,
  type TextScaleId,
} from "@/lib/textSize";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, Heading, Type } from "lucide-react";

export function TextSizeControl({
  contextLabel = "Se aplica en toda la plataforma y se guarda en este teléfono.",
}: {
  contextLabel?: string;
}) {
  const { scaleId, titleScaleId, select, selectTitle } = useTextScale();

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
          <h2 className="font-display text-lg font-bold">Tamaño de la letra</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Elegí el tamaño del texto y de los títulos por separado.{" "}
            {contextLabel}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label
            htmlFor="text-size-select"
            className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            <Type className="size-3.5 shrink-0" />
            Texto general
          </label>
          <Select
            value={scaleId}
            onValueChange={(value) => select(value as TextScaleId)}
          >
            <SelectTrigger
              id="text-size-select"
              className="mt-1.5 h-11 w-full rounded-xl border-border/80 bg-black/30 px-3 text-sm"
            >
              <SelectValue placeholder="Elegí el tamaño">
                {TEXT_SCALE_OPTIONS.find((option) => option.id === scaleId)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="border-border/70 bg-[#111113]">
              {TEXT_SCALE_OPTIONS.map((option) => (
                <SelectItem key={option.id} value={option.id} className="text-sm">
                  <span>{option.label}</span>
                  <span className="ml-auto pl-3 text-[10px] text-muted-foreground">
                    {option.hint}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0">
          <label
            htmlFor="title-size-select"
            className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            <Heading className="size-3.5 shrink-0" />
            Títulos
          </label>
          <Select
            value={titleScaleId}
            onValueChange={(value) => selectTitle(value as TextScaleId)}
          >
            <SelectTrigger
              id="title-size-select"
              className="mt-1.5 h-11 w-full rounded-xl border-border/80 bg-black/30 px-3 text-sm"
            >
              <SelectValue placeholder="Elegí el tamaño">
                {
                  TITLE_SCALE_OPTIONS.find(
                    (option) => option.id === titleScaleId
                  )?.label
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="border-border/70 bg-[#111113]">
              {TITLE_SCALE_OPTIONS.map((option) => (
                <SelectItem key={option.id} value={option.id} className="text-sm">
                  <span>{option.label}</span>
                  <span className="ml-auto pl-3 text-[10px] text-muted-foreground">
                    {option.hint}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-black/25 p-3.5">
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          <Eye className="size-3.5 shrink-0" />
          Vista previa
        </p>
        <p className="mt-2 font-display text-xl font-extrabold leading-tight">
          Título de ejemplo
        </p>
        <p className="mt-1 text-sm leading-snug text-muted-foreground">
          Así se ve el texto con los tamaños elegidos. Todo el contenido se
          mantiene dentro del ancho del celular, sin salirse por los lados.
        </p>
      </div>
    </section>
  );
}
