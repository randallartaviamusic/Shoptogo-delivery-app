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
  /** Recargo por cada tienda extra que el repartidor retira en la misma entrega. */
  extraStopFee: 600,
} as const;

/**
 * Reglas de asignación y confiabilidad de entregas.
 *
 * Un pedido listo no espera para siempre: primero se avisa a los repartidores
 * cercanos, después queda urgente y, pasado un tiempo prudencial, el local
 * puede cancelarlo. Para aceptar hace falta compartir una ubicación reciente y
 * estar dentro del radio. Las entregas solo se agrupan cuando el desvío real
 * es corto y no atrasa la entrega que ya está en curso.
 */
export const ASSIGNMENT_RULES = {
  /** Minutos para que alguien tome un pedido listo antes de marcarlo urgente. */
  readyWindowMinutes: 12,
  /** Después de estos minutos sin repartidor, el local puede cancelar. */
  cancelAfterMinutes: 30,
  /** Si nadie lo toma, se cancela solo para no esperar indefinidamente. */
  autoCancelAfterMinutes: 60,
  /** Distancia máxima del repartidor al local para poder tomar el pedido. */
  maxPickupKm: 6,
  /** Antigüedad máxima de la ubicación del repartidor. */
  maxLocationAgeMinutes: 12,
  /** Entregas activas simultáneas como máximo (una sola o dos agrupadas). */
  maxActiveTrips: 2,
  /** Desvío máximo aceptable para sumar una segunda entrega a la ruta. */
  groupMaxExtraKm: 3.5,
  groupMaxExtraMinutes: 10,
  /** Margen antes de avisar que la entrega va demorada. */
  delayToleranceMinutes: 5,
  /** Minutos fijos de retiro y de entrega para las estimaciones. */
  pickupHandoffMinutes: 3,
  dropoffHandoffMinutes: 4,
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

export type PlannedTrip = {
  /** Número de entrega dentro de la compra (1, 2, 3...). */
  index: number;
  units: number;
  /**
   * Tiendas que se retiran en esta entrega. `fee` es la parte del envío único
   * que le corresponde a cada una (la suma de las partes es el envío entero).
   */
  stops: Array<{ businessId: string; fee: number }>;
  /** Recargo incluido en el envío por retirar en más de una tienda. */
  stopFee: number;
  /** Envío único de la entrega. */
  fee: number;
};

/**
 * Reparte un monto entre varias tiendas en proporción a su recorrido, sin
 * perder ni un colón por redondeo (el último ajuste cierra la cuenta).
 */
export function allocateTripFee(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const safe = weights.map((weight) => Math.max(0, weight));
  const sum = safe.reduce((acc, weight) => acc + weight, 0);
  if (sum <= 0) {
    const base = Math.floor(total / weights.length);
    return weights.map((_, index) =>
      index === weights.length - 1
        ? total - base * (weights.length - 1)
        : base,
    );
  }
  let assigned = 0;
  return safe.map((weight, index) => {
    if (index === safe.length - 1) return Math.max(0, total - assigned);
    const share = Math.floor((total * weight) / sum);
    assigned += share;
    return share;
  });
}

/**
 * Arma las entregas de una compra: máximo 3 productos cada una, en el orden del
 * carrito. Una entrega puede retirar en varias tiendas, pero el envío se cobra
 * una sola vez: el recorrido más largo (no la suma de cada tienda) más un
 * recargo por cada parada adicional. Ese envío único se reparte entre las
 * tiendas para saber cuánto cubre cada una si tiene promoción activa.
 */
export function planDeliveryTrips(
  lines: Array<{ businessId: string; quantity: number }>,
  feeForBusiness: (businessId: string) => number,
): PlannedTrip[] {
  return splitIntoDeliveries(lines).map((chunk, index) => {
    const stores: string[] = [];
    for (const line of chunk) {
      if (!stores.includes(line.businessId)) stores.push(line.businessId);
    }
    const routeFees = stores.map((businessId) => feeForBusiness(businessId));
    const stopFee =
      DELIVERY_RULES.extraStopFee * Math.max(0, stores.length - 1);
    const fee = Math.max(0, ...routeFees) + stopFee;
    const shares = allocateTripFee(fee, routeFees);
    return {
      index: index + 1,
      units: chunk.reduce((acc, line) => acc + line.quantity, 0),
      stops: stores.map((businessId, position) => ({
        businessId,
        fee: shares[position],
      })),
      stopFee,
      fee,
    };
  });
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

/** Minutos estimados de recorrido, incluyendo el tiempo fijo de la parada. */
export function travelMinutes(
  from: GeoPoint | null | undefined,
  to: GeoPoint | null | undefined,
  bufferMinutes = 0,
) {
  if (!isValidPoint(from) || !isValidPoint(to)) return null;
  return Math.max(
    1,
    Math.ceil(travelKm(from, to) * DELIVERY_RULES.minutesPerKm) + bufferMinutes,
  );
}

/**
 * Cuánto suma sumar una segunda entrega a la ruta actual: se compara el
 * recorrido directo contra el recorrido con la parada nueva. Devuelve null si
 * falta alguna ubicación.
 */
export function groupRouteExtra(
  current: { pickup: GeoPoint | null; dropoff: GeoPoint | null },
  candidate: { pickup: GeoPoint | null; dropoff: GeoPoint | null },
) {
  if (
    !isValidPoint(current.pickup) ||
    !isValidPoint(current.dropoff) ||
    !isValidPoint(candidate.pickup) ||
    !isValidPoint(candidate.dropoff)
  ) {
    return null;
  }
  const direct = travelKm(current.pickup, current.dropoff);
  const withStop =
    travelKm(current.pickup, candidate.pickup) +
    travelKm(candidate.pickup, candidate.dropoff) +
    travelKm(candidate.dropoff, current.dropoff);
  const extraKm = Math.max(0, withStop - direct);
  return {
    extraKm: Math.round(extraKm * 10) / 10,
    extraMinutes: Math.ceil(extraKm * DELIVERY_RULES.minutesPerKm),
  };
}

/** Estado del temporizador de un pedido listo que todavía no tiene repartidor. */
export function assignmentWindow(readyAt?: number | null, now = Date.now()) {
  if (!readyAt) {
    return {
      waitingMinutes: 0,
      secondsLeft: null as number | null,
      urgent: false,
      cancellable: false,
    };
  }
  const deadline = readyAt + ASSIGNMENT_RULES.readyWindowMinutes * 60_000;
  const cancelAt = readyAt + ASSIGNMENT_RULES.cancelAfterMinutes * 60_000;
  return {
    waitingMinutes: Math.max(0, Math.floor((now - readyAt) / 60_000)),
    secondsLeft: Math.max(0, Math.floor((deadline - now) / 1000)),
    urgent: now >= deadline,
    cancellable: now >= cancelAt,
  };
}

/** Redondeo a 5 decimales (~1 m) antes de guardar un punto. */
export function normalizePoint(point: GeoPoint): GeoPoint {
  return {
    lat: Math.round(point.lat * 1e5) / 1e5,
    lng: Math.round(point.lng * 1e5) / 1e5,
  };
}
