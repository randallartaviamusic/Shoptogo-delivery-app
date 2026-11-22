import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ASSIGNMENT_RULES, isValidPoint } from "../lib/delivery";
import { cancellationStanding } from "../lib/trust";
import { subscriptionAccess } from "./subscriptions";
import { isBusinessOpenAt, normalizeBusinessHours } from "../lib/hours";
import { businessHourValidator } from "./schema";

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

/** Preferencias Pro del repartidor: radio cercano, aviso con sonido y turnos. */
export const preferences = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "courier") return null;
    const access = await subscriptionAccess(ctx, userId);
    const pro =
      access.hasAccess && (access.plan === "pro" || access.plan === "elite");
    const elite = access.hasAccess && access.plan === "elite";
    const windows = user.availabilityWindows ?? [];
    return {
      plan: access.plan,
      hasAccess: access.hasAccess,
      pro,
      elite,
      preferredRadiusKm: user.preferredRadiusKm ?? ASSIGNMENT_RULES.maxPickupKm,
      offerSoundEnabled: user.offerSoundEnabled ?? true,
      availabilityEnabled: user.availabilityEnabled ?? false,
      availabilityWindows: windows,
      scheduledOnline:
        user.availabilityEnabled && windows.length > 0
          ? isBusinessOpenAt(windows)
          : null,
    };
  },
});

/** Guarda las preferencias Pro del repartidor. */
export const savePreferences = mutation({
  args: {
    preferredRadiusKm: v.optional(v.number()),
    offerSoundEnabled: v.optional(v.boolean()),
    availabilityEnabled: v.optional(v.boolean()),
    availabilityWindows: v.optional(v.array(businessHourValidator)),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Necesitás iniciar sesión");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "courier") {
      throw new ConvexError("Sólo las cuentas de repartidor usan estas preferencias");
    }
    const access = await subscriptionAccess(ctx, userId);
    if (!access.hasAccess || (access.plan !== "pro" && access.plan !== "elite")) {
      throw new ConvexError("El radar y los turnos son del plan Pro o Élite activo");
    }
    const patch: Partial<Doc<"users">> = {};
    if (args.preferredRadiusKm !== undefined) {
      const radius = Math.round(args.preferredRadiusKm);
      if (!Number.isFinite(radius) || radius < 1 || radius > ASSIGNMENT_RULES.maxPickupKm) {
        throw new ConvexError(
          `El radio tiene que estar entre 1 y ${ASSIGNMENT_RULES.maxPickupKm} km`,
        );
      }
      patch.preferredRadiusKm = radius;
    }
    if (args.offerSoundEnabled !== undefined) {
      patch.offerSoundEnabled = args.offerSoundEnabled;
    }
    if (args.availabilityWindows !== undefined) {
      patch.availabilityWindows = normalizeBusinessHours(args.availabilityWindows);
    }
    const enabled = args.availabilityEnabled ?? user.availabilityEnabled ?? false;
    const windows = patch.availabilityWindows ?? user.availabilityWindows ?? [];
    if (enabled && windows.length === 0) {
      throw new ConvexError("Activá al menos un turno para usar la disponibilidad programada");
    }
    if (args.availabilityEnabled !== undefined) {
      patch.availabilityEnabled = args.availabilityEnabled;
    }
    await ctx.db.patch(userId, patch);
    return { saved: true };
  },
});

/**
 * Radar de zona caliente Pro: agrupa retiros de las últimas 24 horas en celdas
 * de ~2 km y devuelve las 6 con más movimiento y mejor ganancia.
 */
export const hotspots = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "courier") return [];
    const access = await subscriptionAccess(ctx, userId);
    if (!access.hasAccess || (access.plan !== "pro" && access.plan !== "elite")) {
      return [];
    }
    const now = Date.now();
    const since = now - 24 * 60 * 60 * 1000;
    const ready = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "ready"))
      .collect();
    const delivered = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "delivered"))
      .order("desc")
      .take(500);
    const recent = delivered.filter(
      (order) => (order.deliveredAt ?? 0) >= since,
    );
    const cells = new Map<
      string,
      {
        lat: number;
        lng: number;
        trips: number;
        payout: number;
        names: Map<string, number>;
      }
    >();
    for (const order of [...ready, ...recent]) {
      const business = await ctx.db.get(order.businessId);
      if (!isValidPoint(business?.location)) continue;
      const cell = 0.02;
      const key = `${Math.floor(business.location.lat / cell)},${Math.floor(
        business.location.lng / cell,
      )}`;
      const entry = cells.get(key) ?? {
        lat: (Math.floor(business.location.lat / cell) + 0.5) * cell,
        lng: (Math.floor(business.location.lng / cell) + 0.5) * cell,
        trips: 0,
        payout: 0,
        names: new Map<string, number>(),
      };
      entry.trips += 1;
      entry.payout += order.deliveryFee + (order.extraStopFee ?? 0);
      entry.names.set(business.name, (entry.names.get(business.name) ?? 0) + 1);
      cells.set(key, entry);
    }
    return Array.from(cells.values())
      .sort((a, b) => b.trips - a.trips || b.payout - a.payout)
      .slice(0, 6)
      .map((entry) => ({
        lat: Math.round(entry.lat * 1000) / 1000,
        lng: Math.round(entry.lng * 1000) / 1000,
        trips: entry.trips,
        payout: entry.payout,
        places: Array.from(entry.names.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([name]) => name),
      }));
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
