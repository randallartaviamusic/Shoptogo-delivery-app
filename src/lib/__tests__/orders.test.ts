import { describe, expect, test } from "bun:test";
import {
  autoCancelTargets,
  businessCashIssue,
  businessDue,
  buyerCancelBlocker,
  checkoutSummary,
  courierCashIssue,
} from "../orders";
import type { TripOrderState } from "../orders";

const member = (
  overrides: Partial<TripOrderState> & { _id: string },
): TripOrderState => ({
  buyerId: "buyer-1",
  status: "pending",
  ...overrides,
});

describe("efectivo que le corresponde al local", () => {
  test("es el valor de sus productos, sin el envío", () => {
    expect(businessDue({ subtotal: 5000 })).toBe(5000);
  });

  test("descuenta la parte de envío que cubrió su promoción", () => {
    expect(businessDue({ subtotal: 5000, deliveryDiscount: 500 })).toBe(4500);
    expect(businessDue({ subtotal: 5000, deliveryDiscount: null })).toBe(5000);
  });
});

describe("faltantes y sobrantes del repartidor contra el comprador", () => {
  test("cobrar menos es un faltante por la diferencia exacta", () => {
    expect(courierCashIssue(-300)).toEqual({ kind: "shortfall", amount: 300 });
  });

  test("cobrar de más queda como reclamo", () => {
    expect(courierCashIssue(250)).toEqual({ kind: "claim", amount: 250 });
  });

  test("si el monto coincide no se abre ningún caso", () => {
    expect(courierCashIssue(0)).toBeNull();
  });

  test("redondea los colones y nunca guarda un monto negativo", () => {
    expect(courierCashIssue(-300.6)).toEqual({ kind: "shortfall", amount: 301 });
    expect(courierCashIssue(-0.2)).toEqual({ kind: "shortfall", amount: 0 });
  });

  test("un monto inválido no se registra como caso", () => {
    expect(courierCashIssue(Number.NaN)).toBeNull();
  });
});

describe("faltantes y sobrantes del repartidor contra el local", () => {
  test("entregar menos al local es un pago incompleto", () => {
    expect(businessCashIssue(-1000)).toEqual({
      kind: "incomplete",
      amount: 1000,
    });
  });

  test("entregar de más es un reclamo, no un pago incompleto", () => {
    expect(businessCashIssue(400)).toEqual({ kind: "claim", amount: 400 });
  });

  test("cuando la cuenta cuadra no hay caso", () => {
    expect(businessCashIssue(0)).toBeNull();
  });
});

describe("vencimiento automático de entregas listas", () => {
  test("cancela todas las paradas listas de una entrega compartida", () => {
    expect(
      autoCancelTargets([
        member({ _id: "a", status: "ready" }),
        member({ _id: "b", status: "ready" }),
      ]),
    ).toEqual(["a", "b"]);
  });

  test("no cancela si una parada ya la tomó un repartidor", () => {
    expect(
      autoCancelTargets([
        member({ _id: "a", status: "ready" }),
        member({ _id: "b", status: "ready", courierId: "courier-1" }),
      ]),
    ).toEqual([]);
  });

  test("no cancela si una parte ya salió del local", () => {
    expect(
      autoCancelTargets([
        member({ _id: "a", status: "ready" }),
        member({ _id: "b", status: "picked_up" }),
      ]),
    ).toEqual([]);
  });

  test("ignora paradas que todavía no están listas", () => {
    expect(
      autoCancelTargets([
        member({ _id: "a", status: "ready" }),
        member({ _id: "b", status: "preparing" }),
        member({ _id: "c", status: "cancelled" }),
      ]),
    ).toEqual(["a"]);
  });

  test("una entrega vacía no cancela nada", () => {
    expect(autoCancelTargets([])).toEqual([]);
  });
});

describe("cancelación del comprador en una compra partida", () => {
  test("puede cancelar mientras ninguna parte fue confirmada", () => {
    expect(
      buyerCancelBlocker(
        [
          member({ _id: "a", status: "pending" }),
          member({ _id: "b", status: "pending" }),
        ],
        "buyer-1",
      ),
    ).toBeNull();
  });

  test("si el local confirmó una parte, no se cancela a medias", () => {
    const blocker = buyerCancelBlocker(
      [
        member({ _id: "a", status: "pending" }),
        member({ _id: "b", status: "accepted" }),
      ],
      "buyer-1",
    );
    expect(blocker).toContain("El local ya confirmó");
  });

  test("una parte retirada bloquea la cancelación", () => {
    const blocker = buyerCancelBlocker(
      [
        member({ _id: "a", status: "pending" }),
        member({ _id: "b", status: "picked_up" }),
      ],
      "buyer-1",
    );
    expect(blocker).toContain("retirada");
  });

  test("no se puede cancelar una compra ajena", () => {
    expect(
      buyerCancelBlocker(
        [member({ _id: "a", status: "pending", buyerId: "buyer-2" })],
        "buyer-1",
      ),
    ).toContain("no pertenece");
  });

  test("una entrega sin órdenes vigentes avisa en vez de cancelar", () => {
    expect(buyerCancelBlocker([], "buyer-1")).toContain("ya no existe");
  });
});

describe("resumen de un checkout repetido", () => {
  test("cuenta entregas por lote aunque haya varias tiendas por entrega", () => {
    expect(
      checkoutSummary([
        { batchIndex: 1, total: 5000 },
        { batchIndex: 1, total: 3000 },
        { batchIndex: 2, total: 2000 },
      ]),
    ).toEqual({ created: 2, orders: 3, total: 10_000 });
  });

  test("un pedido simple es una entrega y una orden", () => {
    expect(checkoutSummary([{ batchIndex: 1, total: 4500 }])).toEqual({
      created: 1,
      orders: 1,
      total: 4500,
    });
  });

  test("los pedidos antiguos sin lote cuentan como una entrega", () => {
    expect(
      checkoutSummary([{ total: 1000 }, { total: 1000 }]),
    ).toEqual({ created: 1, orders: 2, total: 2000 });
  });
});
