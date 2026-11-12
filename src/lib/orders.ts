import type { CashIssueKind, OrderStatus } from "../convex/schema";

/**
 * Reglas puras del ciclo de un pedido: efectivo, cancelaciones y el resumen de
 * un checkout repetido. Viven fuera de Convex para poder probarlas sin base de
 * datos: son las que deciden cuánto dinero se espera y qué se puede cancelar.
 */

/** Lo que el local recibe en efectivo por sus productos (sin el envío). */
export function businessDue(order: {
  subtotal: number;
  deliveryDiscount?: number | null;
}) {
  return order.subtotal - (order.deliveryDiscount ?? 0);
}

export type CashIssueDraft = { kind: CashIssueKind; amount: number };

/**
 * Diferencia del repartidor contra el comprador: si cobró menos es un faltante
 * y si cobró de más queda como reclamo para devolverlo.
 */
export function courierCashIssue(difference: number): CashIssueDraft | null {
  if (!Number.isFinite(difference) || difference === 0) return null;
  return {
    kind: difference < 0 ? "shortfall" : "claim",
    amount: Math.abs(Math.round(difference)),
  };
}

/**
 * Diferencia del repartidor contra el local: si entregó menos es un pago
 * incompleto y si entregó de más queda como reclamo.
 */
export function businessCashIssue(difference: number): CashIssueDraft | null {
  if (!Number.isFinite(difference) || difference === 0) return null;
  return {
    kind: difference < 0 ? "incomplete" : "claim",
    amount: Math.abs(Math.round(difference)),
  };
}

export type TripOrderState = {
  _id: string;
  buyerId: string;
  status: OrderStatus;
  courierId?: string | null;
};

/**
 * Paradas de una entrega que el vencimiento automático puede cancelar.
 *
 * Devuelve una lista vacía (nada se toca) si alguna parada ya tiene repartidor
 * o salió del local: cancelar el resto dejaría un viaje a medias y al cliente
 * sin una parte de lo que ya está en camino.
 */
export function autoCancelTargets(trip: TripOrderState[]): string[] {
  if (trip.length === 0) return [];
  const inTransit = trip.some(
    (member) =>
      member.courierId ||
      member.status === "picked_up" ||
      member.status === "delivered",
  );
  if (inTransit) return [];
  return trip
    .filter((member) => member.status === "ready")
    .map((member) => member._id);
}

/**
 * Motivo por el que el comprador no puede cancelar su compra, o null si puede.
 * La compra se cancela completa: nunca se deja una entrega hermana huérfana.
 */
export function buyerCancelBlocker(
  trip: TripOrderState[],
  buyerId: string,
): string | null {
  if (trip.length === 0) {
    return "Esta entrega ya no existe; actualizá la página e intentá de nuevo";
  }
  for (const member of trip) {
    if (member.buyerId !== buyerId) {
      return "La entrega agrupada no pertenece a la misma compra";
    }
    if (member.status === "picked_up") {
      return "Una parte ya fue retirada; abrí un caso en Ayuda para resolver la compra";
    }
    if (member.status !== "pending" || member.courierId) {
      return "El local ya confirmó una parte; abrí un caso en Ayuda para resolver la compra";
    }
  }
  return null;
}

/**
 * Resumen de un checkout ya registrado. Se usa al repetir una solicitud con la
 * misma clave: el resultado debe ser idéntico al original, así que las entregas
 * se cuentan por lote (`batchIndex`) y no sólo por filas.
 */
export function checkoutSummary(
  orders: Array<{ batchIndex?: number | null; total: number }>,
) {
  const batches = new Set(orders.map((order) => order.batchIndex ?? 1));
  return {
    created: batches.size,
    orders: orders.length,
    total: orders.reduce((acc, order) => acc + order.total, 0),
  };
}
