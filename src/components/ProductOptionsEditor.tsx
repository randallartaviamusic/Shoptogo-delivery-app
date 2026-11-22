import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type {
  ProductOption,
  ProductOptionGroup,
} from "@/lib/productOptions";
import { Plus, SlidersHorizontal, Trash2 } from "lucide-react";

const MAX_GROUPS = 8;
const MAX_OPTIONS = 20;

function newId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

function newOption(): ProductOption {
  return { id: newId("op"), name: "", price: 0 };
}

function newGroup(index: number): ProductOptionGroup {
  return {
    id: newId("grupo"),
    name: `Grupo ${index + 1}`,
    kind: "single",
    required: true,
    options: [newOption()],
  };
}

const GROUP_PRESETS: Array<{
  label: string;
  name: string;
  kind: ProductOptionGroup["kind"];
  required: boolean;
}> = [
  { label: "Sabor o tipo", name: "Sabor", kind: "single", required: true },
  {
    label: "Acompañamientos",
    name: "Acompañamientos",
    kind: "multi",
    required: false,
  },
  {
    label: "Ingredientes",
    name: "Ingredientes",
    kind: "multi",
    required: false,
  },
  {
    label: "Elegir bebida",
    name: "Elegir bebida",
    kind: "single",
    required: true,
  },
];

/**
 * Opciones del producto: sabor/tipo (elige una), acompañamientos o
 * ingredientes (elige varios). Cada opción puede sumar un precio extra o ser
 * gratis.
 */
