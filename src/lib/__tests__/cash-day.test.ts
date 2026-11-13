import { describe, expect, test } from "bun:test";
import {
  cashClosureSignature,
  costaRicaDayKey,
  costaRicaDayRange,
  shiftCostaRicaDay,
  signatureNameMatches,
  summarizeCashDay,
} from "../orders";
import type { CashDayRow } from "../orders";

const row = (overrides: Partial<CashDayRow>): CashDayRow => ({
  tripKey: "CE-1234#1",
  businessId: "biz-a",
  businessName: "Pulpería Ana",
  total: 0,
  subtotal: 0,
  deliveryFee: 0,
  isLeader: false,
  ...overrides,
});

describe("conciliación de caja del día", () => {
  test("una entrega con dos locales cuenta como un solo viaje", () => {
    const summary = summarizeCashDay([
      row({
        businessId: "biz-a",
        total: 5000,
        subtotal: 4000,
        deliveryFee: 1000,
        cashCollected: 7500,
        cashHanded: 4000,
        isLeader: true,
      }),
      row({
        businessId: "biz-b",
        businessName: "Soda Beto",
        total: 2500,
        subtotal: 2500,
        cashHanded: 0,
      }),
    ]);

    expect(summary.deliveries).toBe(1);
    expect(summary.orders).toBe(2);
    expect(summary.expectedToCollect).toBe(7500);
    expect(summary.dueToBusinesses).toBe(6500);
    expect(summary.handedToBusinesses).toBe(4000);
    expect(summary.pendingToBusinesses).toBe(2500);
    expect(summary.earnings).toBe(1000);
  });

  test("lo cobrado se cuenta una sola vez por viaje, no por local", () => {
    const summary = summarizeCashDay([
      row({ cashCollected: 5000, isLeader: true }),
      // Aunque un registro viejo repita el monto, no es la líder del viaje.
      row({ businessId: "biz-b", businessName: "Soda Beto", cashCollected: 5000 }),
    ]);
    expect(summary.collected).toBe(5000);
  });

  test("un local que pagó de más no tapa el faltante de otro", () => {
    const summary = summarizeCashDay([
      row({ businessId: "biz-a", subtotal: 4000, cashHanded: 0 }),
      row({ businessId: "biz-b", businessName: "Soda Beto", subtotal: 1000, cashHanded: 1500 }),
    ]);

    expect(summary.pendingToBusinesses).toBe(4000);
    expect(summary.overpaidToBusinesses).toBe(500);
    expect(summary.businesses.find((line) => line.businessId === "biz-a")?.pending).toBe(4000);
    // El sobrante queda con signo negativo para verlo en el detalle.
    expect(summary.businesses.find((line) => line.businessId === "biz-b")?.pending).toBe(-500);
  });

  test("detecta si cobró menos de lo que debía", () => {
    const summary = summarizeCashDay([
      row({ total: 5000, subtotal: 4000, cashCollected: 4500, cashHanded: 4000, isLeader: true }),
    ]);
    expect(summary.collectionDifference).toBe(-500);
  });

  test("sin entregas el día queda en cero", () => {
    const summary = summarizeCashDay([]);
    expect(summary.orders).toBe(0);
    expect(summary.deliveries).toBe(0);
    expect(summary.pendingToBusinesses).toBe(0);
    expect(summary.businesses).toEqual([]);
  });
});

describe("firma del cierre", () => {
  const summary = summarizeCashDay([
    row({
      businessId: "biz-a",
      total: 5000,
      subtotal: 4000,
      deliveryFee: 1000,
      cashCollected: 5000,
      cashHanded: 3500,
      isLeader: true,
    }),
  ]);

  test("el mismo cierre produce siempre la misma huella", () => {
    const base = {
      courierId: "courier-1",
      day: "2026-11-13",
      signedName: "Ana Solís",
      summary,
      carryOverPending: 0,
    };
    expect(cashClosureSignature(base)).toBe(cashClosureSignature(base));
  });

  test("el nombre se compara sin mayúsculas ni tildes", () => {
    const base = {
      courierId: "courier-1",
      day: "2026-11-13",
      signedName: "Ana Solís",
      summary,
      carryOverPending: 0,
    };
    expect(cashClosureSignature({ ...base, signedName: "  ana solis " })).toBe(
      cashClosureSignature(base),
    );
  });

  test("cambiar cualquier monto cambia la huella", () => {
    const base = {
      courierId: "courier-1",
      day: "2026-11-13",
      signedName: "Ana Solís",
      summary,
      carryOverPending: 0,
    };
    const otherDay = cashClosureSignature({ ...base, day: "2026-11-12" });
    const otherCarry = cashClosureSignature({ ...base, carryOverPending: 1500 });
    const otherSummary = cashClosureSignature({
      ...base,
      summary: { ...summary, handedToBusinesses: 4000 },
    });

    expect(otherDay).not.toBe(cashClosureSignature(base));
    expect(otherCarry).not.toBe(cashClosureSignature(base));
    expect(otherSummary).not.toBe(cashClosureSignature(base));
  });
});

describe("nombre con el que se firma", () => {
  test("acepta el nombre completo aunque cambien mayúsculas y espacios", () => {
    expect(signatureNameMatches("José Pérez", "  jose   perez ")).toBe(true);
  });

  test("rechaza un nombre distinto al de la cuenta", () => {
    expect(signatureNameMatches("José Pérez", "Ana Solís")).toBe(false);
  });

  test("rechaza iniciales o cuentas sin nombre", () => {
    expect(signatureNameMatches("JP", "jp")).toBe(false);
    expect(signatureNameMatches(null, "jose perez")).toBe(false);
  });
});

describe("día civil de Costa Rica", () => {
  test("el día cambia a las 6 UTC, que son las 00:00 locales", () => {
    expect(costaRicaDayKey(Date.parse("2026-11-13T05:59:00Z"))).toBe("2026-11-12");
    expect(costaRicaDayKey(Date.parse("2026-11-13T06:00:00Z"))).toBe("2026-11-13");
  });

  test("el rango cubre exactamente 24 horas desde la medianoche local", () => {
    const range = costaRicaDayRange("2026-11-13");
    expect(range).not.toBeNull();
    expect(range!.start).toBe(Date.parse("2026-11-13T06:00:00.000Z"));
    expect(range!.end - range!.start).toBe(86_400_000);
  });

  test("un día mal escrito no genera rango", () => {
    expect(costaRicaDayRange("13/11/2026")).toBeNull();
    expect(costaRicaDayRange("2026-13-01")).toBeNull();
  });

  test("se puede retroceder y avanzar de día, incluso cruzando el mes", () => {
    expect(shiftCostaRicaDay("2026-11-13", -1)).toBe("2026-11-12");
    expect(shiftCostaRicaDay("2026-11-13", 1)).toBe("2026-11-14");
    expect(shiftCostaRicaDay("2026-12-01", -1)).toBe("2026-11-30");
    expect(shiftCostaRicaDay("2027-01-01", -1)).toBe("2026-12-31");
  });
});
