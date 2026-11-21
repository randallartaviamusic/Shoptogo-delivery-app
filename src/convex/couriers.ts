import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ASSIGNMENT_RULES } from "../lib/delivery";
import { cancellationStanding } from "../lib/trust";
import { subscriptionAccess } from "./subscriptions";

const LOCATION_FRESH_MS = ASSIGNMENT_RULES.maxLocationAgeMinutes * 60_000;

function tripKey(order: Doc<"orders">) {
  return `${order.groupCode ?? order.code}#${order.batchIndex ?? 1}`;
}

function activeTrips(orders: Doc<"orders">[]) {
  const seen = new Set<string>();
  for (const order of orders) {
    if (order.status !== "ready" && order.status !== "picked_up") continue;
    seen.add(tripKey(order));
  }
  return seen.size;
}

/**
 * Directorio de repartidores para un negocio. Incluye a todos los de la
 * plataforma, con los favoritos del local primero y el estado operativo que
 * importa al momento de asignar una entrega.
 */
export const forBusiness = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .first();
    if (!business) return null;

    const couriers = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "courier"))
      .collect();
    const favoriteIds = new Set(
      (business.favoriteCourierIds ?? []).map(String),
    );
    const now = Date.now();
    const rows = [];

    for (const courier of couriers) {
      const presence = await ctx.db
        .query("courierPresence")
        .withIndex("by_owner", (q) => q.eq("ownerId", courier._id))
        .unique();
      const online =
        !!presence && now - presence.updatedAt <= LOCATION_FRESH_MS;
      const orders = await ctx.db
        .query("orders")
        .withIndex("by_courier", (q) => q.eq("courierId", courier._id))
        .collect();
      const active = activeTrips(orders);
      const openCashIssues = orders.filter(
        (order) => order.cashIssue && !order.cashIssue.resolvedAt,
      ).length;
      const renouncements = (courier.courierRenouncements ?? []).filter(
        (at) => now - at <= 30 * 86_400_000,
      ).length;
      const standing = cancellationStanding({
        role: "courier",
        cancellations30d: renouncements,
        openCashIssues,
      });
      const access = await subscriptionAccess(ctx, courier._id);
      const verified = courier.verificationStatus === "verified";

      rows.push({
        _id: courier._id,
        name: courier.name?.trim() || "Repartidor Shop To Go",
        image: courier.image ?? "",
        vehicle: courier.vehicle?.trim() || "Sin vehículo registrado",
        rating: courier.rating ?? null,
        reviews: courier.reviews ?? 0,
        deliveries: orders.filter((order) => order.status === "delivered")
          .length,
        verified,
        online,
        available:
          verified &&
          online &&
          !standing.restricted &&
          access.hasAccess &&
          active < ASSIGNMENT_RULES.maxActiveTrips,
        activeDeliveries: active,
        favorite: favoriteIds.has(String(courier._id)),
      });
    }

    rows.sort(
      (a, b) =>
        Number(b.favorite) - Number(a.favorite) ||
        Number(b.available) - Number(a.available) ||
        Number(b.verified) - Number(a.verified) ||
        (b.rating ?? 0) - (a.rating ?? 0) ||
        a.name.localeCompare(b.name),
    );

    return {
      businessId: business._id,
      favorites: rows.filter((row) => row.favorite).length,
      couriers: rows,
    };
  },
});

/** El local guarda o quita a un repartidor de su lista de favoritos. */
export const toggleFavorite = mutation({
  args: { courierId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("Iniciá sesión para elegir tus repartidores");
    }
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .first();
    if (!business) {
      throw new ConvexError("Ese repartidor no pertenece a tu local");
    }
    const courier = await ctx.db.get(args.courierId);
    if (!courier || courier.role !== "courier") {
      throw new ConvexError("Ese repartidor ya no está disponible");
    }

    const favorites = business.favoriteCourierIds ?? [];
    const exists = favorites.includes(args.courierId);
    const next = exists
      ? favorites.filter((id) => id !== args.courierId)
      : [...favorites, args.courierId];
    await ctx.db.patch(business._id, { favoriteCourierIds: next });
    return { favorite: !exists, favorites: next.length };
  },
});
