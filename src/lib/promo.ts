/**
 * Promociones de envío que un local financia en sus productos: el cliente paga
 * el envío gratis o al 50% y el local cubre la diferencia.
 */
export type PromoKind = "free_delivery" | "half_delivery";

export type ProductPromo = {
  kind: PromoKind;
  /** Momento en que la promo deja de aplicarse. */
  endsAt: number;
};

export const PROMO_OPTIONS: Array<{
  kind: PromoKind;
  label: string;
  detail: string;
}> = [
  {
    kind: "free_delivery",
    label: "Envío express gratis",
    detail: "Vos pagás el 100% del envío de esos pedidos.",
  },
  {
    kind: "half_delivery",
    label: "Envío express al 50%",
    detail: "Vos pagás la mitad del envío de esos pedidos.",
  },
];

export const PROMO_DAYS = [1, 2, 3, 5, 7];

export function promoBadge(kind: PromoKind) {
  return kind === "free_delivery" ? "Envío gratis" : "Envío 50%";
}

export function isPromoActive(
  promo?: { endsAt: number } | null,
  now = Date.now(),
) {
  return Boolean(promo && promo.endsAt > now);
}

/** Monto del envío que absorbe el local. */
export function promoDiscount(fee: number, kind: PromoKind) {
  return kind === "free_delivery" ? fee : Math.round(fee / 2);
}

/** La mejor promo entre varias: gratis gana a 50%. */
export function bestPromoKind(kinds: PromoKind[]): PromoKind | null {
  if (kinds.includes("free_delivery")) return "free_delivery";
  return kinds[0] ?? null;
}

export function promoDaysLeft(endsAt: number, now = Date.now()) {
  return Math.max(1, Math.ceil((endsAt - now) / 86_400_000));
}
