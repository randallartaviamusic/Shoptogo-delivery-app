import { promoBadge } from "@/lib/promo";
import type { PromoKind } from "@/lib/promo";
import { cn } from "@/lib/utils";
import { TicketPercent } from "lucide-react";

/**
 * Etiqueta que se pega sobre la imagen del producto cuando su local está
 * financiando parte del envío. La promoción es de la tienda completa.
 */
export function PromoBadge({
  promo,
  className,
  withIcon = true,
}: {
  promo?: PromoKind | null;
  className?: string;
  withIcon?: boolean;
}) {
  if (!promo) return null;
  return (
    <span
      className={cn(
        "sheen-tag inline-flex items-center gap-1 rounded-full bg-ember-gradient px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-black shadow-[0_6px_16px_-6px_rgba(0,0,0,0.9)]",
        className,
      )}
    >
      {withIcon && <TicketPercent className="size-3" />}
      {promoBadge(promo)}
    </span>
  );
}
