import { describe, expect, test } from "bun:test";
import {
  buildNotifyDraft,
  displayPhone,
  normalizePhone,
  offerLink,
  orderLink,
} from "../notify";

describe("teléfono de WhatsApp", () => {
  test("acepta las formas en que se escribe un número tico", () => {
    for (const raw of [
      "8888-1234",
      "88881234",
      "+506 8888 1234",
      "+506-8888-1234",
      "50688881234",
    ]) {
      expect(normalizePhone(raw)).toBe("50688881234");
    }
  });

  test("rechaza lo que no es un número de Costa Rica", () => {
    // México, sin código de país: no sabemos de qué país es.
    expect(normalizePhone("5512345678")).toBeNull();
    expect(normalizePhone("8888123")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  test("lo muestra legible, con código de país", () => {
    expect(displayPhone("8888-1234")).toBe("+506 8888-1234");
    expect(displayPhone("+50688881234")).toBe("+506 8888-1234");
    expect(displayPhone("123")).toBeNull();
  });
});

describe("enlaces de un toque", () => {
  test("la oferta apunta al panel del repartidor con su token", () => {
    expect(offerLink("https://capricho.cr/", "abc123")).toBe(
      "https://capricho.cr/courier?offer=abc123",
    );
  });

  test("el token se escapa: no puede inyectar parámetros", () => {
    expect(offerLink("https://capricho.cr", "a&b=c")).toBe(
      "https://capricho.cr/courier?offer=a%26b%3Dc",
    );
  });

  test("el enlace al pedido usa su identificador", () => {
    expect(orderLink("https://capricho.cr", "jd7abc")).toBe(
      "https://capricho.cr/orders/jd7abc",
    );
  });
});

describe("mensajes de WhatsApp", () => {
  test("pedido nuevo: el local sabe qué cocinar y cuánto cobra", () => {
    const draft = buildNotifyDraft({
      kind: "new_order",
      tripNumber: "CE-1042",
      itemCount: 3,
      businessAmount: 12500,
      dropAddress: "200 m norte del parque, Tilarán",
    });
    expect(draft.title).toBe("Pedido nuevo");
    expect(draft.body).toContain("CE-1042");
    expect(draft.body).toContain("3 productos");
    expect(draft.body).toContain("₡12.500");
    expect(draft.body).toContain("200 m norte del parque");
  });

  test("pedido nuevo: un solo producto va en singular", () => {
    const draft = buildNotifyDraft({
      kind: "new_order",
      tripNumber: "CE-1043",
      itemCount: 1,
      businessAmount: 3500,
      dropAddress: "Tilarán centro",
    });
    expect(draft.body).toContain("1 producto.");
  });

  test("oferta de entrega: dice el pago, la distancia y cuánto dura", () => {
    const draft = buildNotifyDraft({
      kind: "order_ready",
      orderNumber: "CE-2001",
      pickups: 2,
      km: 4.2,
      payout: 1500,
      expiresInMin: 10,
    });
    expect(draft.title).toBe("Entrega disponible");
    expect(draft.body).toContain("2 retiros en un solo viaje");
    expect(draft.body).toContain("4.2 km");
    expect(draft.body).toContain("₡1.500");
    expect(draft.body).toContain("10 min");
  });

  test("la oferta no revela la dirección antes de aceptar", () => {
    const draft = buildNotifyDraft({
      kind: "order_ready",
      orderNumber: "CE-2002",
      pickups: 1,
      km: null,
      payout: 1000,
      expiresInMin: 10,
    });
    expect(draft.body).not.toContain("Ruta de");
  });

  test("repartidor asignado: nombre, contacto formateado y ETA", () => {
    const draft = buildNotifyDraft({
      kind: "courier_assigned",
      orderNumber: "CE-3001",
      courierName: "Marta Solís",
      courierPhone: "8888-1234",
      etaMin: 14,
    });
    expect(draft.title).toBe("Repartidor asignado");
    expect(draft.body).toContain("Marta Solís");
    expect(draft.body).toContain("+506 8888-1234");
    expect(draft.body).toContain("~14 min");
  });

  test("repartidor asignado sin teléfono no deja una línea vacía", () => {
    const draft = buildNotifyDraft({
      kind: "courier_assigned",
      orderNumber: "CE-3002",
      courierName: "Marta Solís",
      courierPhone: null,
      etaMin: null,
    });
    expect(draft.body).toContain("Marta Solís");
    expect(draft.body).not.toContain("Contacto");
    expect(draft.body).not.toContain("\n\n");
  });
});
