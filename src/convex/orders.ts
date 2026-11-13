import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  ASSIGNMENT_RULES,
  DELIVERY_RULES,
  assignmentWindow,
  deliveryQuote,
  formatKm,
  groupRouteExtra,
  isValidPoint,
  travelKm,
  travelMinutes,
} from "../lib/delivery";
import {
  autoCancelTargets,
  businessCashIssue,
  businessDue,
  buyerCancelBlocker,
  cashClosureSignature,
  costaRicaDayKey,
  costaRicaDayRange,
  courierCashIssue,
  signatureNameMatches,
  summarizeCashDay,
} from "../lib/orders";
import type { CashDayRow } from "../lib/orders";
import { cashIssueKindValidator } from "./schema";
import { requireSubscriptionAccess, subscriptionAccess } from "./subscriptions";
import { isAdminEmail } from "./branding";
import { normalizePhone } from "../lib/notify";
import { queueNotice } from "./notifications";

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

/**
 * La espera de una entrega con varias tiendas empieza cuando la última quedó
 * lista, no cuando lo hizo la primera: antes no se podía retirar completa.
 */
function tripReadyAt(trip: Doc<"orders">[]) {
  let latest: number | null = null;
  for (const member of trip) {
    if (member.status === "cancelled" || !member.readyAt) continue;
    latest = latest === null ? member.readyAt : Math.max(latest, member.readyAt);
  }
  return latest;
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
  // Inicio del día civil de Costa Rica (UTC-6), independientemente de la zona
  // horaria configurada en el servidor.
  const costaRicaOffsetMs = 6 * 60 * 60 * 1000;
  const localNow = new Date(Date.now() - costaRicaOffsetMs);
  localNow.setUTCHours(0, 0, 0, 0);
  return localNow.getTime() + costaRicaOffsetMs;
}

const LOCATION_FRESH_MS = ASSIGNMENT_RULES.maxLocationAgeMinutes * 60_000;

async function presenceFor(ctx: DbCtx, ownerId: Id<"users">) {
  return await ctx.db
    .query("courierPresence")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .unique();
}

function freshPresence(
  presence: Awaited<ReturnType<typeof presenceFor>>,
  now = Date.now(),
) {
  if (!presence) return null;
  return now - presence.updatedAt <= LOCATION_FRESH_MS ? presence.location : null;
}

async function saveCourierPresence(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  location: { lat: number; lng: number },
) {
  const now = Date.now();
  const point = {
    lat: Math.round(location.lat * 1e5) / 1e5,
    lng: Math.round(location.lng * 1e5) / 1e5,
  };
  const existing = await presenceFor(ctx, ownerId);
  if (existing) {
    await ctx.db.patch(existing._id, { location: point, updatedAt: now });
  } else {
    await ctx.db.insert("courierPresence", {
      ownerId,
      location: point,
      updatedAt: now,
    });
  }
  return { location: point, updatedAt: now };
}

/** Entregas activas del repartidor, una por viaje (no por tienda). */
function activeTripLeaders(orders: Doc<"orders">[]) {
  const seen = new Set<string>();
  const leaders: Doc<"orders">[] = [];
  for (const order of orders) {
    if (order.status !== "ready" && order.status !== "picked_up") continue;
    const key = tripKey(order);
    if (seen.has(key)) continue;
    seen.add(key);
    leaders.push(order);
  }
  return leaders;
}

async function userName(ctx: DbCtx, id?: Id<"users">) {
  if (!id) return null;
  const user = await ctx.db.get(id);
  return user?.name ?? null;
}

