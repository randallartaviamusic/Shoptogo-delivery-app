import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { DELIVERY_RULES } from "../lib/delivery";
import { cashIssueKindValidator } from "./schema";

type OrderViewer = "buyer" | "business" | "courier";

type DbCtx = QueryCtx | MutationCtx;

async function myBusiness(ctx: DbCtx, userId: Id<"users">) {
  return await ctx.db
    .query("businesses")
    .withIndex("by_owner", (q) => q.eq("ownerId", userId))
    .first();
}

/** Entregas hermanas de la misma compra partida en varias entregas. */
async function groupSiblings(ctx: DbCtx, order: Doc<"orders">) {
  if (!order.groupCode) return [];
  const groupCode = order.groupCode;
  const siblings = await ctx.db
    .query("orders")
    .withIndex("by_group", (q) => q.eq("groupCode", groupCode))
    .collect();
  return siblings.filter((sibling) => sibling._id !== order._id);
}

/** Órdenes que forman una misma entrega (una por tienda del viaje). */
async function tripOrders(ctx: DbCtx, order: Doc<"orders">) {
  if (!order.groupCode || !order.batchIndex) return [order];
  const groupCode = order.groupCode;
  const batchIndex = order.batchIndex;
  const group = await ctx.db
    .query("orders")
    .withIndex("by_group", (q) => q.eq("groupCode", groupCode))
    .collect();
  return group.filter((sibling) => sibling.batchIndex === batchIndex);
}

function tripKey(order: Doc<"orders">) {
  return `${order.groupCode ?? order.code}#${order.batchIndex ?? 1}`;
}

/** Órdenes vigentes de la entrega (sin las tiendas canceladas). */
async function tripForOrder(ctx: DbCtx, order: Doc<"orders">) {
  const trip = (await tripOrders(ctx, order)).filter(
    (member) => member.status !== "cancelled",
  );
  return trip.length > 0 ? trip : [order];
}

/** La orden líder guarda el efectivo cobrado y los problemas del viaje. */
function tripLeaderOf(trip: Doc<"orders">[]) {
  return trip.reduce(
    (best, member) =>
      (member.tripPosition ?? 0) < (best.tripPosition ?? 0) ? member : best,
    trip[0],
  );
}

/** Entregas de la compra que todavía no salieron ni se cancelaron. */
function pendingSiblings(siblings: Doc<"orders">[]) {
  return siblings.filter(
    (sibling) =>
      sibling.status !== "delivered" && sibling.status !== "cancelled",
  );
}

/**
 * Las entregas de una compra grande se preparan una detrás de otra: la
 * siguiente recién se habilita cuando la anterior ya salió del local.
 */
async function previousDeliveryOpen(ctx: DbCtx, order: Doc<"orders">) {
  if (!order.groupCode || !order.batchIndex || order.batchIndex <= 1) {
    return false;
  }
  const siblings = await groupSiblings(ctx, order);
  return siblings.some(
    (sibling) =>
      (sibling.batchIndex ?? 0) < (order.batchIndex ?? 0) &&
      sibling.status !== "picked_up" &&
      sibling.status !== "delivered" &&
      sibling.status !== "cancelled",
  );
}

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

async function userName(ctx: DbCtx, id?: Id<"users">) {
  if (!id) return null;
  const user = await ctx.db.get(id);
  return user?.name ?? null;
}

/** Lo que el local recibe en efectivo por sus productos (sin el envío). */
function businessDue(order: Doc<"orders">) {
  return order.subtotal - (order.deliveryDiscount ?? 0);
}

