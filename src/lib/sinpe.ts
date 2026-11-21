import { money } from "./format";
import { displayPhone, normalizePhone } from "./notify";

/**
 * Cobro directo por SINPE Móvil. El comprador que no paga en efectivo
 * transfiere a cada tienda el total de su pedido (productos + su parte del
 * envío) y manda la captura por WhatsApp al número del local.
 */

/** Acepta 8888-1234, 88881234 y +506 8888 1234. Devuelve 8 dígitos. */
export function normalizeSinpeNumber(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 8) return digits;
  if (digits.length === 11 && digits.startsWith("506")) return digits.slice(3);
  return null;
}

/** Número de SINPE listo para mostrar: 8888-1234. */
export function formatSinpeNumber(raw: string | null | undefined) {
  const value = normalizeSinpeNumber(raw);
  return value ? `${value.slice(0, 4)}-${value.slice(4)}` : null;
}

/** Enlace de WhatsApp con un mensaje ya escrito, desde el teléfono del comprador. */
export function sinpeWhatsappHref(
  number: string | null | undefined,
  message: string,
) {
  const normalized = normalizePhone(number);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

/**
 * Mensaje específico del pago. Se abre desde el WhatsApp del comprador hacia
 * el número del local; la captura queda adjunta al pedido y su enlace va en
 * el texto para que el local la revise incluso antes de recibir el chat.
 */
export function sinpePaymentMessage(input: {
  businessName: string;
  orderCode: string;
  amount: number;
  buyerName?: string | null;
  buyerPhone?: string | null;
  receiptUrl?: string | null;
}) {
  const buyer = input.buyerName?.trim() || "un cliente de Shop To Go";
  const buyerPhone = displayPhone(input.buyerPhone);
  return [
    `Hola, soy ${buyer}.`,
    `Hice el pago por SINPE Móvil del pedido ${input.orderCode} de ${input.businessName}.`,
    `Monto transferido: ${money(input.amount)} (productos más el envío de mi pedido).`,
    buyerPhone ? `Mi número de WhatsApp es ${buyerPhone}.` : null,
    input.receiptUrl
      ? `Captura del comprobante: ${input.receiptUrl}`
      : "Adjunto la captura del comprobante en este chat.",
    "Por favor confirmame la recepción del pago.",
  ]
    .filter(Boolean)
    .join("\n");
}