async function decorateOrder(
  ctx: DbCtx,
  order: Doc<"orders">,
  business: Doc<"businesses"> | null,
  viewer: OrderViewer,
) {
  const now = Date.now();
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

  // Llegada estimada y demora contra el tiempo prometido. Para un pedido ya
  // asignado se usa la ubicación del repartidor y, si falta, la del local.
  const promisedMinutes =
    deliveryQuote(business?.location, order.deliveryLocation)?.minutes ?? null;
  const promiseBase =
    order.pickedUpAt ?? order.readyAt ?? order.acceptedAt ?? order.createdAt;
  const promisedArrivalAt =
    promisedMinutes !== null ? promiseBase + promisedMinutes * 60_000 : null;

  let estimatedArrivalAt: number | null = null;
  if (order.deliveredAt) {
    estimatedArrivalAt = order.deliveredAt;
  } else if (order.status === "picked_up") {
    const from = isValidPoint(order.courierLocation)
      ? order.courierLocation
      : isValidPoint(business?.location)
        ? business.location
        : null;
    const minutes = travelMinutes(
      from,
      order.deliveryLocation,
      ASSIGNMENT_RULES.dropoffHandoffMinutes,
    );
    if (minutes !== null) estimatedArrivalAt = now + minutes * 60_000;
  } else if (order.status === "ready" && order.courierId) {
    const pickupMinutes = travelMinutes(
      order.courierLocation,
      business?.location,
      ASSIGNMENT_RULES.pickupHandoffMinutes,
    );
    const dropoffMinutes = travelMinutes(
      business?.location,
      order.deliveryLocation,
      ASSIGNMENT_RULES.dropoffHandoffMinutes,
    );
    if (pickupMinutes !== null && dropoffMinutes !== null) {
      estimatedArrivalAt =
        now + (pickupMinutes + dropoffMinutes) * 60_000;
    }
  }
  const lateMinutes =
    promisedArrivalAt && estimatedArrivalAt
      ? Math.max(
          0,
          Math.round((estimatedArrivalAt - promisedArrivalAt) / 60_000),
        )
      : 0;
  const delayed = lateMinutes > ASSIGNMENT_RULES.delayToleranceMinutes;
  const unassignedReady = order.status === "ready" && !order.courierId;
  const effectiveReadyAt = tripReadyAt(trip) ?? order.readyAt ?? null;
  const wait = assignmentWindow(effectiveReadyAt, now);

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
    cancellationReason: order.cancellationReason ?? null,
    // Temporizador para pedidos listos que todavía no tienen repartidor.
    waitStartedAt: unassignedReady ? effectiveReadyAt : null,
    waitingMinutes: unassignedReady ? wait.waitingMinutes : null,
    assignmentSecondsLeft: unassignedReady ? wait.secondsLeft : null,
    assignmentUrgent: unassignedReady ? wait.urgent : false,
    canCancelUnassigned: unassignedReady ? wait.cancellable : false,
    // Estimación de llegada y aviso de demora.
    promisedArrivalAt,
    estimatedArrivalAt,
    lateMinutes,
    delayed,
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
    // Al repartidor se le muestran las instrucciones operativas del local y un
    // teléfono de contacto; no se exponen al comprador ni a otros roles.
    businessPhone: viewer === "courier" ? (business?.ownerId ? (await ctx.db.get(business.ownerId))?.phone ?? null : null) : null,
    pickupInstructions:
      viewer === "courier" ? (business?.pickupInstructions ?? null) : null,
    packagingInstructions:
      viewer === "courier" ? (business?.packagingInstructions ?? null) : null,
    courierRating: courier?.rating ?? null,
    courierReviews: courier?.reviews ?? 0,
    courierVerified: courier?.verificationStatus === "verified",
    businessRating: business?.rating ?? null,
    businessReviews: business?.reviews ?? null,
    businessVerified: Boolean(business?.verifiedAt),
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
    const newOrders = sorted.filter((o) => o.status === "pending");
    const deliveredToday = sorted.filter(
      (o) => o.deliveredAt && o.deliveredAt >= today,
    );
    const createdToday = sorted.filter((o) => o.createdAt >= today);
    const cancelledToday = sorted.filter(
      (o) => o.status === "cancelled" && (o.cancelledAt ?? o.createdAt) >= today,
    );
    const cashHandedToday = sorted.filter(
      (o) => o.cashHandedAt !== undefined && o.cashHandedAt >= today,
    );
    const cashDifferencesToday = cashHandedToday.filter(
      (o) => o.cashHanded !== undefined && o.cashHanded !== businessDue(o),
    );
    const promoOrdersToday = deliveredToday.filter(
      (o) => (o.deliveryDiscount ?? 0) > 0,
    );
    const reportOrders = new Map<string, (typeof decorated)[number]>();
    for (const order of [...cancelledToday, ...cashDifferencesToday]) {
      const row = decorated.find((candidate) => candidate._id === order._id);
      if (row) reportOrders.set(order._id, row);
    }
    const active = sorted.filter((o) =>
      ["pending", "accepted", "preparing", "ready", "picked_up"].includes(
        o.status,
      ),
    );
    const newOrderNotifications = [];
    for (const order of newOrders) {
      const buyer = await ctx.db.get(order.buyerId);
      newOrderNotifications.push({
        _id: order._id,
        code: order.code,
        createdAt: order.createdAt,
        subtotal: order.subtotal,
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        buyerName: buyer?.name ?? "Cliente",
      });
    }

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
      newOrders: newOrderNotifications,
      dailyReport: {
        cancelled: cancelledToday.slice(0, 20).map((order) => ({
          code: order.code,
          buyerName: reportOrders.get(order._id)?.buyerName ?? "Cliente",
          total: order.total,
          reason: order.cancellationReason ?? "Sin motivo registrado",
          at: order.cancelledAt ?? order.createdAt,
        })),
        cashDifferences: cashDifferencesToday.slice(0, 20).map((order) => ({
          code: order.code,
          buyerName: reportOrders.get(order._id)?.buyerName ?? "Cliente",
          due: businessDue(order),
          received: order.cashHanded ?? 0,
          difference: (order.cashHanded ?? 0) - businessDue(order),
          at: order.cashHandedAt ?? order.deliveredAt ?? order.createdAt,
        })),
        promoOrders: promoOrdersToday.slice(0, 20).map((order) => ({
          code: order.code,
          amount: order.deliveryDiscount ?? 0,
        })),
      },
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
        ordersToday: createdToday.length,
        cancelledToday: cancelledToday.length,
        cashDueToday: deliveredToday.reduce((acc, o) => acc + businessDue(o), 0),
        cashReceivedToday: cashHandedToday.reduce(
          (acc, o) => acc + (o.cashHanded ?? 0),
          0,
        ),
        cashPendingToday: deliveredToday.reduce(
          (acc, o) => acc + Math.max(0, businessDue(o) - (o.cashHanded ?? 0)),
          0,
        ),
        cashDifferenceCountToday: cashDifferencesToday.length,
        cashDifferenceAmountToday: cashDifferencesToday.reduce(
          (acc, o) => acc + Math.abs((o.cashHanded ?? 0) - businessDue(o)),
          0,
        ),
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

async function requireSubscriptionAccessForBoard(
  ctx: DbCtx,
  userId: Id<"users">,
) {
  const access = await subscriptionAccess(ctx, userId);
  return access.hasAccess;
}

export const courierBoard = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (user?.role !== "courier") return null;

    const now = Date.now();
    const presence = await presenceFor(ctx, userId);
    const courierLocation = freshPresence(presence, now);

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
      const trip = (await tripOrders(ctx, order)).filter(
        (member) => member.status !== "cancelled",
      );
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
      const decorated = await decorateOrder(ctx, order, business, "courier");
      // Antes de aceptar basta con negocio, ubicación general y monto: no
      // compartimos identidad, dirección ni teléfono del comprador.
      const preview = {
        ...decorated,
        buyerName: "Cliente",
        buyerPhone: null,
        address: "Se revela al aceptar la entrega",
        deliveryLocation: null,
        notes: null,
        deliveryPin: null,
        cashIssue: null,
      };
      // La distancia de retiro es la de la tienda más lejana del viaje.
      let pickupKm: number | null = null;
      let pickupMinutes: number | null = null;
      if (courierLocation) {
        let farthest = 0;
        let found = false;
        for (const member of trip) {
          const stopBusiness =
            member.businessId === order.businessId
              ? business
              : await ctx.db.get(member.businessId);
          if (!isValidPoint(stopBusiness?.location)) continue;
          found = true;
          farthest = Math.max(
            farthest,
            travelKm(courierLocation, stopBusiness.location),
          );
        }
        if (found) {
          pickupKm = Math.round(farthest * 10) / 10;
          pickupMinutes =
            Math.max(
              1,
              Math.ceil(farthest * DELIVERY_RULES.minutesPerKm),
            ) + ASSIGNMENT_RULES.pickupHandoffMinutes;
        }
      }
      const deliveryMinutes = travelMinutes(
        business?.location,
        order.deliveryLocation,
        ASSIGNMENT_RULES.dropoffHandoffMinutes,
      );
      const totalEtaMinutes =
        pickupMinutes !== null && deliveryMinutes !== null
          ? pickupMinutes + deliveryMinutes
          : null;
      available.push({
        ...preview,
        pickupKm,
        pickupMinutes,
        deliveryMinutes,
        totalEtaMinutes,
        estimatedArrivalAt:
          totalEtaMinutes !== null
            ? now + totalEtaMinutes * 60_000
            : decorated.estimatedArrivalAt,
      });
    }

    const mine = await ctx.db
      .query("orders")
      .withIndex("by_courier", (q) => q.eq("courierId", userId))
      .collect();
    const sortedMine = mine.sort((a, b) => b.createdAt - a.createdAt);
    const activeLeaders = activeTripLeaders(sortedMine);

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

    const activeCount = activeLeaders.length;
    const capacity = Math.max(
      0,
      ASSIGNMENT_RULES.maxActiveTrips - activeCount,
    );

    // Con una entrega en curso solo se puede sumar otra si el desvío es corto
    // y la entrega actual no va demorada.
    let groupingBase: {
      pickup: { lat: number; lng: number } | null;
      dropoff: { lat: number; lng: number } | null;
      late: boolean;
    } | null = null;
    if (activeLeaders.length === 1) {
      const leader = activeLeaders[0];
      const leaderBusiness = await ctx.db.get(leader.businessId);
      const leaderPromise =
        deliveryQuote(leaderBusiness?.location, leader.deliveryLocation)
          ?.minutes ?? null;
      const late =
        (leader.status === "picked_up" &&
          !!leader.pickedUpAt &&
          leaderPromise !== null &&
          now >
            leader.pickedUpAt +
              (leaderPromise + ASSIGNMENT_RULES.delayToleranceMinutes) *
                60_000) ||
        // Si todavía no la retiró y ya lleva demasiado esperando, primero
        // conviene que la retire antes de sumar otra parada.
        (leader.status === "ready" &&
          !!leader.readyAt &&
          now - leader.readyAt > ASSIGNMENT_RULES.readyWindowMinutes * 60_000);
      groupingBase = {
        pickup:
          leader.status === "picked_up"
            ? courierLocation
            : (leaderBusiness?.location ?? null),
        dropoff: leader.deliveryLocation ?? null,
        late,
      };
    }

    const evaluated = available.map((order) => {
      let acceptReason: string | null = null;
      let groupable = false;
      let groupExtraMinutes: number | null = null;

      if (!courierLocation) {
        acceptReason =
          "Activá tu ubicación para calcular la distancia al local.";
      } else if (activeCount >= ASSIGNMENT_RULES.maxActiveTrips) {
        acceptReason =
          "Ya tenés el máximo de 2 entregas activas. Terminá una para tomar otra.";
      } else if (
        order.pickupKm !== null &&
        order.pickupKm > ASSIGNMENT_RULES.maxPickupKm
      ) {
        acceptReason = `El local está a ${formatKm(order.pickupKm)} de vos (máximo ${ASSIGNMENT_RULES.maxPickupKm} km).`;
      }

      if (!acceptReason && groupingBase) {
        if (groupingBase.late) {
          acceptReason =
            "Tu entrega actual va demorada: terminala antes de sumar otra.";
        } else {
          const extra = groupRouteExtra(groupingBase, {
            pickup: order.businessLocation,
            dropoff: order.deliveryLocation,
          });
          if (!extra) {
            acceptReason =
              "Falta la ubicación de una entrega para calcular el desvío.";
          } else if (
            extra.extraKm > ASSIGNMENT_RULES.groupMaxExtraKm ||
            extra.extraMinutes > ASSIGNMENT_RULES.groupMaxExtraMinutes
          ) {
            acceptReason = `Agruparla desvía ${formatKm(extra.extraKm)} y ${extra.extraMinutes} min de tu ruta actual.`;
          } else {
            groupable = true;
            groupExtraMinutes = extra.extraMinutes;
          }
        }
      }

      return {
        ...order,
        acceptAllowed: acceptReason === null,
        acceptReason,
        groupable,
        groupExtraMinutes,
      };
    });

    // Primero lo urgente; entre lo urgente, lo más cercano. Los pedidos sin
    // ubicación del repartidor quedan al final.
    evaluated.sort(
      (a, b) =>
        Number(b.assignmentUrgent) - Number(a.assignmentUrgent) ||
        (a.pickupKm ?? 999) - (b.pickupKm ?? 999) ||
        (a.readyAt ?? a.createdAt) - (b.readyAt ?? b.createdAt),
    );
    const eligible =
      user.verificationStatus === "verified" &&
      (await requireSubscriptionAccessForBoard(ctx, userId));
    const nearest = evaluated
      .filter((order) => order.acceptAllowed && order.pickupKm !== null)
      .sort((a, b) => (a.pickupKm ?? 0) - (b.pickupKm ?? 0))[0];
    const availableWithSuggestion = evaluated.map((order) => ({
      ...order,
      acceptAllowed: eligible && order.acceptAllowed,
      acceptReason:
        !eligible
          ? user.verificationStatus !== "verified"
            ? "Verificá tu cuenta en Perfil para tomar entregas."
            : "Activá o renová tu suscripción para tomar entregas."
          : order.acceptReason,
      recommended: eligible && nearest?._id === order._id,
    }));

    const today = startOfToday();
    const deliveredToday = sortedMine.filter(
      (o) => o.status === "delivered" && (o.deliveredAt ?? 0) >= today,
    );

    return {
      available: availableWithSuggestion,
      active,
      history: history.slice(0, 15),
      // Hasta dos entregas activas, y la segunda solo si se agrupa bien.
      canAccept: capacity > 0 && eligible,
      capacity,
      activeCount,
      maxActive: ASSIGNMENT_RULES.maxActiveTrips,
      busyOrder: active[0] ?? null,
      courierLocation,
      courierLocationAt: presence?.updatedAt ?? null,
      locationFresh: !!courierLocation,
      stats: {
        available: availableWithSuggestion.length,
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

/**
 * Momento en que la entrega se completó. Los pedidos viejos pueden no tener
 * `deliveredAt`: en ese caso se usa la mejor marca disponible para no perder su
 * efectivo en la conciliación del día.
 */
function settledAt(order: Doc<"orders">) {
  return order.deliveredAt ?? order.pickedUpAt ?? order.createdAt;
}

/**
 * Filas de caja de un repartidor en un rango de días. Cada fila es una orden
 * (una tienda de una entrega); la líder del viaje es la única que guarda el
 * efectivo cobrado al comprador.
 */
async function collectCashDay(
  ctx: DbCtx,
  courierId: Id<"users">,
  start: number,
  end: number,
) {
  const mine = await ctx.db
    .query("orders")
    .withIndex("by_courier", (q) => q.eq("courierId", courierId))
    .collect();
  const delivered = mine.filter(
    (order) =>
      order.status === "delivered" &&
      settledAt(order) >= start &&
      settledAt(order) < end,
  );

  const leaderByTrip = new Map<string, { id: string; position: number }>();
  for (const order of delivered) {
    const key = tripKey(order);
    const position = order.tripPosition ?? 0;
    const best = leaderByTrip.get(key);
    if (!best || position < best.position) {
      leaderByTrip.set(key, { id: order._id, position });
    }
  }
  const leaderIds = new Set([...leaderByTrip.values()].map((entry) => entry.id));

  const rows: CashDayRow[] = [];
  const names = new Map<string, string>();
  for (const order of delivered) {
    let name = names.get(order.businessId);
    if (name === undefined) {
      name = (await ctx.db.get(order.businessId))?.name ?? "Local";
      names.set(order.businessId, name);
    }
    rows.push({
      tripKey: tripKey(order),
      businessId: order.businessId,
      businessName: name,
      total: order.total,
      subtotal: order.subtotal,
      deliveryDiscount: order.deliveryDiscount ?? null,
      deliveryFee: order.deliveryFee,
      extraStopFee: order.extraStopFee ?? null,
      cashHanded: order.cashHanded ?? null,
      cashCollected: order.cashCollected ?? null,
      isLeader: leaderIds.has(order._id),
    });
  }

  const openIssues = delivered.filter(
    (order) => order.cashIssue && !order.cashIssue.resolvedAt,
  ).length;
  const activeTrips = mine.filter(
    (order) => order.status === "ready" || order.status === "picked_up",
  ).length;

  return {
    delivered,
    summary: summarizeCashDay(rows),
    openIssues,
    activeTrips,
  };
}

/** Pendiente que el repartidor arrastra de días anteriores a este cierre. */
async function carryOverPending(
  ctx: DbCtx,
  courierId: Id<"users">,
  before: number,
) {
  const mine = await ctx.db
    .query("orders")
    .withIndex("by_courier", (q) => q.eq("courierId", courierId))
    .collect();
  let pending = 0;
  for (const order of mine) {
    if (order.status !== "delivered") continue;
    if (settledAt(order) >= before) continue;
    pending += Math.max(0, businessDue(order) - (order.cashHanded ?? 0));
  }
  return pending;
}

/**
 * Conciliación de caja del repartidor para un día: lo cobrado, lo entregado a
 * cada local, lo pendiente y si el día ya quedó firmado.
 */
export const courierCashDay = query({
  args: { day: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (user?.role !== "courier") return null;

    const range = costaRicaDayRange(args.day);
    if (!range) throw new Error("Ese día no es válido");

    const { delivered, summary, openIssues, activeTrips } = await collectCashDay(
      ctx,
      userId,
      range.start,
      range.end,
    );
    const carryOver = await carryOverPending(ctx, userId, range.start);
    const closing = await ctx.db
      .query("cashClosings")
      .withIndex("by_courier_day", (q) =>
        q.eq("courierId", userId).eq("day", range.day),
      )
      .unique();

    const changedSinceClosing = closing
      ? closing.orders !== summary.orders ||
        closing.collected !== summary.collected ||
        closing.handedToBusinesses !== summary.handedToBusinesses ||
        closing.pendingToBusinesses !== summary.pendingToBusinesses
      : false;

    const signatureValid = closing
      ? cashClosureSignature({
          courierId: userId,
          day: closing.day,
          signedName: closing.signedName,
          summary: {
            orders: closing.orders,
            deliveries: closing.deliveries,
            expectedToCollect: closing.expectedToCollect,
            collected: closing.collected,
            collectionDifference: closing.collectionDifference,
            earnings: closing.earnings,
            dueToBusinesses: closing.dueToBusinesses,
            handedToBusinesses: closing.handedToBusinesses,
            pendingToBusinesses: closing.pendingToBusinesses,
            overpaidToBusinesses: closing.overpaidToBusinesses,
            businesses: closing.businesses.map((line) => ({
              businessId: line.businessId,
              name: line.name,
              orders: line.orders,
              due: line.due,
              handed: line.handed,
              pending: line.pending,
            })),
          },
          carryOverPending: closing.carryOverPending,
        }) === closing.signature
      : null;

    return {
      day: range.day,
      isToday: range.day === costaRicaDayKey(),
      summary,
      openIssues,
      carryOverPending: carryOver,
      activeTrips,
      closing: closing
        ? {
            signedName: closing.signedName,
            note: closing.note ?? null,
            signature: closing.signature,
            signedAt: closing.signedAt,
            orders: closing.orders,
            deliveries: closing.deliveries,
            collected: closing.collected,
            handedToBusinesses: closing.handedToBusinesses,
            pendingToBusinesses: closing.pendingToBusinesses,
            carryOverPending: closing.carryOverPending,
            businesses: closing.businesses,
          }
        : null,
      changedSinceClosing,
      signatureValid,
    };
  },
});

/**
 * Firma el cierre del día. Queda un snapshot firmado con el nombre completo de
 * la cuenta: no se puede reescribir, y si algo cambia después la firma deja de
 * coincidir. Si queda efectivo pendiente o casos abiertos, la nota es
 * obligatoria para que el local sepa cómo se resuelve.
 */
export const signCourierCash = mutation({
  args: {
    day: v.optional(v.string()),
    signedName: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const user = await ctx.db.get(userId);
    if (user?.role !== "courier") {
      throw new Error("Sólo las cuentas de repartidor firman su cierre de caja");
    }

    const range = costaRicaDayRange(args.day);
    if (!range) throw new Error("Ese día no es válido");
    if (range.start > Date.now()) {
      throw new Error("Todavía no podés cerrar un día que no empezó");
    }

    const existing = await ctx.db
      .query("cashClosings")
      .withIndex("by_courier_day", (q) =>
        q.eq("courierId", userId).eq("day", range.day),
      )
      .unique();
    if (existing) {
      throw new Error(
        `El cierre del ${range.day} ya está firmado. Cada día se firma una sola vez`,
      );
    }

    if (!signatureNameMatches(user.name, args.signedName)) {
      throw new Error(
        "Para firmar escribí tu nombre completo tal como figura en tu cuenta",
      );
    }

    const { delivered, summary, openIssues, activeTrips } = await collectCashDay(
      ctx,
      userId,
      range.start,
      range.end,
    );
    if (summary.orders === 0) {
      throw new Error("Todavía no tenés entregas completadas ese día");
    }
    if (activeTrips > 0 && range.day === costaRicaDayKey()) {
      throw new Error(
        "Tenés entregas en curso: cerralas antes de firmar el cierre del día",
      );
    }

    const note = (args.note ?? "").trim();
    if (note.length > 500) {
      throw new Error("La nota es demasiado larga (máximo 500 caracteres)");
    }
    const needsNote =
      summary.pendingToBusinesses > 0 ||
      openIssues > 0 ||
      summary.collectionDifference !== 0;
    if (needsNote && note.length < 8) {
      throw new Error(
        "Queda efectivo pendiente o una diferencia: escribí una nota de al menos 8 caracteres",
      );
    }

    const carryOver = await carryOverPending(ctx, userId, range.start);
    const signedAt = Date.now();
    const signature = cashClosureSignature({
      courierId: userId,
      day: range.day,
      signedName: args.signedName,
      summary,
      carryOverPending: carryOver,
    });

    await ctx.db.insert("cashClosings", {
      courierId: userId,
      day: range.day,
      from: range.start,
      to: range.end,
      signedName: args.signedName.trim(),
      note: note || undefined,
      orders: summary.orders,
      deliveries: summary.deliveries,
      expectedToCollect: summary.expectedToCollect,
      collected: summary.collected,
      collectionDifference: summary.collectionDifference,
      earnings: summary.earnings,
      dueToBusinesses: summary.dueToBusinesses,
      handedToBusinesses: summary.handedToBusinesses,
      pendingToBusinesses: summary.pendingToBusinesses,
      overpaidToBusinesses: summary.overpaidToBusinesses,
      carryOverPending: carryOver,
      openIssues,
      businesses: summary.businesses.map((line) => ({
        businessId: line.businessId as Id<"businesses">,
        name: line.name,
        orders: line.orders,
        due: line.due,
        handed: line.handed,
        pending: line.pending,
      })),
      orderIds: delivered.map((order) => order._id),
      signature,
      signedAt,
    });

    return { signature, signedAt, summary, carryOverPending: carryOver };
  },
});

const TRANSITIONS: Record<
  string,
  Array<"accepted" | "preparing" | "ready" | "cancelled">
> = {
  pending: ["accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready"],
  // Un pedido listo se puede cancelar solo si nadie lo tomó pasado el plazo.
  ready: ["cancelled"],
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
    reason: v.optional(v.string()),
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
    if (args.status === "cancelled" && order.status === "preparing") {
      throw new Error(
        "El pedido ya está en preparación y no se puede cancelar desde el panel. Si hay un problema, abrí un caso en Ayuda",
      );
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
    if (args.status === "cancelled" && order.status === "ready") {
      if (order.courierId) {
        throw new Error(
          "El repartidor ya tomó este pedido: coordiná con él para cancelar",
        );
      }
      const trip = await tripForOrder(ctx, order);
      const wait = assignmentWindow(tripReadyAt(trip) ?? order.readyAt);
      if (!wait.cancellable) {
        throw new Error(
          `Todavía puede llegar un repartidor. Podés cancelar si nadie lo toma en ${ASSIGNMENT_RULES.cancelAfterMinutes} minutos`,
        );
      }
    }

    const patch: Partial<Doc<"orders">> = { status: args.status };
    const stamp = TIMESTAMP[args.status];
    if (stamp) patch[stamp] = Date.now();
    if (args.status === "cancelled") {
      patch.cancellationReason =
        args.reason?.trim() ||
        (order.status === "ready"
          ? "Nadie tomó el pedido a tiempo. El local lo canceló."
          : "El local canceló el pedido.");
    }
    await ctx.db.patch(args.orderId, patch);

    // Recién cuando la entrega está completa se ofrece: antes nadie podría
    // retirarla. Se lee el pedido ya actualizado para no ofrecer algo viejo.
    if (args.status === "ready") {
      const updated = await ctx.db.get(args.orderId);
      if (updated) await offerTripToCouriers(ctx, updated);
    }

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
    const issue = businessCashIssue(difference);
    if (issue) {
      await ctx.db.patch(leader._id, {
        cashIssue: { ...issue, note, at: now, by: userId, orderId: order._id },
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

/** Minutos que una oferta queda abierta antes de pasar al siguiente. */
const OFFER_WINDOW_MS = 10 * 60_000;
/** Tope de avisos por entrega: escribirle a 30 personas es spam, no oferta. */
const MAX_OFFERS_PER_TRIP = 6;

function newOfferToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/** Cierra las ofertas abiertas de un viaje: lo tomó alguien o venció. */
async function closeOffersForTrip(
  ctx: MutationCtx,
  trip: Doc<"orders">[],
  winnerId?: Id<"users">,
) {
  const seen = new Set<string>();
  for (const member of trip) {
    const key = tripKey(member);
    if (seen.has(key)) continue;
    seen.add(key);
    const offers = await ctx.db
      .query("deliveryOffers")
      .withIndex("by_trip", (q) => q.eq("tripKey", key))
      .collect();
    for (const offer of offers) {
      if (offer.status !== "open") continue;
      if (winnerId && offer.courierId === winnerId) {
        await ctx.db.patch(offer._id, {
          status: "accepted",
          acceptedAt: Date.now(),
        });
      } else {
        await ctx.db.patch(offer._id, { status: "declined" });
      }
    }
  }
}

/**
 * Ofertas push: cuando una entrega queda lista se le avisa a los repartidores
 * verificados que están cerca, en orden de cercanía. Cada uno recibe un token
 * propio, así el enlace de WhatsApp acepta en un toque sin exponer el pedido a
 * quien no fue invitado.
 */
async function offerTripToCouriers(ctx: MutationCtx, order: Doc<"orders">) {
  const trip = (await tripOrders(ctx, order)).filter(
    (member) => member.status !== "cancelled",
  );
  if (trip.length === 0) return 0;
  // Una entrega con varias tiendas se ofrece cuando está completa: ofrecer una
  // parte sería invitar a algo que el repartidor no puede aceptar.
  if (trip.some((member) => member.status !== "ready" || member.courierId)) {
    return 0;
  }

  const key = tripKey(order);
  const now = Date.now();
  const expiresAt = now + OFFER_WINDOW_MS;
  const existing = await ctx.db
    .query("deliveryOffers")
    .withIndex("by_trip", (q) => q.eq("tripKey", key))
    .collect();
  const invited = new Set(
    existing
      .filter((offer) => offer.status === "open" && offer.expiresAt > now)
      .map((offer) => String(offer.courierId)),
  );

  const pickupPoints: Array<{ lat: number; lng: number }> = [];
  let payout = 0;
  for (const member of trip) {
    payout += member.deliveryFee + (member.extraStopFee ?? 0);
    const business = await ctx.db.get(member.businessId);
    if (isValidPoint(business?.location)) pickupPoints.push(business.location);
  }

  const presences = await ctx.db.query("courierPresence").collect();
  const candidates: Array<{ userId: Id<"users">; pickupKm: number }> = [];
  for (const presence of presences) {
    if (now - presence.updatedAt > LOCATION_FRESH_MS) continue;
    if (invited.has(String(presence.ownerId))) continue;
    const courier = await ctx.db.get(presence.ownerId);
    if (courier?.role !== "courier") continue;
    if (courier.verificationStatus !== "verified") continue;
    // Con "mismo repartidor", la entrega sólo se le ofrece a quien ya hizo la
    // anterior: los demás quedarían invitados a algo que no pueden tomar.
    if (
      trip.some(
        (member) =>
          member.reservedCourierId &&
          member.reservedCourierId !== presence.ownerId,
      )
    ) {
      continue;
    }
    let farthest = 0;
    for (const point of pickupPoints) {
      farthest = Math.max(farthest, travelKm(presence.location, point));
    }
    if (pickupPoints.length > 0 && farthest > ASSIGNMENT_RULES.maxPickupKm) {
      continue;
    }
    const mine = await ctx.db
      .query("orders")
      .withIndex("by_courier", (q) => q.eq("courierId", presence.ownerId))
      .collect();
    if (activeTripLeaders(mine).length >= ASSIGNMENT_RULES.maxActiveTrips) {
      continue;
    }
    candidates.push({ userId: presence.ownerId, pickupKm: farthest });
  }

  candidates.sort((a, b) => a.pickupKm - b.pickupKm);
  let created = 0;
  for (const candidate of candidates.slice(0, MAX_OFFERS_PER_TRIP)) {
    const token = newOfferToken();
    await ctx.db.insert("deliveryOffers", {
      token,
      courierId: candidate.userId,
      orderId: order._id,
      tripKey: key,
      status: "open",
      expiresAt,
      createdAt: now,
    });
    const courier = await ctx.db.get(candidate.userId);
    await queueNotice(ctx, {
      order,
      tripKey: key,
      recipientId: candidate.userId,
      recipientRole: "courier",
      phone: normalizePhone(courier?.phone),
      link: `/courier?offer=${token}`,
      draft: {
        kind: "order_ready",
        orderNumber: order.code,
        pickups: trip.length,
        km: order.distanceKm ?? null,
        payout,
        expiresInMin: Math.round(OFFER_WINDOW_MS / 60_000),
      },
    });
    created += 1;
  }
  return created;
}

/**
 * Avisos de "repartidor asignado": el local necesita saber quién va a retirar
 * el efectivo, y el comprador que pidió avisos recibe el contacto.
 */
async function notifyAssignment(ctx: MutationCtx, trip: Doc<"orders">[]) {
  const leader = trip[0];
  const courierId = leader.courierId;
  if (!courierId) return;
  const courier = await ctx.db.get(courierId);
  const courierName = courier?.name ?? "Un repartidor";

  // Todos los locales del viaje necesitan saber quién va a retirar el efectivo,
  // no sólo el primero: cada uno le entrega su parte.
  const notified = new Set<string>();
  for (const member of trip) {
    const business = await ctx.db.get(member.businessId);
    if (!business?.ownerId || notified.has(String(business.ownerId))) continue;
    notified.add(String(business.ownerId));
    const owner = await ctx.db.get(business.ownerId);
    await queueNotice(ctx, {
      order: member,
      tripKey: tripKey(member),
      recipientId: business.ownerId,
      recipientRole: "business",
      phone: normalizePhone(owner?.phone),
      link: "/business?tab=orders",
      draft: {
        kind: "courier_assigned",
        orderNumber: member.code,
        courierName,
        courierPhone: courier?.phone ?? null,
      },
    });
  }

  // El comprador sólo recibe nada si él mismo pidió los avisos en su perfil.
  const buyer = await ctx.db.get(leader.buyerId);
  if (buyer?.notifyWhatsapp && normalizePhone(buyer.phone)) {
    await queueNotice(ctx, {
      order: leader,
      tripKey: tripKey(leader),
      recipientId: leader.buyerId,
      recipientRole: "buyer",
      phone: normalizePhone(buyer.phone),
      link: `/orders/${leader._id}`,
      draft: {
        kind: "courier_assigned",
        orderNumber: leader.code,
        courierName,
        courierPhone: courier?.phone ?? null,
      },
    });
  }
}

export const courierAccept = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    return await acceptTripForCourier(ctx, userId, args.orderId);
  },
});

/**
 * Aceptar una entrega. El tablero y la oferta de un toque entran por acá: las
 * reglas tienen que ser idénticas, si no una de las dos puertas sería un atajo
 * para saltarse la verificación, la suscripción o la distancia máxima.
 */
async function acceptTripForCourier(
  ctx: MutationCtx,
  userId: Id<"users">,
  orderId: Id<"orders">,
  options?: { allowRecentLocation?: boolean },
) {
  {
    const courier = await ctx.db.get(userId);
    if (courier?.role !== "courier") {
      throw new Error("Sólo las cuentas de repartidor pueden tomar pedidos");
    }
    if (courier.verificationStatus !== "verified") {
      throw new Error(
        "Tu cuenta de repartidor todavía no está verificada. Completá tus datos en Perfil → Verificación y esperá la revisión",
      );
    }
    await requireSubscriptionAccess(
      ctx,
      userId,
      "Tu suscripción de repartidor está vencida o sin activar. Activala en Suscripción para tomar entregas",
    );
    const presence = await presenceFor(ctx, userId);
    // Con una oferta reciente la distancia ya se validó al ofrecerla. Si el GPS
    // se enfrió mientras leía el WhatsApp, usamos la última posición conocida
    // (hasta 30 min) en vez de hacerle perder la entrega por abrir el enlace.
    const recentEnough =
      options?.allowRecentLocation &&
      presence !== null &&
      Date.now() - presence.updatedAt <= 30 * 60_000;
    const courierPoint =
      freshPresence(presence) ?? (recentEnough ? presence.location : null);
    if (!courierPoint) {
      throw new Error(
        "Activá tu ubicación para tomar pedidos: así comprobamos que el local esté cerca",
      );
    }
    const order = await ctx.db.get(orderId);
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

    // Control de distancia: no se toma un pedido si el local queda lejos.
    let farthestKm = 0;
    for (const member of trip) {
      const stopBusiness = await ctx.db.get(member.businessId);
      if (!stopBusiness || !isValidPoint(stopBusiness.location)) continue;
      farthestKm = Math.max(
        farthestKm,
        travelKm(courierPoint, stopBusiness.location),
      );
    }
    if (farthestKm > ASSIGNMENT_RULES.maxPickupKm) {
      throw new Error(
        `El local está a ${formatKm(farthestKm)} de vos: el máximo para retirar es ${ASSIGNMENT_RULES.maxPickupKm} km. Acercate y volvé a intentar`,
      );
    }

    const mine = await ctx.db
      .query("orders")
      .withIndex("by_courier", (q) => q.eq("courierId", userId))
      .collect();
    const activeLeaders = activeTripLeaders(mine);
    if (activeLeaders.length >= ASSIGNMENT_RULES.maxActiveTrips) {
      throw new Error(
        "Ya tenés el máximo de 2 entregas activas. Terminá una antes de tomar otra",
      );
    }

    // Segunda entrega: solo si está cerca y el desvío no atrasa la actual.
    let grouped = false;
    if (activeLeaders.length === 1) {
      const current = activeLeaders[0];
      const currentBusiness = await ctx.db.get(current.businessId);
      const promised =
        deliveryQuote(currentBusiness?.location, current.deliveryLocation)
          ?.minutes ?? null;
      const currentLate =
        (current.status === "picked_up" &&
          !!current.pickedUpAt &&
          promised !== null &&
          Date.now() >
            current.pickedUpAt +
              (promised + ASSIGNMENT_RULES.delayToleranceMinutes) * 60_000) ||
        (current.status === "ready" &&
          !!current.readyAt &&
          Date.now() - current.readyAt >
            ASSIGNMENT_RULES.readyWindowMinutes * 60_000);
      if (currentLate) {
        throw new Error(
          "Tu entrega actual va demorada: terminala antes de sumar otra",
        );
      }
      const candidateBusiness = await ctx.db.get(order.businessId);
      const extra = groupRouteExtra(
        {
          pickup:
            current.status === "picked_up"
              ? courierPoint
              : (currentBusiness?.location ?? null),
          dropoff: current.deliveryLocation ?? null,
        },
        {
          pickup: candidateBusiness?.location ?? null,
          dropoff: order.deliveryLocation ?? null,
        },
      );
      if (!extra) {
        throw new Error(
          "Falta la ubicación de una de las entregas para calcular si conviene agruparlas",
        );
      }
      if (
        extra.extraKm > ASSIGNMENT_RULES.groupMaxExtraKm ||
        extra.extraMinutes > ASSIGNMENT_RULES.groupMaxExtraMinutes
      ) {
        throw new Error(
          `No conviene agrupar: el desvío suma ${formatKm(extra.extraKm)} y ${extra.extraMinutes} min a tu entrega actual`,
        );
      }
      grouped = true;
    }

    await saveCourierPresence(ctx, userId, courierPoint);

    for (const member of trip) {
      await ctx.db.patch(member._id, {
        courierId: userId,
        courierAcceptedAt: Date.now(),
        // La ubicación queda disponible enseguida para la ETA y el mapa.
        courierLocation: courierPoint,
        courierLocationAt: Date.now(),
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

    // El viaje ya tiene dueño: las ofertas de los demás quedan cerradas y los
    // avisos de asignación salen para el local y el comprador.
    await closeOffersForTrip(ctx, trip, userId);
    await notifyAssignment(ctx, trip);

    return { accepted: true, grouped };
  }
}

/**
 * Ofertas abiertas del repartidor. Se muestran arriba del tablero y son las
 * mismas que llegan por WhatsApp: el token permite aceptar en un toque.
 */
export const myOffers = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const now = Date.now();
    const offers = await ctx.db
      .query("deliveryOffers")
      .withIndex("by_courier", (q) =>
        q.eq("courierId", userId).eq("status", "open"),
      )
      .collect();
    const open: Array<{
      token: string;
      orderId: Id<"orders">;
      code: string;
      businessName: string;
      items: number;
      payout: number;
      distanceKm: number | null;
      expiresAt: number;
    }> = [];
    for (const offer of offers) {
      if (offer.expiresAt <= now) continue;
      const order = await ctx.db.get(offer.orderId);
      if (!order || order.courierId || order.status !== "ready") continue;
      const business = await ctx.db.get(order.businessId);
      open.push({
        token: offer.token,
        orderId: order._id,
        code: order.code,
        businessName: business?.name ?? "Local",
        items: order.items.reduce((acc, item) => acc + item.quantity, 0),
        payout: order.deliveryFee + (order.extraStopFee ?? 0),
        distanceKm: order.distanceKm ?? null,
        expiresAt: offer.expiresAt,
      });
    }
    return open.sort((a, b) => a.expiresAt - b.expiresAt);
  },
});

/** Aceptar desde el enlace de WhatsApp: mismo camino que el tablero. */
export const acceptOffer = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const offer = await ctx.db
      .query("deliveryOffers")
      .withIndex("by_token", (q) => q.eq("token", args.token.trim()))
      .unique();
    if (!offer) throw new Error("Esa oferta no existe o ya venció");
    if (offer.courierId !== userId) {
      throw new Error("Esta oferta es para otra cuenta de repartidor");
    }
    if (offer.status !== "open") {
      throw new Error("Esa oferta ya no está disponible");
    }
    if (offer.expiresAt <= Date.now()) {
      await ctx.db.patch(offer._id, { status: "expired" });
      throw new Error(
        "La oferta venció. Mirá las entregas disponibles para tomar otra",
      );
    }
    return await acceptTripForCourier(ctx, userId, offer.orderId, {
      allowRecentLocation: true,
    });
  },
});

/** "Ahora no": la oferta se cierra para este repartidor sin tocar el pedido. */
export const declineOffer = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const offer = await ctx.db
      .query("deliveryOffers")
      .withIndex("by_token", (q) => q.eq("token", args.token.trim()))
      .unique();
    if (!offer || offer.courierId !== userId) {
      throw new Error("Esa oferta no es tuya");
    }
    if (offer.status === "open") {
      await ctx.db.patch(offer._id, { status: "declined" });
    }
    return { declined: true };
  },
});

