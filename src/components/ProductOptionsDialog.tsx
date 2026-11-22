import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { money } from "@/lib/format";
import {
  defaultChoices,
  toggleChoice,
  validateChoices,
  type ProductOptionChoice,
  type ProductOptionGroup,
} from "@/lib/productOptions";
import { Check, Loader2, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";

export type ProductWithOptions = {
  _id: string;
  name: string;
  description?: string;
  price: number;
  image?: string;
  optionGroups?: ProductOptionGroup[] | null;
};

/**
 * El comprador arma su variante: un sabor, varios acompañamientos o los
 * ingredientes que quiere. El precio se actualiza con cada extra.
 */
export function ProductOptionsDialog({
  open,
  onOpenChange,
  product,
  busy = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductWithOptions | null;
  busy?: boolean;
  onConfirm: (choices: ProductOptionChoice[]) => void;
}) {
  const groups = product?.optionGroups ?? [];
  const [choices, setChoices] = useState<ProductOptionChoice[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setChoices(defaultChoices(groups));
    setError(null);
  }, [open, product?._id]);

  const validation = validateChoices(groups, choices);
  const extra = validation.ok
    ? validation.extra
    : choices.reduce((sum, choice) => {
        const option = groups
          .find((group) => group.id === choice.groupId)
          ?.options.find((entry) => entry.id === choice.optionId);
        return sum + (option?.price ?? 0);
      }, 0);
  const total = (product?.price ?? 0) + extra;

  const handleConfirm = () => {
    const next = validateChoices(groups, choices);
    if (!next.ok) {
      setError(next.error);
      return;
    }
    setError(null);
    onConfirm(next.choices);
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto border-border/80 bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">{product.name}</DialogTitle>
          <DialogDescription>
            {product.description || "Elegí cómo querés este producto."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-black/20 px-3 py-2.5">
          <span className="text-xs text-muted-foreground">Precio base</span>
          <span className="font-display text-base font-bold">
            {money(product.price)}
          </span>
        </div>

        <div className="space-y-4">
          {groups.map((group) => {
            const selectedIds = new Set(
              choices
                .filter((choice) => choice.groupId === group.id)
                .map((choice) => choice.optionId),
            );
            return (
              <section key={group.id} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold">{group.name}</p>
                  <span className="text-[10px] text-muted-foreground">
                    {group.kind === "single"
                      ? "Elegí una"
                      : group.required
                        ? "Elegí al menos una"
                        : "Opcional"}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.options.map((option) => {
                    const active = selectedIds.has(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setError(null);
                          setChoices((current) =>
                            toggleChoice(
                              groups,
                              current,
                              group.id,
                              option.id,
                            ),
                          );
                        }}
                        className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                          active
                            ? "border-accent/60 bg-accent/10"
                            : "border-border/70 hover:border-accent/30"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className={`flex size-4 shrink-0 items-center justify-center border ${
                              group.kind === "single"
                                ? "rounded-full"
                                : "rounded"
                            } ${
                              active
                                ? "border-accent bg-accent text-accent-foreground"
                                : "border-border"
                            }`}
                          >
                            {active && <Check className="size-3" />}
                          </span>
                          <span className="truncate">{option.name}</span>
                        </span>
                        {option.price > 0 && (
                          <span className="shrink-0 font-semibold text-accent">
                            +{money(option.price)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {error && (
          <p className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[11px] text-primary">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="gap-2 bg-ember-gradient text-black"
            disabled={busy}
            onClick={handleConfirm}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShoppingCart className="size-4" />
            )}
            Agregar · {money(total)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

