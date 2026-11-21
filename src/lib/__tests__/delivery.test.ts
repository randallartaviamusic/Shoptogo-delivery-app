import { describe, expect, test } from "bun:test";
import {
  DELIVERY_RULES,
  allocateTripFee,
  assignmentWindow,
  deliveryQuote,
  planDeliveryTrips,
  splitIntoDeliveries,
  travelKm,
} from "../delivery";
import type { GeoPoint } from "../delivery";

const TILARAN: GeoPoint = { lat: 10.47093, lng: -84.96745 };
/** Punto al norte del centro: un grado de latitud son ~111 km en línea recta. */
const north = (degrees: number): GeoPoint => ({
  lat: TILARAN.lat + degrees,
  lng: TILARAN.lng,
});

describe("tarifa de envío por distancia", () => {
  test("el mismo punto paga sólo la base", () => {
    const quote = deliveryQuote(TILARAN, TILARAN);
    expect(quote).not.toBeNull();
    expect(quote!.fee).toBe(DELIVERY_RULES.baseFee);
    expect(quote!.distanceKm).toBe(0);
  });

  test("el primer km de recorrido está incluido en la base", () => {
    // ~0,83 km de recorrido: todavía no se cobra km adicional.
    const quote = deliveryQuote(TILARAN, north(0.006));
    expect(quote!.distanceKm).toBe(0.8);
    expect(quote!.fee).toBe(1000);
  });

  test("cobra ₡350 por cada km adicional o fracción", () => {
    // ~1,95 km de recorrido: 0,95 km extra ya cuentan como un km completo.
    const firstExtra = deliveryQuote(TILARAN, north(0.014));
    expect(firstExtra!.distanceKm).toBe(1.9);
    expect(firstExtra!.fee).toBe(1350);

    // ~2,78 km de recorrido: 1,78 km extra cuentan como dos km completos.
    const secondExtra = deliveryQuote(TILARAN, north(0.02));
    expect(secondExtra!.distanceKm).toBe(2.8);
    expect(secondExtra!.fee).toBe(1700);
  });

  test("el recargo se acumula km por km", () => {
    const quote = deliveryQuote(TILARAN, north(0.03));
    expect(quote!.fee).toBe(DELIVERY_RULES.baseFee + 4 * DELIVERY_RULES.perKm);
  });

  test("fuera del radio de 12 km no hay envío", () => {
    expect(travelKm(TILARAN, north(0.09))).toBeGreaterThan(
      DELIVERY_RULES.maxKm,
    );
    expect(deliveryQuote(TILARAN, north(0.09))).toBeNull();
    // Justo dentro del radio sí cotiza.
    expect(deliveryQuote(TILARAN, north(0.08))?.fee).toBe(4850);
  });

  test("sin punto de entrega no hay cotización", () => {
    expect(deliveryQuote(TILARAN, null)).toBeNull();
    expect(deliveryQuote(undefined, TILARAN)).toBeNull();
  });
});

describe("división de la compra en entregas de 3", () => {
  test("reparte 7 unidades en 3, 3 y 1", () => {
    const deliveries = splitIntoDeliveries([{ quantity: 7 }]);
    expect(deliveries.map((chunk) => chunk[0].quantity)).toEqual([3, 3, 1]);
  });

  test("una línea que cruza el límite se parte entre dos entregas", () => {
    const deliveries = splitIntoDeliveries([
      { quantity: 2, id: "a" },
      { quantity: 2, id: "b" },
    ]);
    expect(deliveries).toEqual([
      [
        { quantity: 2, id: "a" },
        { quantity: 1, id: "b" },
      ],
      [{ quantity: 1, id: "b" }],
    ]);
  });

  test("nunca se pierden ni se inventan unidades", () => {
    const items = [
      { quantity: 1 },
      { quantity: 5 },
      { quantity: 2 },
      { quantity: 4 },
    ];
    const deliveries = splitIntoDeliveries(items);
    const total = deliveries.flat().reduce((acc, item) => acc + item.quantity, 0);
    expect(total).toBe(12);
    for (const chunk of deliveries) {
      expect(chunk.reduce((acc, item) => acc + item.quantity, 0)).toBeLessThanOrEqual(3);
    }
  });

  test("un carrito vacío no genera entregas", () => {
    expect(splitIntoDeliveries([])).toEqual([]);
  });
});

