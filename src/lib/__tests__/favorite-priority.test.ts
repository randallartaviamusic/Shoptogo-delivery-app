import { describe, expect, test } from "bun:test";
import { favoritePriorityState } from "../delivery";

const now = 1_000_000;
const until = now + 3 * 60_000;

describe("prioridad de repartidores favoritos", () => {
  test("sin ventana de prioridad cualquier repartidor puede tomar la entrega", () => {
    const state = favoritePriorityState([{}], "courier-1", now);
    expect(state.active).toBe(false);
    expect(state.allowed).toBe(true);
  });

  test("durante la ventana sólo el favorito puede tomar la entrega", () => {
    const trip = [{ favoriteCourierIds: ["favorite-1"], favoritePriorityUntil: until }];
    expect(favoritePriorityState(trip, "favorite-1", now).allowed).toBe(true);
    expect(favoritePriorityState(trip, "other-1", now).allowed).toBe(false);
  });

  test("la prioridad se comparte entre todas las tiendas de la entrega", () => {
    const trip = [
      { favoriteCourierIds: ["favorite-1"], favoritePriorityUntil: until },
      { favoriteCourierIds: ["favorite-2"], favoritePriorityUntil: until },
    ];
    expect(favoritePriorityState(trip, "favorite-2", now).allowed).toBe(true);
  });

  test("el repartidor reservado por el comprador siempre puede tomarla", () => {
    const trip = [
      {
        favoriteCourierIds: ["favorite-1"],
        favoritePriorityUntil: until,
        reservedCourierId: "reserved-1",
      },
    ];
    expect(favoritePriorityState(trip, "reserved-1", now).allowed).toBe(true);
  });

  test("al vencer la ventana la entrega se libera para todos", () => {
    const trip = [{ favoriteCourierIds: ["favorite-1"], favoritePriorityUntil: until }];
    expect(favoritePriorityState(trip, "other-1", until).allowed).toBe(true);
  });
});