/** Cierra ofertas vencidas. La ventana es corta: el pedido no puede esperar. */
export const expireOffers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const open = await ctx.db
      .query("deliveryOffers")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    let expired = 0;
    for (const offer of open) {
      if (offer.status !== "open" || offer.expiresAt > now) continue;
      await ctx.db.patch(offer._id, { status: "expired" });
      expired += 1;
    }
    return { expired };
  },
});

/**
 * El repartidor comparte su ubicación aunque no tenga una entrega activa. Es
 * lo que permite ordenar los pedidos por cercanía y bloquear los que quedan
 * demasiado lejos.
 */
export const updateCourierPresence = mutation({
  args: { location: v.object({ lat: v.number(), lng: v.number() }) },
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
    return await saveCourierPresence(ctx, userId, { lat, lng });
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
    // Mantener fresca también la presencia general del repartidor.
    await saveCourierPresence(ctx, userId, { lat, lng });
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
    if (!order.deliveryPin && !trip.some((member) => member.deliveryPin)) {
      throw new Error("No hay PIN de entrega registrado para esta orden; abrí un caso en Ayuda antes de cerrar la entrega");
    }
    // El PIN del comprador confirma que el pedido llegó a la persona correcta.
    const expectedPin =
      order.deliveryPin ?? trip.find((member) => member.deliveryPin)?.deliveryPin;
    const givenPin = (args.pin ?? "").trim();
    if (!givenPin) {
      throw new Error(
        "Pedile el PIN de entrega al comprador para confirmar que recibió el pedido",
      );
    }
    if (givenPin !== expectedPin) {
      throw new Error("El PIN de entrega no coincide. Verificalo con el comprador");
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
    const issue = courierCashIssue(difference);
    if (issue) {
      cashPatch.cashIssue = { ...issue, note, at: now, by: userId };
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
    if (order.status === "picked_up") {
      throw new Error(
        "El pedido ya fue retirado y no se puede cancelar. Si hay un problema, abrí un caso en Ayuda",
      );
    }
    const trip = (await tripOrders(ctx, order)).filter(
      (member) => member.status !== "cancelled",
    );
    const now = Date.now();
    // La compra se cancela completa: una hermana huérfana seguiría en el panel
    // del local como un pedido que el comprador ya no quiere.
    const blocker = buyerCancelBlocker(trip, userId);
    if (blocker) throw new Error(blocker);
    for (const member of trip) {
      await ctx.db.patch(member._id, {
        status: "cancelled",
        cancelledAt: now,
        cancellationReason: "Cancelaste la compra antes de que los locales la confirmaran.",
      });
    }
    return { cancelled: true, orders: trip.length };
  },
});

/**
 * Red de seguridad: un pedido listo que nadie tomó no queda esperando para
 * siempre. Pasado el plazo se cancela solo, sin cobrar nada y conservando el
 * historial. El local puede adelantarse y cancelarlo a los 30 minutos.
 */
export const autoCancelStaleReady = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const threshold =
      now - ASSIGNMENT_RULES.autoCancelAfterMinutes * 60_000;
    const ready = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "ready"))
      .collect();
    let cancelled = 0;
    for (const order of ready) {
      if (order.courierId) continue;
      const trip = await tripForOrder(ctx, order);
      const readyAt = tripReadyAt(trip) ?? order.readyAt;
      if (!readyAt || readyAt > threshold) continue;
      // Se cancela el viaje completo y sólo si nadie lo tomó: si una parada ya
      // salió del local, el resto no se puede abandonar.
      const targets = new Set(autoCancelTargets(trip));
      for (const member of trip) {
        if (!targets.has(member._id)) continue;
        await ctx.db.patch(member._id, {
          status: "cancelled",
          cancelledAt: now,
          cancellationReason: `Nadie tomó la entrega en ${ASSIGNMENT_RULES.autoCancelAfterMinutes} minutos. Se canceló automáticamente y no se cobra nada.`,
        });
        cancelled += 1;
      }
    }
    return { cancelled };
  },
});