async function decorateOrder(
  ctx: DbCtx,
  order: Doc<"orders">,
  business: Doc<"businesses"> | null,
  viewer: OrderViewer,
) {
  const buyer = await ctx.db.get(order.buyerId);
  const courier = order.courierId ? await ctx.db.get(order.courierId) : null;
  const pendingGroup = pendingSiblings(await groupSiblings(ctx, order));
  // Las tiendas canceladas del viaje no cuentan para el cobro ni las paradas.
  const trip = (await tripOrders(ctx, order)).filter(
    (member) => member.status !== "cancelled" || member._id === order._id,
  );
  const stops = [];
  for (const tripOrder of trip) {
    const stopBusiness =
      tripOrder.businessId === order.businessId
        ? business
        : await ctx.db.get(tripOrder.businessId);
    stops.push({
      businessId: tripOrder.businessId,
      name: stopBusiness?.name ?? "Local",
      address: stopBusiness?.address ?? "",
      // Parte del envío único de la entrega que le corresponde a esta tienda.
      fee: tripOrder.deliveryFee,
      itemCount: tripOrder.items.reduce((acc, item) => acc + item.quantity, 0),
    });
  }
  const tripEarnings = trip.reduce(
    (acc, member) => acc + member.deliveryFee + (member.extraStopFee ?? 0),
    0,
  );
  // Recargo informativo del envío: el cliente lo paga dentro del envío único
  // de la entrega, no como un cobro aparte por tienda.
  const stopSurcharge =
    DELIVERY_RULES.extraStopFee *
    Math.max(0, (order.tripStops ?? trip.length) - 1);
  const tripTotal = trip.reduce((acc, member) => acc + member.total, 0);
  // La orden líder del viaje guarda el efectivo cobrado y los problemas.
  const leader = trip.reduce(
    (best, member) =>
      (member.tripPosition ?? 0) < (best.tripPosition ?? 0) ? member : best,
    trip[0],
  );
  const due = businessDue(order);
  const tripDue = trip.reduce((acc, member) => acc + businessDue(member), 0);
  const tripHanded = trip.reduce(
    (acc, member) => acc + (member.cashHanded ?? 0),
    0,
  );
  const collectorName = await userName(ctx, leader.cashCollectedBy);
  const handedByName = await userName(ctx, order.cashHandedBy);
  const issueByName = await userName(ctx, leader.cashIssue?.by);
  const issueResolvedByName = await userName(ctx, leader.cashIssue?.resolvedBy);
  return {
    _id: order._id,
    code: order.code,
    status: order.status,
    items: order.items,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    deliveryDiscount: order.deliveryDiscount ?? 0,
    total: order.total,
    address: order.address,
    distanceKm: order.distanceKm ?? null,
    deliveryLocation: order.deliveryLocation ?? null,
    notes: order.notes ?? null,
    groupCode: order.groupCode ?? null,
    batchIndex: order.batchIndex ?? null,
    batchCount: order.batchCount ?? null,
    sameCourier: order.sameCourier ?? false,
    reservedCourierId: order.reservedCourierId ?? null,
    locked: await previousDeliveryOpen(ctx, order),
    // Entregas que le faltan a esta compra: le sirve al repartidor para saber
    // si se está comprometiendo a varias entregas.
    remainingDeliveries: pendingGroup.length,
    // De esas, las que están reservadas para este repartidor y puede soltar.
    reservedDeliveries: pendingGroup.filter(
      (sibling) =>
        !!order.courierId &&
        !sibling.courierId &&
        sibling.reservedCourierId === order.courierId,
    ).length,
    groupEarnings:
      order.deliveryFee +
      (order.extraStopFee ?? 0) +
      pendingGroup.reduce(
        (acc, sibling) =>
          acc + sibling.deliveryFee + (sibling.extraStopFee ?? 0),
        0,
      ),
    // Entrega compartida con más tiendas: el repartidor retira en cada una.
    tripStops: order.tripStops ?? trip.length,
    extraStopFee: stopSurcharge,
    tripEarnings,
    // Lo que el repartidor cobra al cliente en esta entrega (productos + envío).
    tripTotal,
    // Efectivo verificable: montos esperados, confirmados y diferencias.
    businessDue: due,
    businessPending: due - (order.cashHanded ?? 0),
    expectedTotal: tripTotal,
    expectedEarnings: tripEarnings,
    cashCollected: leader.cashCollected ?? null,
    cashCollectedAt: leader.cashCollectedAt ?? null,
    cashCollectedByName: collectorName,
    cashHanded: order.cashHanded ?? null,
    cashHandedAt: order.cashHandedAt ?? null,
    cashHandedByName: handedByName,
    cashCollectedLog: (leader.cashCollectedLog ?? []).map((entry) => ({
      amount: entry.amount,
      at: entry.at,
    })),
    cashHandedLog: (order.cashHandedLog ?? []).map((entry) => ({
      amount: entry.amount,
      at: entry.at,
    })),
    cashDifference:
      leader.cashCollected !== undefined
        ? leader.cashCollected - tripTotal
        : null,
    // Dinero de los locales que el repartidor todavía tiene en la mano.
    cashPending: tripDue - tripHanded,
    cashIssue: leader.cashIssue
      ? {
          ...leader.cashIssue,
          byName: issueByName,
          resolvedByName: issueResolvedByName,
        }
      : null,
    // Los códigos se muestran sólo a quien tiene que usarlos.
    pickupCode: viewer === "business" ? (order.pickupCode ?? null) : null,
    deliveryPin: viewer === "buyer" ? (order.deliveryPin ?? null) : null,
    stops,
    createdAt: order.createdAt,
    acceptedAt: order.acceptedAt ?? null,
    courierAcceptedAt: order.courierAcceptedAt ?? null,
    readyAt: order.readyAt ?? null,
    pickedUpAt: order.pickedUpAt ?? null,
    deliveredAt: order.deliveredAt ?? null,
    cancelledAt: order.cancelledAt ?? null,
    businessId: order.businessId,
    businessName: business?.name ?? "Capricho Express",
    businessImage: business?.image ?? "",
    businessAddress: business?.address ?? "",
    businessLocation: business?.location ?? null,
    etaMinutes: business?.etaMinutes ?? 25,
    buyerName: buyer?.name ?? "Cliente Capricho",
    buyerPhone: buyer?.phone ?? null,
    courierId: order.courierId ?? null,
    courierName: courier?.name ?? null,
    courierPhone: courier?.phone ?? null,
    courierLocation:
      order.status === "ready" || order.status === "picked_up"
        ? (order.courierLocation ?? null)
        : null,
    courierLocationAt:
      order.status === "ready" || order.status === "picked_up"
        ? (order.courierLocationAt ?? null)
        : null,
  };
}

