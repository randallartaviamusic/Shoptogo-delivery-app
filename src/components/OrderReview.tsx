import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Star, Store, Bike } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function StarPicker({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`${label}: ${star} ${star === 1 ? "estrella" : "estrellas"}`}
          onClick={() => onChange(star)}
          className="rounded-md p-0.5 transition-transform hover:scale-110"
        >
          <Star
            className={cn(
              "size-5",
              star <= value
                ? "fill-accent text-accent"
                : "text-muted-foreground/50",
            )}
          />
        </button>
      ))}
    </div>
  );
}

/** Calificación separada del negocio y del repartidor, una vez por pedido. */
export function OrderReview({
  orderId,
  businessName,
  courierName,
}: {
  orderId: string;
  businessName: string;
  courierName: string | null;
}) {
  const existing = useQuery(api.reviews.forOrder, {
    orderId: orderId as Id<"orders">,
  });
  const submit = useMutation(api.reviews.submit);
  const [businessRating, setBusinessRating] = useState(0);
  const [courierRating, setCourierRating] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  if (existing === undefined) {
    return (
      <div className="flex h-16 items-center justify-center rounded-2xl border border-border/70">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (existing) {
    return (
      <div className="rounded-2xl border border-accent/25 bg-accent/[0.05] p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
          <Star className="size-3.5 fill-current" /> Ya calificaste este pedido
        </p>
        <div className="mt-2 grid gap-1.5 text-[11px] sm:grid-cols-2">
          <p className="flex items-center gap-1.5">
            <Store className="size-3.5 text-muted-foreground" />
            {businessName}: {existing.businessRating}/5
          </p>
          {existing.courierRating !== null && (
            <p className="flex items-center gap-1.5">
              <Bike className="size-3.5 text-muted-foreground" />
              {courierName ?? "Repartidor"}: {existing.courierRating}/5
            </p>
          )}
        </div>
        {existing.comment && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            “{existing.comment}”
          </p>
        )}
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!businessRating) {
      toast.error("Elegí una calificación para el negocio");
      return;
    }
    if (courierName && !courierRating) {
      toast.error("Calificá también al repartidor");
      return;
    }
    setSaving(true);
    try {
      await submit({
        orderId: orderId as Id<"orders">,
        businessRating,
        courierRating: courierName ? courierRating : undefined,
        comment: comment.trim() || undefined,
      });
      toast.success("Gracias por calificar", {
        description:
          "Tu opinión queda separada por negocio y repartidor para mejorar el servicio.",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos guardar tu opinión",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/70 bg-black/20 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
        <Star className="size-3.5" /> Calificá tu pedido
      </p>
      <div className="mt-2 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[11px] font-medium">
            <Store className="size-3.5 text-muted-foreground" /> {businessName}
          </p>
          <StarPicker
            value={businessRating}
            onChange={setBusinessRating}
            label={`Calificación para ${businessName}`}
          />
        </div>
        {courierName && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] font-medium">
              <Bike className="size-3.5 text-muted-foreground" /> {courierName}
            </p>
            <StarPicker
              value={courierRating}
              onChange={setCourierRating}
              label={`Calificación para ${courierName}`}
            />
          </div>
        )}
        <Textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={500}
          placeholder="Contá brevemente cómo fue la preparación y la entrega (opcional)."
          className="min-h-16 resize-none text-xs"
        />
        <Button
          size="sm"
          className="w-full gap-1.5 bg-ember-gradient text-black"
          disabled={saving}
          onClick={() => void handleSubmit()}
        >
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Star className="size-3.5" />
          )}
          Enviar calificación
        </Button>
      </div>
    </div>
  );
}
