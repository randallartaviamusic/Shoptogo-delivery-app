/**
 * Promociones de envío que financia el local desde los ajustes de su tienda.
 *
 * El envío se cobra una sola vez por entrega, nunca por producto ni por
 * tienda. Si el local tiene una promo activa cubre la parte del envío que le
 * corresponde a su tienda en esa entrega (100% o 50%) y el cliente paga el
 * resto. Ese monto es un gasto promocional del local, no una comisión de la
 * plataforma: el local recibe siempre el 100% del valor de sus productos.
 */
export type PromoKind = "free_delivery" | "half_delivery";

/** `null` = el local no ofrece promoción de envío. */
export type DeliveryPromo = PromoKind | null;

export const PROMO_OPTIONS: Array<{
  kind: DeliveryPromo;
  label: string;
  detail: string;
}> = [
  {
    kind: null,
    label: "Sin promoción de envío",
    detail: "El cliente paga el envío completo de cada entrega.",
  },
  {
    kind: "free_delivery",
    label: "Envío sin costo",
    detail: "Vos cubrís el 100% de la parte de tu tienda en cada entrega.",
  },
  {
    kind: "half_delivery",
    label: "Promoción de envío al 50%",
    detail: "Vos cubrís la mitad de la parte de tu tienda en cada entrega.",
  },
];

export function promoBadge(kind: PromoKind) {
  return kind === "free_delivery" ? "Envío gratis" : "Envío 50%";
}

export function promoLabel(promo?: DeliveryPromo) {
  return promo ? promoBadge(promo) : "Sin promoción de envío";
}

/** Monto del envío que absorbe el local. */
export function promoDiscount(fee: number, kind: PromoKind) {
  return kind === "free_delivery" ? fee : Math.round(fee / 2);
}
