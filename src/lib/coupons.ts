/**
 * Cupones de los locales. El descuento lo paga el negocio que lo crea: baja del
 * valor de sus productos, nunca del envío ni de la comisión de la plataforma.
 * Las reglas viven acá para usarlas igual en la vista previa del carrito, en el
 * checkout y en los tests.
 */

export const COUPON_RULES = {
  /** Porcentaje máximo que un local puede descontar. */
  maxPercent: 50,
  /** Descuento fijo máximo por pedido, en colones. */
  maxAmount: 25_000,
  /** Largo del código: de 3 a 16 letras, números o guiones. */
  minCodeLength: 3,
  maxCodeLength: 16,
} as const;

export type CouponKind = "percent" | "amount";

export type CouponLike = {
  kind: CouponKind;
  value: number;
  minSubtotal: number;
  maxDiscount?: number | null;
  active: boolean;
  expiresAt?: number | null;
  maxRedemptions?: number | null;
  redemptions: number;
};

export function normalizeCouponCode(value?: string | null) {
  return (value ?? "").trim().toUpperCase();
}

/** Valida el código al crearlo: sin espacios, sin signos raros. */
export function couponCodeError(code: string) {
  const normalized = normalizeCouponCode(code);
  if (normalized.length < COUPON_RULES.minCodeLength) {
    return `El código necesita al menos ${COUPON_RULES.minCodeLength} caracteres`;
  }
  if (normalized.length > COUPON_RULES.maxCodeLength) {
    return `El código no puede pasar de ${COUPON_RULES.maxCodeLength} caracteres`;
  }
  if (!/^[A-Z0-9-]+$/.test(normalized)) {
    return "Usá sólo letras, números y guiones";
  }
  return null;
}

/** Motivo por el que el cupón no aplica, o null si aplica. */
export function couponBlocker(
  coupon: CouponLike,
  subtotal: number,
  now = Date.now(),
): string | null {
  if (!coupon.active) return "Ese cupón está desactivado";
  if (coupon.expiresAt && coupon.expiresAt <= now) {
    return "Ese cupón ya venció";
  }
  if (
    coupon.maxRedemptions !== null &&
    coupon.maxRedemptions !== undefined &&
    coupon.redemptions >= coupon.maxRedemptions
  ) {
    return "Ese cupón ya alcanzó su límite de usos";
  }
  if (subtotal < coupon.minSubtotal) {
    return `El cupón aplica desde ₡${coupon.minSubtotal.toLocaleString("es-CR")} en productos`;
  }
  return null;
}

/**
 * Descuento real del cupón. Nunca supera el subtotal, ni el tope configurado,
 * ni el máximo permitido por las reglas de la plataforma.
 */
export function couponDiscount(coupon: CouponLike, subtotal: number) {
  if (subtotal <= 0) return 0;
  if (couponBlocker(coupon, subtotal)) return 0;
  let discount = 0;
  if (coupon.kind === "percent") {
    const percent = Math.min(COUPON_RULES.maxPercent, Math.max(0, coupon.value));
    discount = Math.round((subtotal * percent) / 100);
    if (coupon.maxDiscount) {
      discount = Math.min(discount, Math.max(0, coupon.maxDiscount));
    }
  } else {
    discount = Math.min(
      COUPON_RULES.maxAmount,
      Math.max(0, Math.round(coupon.value)),
    );
  }
  return Math.min(subtotal, discount);
}
