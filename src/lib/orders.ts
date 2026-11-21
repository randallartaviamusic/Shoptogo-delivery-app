import type { CashIssueKind, OrderStatus } from "../convex/schema";

/**
 * Reglas puras del ciclo de un pedido: efectivo, cancelaciones y el resumen de
 * un checkout repetido. Viven fuera de Convex para poder probarlas sin base de
 * datos: son las que deciden cuánto dinero se espera y qué se puede cancelar.
 */

/**
 * Lo que el local recibe en efectivo por sus productos (sin el envío). El
 * cupón que ofrece el propio local se descuenta de su liquidación: lo paga él,
 * igual que la promoción de envío.
 */
export function businessDue(order: {
  subtotal: number;
  deliveryDiscount?: number | null;
  couponDiscount?: number | null;
}) {
  return (
    order.subtotal -
    (order.deliveryDiscount ?? 0) -
    (order.couponDiscount ?? 0)
  );
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
 * Una fila de efectivo del día: es una orden (una tienda dentro de una
 * entrega). Una entrega con varias tiendas deja varias filas con el mismo
 * `tripKey`, y sólo la líder guarda el efectivo cobrado al comprador.
 */
export type CashDayRow = {
  tripKey: string;
  businessId: string;
  businessName: string;
  /** Total de esta tienda dentro de la entrega (productos + su parte del envío). */
  total: number;
  subtotal: number;
  deliveryDiscount?: number | null;
  deliveryFee: number;
  extraStopFee?: number | null;
  /** Efectivo que el local confirmó haber recibido. */
  cashHanded?: number | null;
  /** Efectivo confirmado por el repartidor al entregar (sólo en la líder). */
  cashCollected?: number | null;
  isLeader: boolean;
  /** El comprador pagó directo al local por SINPE: no hay efectivo. */
  paidBySinpe?: boolean;
};

export type CashBusinessLine = {
  businessId: string;
  name: string;
  orders: number;
  due: number;
  handed: number;
  pending: number;
};

export type CashDaySummary = {
  /** Órdenes (una por tienda) entregadas en el día. */
  orders: number;
  /** Entregas físicas: varias tiendas del mismo viaje cuentan una sola vez. */
  deliveries: number;
  /** Lo que el repartidor debía cobrar a los compradores. */
  expectedToCollect: number;
  /** Lo que confirmó haber cobrado. */
  collected: number;
  /** Cobrado − esperado: negativo es faltante, positivo es sobrante. */
  collectionDifference: number;
  /** Envíos ganados en el día. */
  earnings: number;
  dueToBusinesses: number;
  handedToBusinesses: number;
  /** Lo que todavía debe a los locales. */
  pendingToBusinesses: number;
  /** Lo que entregó de más a algún local (se muestra aparte, no se compensa). */
  overpaidToBusinesses: number;
  businesses: CashBusinessLine[];
};

/**
 * Cuenta el efectivo de un día para un repartidor: cobrado, entregado a cada
 * local y pendiente. Los sobrantes de un local no tapan los faltantes de otro:
 * se informan por separado para que la conciliación sea honesta.
 */
export function summarizeCashDay(rows: CashDayRow[]): CashDaySummary {
  const byBusiness = new Map<string, CashBusinessLine>();
  const trips = new Set<string>();
  let expectedToCollect = 0;
  let collected = 0;
  let earnings = 0;
  let pendingToBusinesses = 0;
  let overpaidToBusinesses = 0;

  for (const row of rows) {
    trips.add(row.tripKey);
    // La ganancia del envío se cuenta aunque el comprador haya pagado por
    // SINPE: el repartidor hizo la entrega igual. La conciliación de efectivo
    // y lo que se le debe a los locales sí excluye esos pedidos.
    earnings += row.deliveryFee + (row.extraStopFee ?? 0);
    if (row.paidBySinpe) continue;
    expectedToCollect += row.total;
    if (row.isLeader) collected += row.cashCollected ?? 0;

    const due = businessDue(row);
    const handed = row.cashHanded ?? 0;
    const pending = due - handed;
    if (pending > 0) pendingToBusinesses += pending;
    else overpaidToBusinesses += -pending;

    const line = byBusiness.get(row.businessId) ?? {
      businessId: row.businessId,
      name: row.businessName,
      orders: 0,
      due: 0,
      handed: 0,
      pending: 0,
    };
    line.orders += 1;
    line.due += due;
    line.handed += handed;
    line.pending += pending;
    byBusiness.set(row.businessId, line);
  }

  const businesses = Array.from(byBusiness.values()).sort(
    (a, b) => a.name.localeCompare(b.name) || a.businessId.localeCompare(b.businessId),
  );

  return {
    orders: rows.length,
    deliveries: trips.size,
    expectedToCollect,
    collected,
    collectionDifference: collected - expectedToCollect,
    earnings,
    dueToBusinesses: businesses.reduce((acc, line) => acc + line.due, 0),
    handedToBusinesses: businesses.reduce((acc, line) => acc + line.handed, 0),
    pendingToBusinesses,
    overpaidToBusinesses,
    businesses,
  };
}

/** Huella del cierre: si los montos firmados cambian, la huella no coincide. */
export function cashClosureSignature(input: {
  courierId: string;
  day: string;
  signedName: string;
  summary: CashDaySummary;
  carryOverPending: number;
}): string {
  const { summary } = input;
  const canonical = [
    input.courierId,
    input.day,
    normalizeName(input.signedName),
    summary.orders,
    summary.deliveries,
    summary.expectedToCollect,
    summary.collected,
    summary.collectionDifference,
    summary.earnings,
    summary.dueToBusinesses,
    summary.handedToBusinesses,
    summary.pendingToBusinesses,
    summary.overpaidToBusinesses,
    input.carryOverPending,
    summary.businesses
      .map(
        (line) =>
          `${line.businessId}:${line.orders}:${line.due}:${line.handed}:${line.pending}`,
      )
      .join("|"),
  ].join(";");

  // FNV-1a de 32 bits: suficiente para detectar un cambio en lo firmado.
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/** La firma debe ser el nombre de la cuenta, no una inicial ni un alias. */
export function signatureNameMatches(
  accountName: string | null | undefined,
  typed: string,
) {
  if (!accountName || normalizeName(accountName).length < 3) return false;
  return normalizeName(accountName) === normalizeName(typed);
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

/** Costa Rica es UTC−6 todo el año: no hay horario de verano. */
export const COSTA_RICA_OFFSET_MS = 6 * 60 * 60 * 1000;

/** Día civil de Costa Rica de un momento dado, como `2026-11-13`. */
export function costaRicaDayKey(timestamp = Date.now()) {
  return new Date(timestamp - COSTA_RICA_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Rango [inicio, fin) del día civil de Costa Rica. Devuelve null si el día no
 * tiene el formato esperado.
 */
export function costaRicaDayRange(day?: string) {
  const key = day ?? costaRicaDayKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const start = Date.parse(`${key}T06:00:00.000Z`);
  if (!Number.isFinite(start)) return null;
  return { day: key, start, end: start + 86_400_000 };
}

/** Corre un día civil de Costa Rica hacia adelante o hacia atrás. */
export function shiftCostaRicaDay(day: string, days: number) {
  const range = costaRicaDayRange(day);
  if (!range) return day;
  return costaRicaDayKey(range.start + days * 86_400_000);
}