export const myOrders = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_buyer", (q) => q.eq("buyerId", userId))
      .collect();
    const sorted = orders.sort((a, b) => b.createdAt - a.createdAt);
    const result = [];
    for (const order of sorted) {
      const business = await ctx.db.get(order.businessId);
      result.push(await decorateOrder(ctx, order, business, "buyer"));
    }
    return result;
  },
});

export const businessBoard = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const business = await myBusiness(ctx, userId);
    if (!business) return null;

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .collect();
    const sorted = orders.sort((a, b) => b.createdAt - a.createdAt);
    const decorated = [];
    for (const order of sorted) {
      decorated.push(await decorateOrder(ctx, order, business, "business"));
    }

    const today = startOfToday();
    const deliveredToday = sorted.filter(
      (o) => o.deliveredAt && o.deliveredAt >= today,
    );
    const active = sorted.filter((o) =>
      ["pending", "accepted", "preparing", "ready", "picked_up"].includes(
        o.status,
      ),
    );

    return {
      business: {
        _id: business._id,
        name: business.name,
        image: business.image,
        category: business.category,
        tagline: business.tagline,
        address: business.address,
        deliveryFee: business.deliveryFee,
        etaMinutes: business.etaMinutes,
        rating: business.rating,
        reviews: business.reviews,
        isOpen: business.isOpen,
        deliveryPromo: business.deliveryPromo ?? null,
      },
      orders: decorated,
      stats: {
        // El local recibe el 100% de sus productos menos lo que él mismo
        // prometió cubrir de envío: eso es gasto promocional, no comisión.
        productSalesToday: deliveredToday.reduce(
          (acc, o) => acc + o.subtotal,
          0,
        ),
        promoSpendToday: deliveredToday.reduce(
          (acc, o) => acc + (o.deliveryDiscount ?? 0),
          0,
        ),
        revenueToday: deliveredToday.reduce(
          (acc, o) => acc + o.subtotal - (o.deliveryDiscount ?? 0),
          0,
        ),
        deliveredToday: deliveredToday.length,
        // Efectivo de tus productos que el repartidor todavía no confirmó
        // (de todo el historial, no sólo de hoy).
        cashPending: sorted.reduce(
          (acc, o) =>
            o.status === "delivered"
              ? acc + Math.max(0, businessDue(o) - (o.cashHanded ?? 0))
              : acc,
          0,
        ),
        active: active.length,
        waiting: sorted.filter((o) => o.status === "pending").length,
        totalOrders: sorted.length,
      },
    };
  },
});

