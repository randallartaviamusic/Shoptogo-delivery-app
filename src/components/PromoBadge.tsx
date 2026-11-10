import { promoBadge, promoDaysLeft } from "@/lib/promo";
import type { ProductPromo } from "@/lib/promo";
import { cn } from "@/lib/utils";
import { TicketPercent } from "lucide-react";

function activePromoOf(promo?: ProductPromo | null) {
  return promo && promo.endsAt > Date.now() ? promo : null;
}

/**
 * Etiqueta que se pega sobre la imagen del producto cuando el local está
 * financiando el envío.
 */
export function PromoBadge({
  promo,
  className,
  withIcon = true,
}: {
  promo?: ProductPromo | null;
  className?: string;
  withIcon?: boolean;
}) {
  const active = activePromoOf(promo);
  if (!active) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-ember-gradient px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-black shadow-[0_6px_16px_-6px_rgba(0,0,0,0.9)]",
        className,
      )}
    >
      {withIcon && <TicketPercent className="size-3" />}
      {promoBadge(active.kind)}
    </span>
  );
}

/** Texto con cuántos días le quedan a la promo (para el panel del local). */
export function PromoStatus({
  promo,
  className,
}: {
  promo?: ProductPromo | null;
  className?: string;
}) {
  const active = activePromoOf(promo);
  if (!active) return null;
  const days = promoDaysLeft(active.endsAt);
  return (
    <p className={cn("text-[11px] font-semibold text-accent", className)}>
      {promoBadge(active.kind)} · queda{days === 1 ? "" : "n"} {days} día
      {days === 1 ? "" : "s"}
    </p>
  );
}