/** Pedidos recientes de la cuenta, para asociar un caso de ayuda. */
export const myOrderChoices = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    let orders: Doc<"orders">[] = [];
    if (user?.role === "business") {
      const business = await myBusiness(ctx, userId);
      if (business) {
        orders = await ctx.db
          .query("orders")
          .withIndex("by_business", (q) => q.eq("businessId", business._id))
          .collect();
      }
    } else if (user?.role === "courier") {
      orders = await ctx.db
        .query("orders")
        .withIndex("by_courier", (q) => q.eq("courierId", userId))
        .collect();
    } else {
      orders = await ctx.db
        .query("orders")
        .withIndex("by_buyer", (q) => q.eq("buyerId", userId))
        .collect();
    }
    return orders
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 24)
      .map((order) => ({
        _id: order._id,
        code: order.code,
        status: order.status,
        total: order.total,
        createdAt: order.createdAt,
      }));
  },
});

/** Comprobante digital del pedido, compartido sólo con sus participantes. */
export const receipt = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;
    const business = await ctx.db.get(order.businessId);
    const buyer = await ctx.db.get(order.buyerId);
    const courier = order.courierId ? await ctx.db.get(order.courierId) : null;
    const viewer = await ctx.db.get(userId);
    const allowed =
      order.buyerId === userId ||
      order.courierId === userId ||
      business?.ownerId === userId ||
      isAdminEmail(viewer?.email);
    if (!allowed) return null;

    return {
      code: order.code,
      status: order.status,
      createdAt: order.createdAt,
      acceptedAt: order.acceptedAt ?? null,
      readyAt: order.readyAt ?? null,
      pickedUpAt: order.pickedUpAt ?? null,
      deliveredAt: order.deliveredAt ?? null,
      cancelledAt: order.cancelledAt ?? null,
      cancellationReason: order.cancellationReason ?? null,
      business: business
        ? {
            name: business.name,
            address: business.address,
            image: business.image,
            verified: Boolean(business.verifiedAt),
          }
        : null,
      buyer: buyer ? { name: buyer.name ?? "Cliente", phone: buyer.phone ?? null } : null,
      courier: courier
        ? {
            name: courier.name ?? "Repartidor",
            phone: courier.phone ?? null,
            vehicle: courier.vehicle ?? null,
            verified: courier.verificationStatus === "verified",
          }
        : null,
      items: order.items,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      deliveryDiscount: order.deliveryDiscount ?? 0,
      total: order.total,
      address: order.address,
      notes: order.notes ?? null,
      // Cada secreto se entrega sólo a quien debe validarlo.
      pickupCode: business?.ownerId === userId ? (order.pickupCode ?? null) : null,
      deliveryPin: order.buyerId === userId ? (order.deliveryPin ?? null) : null,
      cashCollected: order.cashCollected ?? null,
      cashCollectedAt: order.cashCollectedAt ?? null,
      cashHanded: order.cashHanded ?? null,
      cashHandedAt: order.cashHandedAt ?? null,
      cashIssue:
        order.courierId === userId || business?.ownerId === userId
          ? (order.cashIssue ?? null)
          : null,
      tripStops: order.tripStops ?? 1,
    };
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