export const courierBoard = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (user?.role !== "courier") return null;

    const readyOrders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "ready"))
      .collect();
    const available = [];
    const seenTrips = new Set<string>();
    for (const order of readyOrders) {
      if (order.courierId) continue;
      const key = tripKey(order);
      if (seenTrips.has(key)) continue;
      const trip = await tripOrders(ctx, order);
      // Una entrega con varias tiendas sólo se ofrece cuando todas están listas.
      if (trip.some((member) => member.status !== "ready" || member.courierId)) {
        continue;
      }
      // Si el cliente pidió el mismo repartidor, las siguientes entregas sólo
      // las ve quien ya hizo la primera.
      if (
        trip.some(
          (member) =>
            member.reservedCourierId && member.reservedCourierId !== userId,
        )
      ) {
        continue;
      }
      seenTrips.add(key);
      const business = await ctx.db.get(order.businessId);
      available.push(await decorateOrder(ctx, order, business, "courier"));
    }

    const mine = await ctx.db
      .query("orders")
      .withIndex("by_courier", (q) => q.eq("courierId", userId))
      .collect();
    const sortedMine = mine.sort((a, b) => b.createdAt - a.createdAt);

    const active = [];
    const history = [];
    const seenMine = new Set<string>();
    for (const order of sortedMine) {
      const key = tripKey(order);
      if (seenMine.has(key)) continue;
      seenMine.add(key);
      const business = await ctx.db.get(order.businessId);
      const decorated = await decorateOrder(ctx, order, business, "courier");
      if (order.status === "picked_up" || order.status === "ready") {
        active.push(decorated);
      } else if (order.status === "delivered") {
        history.push(decorated);
      }
    }

    const today = startOfToday();
    const deliveredToday = sortedMine.filter(
      (o) => o.status === "delivered" && (o.deliveredAt ?? 0) >= today,
    );

    return {
      available,
      active,
      history: history.slice(0, 15),
      // Un repartidor atiende una entrega a la vez.
      canAccept: active.length === 0,
      busyOrder: active[0] ?? null,
      stats: {
        available: available.length,
        active: active.length,
        deliveriesToday: deliveredToday.length,
        earningsToday: deliveredToday.reduce(
          (acc, o) => acc + o.deliveryFee + (o.extraStopFee ?? 0),
          0,
        ),
        // Se suman todas las órdenes entregadas: una entrega con varias
        // tiendas genera una orden por tienda y el viaje completo es la suma.
        earningsTotal: sortedMine.reduce(
          (acc, o) =>
            o.status === "delivered"
              ? acc + o.deliveryFee + (o.extraStopFee ?? 0)
              : acc,
          0,
        ),
      },
    };
  },
});

const TRANSITIONS: Record<
  string,
  Array<"accepted" | "preparing" | "ready" | "cancelled">
> = {
  pending: ["accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready"],
  ready: [],
  picked_up: [],
  delivered: [],
  cancelled: [],
};

const TIMESTAMP: Record<string, "acceptedAt" | "readyAt" | "cancelledAt"> = {
  accepted: "acceptedAt",
  ready: "readyAt",
  cancelled: "cancelledAt",
};

export const businessUpdateStatus = mutation({
  args: {
    orderId: v.id("orders"),
    status: v.union(
      v.literal("accepted"),
      v.literal("preparing"),
      v.literal("ready"),
      v.literal("cancelled"),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const business = await myBusiness(ctx, userId);
    if (!business) throw new Error("No tenés un negocio asociado");

    const order = await ctx.db.get(args.orderId);
    if (!order || order.businessId !== business._id) {
      throw new Error("Ese pedido no pertenece a tu negocio");
    }
    const allowed = TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(args.status)) {
      throw new Error("Ese cambio de estado no es válido");
    }
    if (args.status !== "cancelled" && (await previousDeliveryOpen(ctx, order))) {
      throw new Error(
        "Esta compra se prepara en orden: primero tiene que salir la entrega anterior",
      );
    }

    const patch: Partial<Doc<"orders">> = { status: args.status };
    const stamp = TIMESTAMP[args.status];
    if (stamp) patch[stamp] = Date.now();
    await ctx.db.patch(args.orderId, patch);
    return { status: args.status };
  },
});

/**
 * El negocio confirma cuánto efectivo le entregó el repartidor. La diferencia
 * contra el valor de sus productos queda registrada como faltante o reclamo.
 */