describe("envío único por entrega con varias tiendas", () => {
  test("una sola tienda paga sólo su recorrido", () => {
    const trips = planDeliveryTrips([{ businessId: "a", quantity: 1 }], () => 1350);
    expect(trips).toHaveLength(1);
    expect(trips[0].fee).toBe(1350);
    expect(trips[0].stopFee).toBe(0);
    expect(trips[0].stops).toEqual([{ businessId: "a", fee: 1350 }]);
  });

  test("dos tiendas pagan el recorrido más largo más el recargo por parada", () => {
    const fees: Record<string, number> = { a: 1000, b: 1600 };
    const trips = planDeliveryTrips(
      [
        { businessId: "a", quantity: 1 },
        { businessId: "b", quantity: 1 },
      ],
      (businessId) => fees[businessId],
    );
    expect(trips).toHaveLength(1);
    // No se suman los dos envíos: se toma el más largo y se agrega el recargo.
    expect(trips[0].fee).toBe(1600 + DELIVERY_RULES.extraStopFee);
    expect(trips[0].stopFee).toBe(DELIVERY_RULES.extraStopFee);
  });

  test("el envío se reparte entre las tiendas sin perder colones", () => {
    const fees: Record<string, number> = { a: 1000, b: 1600 };
    const trips = planDeliveryTrips(
      [
        { businessId: "a", quantity: 1 },
        { businessId: "b", quantity: 1 },
      ],
      (businessId) => fees[businessId],
    );
    const sum = trips[0].stops.reduce((acc, stop) => acc + stop.fee, 0);
    expect(sum).toBe(trips[0].fee);
    for (const stop of trips[0].stops) expect(stop.fee).toBeGreaterThan(0);
  });

  test("el reparto proporcional cierra la cuenta al centavo", () => {
    expect(allocateTripFee(1000, [1000, 1600])).toEqual([384, 616]);
    expect(allocateTripFee(1000, [1, 1, 1])).toEqual([333, 333, 334]);
    expect(allocateTripFee(1950, [0, 0])).toEqual([975, 975]);
    expect(allocateTripFee(500, [])).toEqual([]);
  });

  test("tres tiendas suman dos recargos de parada", () => {
    const trips = planDeliveryTrips(
      [
        { businessId: "a", quantity: 1 },
        { businessId: "b", quantity: 1 },
        { businessId: "c", quantity: 1 },
      ],
      () => 1000,
    );
    expect(trips[0].stopFee).toBe(2 * DELIVERY_RULES.extraStopFee);
    expect(trips[0].fee).toBe(1000 + 2 * DELIVERY_RULES.extraStopFee);
  });

  test("una compra grande paga el envío de cada entrega", () => {
    const trips = planDeliveryTrips([{ businessId: "a", quantity: 4 }], () => 1000);
    expect(trips).toHaveLength(2);
    expect(trips.map((trip) => trip.units)).toEqual([3, 1]);
    expect(trips.every((trip) => trip.fee === 1000)).toBe(true);
  });

  test("mismo producto de dos tiendas se separa por parada", () => {
    const trips = planDeliveryTrips(
      [
        { businessId: "a", quantity: 2 },
        { businessId: "b", quantity: 2 },
      ],
      () => 1000,
    );
    // 4 unidades: [a2, b1] y [b1], cada entrega con su propio envío.
    expect(trips).toHaveLength(2);
    expect(trips[0].stops.map((stop) => stop.businessId)).toEqual(["a", "b"]);
    expect(trips[1].stops.map((stop) => stop.businessId)).toEqual(["b"]);
  });
});

describe("temporizador de asignación", () => {
  test("marca urgente a los 12 minutos y cancelable a los 30", () => {
    const readyAt = 1_000_000;
    expect(assignmentWindow(readyAt, readyAt + 5 * 60_000).urgent).toBe(false);
    expect(assignmentWindow(readyAt, readyAt + 13 * 60_000).urgent).toBe(true);
    expect(assignmentWindow(readyAt, readyAt + 13 * 60_000).cancellable).toBe(false);
    expect(assignmentWindow(readyAt, readyAt + 31 * 60_000).cancellable).toBe(true);
  });

  test("sin hora de listo no hay cuenta regresiva", () => {
    expect(assignmentWindow(null).secondsLeft).toBeNull();
    expect(assignmentWindow(null).cancellable).toBe(false);
  });
});
