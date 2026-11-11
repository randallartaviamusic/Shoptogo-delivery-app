/**
 * Reglas de reparto de Capricho Express.
 *
 * La plataforma fija el precio del envío: los negocios no lo eligen. Se calcula
 * con la distancia real entre el local y el punto de entrega del cliente, que
 * ambos marcan en el mapa.
 *
 * Por ahora la operación está abierta solo en Tilarán, Guanacaste.
 */
export type GeoPoint = { lat: number; lng: number };

/** Centro de Tilarán, Guanacaste (plaza / parque central). */
export const TILARAN_CENTER: GeoPoint = { lat: 10.47093, lng: -84.96745 };

export const DELIVERY_RULES = {
  /** ₡1.000 cubre los primeros 2 km de recorrido del repartidor. */
  baseFee: 1000,
  baseKm: 2,
  /** ₡350 por cada km adicional (o fracción). */
  perKm: 350,
  /** Radio máximo de entrega desde el local, en km de recorrido. */
  maxKm: 12,
  /** Minutos de manejo por km recorrido. */
  minutesPerKm: 4,
  /** Minutos fijos de búsqueda y entrega. */
  fixedMinutes: 5,
  /** Radio donde aceptamos locales nuevos: cantón de Tilarán. */
  businessAreaKm: 15,
  /** Las calles de un pueblo suman ~25% sobre la distancia en línea recta. */
  roadFactor: 1.25,
} as const;

/**
 * Un repartidor no lleva más de 3 unidades de producto en una entrega. Si la
 * compra es más grande, se parte en entregas consecutivas y cada una paga su
 * propio envío.
 */
export const MAX_UNITS_PER_DELIVERY = 3;

/**
 * Parte una lista de productos en entregas de hasta 3 unidades, respetando el
 * orden en que el cliente armó el carrito.
 */
export function splitIntoDeliveries<T extends { quantity: number }>(
  items: T[],
): T[][] {
  const deliveries: T[][] = [];
  let current: T[] = [];
  let units = 0;

  for (const item of items) {
    let remaining = Math.max(0, item.quantity);
    while (remaining > 0) {
      if (units === MAX_UNITS_PER_DELIVERY) {
        deliveries.push(current);
        current = [];
        units = 0;
      }
      const take = Math.min(MAX_UNITS_PER_DELIVERY - units, remaining);
      current.push({ ...item, quantity: take });
      units += take;
      remaining -= take;
    }
  }

  if (current.length > 0) deliveries.push(current);
  return deliveries;
}

export type DeliveryQuote = {
  /** Distancia de recorrido estimada, ya con el factor de calles. */
  distanceKm: number;
  fee: number;
  minutes: number;
};

export function isValidPoint(point?: GeoPoint | null): point is GeoPoint {
  return (
    !!point &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  );
}

/** Distancia en línea recta entre dos puntos, en kilómetros. */
export function straightLineKm(from: GeoPoint, to: GeoPoint) {
  const earthRadiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Distancia de recorrido estimada entre el local y el punto de entrega. */
export function travelKm(from: GeoPoint, to: GeoPoint) {
  return straightLineKm(from, to) * DELIVERY_RULES.roadFactor;
}

/**
 * Tarifa de envío para un pedido. Devuelve null si el punto de entrega queda
 * fuera del radio de cobertura.
 */
export function deliveryQuote(
  business: GeoPoint | undefined | null,
  dropoff: GeoPoint | undefined | null,
): DeliveryQuote | null {
  if (!isValidPoint(business) || !isValidPoint(dropoff)) return null;
  const distanceKm = travelKm(business, dropoff);
  if (distanceKm > DELIVERY_RULES.maxKm) return null;

  const extraKm = Math.ceil(Math.max(0, distanceKm - DELIVERY_RULES.baseKm));
  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    fee: DELIVERY_RULES.baseFee + extraKm * DELIVERY_RULES.perKm,
    minutes: DELIVERY_RULES.fixedMinutes + Math.ceil(distanceKm * DELIVERY_RULES.minutesPerKm),
  };
}

/** Distancia legible: "2,4 km". */
export function formatKm(distanceKm: number) {
  return `${distanceKm.toFixed(1).replace(".", ",")} km`;
}

/** Redondeo a 5 decimales (~1 m) antes de guardar un punto. */
export function normalizePoint(point: GeoPoint): GeoPoint {
  return {
    lat: Math.round(point.lat * 1e5) / 1e5,
    lng: Math.round(point.lng * 1e5) / 1e5,
  };
}