export const businessConfirmCash = mutation({
  args: {
    orderId: v.id("orders"),
    amount: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const business = await myBusiness(ctx, userId);
    if (!business) throw new Error("No tenés un negocio asociado");
    const order = await ctx.db.get(args.orderId);
    if (!order || order.businessId !== business._id) {
      throw new Error("Ese pedido no pertenece a tu negocio");
    }
    if (order.status !== "delivered") {
      throw new Error("El efectivo se confirma cuando la entrega ya se completó");
    }

    const amount = Math.round(args.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("Ese monto no es válido");
    }
    const due = businessDue(order);
    const difference = amount - due;
    const note = (args.note ?? "").trim();
    if (difference !== 0 && note.length < 4) {
      throw new Error(
        "El monto no coincide con lo que te corresponde: escribí una nota con lo que pasó",
      );
    }

    const now = Date.now();
    await ctx.db.patch(args.orderId, {
      cashHanded: amount,
      cashHandedAt: now,
      cashHandedBy: userId,
      cashHandedLog: [
        ...(order.cashHandedLog ?? []),
        { amount, at: now, by: userId },
      ],
    });

    const trip = await tripForOrder(ctx, order);
    const leader = tripLeaderOf(trip);
    if (difference !== 0) {
      await ctx.db.patch(leader._id, {
        cashIssue: {
          kind: difference < 0 ? "incomplete" : "claim",
          amount: Math.abs(difference),
          note,
          at: now,
          by: userId,
          orderId: order._id,
        },
      });
    } else if (
      leader.cashIssue?.orderId === order._id &&
      !leader.cashIssue.resolvedAt
    ) {
      // Si después se completa el monto, el faltante de este local se cierra.
      await ctx.db.patch(leader._id, {
        cashIssue: {
          ...leader.cashIssue,
          resolvedAt: now,
          resolvedBy: userId,
        },
      });
    }
    return { difference };
  },
});

/** Cualquiera de las partes puede dejar asentado un problema de efectivo. */
export const reportCashIssue = mutation({
  args: {
    orderId: v.id("orders"),
    kind: cashIssueKindValidator,
    amount: v.optional(v.number()),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Ese pedido no existe");
    const business = await myBusiness(ctx, userId);
    const isOwner = business?._id === order.businessId;
    const isCourier = order.courierId === userId;
    const isBuyer = order.buyerId === userId;
    if (!isOwner && !isCourier && !isBuyer) {
      throw new Error("Ese pedido no es tuyo");
    }
    const note = args.note.trim();
    if (note.length < 6) {
      throw new Error("Contá brevemente qué pasó con el efectivo");
    }
    const amount = Math.max(0, Math.round(args.amount ?? 0));
    const now = Date.now();
    const trip = await tripForOrder(ctx, order);
    const leader = tripLeaderOf(trip);
    await ctx.db.patch(leader._id, {
      cashIssue: {
        kind: args.kind,
        amount,
        note,
        at: now,
        by: userId,
        orderId: order._id,
      },
    });
    return { reported: true };
  },
});

export const resolveCashIssue = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Ese pedido no existe");
    const business = await myBusiness(ctx, userId);
    const isOwner = business?._id === order.businessId;
    const isCourier = order.courierId === userId;
    if (!isOwner && !isCourier) {
      throw new Error("Sólo el local o el repartidor pueden cerrar el caso");
    }
    const trip = await tripForOrder(ctx, order);
    const leader = tripLeaderOf(trip);
    if (!leader.cashIssue || leader.cashIssue.resolvedAt) return null;
    await ctx.db.patch(leader._id, {
      cashIssue: {
        ...leader.cashIssue,
        resolvedAt: Date.now(),
        resolvedBy: userId,
      },
    });
    return { resolved: true };
  },
});