export function ProductOptionsEditor({
  groups,
  onChange,
}: {
  groups: ProductOptionGroup[];
  onChange: (groups: ProductOptionGroup[]) => void;
}) {
  const updateGroup = (
    groupId: string,
    patch: Partial<ProductOptionGroup>,
  ) => {
    onChange(
      groups.map((group) =>
        group.id === groupId ? { ...group, ...patch } : group,
      ),
    );
  };

  const addPreset = (preset: (typeof GROUP_PRESETS)[number]) => {
    onChange([
      ...groups,
      {
        id: newId("grupo"),
        name: preset.name,
        kind: preset.kind,
        required: preset.required,
        options: [newOption()],
      },
    ]);
  };

  const hasGroup = (name: string) =>
    groups.some(
      (group) => group.name.trim().toLowerCase() === name.toLowerCase(),
    );

  const updateOption = (
    groupId: string,
    optionId: string,
    patch: Partial<ProductOption>,
  ) => {
    onChange(
      groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              options: group.options.map((option) =>
                option.id === optionId ? { ...option, ...patch } : option,
              ),
            }
          : group,
      ),
    );
  };

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-black/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <SlidersHorizontal className="size-3.5" />
            Opciones para el comprador
          </p>
          <p className="mt-1 max-w-md text-[10px] leading-relaxed text-muted-foreground">
            Sabor, tipo o bebida: elige una. Acompañamientos o ingredientes:
            puede elegir varios. Si una opción cuesta más, escribí el extra; si
            es gratis, dejá 0.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1 border-border/80 text-[11px]"
          disabled={groups.length >= MAX_GROUPS}
          onClick={() => onChange([...groups, newGroup(groups.length)])}
        >
          <Plus className="size-3.5" /> Agregar grupo
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Atajos
        </span>
        {GROUP_PRESETS.map((preset) => (
          <Button
            key={preset.name}
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 border-border/80 px-2 text-[10px]"
            disabled={
              groups.length >= MAX_GROUPS || hasGroup(preset.name)
            }
            onClick={() => addPreset(preset)}
          >
            <Plus className="size-3" /> {preset.label}
          </Button>
        ))}
      </div>

      {groups.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center">
          <p className="text-xs font-semibold">Este producto no tiene opciones</p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            Agregá un grupo si querés que el comprador elija sabor,
            acompañamientos, ingredientes o una bebida.
          </p>
        </div>
      )}

      {groups.map((group, groupIndex) => (
        <div
          key={group.id}
          className="space-y-3 rounded-xl border border-border/70 bg-card/60 p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <Label htmlFor={`option-group-${group.id}`}>
                Grupo {groupIndex + 1}
              </Label>
              <Input
                id={`option-group-${group.id}`}
                value={group.name}
                maxLength={60}
                placeholder="Ej.: Sabor, Acompañamientos, Ingredientes"
                onChange={(event) =>
                  updateGroup(group.id, { name: event.target.value })
                }
              />
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Quitar ${group.name || "grupo"}`}
              className="mt-6 size-8 shrink-0 text-muted-foreground hover:text-primary"
              onClick={() =>
                onChange(groups.filter((entry) => entry.id !== group.id))
              }
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Forma de elegir</Label>
              <Select
                value={group.kind}
                onValueChange={(value) =>
                  updateGroup(group.id, {
                    kind: value === "multi" ? "multi" : "single",
                    required: value === "single" ? true : group.required,
                  })
                }
              >
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">
                    Elegir una (sabor o tipo)
                  </SelectItem>
                  <SelectItem value="multi">
                    Elegir varias (acompañamientos o ingredientes)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {group.kind === "multi" ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-black/20 px-3 py-2.5">
                <div>
                  <p className="text-xs font-medium">Obligatorio</p>
                  <p className="text-[10px] text-muted-foreground">
                    El comprador tiene que elegir al menos una.
                  </p>
                </div>
                <Switch
                  checked={group.required}
                  onCheckedChange={(checked) =>
                    updateGroup(group.id, { required: checked })
                  }
                  aria-label={`Hacer obligatorio ${group.name || "el grupo"}`}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-border/70 bg-black/20 px-3 py-2.5 text-[10px] leading-relaxed text-muted-foreground">
                El comprador siempre elige una opción de este grupo.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Opciones
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-[10px]"
                disabled={group.options.length >= MAX_OPTIONS}
                onClick={() =>
                  updateGroup(group.id, {
                    options: [...group.options, newOption()],
                  })
                }
              >
                <Plus className="size-3" /> Agregar opción
              </Button>
            </div>

            {group.options.map((option) => (
              <div key={option.id} className="space-y-1.5">
                <div className="grid grid-cols-[minmax(0,1fr)_92px_auto] items-end gap-2">
                  <div className="space-y-1">
                    <Label
                      htmlFor={`option-name-${option.id}`}
                      className="text-[10px]"
                    >
                      Nombre
                    </Label>
                    <Input
                      id={`option-name-${option.id}`}
                      value={option.name}
                      maxLength={60}
                      placeholder={
                        group.kind === "single"
                          ? "Ej.: BBQ, Picante, Clásico"
                          : "Ej.: Papas, ensalada, sin cebolla"
                      }
                      onChange={(event) =>
                        updateOption(group.id, option.id, {
                          name: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label
                      htmlFor={`option-price-${option.id}`}
                      className="text-[10px]"
                    >
                      Extra ₡
                    </Label>
                    <Input
                      id={`option-price-${option.id}`}
                      type="number"
                      min={0}
                      step={100}
                      inputMode="numeric"
                      value={option.price === 0 ? "" : option.price}
                      placeholder="0"
                      onChange={(event) =>
                        updateOption(group.id, option.id, {
                          price: Math.max(
                            0,
                            Math.round(Number(event.target.value) || 0),
                          ),
                        })
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Quitar ${option.name || "opción"}`}
                    className="size-8 text-muted-foreground hover:text-primary"
                    disabled={group.options.length <= 1}
                    onClick={() =>
                      updateGroup(group.id, {
                        options: group.options.filter(
                          (entry) => entry.id !== option.id,
                        ),
                      })
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                {group.kind === "multi" && (
                  <label className="flex cursor-pointer items-center gap-2 text-[10px] text-muted-foreground">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-[var(--accent)]"
                      checked={Boolean(option.defaultSelected)}
                      onChange={(event) =>
                        updateOption(group.id, option.id, {
                          defaultSelected: event.target.checked,
                        })
                      }
                    />
                    Viene marcada por defecto (por ejemplo, un ingrediente que
                    el comprador puede quitar).
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
