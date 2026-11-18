import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { isAdminEmail } from "./branding";
import { ASSIGNMENT_RULES, deliveryQuote } from "../lib/delivery";
import { hasSubscriptionAccess, subscriptionStatus } from "../lib/subscriptions";

/**
 * Gestión de cuentas para el perfil administrador: revisar, filtrar y borrar
 * cuentas falsas, duplicadas, de spam o problemáticas.
 */

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Necesitás iniciar sesión");
  const user = await ctx.db.get(userId);
  if (!user || !isAdminEmail(user.email)) {
    throw new Error("Sólo el perfil administrador puede gestionar cuentas");
  }
  return user;
}

const OPEN_ORDER_STATUSES = [
  "pending",
  "accepted",
  "preparing",
  "ready",
  "picked_up",
] as const;

/** Lista de cuentas con su actividad, filtrrable por nombre, correo o teléfono. */
export const users = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const all = await ctx.db.query("users").collect();
    const businesses = await ctx.db.query("businesses").collect();
    const orders = await ctx.db.query("orders").collect();
    const swipes = await ctx.db.query("swipes").collect();

    const businessByOwner = new Map(
      businesses
        .filter((business) => business.ownerId)
        .map((business) => [business.ownerId!, business]),
    );

    const orderCount = new Map<string, number>();
    for (const order of orders) {
      orderCount.set(order.buyerId, (orderCount.get(order.buyerId) ?? 0) + 1);
    }

    const swipeCount = new Map<string, number>();
    for (const swipe of swipes) {
      swipeCount.set(swipe.userId, (swipeCount.get(swipe.userId) ?? 0) + 1);
    }

    const emailCount = new Map<string, number>();
    for (const user of all) {
      const key = (user.email ?? "").trim().toLowerCase();
      if (!key) continue;
      emailCount.set(key, (emailCount.get(key) ?? 0) + 1);
    }

    const term = (args.search ?? "").trim().toLowerCase();
    const rows = all
      .filter((user) => {
        if (!term) return true;
        return [user.name, user.email, user.phone].some((value) =>
          (value ?? "").toLowerCase().includes(term),
        );
      })
      .map((user) => ({
        _id: user._id,
        name: user.name ?? null,
        email: user.email ?? null,
        phone: user.phone ?? null,
        role: user.role ?? null,
        city: user.city ?? null,
        createdAt: user._creationTime,
        isAnonymous: user.isAnonymous ?? false,
        isMe: user._id === admin._id,
        isAdmin: isAdminEmail(user.email),
        sameEmail: emailCount.get((user.email ?? "").trim().toLowerCase()) ?? 1,
        businessName: businessByOwner.get(user._id)?.name ?? null,
        orders: orderCount.get(user._id) ?? 0,
        swipes: swipeCount.get(user._id) ?? 0,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);

    return {
      users: rows,
      total: all.length,
      anonymous: all.filter((user) => user.isAnonymous).length,
      duplicates: Array.from(emailCount.values()).filter((count) => count > 1)
        .length,
    };
  },
});

