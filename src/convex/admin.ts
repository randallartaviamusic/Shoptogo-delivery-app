import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { isAdminEmail } from "./branding";

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