export const courierAccept = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const courier = await ctx.db.get(userId);
    if (courier?.role !== "courier") {
      throw new Error("Sólo las cuentas de repartidor pueden tomar pedidos");
    }
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Ese pedido no existe");
    // Una entrega puede retirar en varias tiendas: se toma el viaje completo.
    const trip = (await tripOrders(ctx, order)).filter(
      (member) => member.status !== "cancelled",
    );
    if (trip.length === 0) throw new Error("Esta entrega fue cancelada");
    if (trip.some((member) => member.courierId)) {
      throw new Error("Otro repartidor ya tomó esta entrega");
    }
    if (trip.some((member) => member.status !== "ready")) {
      throw new Error(
        trip.length > 1
          ? "Falta que una de las tiendas marque su parte lista"
          : "El pedido todavía no está listo",
      );
    }
    if (
      trip.some(
        (member) =>
          member.reservedCourierId && member.reservedCourierId !== userId,
      )
    ) {
      throw new Error(
        "El cliente pidió que el mismo repartidor haga todas las entregas de esta compra",
      );
    }
    if (await previousDeliveryOpen(ctx, order)) {
      throw new Error(
        "Esta compra va en orden: primero tiene que entregarse la anterior",
      );
    }

    // Primero se termina la entrega en curso: nadie atiende dos a la vez.
    const mine = await ctx.db
      .query("orders")
      .withIndex("by_courier", (q) => q.eq("courierId", userId))
      .collect();
    const busy = mine.find(
      (item) => item.status === "ready" || item.status === "picked_up",
    );
    if (busy) {
      throw new Error(
        `Terminá la entrega ${busy.code} antes de tomar otro pedido`,
      );
    }

    for (const member of trip) {
      await ctx.db.patch(member._id, {
        courierId: userId,
        courierAcceptedAt: Date.now(),
      });
    }

    // Con "mismo repartidor", las entregas que falten de la compra quedan
    // reservadas para quien tomó la primera.
    if (order.sameCourier && order.groupCode) {
      const tripIds = new Set(trip.map((member) => member._id));
      const siblings = await groupSiblings(ctx, order);
      for (const sibling of siblings) {
        if (
          tripIds.has(sibling._id) ||
          sibling.courierId ||
          sibling.status === "delivered" ||
          sibling.status === "cancelled"
        ) {
          continue;
        }
        await ctx.db.patch(sibling._id, { reservedCourierId: userId });
      }
    }

    return { accepted: true };
  },
});

export const updateCourierLocation = mutation({
  args: {
    orderId: v.id("orders"),
    location: v.object({ lat: v.number(), lng: v.number() }),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const courier = await ctx.db.get(userId);
    if (courier?.role !== "courier") {
      throw new Error("Sólo las cuentas de repartidor pueden compartir ubicación");
    }
    const { lat, lng } = args.location;
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      throw new Error("La ubicación no es válida");
    }
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Ese pedido no existe");
    // La ubicación se comparte con todas las tiendas de la entrega.
    const trip = await tripOrders(ctx, order);
    if (trip.some((member) => member.courierId !== userId)) {
      throw new Error("Este pedido no está asignado a vos");
    }
    if (
      trip.every(
        (member) => member.status !== "ready" && member.status !== "picked_up",
      )
    ) {
      throw new Error("El seguimiento no está activo para este pedido");
    }
    for (const member of trip) {
      await ctx.db.patch(member._id, {
        courierLocation: {
          lat: Math.round(lat * 1e5) / 1e5,
          lng: Math.round(lng * 1e5) / 1e5,
        },
        courierLocationAt: Date.now(),
      });
    }
    return { updated: true };
  },
});

/**
 * El repartidor ya no quiere hacer las entregas restantes de una compra
 * grande: libera las que tenía reservadas para que otro las tome.
 */
export const courierRenounceRemaining = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Ese pedido no existe");
    if (order.courierId !== userId) {
      throw new Error("Este pedido no está asignado a vos");
    }

    let released = 0;
    for (const sibling of await groupSiblings(ctx, order)) {
      if (sibling.status === "delivered" || sibling.status === "cancelled") {
        continue;
      }
      if (sibling.courierId || sibling.reservedCourierId !== userId) continue;
      await ctx.db.patch(sibling._id, { reservedCourierId: undefined });
      released += 1;
    }
    return { released };
  },
});

