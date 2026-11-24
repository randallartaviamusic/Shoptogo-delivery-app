/** Modalidades de pedido: cómo recibe el comprador lo que compra. */
export type FulfillmentMethod = "dine_in" | "pickup" | "delivery" | "reservation";

export const FULFILLMENT_OPTIONS: Array<{
  value: FulfillmentMethod;
  label: string;
  hint: string;
  /** La modalidad usa repartidor y punto de entrega en el mapa. */
  needsDelivery: boolean;
  /** La modalidad exige fecha y hora exacta. */
  needsSchedule: boolean;
}> = [
  {
    value: "delivery",
    label: "Pedir para llevar",
    hint: "Un repartidor lo lleva a tu punto",
    needsDelivery: true,
    needsSchedule: false,
  },
  {
    value: "pickup",
    label: "Retirar en el local",
    hint: "Pasás a buscarlo, sin envío",
    needsDelivery: false,
    needsSchedule: false,
  },
  {
    value: "dine_in",
    label: "Comer en el local",
    hint: "Te lo sirven en la mesa",
    needsDelivery: false,
    needsSchedule: false,
  },
  {
    value: "reservation",
    label: "Reservar o cita",
    hint: "Elegí fecha y hora exacta",
    needsDelivery: false,
    needsSchedule: true,
  },
];

export const ALL_FULFILLMENT_METHODS: FulfillmentMethod[] = [
  "delivery",
  "pickup",
  "dine_in",
  "reservation",
];

/** Modalidades activas de un producto. Sin dato guardado: llevar + retirar +
 * comer en el local (+ reservación si reservable es true, por compatibilidad
 * con productos viejos). */
export function productFulfillmentMethods(product: {
  fulfillmentMethods?: FulfillmentMethod[] | null;
  reservable?: boolean | null;
}): FulfillmentMethod[] {
  const stored = (product.fulfillmentMethods ?? []).filter((value): value is FulfillmentMethod =>
    value === "delivery" || value === "pickup" || value === "dine_in" || value === "reservation",
  );
  if (stored.length > 0) return Array.from(new Set(stored));
  const base: FulfillmentMethod[] = ["delivery", "pickup", "dine_in"];
  if (product.reservable) base.push("reservation");
  return base;
}

/** Limpia las modalidades elegidas en el editor: únicas, válidas y al menos una. */
export function normalizeFulfillmentMethods(
  input: unknown,
  fallbackReservable = false,
): FulfillmentMethod[] {
  const list = Array.isArray(input) ? input : [];
  const clean = Array.from(
    new Set(list.filter((value): value is FulfillmentMethod =>
      value === "delivery" || value === "pickup" || value === "dine_in" || value === "reservation",
    )),
  );
  if (clean.length > 0) return clean;
  const base: FulfillmentMethod[] = ["delivery", "pickup", "dine_in"];
  if (fallbackReservable) base.push("reservation");
  return base;
}

export const FULFILLMENT_LABEL: Record<FulfillmentMethod, string> = {
  delivery: "Entrega a domicilio",
  pickup: "Retiro en el local",
  dine_in: "Comer en el local",
  reservation: "Reserva",
};

export function fulfillmentLabel(value: string | null | undefined): string {
  switch (value) {
    case "dine_in":
      return FULFILLMENT_LABEL.dine_in;
    case "pickup":
      return FULFILLMENT_LABEL.pickup;
    case "reservation":
      return FULFILLMENT_LABEL.reservation;
    default:
      return FULFILLMENT_LABEL.delivery;
  }
}

/** Texto corto para el aviso que recibe el local al entrar un pedido. */
export function fulfillmentNotice(
  fulfillment: string | null | undefined,
  address: string,
): string {
  switch (fulfillment) {
    case "dine_in":
      return "para comer en el local";
    case "pickup":
      return "para retirar en el local";
    case "reservation":
      return "con reserva de fecha y hora";
    default:
      return `Entrega en ${address}`;
  }
}