/** Tendencias globales para el panel privado de administración. */
export const analytics = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const days = args.days === 7 ? 7 : 30;
    const start = now - days * 86_400_000;
    const localOffset = 6 * 60 * 60 * 1000;
    const localToday = new Date(now - localOffset);
    localToday.setUTCHours(0, 0, 0, 0);
    const todayStart = localToday.getTime() + localOffset;
    const orders = await ctx.db.query("orders").collect();
    const businesses = await ctx.db.query("businesses").collect();
    const users = await ctx.db.query("users").collect();
    const subscriptions = await ctx.db.query("subscriptions").collect();
    const presences = await ctx.db.query("courierPresence").collect();

    const selectedOrders = orders.filter((order) => order.createdAt >= start);
    const delivered = orders.filter(
      (order) => order.status === "delivered" && (order.deliveredAt ?? 0) >= start,
    );
    const cancelled = selectedOrders.filter((order) => order.status === "cancelled");
    const businessById = new Map(businesses.map((business) => [business._id, business]));
    const userById = new Map(users.map((user) => [user._id, user]));

    const orderHours = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${String(hour).padStart(2, "0")}:00`,
      orders: 0,
    }));
    for (const order of orders) {
      if (order.createdAt < todayStart || order.createdAt >= todayStart + 86_400_000) continue;
      const hour = new Date(order.createdAt - localOffset).getUTCHours();
      orderHours[hour].orders += 1;
    }

    let measured = 0;
    let onTime = 0;
    let totalPromisedMinutes = 0;
    let totalActualMinutes = 0;
    let totalDelayMinutes = 0;
    for (const order of delivered) {
      const business = businessById.get(order.businessId);
      const promisedMinutes = deliveryQuote(
        business?.location,
        order.deliveryLocation,
      )?.minutes;
      const deliveredAt = order.deliveredAt;
      if (promisedMinutes === undefined || promisedMinutes === null || !deliveredAt) continue;
      const startsAt = order.pickedUpAt ?? order.readyAt ?? order.acceptedAt ?? order.createdAt;
      const actualMinutes = Math.max(0, (deliveredAt - startsAt) / 60_000);
      const delayMinutes = actualMinutes - promisedMinutes;
      measured += 1;
      totalPromisedMinutes += promisedMinutes;
      totalActualMinutes += actualMinutes;
      totalDelayMinutes += delayMinutes;
      if (delayMinutes <= ASSIGNMENT_RULES.delayToleranceMinutes) onTime += 1;
    }

    const activeUntil = now + 7 * 86_400_000;
    const subscriptionsByOwner = new Map(
      subscriptions.map((subscription) => [subscription.ownerId, subscription]),
    );
    const expiringBusinesses = businesses
      .filter((business) => business.ownerId)
      .flatMap((business) => {
        const owner = userById.get(business.ownerId!);
        if (!owner) return [];
        const subscription = subscriptionsByOwner.get(owner._id);
        const until = subscription?.activeUntil;
        if (until === undefined || until <= now || until > activeUntil) return [];
        return [{
          businessId: business._id,
          name: business.name,
          ownerName: owner.name ?? owner.email ?? "Cuenta",
          activeUntil: until,
          daysLeft: Math.ceil((until - now) / 86_400_000),
        }];
      })
      .sort((a, b) => a.activeUntil - b.activeUntil);

    const usersById = new Map(users.map((user) => [user._id, user]));
    const activeCouriers = [];
    for (const presence of presences) {
      if (now - presence.updatedAt > ASSIGNMENT_RULES.maxLocationAgeMinutes * 60_000) continue;
      const courier = usersById.get(presence.ownerId);
      if (courier?.role !== "courier" || courier.verificationStatus !== "verified") continue;
      const subscription = subscriptionsByOwner.get(courier._id);
      if (!hasSubscriptionAccess(subscriptionStatus(subscription?.activeUntil))) continue;
      activeCouriers.push({
        userId: courier._id,
        name: courier.name ?? "Repartidor",
        lastSeenAt: presence.updatedAt,
      });
    }

    return {
      days,
      generatedAt: now,
      metrics: {
        gmv: delivered.reduce((sum, order) => sum + order.total, 0),
        completedOrders: delivered.length,
        orders: selectedOrders.length,
        cancellations: cancelled.length,
        cancellationRate: selectedOrders.length ? cancelled.length / selectedOrders.length : 0,
        averagePromisedMinutes: measured ? totalPromisedMinutes / measured : null,
        averageActualMinutes: measured ? totalActualMinutes / measured : null,
        averageDelayMinutes: measured ? totalDelayMinutes / measured : null,
        onTimeRate: measured ? onTime / measured : null,
        measuredDeliveries: measured,
        activeCourierCount: activeCouriers.length,
        expiringBusinessCount: expiringBusinesses.length,
      },
      ordersByHour: orderHours,
      activeCouriers: activeCouriers.sort((a, b) => a.name.localeCompare(b.name)),
      expiringBusinesses,
    };
  },
});

/**
 * Borra la cuenta con todo lo que le pertenece: carrito, swipes, pedidos
 * abiertos, su local con productos y sus sesiones. Los pedidos entregados se
 * conservan como historial y los que tenía asignados como repartidor quedan
 * libres para otro repartidor.
 */
export const deleteUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (admin._id === args.userId) {
      throw new Error("No podés eliminar tu propia cuenta administradora");
    }
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("Esa cuenta ya no existe");
    if (isAdminEmail(user.email)) {
      throw new Error("No se puede eliminar otra cuenta administradora");
    }

    const cleared = {
      cartItems: 0,
      swipes: 0,
      orders: 0,
      products: 0,
      businesses: 0,
      sessions: 0,
    };

    for (const item of await ctx.db
      .query("cartItems")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect()) {
      await ctx.db.delete(item._id);
      cleared.cartItems += 1;
    }

    for (const swipe of await ctx.db
      .query("swipes")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect()) {
      await ctx.db.delete(swipe._id);
      cleared.swipes += 1;
    }

    // Pedidos como comprador: se borran los que siguen abiertos y se conservan
    // los entregados o cancelados como historial del local.
    for (const order of await ctx.db
      .query("orders")
      .withIndex("by_buyer", (q) => q.eq("buyerId", args.userId))
      .collect()) {
      if (order.status === "delivered" || order.status === "cancelled") continue;
      await ctx.db.delete(order._id);
      cleared.orders += 1;
    }

    // Pedidos asignados como repartidor: los abiertos vuelven a la lista.
    for (const order of await ctx.db
      .query("orders")
      .withIndex("by_courier", (q) => q.eq("courierId", args.userId))
      .collect()) {
      if (order.status === "delivered" || order.status === "cancelled") continue;
      await ctx.db.patch(order._id, { courierId: undefined });
    }

    // Local propio: se borra con su catálogo y sus pedidos abiertos.
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
      .first();
    if (business) {
      for (const product of await ctx.db
        .query("products")
        .withIndex("by_business", (q) => q.eq("businessId", business._id))
        .collect()) {
        await ctx.db.delete(product._id);
        cleared.products += 1;
      }
      for (const order of await ctx.db
        .query("orders")
        .withIndex("by_business", (q) => q.eq("businessId", business._id))
        .collect()) {
        if (
          !OPEN_ORDER_STATUSES.includes(
            order.status as (typeof OPEN_ORDER_STATUSES)[number],
          )
        ) {
          continue;
        }
        await ctx.db.delete(order._id);
        cleared.orders += 1;
      }
      await ctx.db.delete(business._id);
      cleared.businesses += 1;
    }

    // Credenciales: se cierran sus sesiones y se borran sus accesos.
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const session of sessions) {
      for (const token of await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect()) {
        await ctx.db.delete(token._id);
      }
      await ctx.db.delete(session._id);
      cleared.sessions += 1;
    }
    for (const account of await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", args.userId))
      .collect()) {
      await ctx.db.delete(account._id);
    }

    await ctx.db.delete(args.userId);
    return cleared;
  },
});