export const courierUpdateStatus = mutation({
  args: {
    orderId: v.id("orders"),
    status: v.union(v.literal("picked_up"), v.literal("delivered")),
    // Código que entrega el local al retirar el pedido.
    pickupCode: v.optional(v.string()),
    // PIN que da el comprador al recibir.
    pin: v.optional(v.string()),
    // Efectivo que el repartidor confirma haber cobrado al comprador.
    cashAmount: v.optional(v.number()),
    // Nota obligatoria si el monto no coincide con el total del pedido.
    cashNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Ese pedido no existe");
    // El estado se mueve para todas las tiendas de la misma entrega.
    const trip = (await tripOrders(ctx, order)).filter(
      (member) => member.status !== "cancelled",
    );
    if (trip.length === 0) throw new Error("Esta entrega fue cancelada");
    if (trip.some((member) => member.courierId !== userId)) {
      throw new Error("Este pedido no está asignado a vos");
    }
    const now = Date.now();
    if (args.status === "picked_up") {
      if (trip.some((member) => member.status !== "ready")) {
        throw new Error("Todavía falta que una tienda tenga su parte lista");
      }
      // El código confirma que el repartidor se lleva el pedido correcto.
      const expectedCode =
        order.pickupCode ?? trip.find((member) => member.pickupCode)?.pickupCode;
      if (expectedCode) {
        const given = (args.pickupCode ?? "").trim();
        if (!given) {
          throw new Error(
            "Pedile el código de retiro al local para confirmar que llevás el pedido correcto",
          );
        }
        if (given !== expectedCode) {
          throw new Error(
            "El código de retiro no coincide. Revisalo con el local antes de salir",
          );
        }
      }
      for (const member of trip) {
        await ctx.db.patch(member._id, {
          status: "picked_up",
          pickedUpAt: now,
        });
      }
      return { status: args.status, orders: trip.length };
    }

    if (trip.some((member) => member.status !== "picked_up")) {
      throw new Error("Primero marcá la entrega como recogida");
    }
    // El PIN del comprador confirma que el pedido llegó a la persona correcta.
    const expectedPin =
      order.deliveryPin ?? trip.find((member) => member.deliveryPin)?.deliveryPin;
    if (expectedPin) {
      const given = (args.pin ?? "").trim();
      if (!given) {
        throw new Error(
          "Pedile el PIN de entrega al comprador para confirmar que recibió el pedido",
        );
      }
      if (given !== expectedPin) {
        throw new Error("El PIN de entrega no coincide. Verificalo con el comprador");
      }
    }

    // Sin el registro del efectivo la entrega no se puede cerrar: es lo que
    // permite verificar que el dinero llegó al local.
    if (args.cashAmount === undefined) {
      throw new Error("Confirmá cuánto efectivo cobraste antes de cerrar la entrega");
    }
    const cashAmount = Math.round(args.cashAmount);
    if (!Number.isFinite(cashAmount) || cashAmount < 0) {
      throw new Error("Ese monto en efectivo no es válido");
    }
    const expectedTotal = trip.reduce((acc, member) => acc + member.total, 0);
    const difference = cashAmount - expectedTotal;
    const note = (args.cashNote ?? "").trim();
    if (difference !== 0 && note.length < 4) {
      throw new Error(
        "El efectivo no coincide con el total: escribí una nota con lo que pasó",
      );
    }

    const leader = trip.reduce(
      (best, member) =>
        (member.tripPosition ?? 0) < (best.tripPosition ?? 0) ? member : best,
      trip[0],
    );
    for (const member of trip) {
      await ctx.db.patch(member._id, {
        status: "delivered",
        deliveredAt: now,
        courierLocation: undefined,
        courierLocationAt: undefined,
      });
    }
    const cashPatch: Partial<Doc<"orders">> = {
      cashCollected: cashAmount,
      cashCollectedAt: now,
      cashCollectedBy: userId,
      cashCollectedLog: [
        ...(leader.cashCollectedLog ?? []),
        { amount: cashAmount, at: now, by: userId },
      ],
    };
    if (difference !== 0) {
      cashPatch.cashIssue = {
        kind: difference < 0 ? "shortfall" : "claim",
        amount: Math.abs(difference),
        note,
        at: now,
        by: userId,
      };
    }
    await ctx.db.patch(leader._id, cashPatch);
    return { status: args.status, orders: trip.length, cashDifference: difference };
  },
});

export const cancel = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Ese pedido no existe");
    if (order.buyerId !== userId) throw new Error("Ese pedido no es tuyo");
    if (order.status !== "pending") {
      throw new Error("El negocio ya confirmó tu pedido, escribile para cancelar");
    }
    await ctx.db.patch(args.orderId, {
      status: "cancelled",
      cancelledAt: Date.now(),
    });
    return { cancelled: true };
  },
});

export const orderDetail = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;
    const business = await ctx.db.get(order.businessId);
    const isOwner = business?.ownerId === userId;
    const isBuyer = order.buyerId === userId;
    const isCourier = order.courierId === userId;
    if (!isOwner && !isBuyer && !isCourier) return null;
    return await decorateOrder(
      ctx,
      order,
      business,
      isOwner ? "business" : isBuyer ? "buyer" : "courier",
    );
  },
});
