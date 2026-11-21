import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function clampRating(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(5, Math.max(1, Math.round(value)));
}

function average(current: number, count: number, next: number) {
  if (count <= 0) return { rating: next, reviews: 1 };
  return {
    rating: Math.round(((current * count + next) / (count + 1)) * 10) / 10,
    reviews: count + 1,
  };
}

/**
 * El comprador califica por separado al negocio y al repartidor. Solo se
 * permite una vez por pedido y cuando la entrega ya se completó.
 */
export const submit = mutation({
  args: {
    orderId: v.id("orders"),
    businessRating: v.number(),
    courierRating: v.optional(v.number()),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Ese pedido no existe");
    if (order.buyerId !== userId) {
      throw new Error("Sólo el comprador puede calificar este pedido");
    }
    if (order.status !== "delivered") {
      throw new Error("Podés calificar cuando el pedido ya fue entregado");
    }
    const businessRating = clampRating(args.businessRating);
    if (!businessRating) throw new Error("Elegí una calificación para el negocio");
    const courierRating = args.courierRating
      ? clampRating(args.courierRating)
      : undefined;
    if (order.courierId && !courierRating) {
      throw new Error("Calificá también al repartidor");
    }
    const existing = await ctx.db
      .query("reviews")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .unique();
    if (existing) throw new Error("Ya calificaste este pedido");

    const comment = (args.comment ?? "").trim().slice(0, 500);
    const reviewId = await ctx.db.insert("reviews", {
      orderId: args.orderId,
      buyerId: userId,
      businessId: order.businessId,
      courierId: order.courierId,
      businessRating,
      courierRating,
      comment: comment || undefined,
      createdAt: Date.now(),
    });

    const business = await ctx.db.get(order.businessId);
    if (business) {
      const next = average(business.rating, business.reviews, businessRating);
      await ctx.db.patch(business._id, next);
    }
    if (order.courierId && courierRating) {
      const courier = await ctx.db.get(order.courierId);
      if (courier) {
        const next = average(
          courier.rating ?? 0,
          courier.reviews ?? 0,
          courierRating,
        );
        await ctx.db.patch(courier._id, next);
      }
    }

    return { reviewId, businessRating, courierRating: courierRating ?? null };
  },
});

/**
 * Entregas completadas que el negocio todavía no calificó. Cada pedido se
 * puede reseñar una sola vez y la fila desaparece en cuanto se envía.
 */
export const pendingBusinessCourierReviews = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .first();
    if (!business) return [];

    const [orders, given] = await Promise.all([
      ctx.db
        .query("orders")
        .withIndex("by_business", (q) => q.eq("businessId", business._id))
        .collect(),
      ctx.db
        .query("businessCourierReviews")
        .withIndex("by_business", (q) => q.eq("businessId", business._id))
        .collect(),
    ]);
    const reviewed = new Set(given.map((review) => String(review.orderId)));
    const pending = orders
      .filter(
        (order) =>
          order.status === "delivered" &&
          !!order.courierId &&
          !reviewed.has(String(order._id)),
      )
      .sort(
        (a, b) =>
          (b.deliveredAt ?? b.createdAt) - (a.deliveredAt ?? a.createdAt),
      )
      .slice(0, 20);

    const rows = [];
    for (const order of pending) {
      if (!order.courierId) continue;
      const courier = await ctx.db.get(order.courierId);
      if (!courier || courier.role !== "courier") continue;
      rows.push({
        orderId: order._id,
        code: order.code,
        deliveredAt: order.deliveredAt ?? order.createdAt,
        courierId: courier._id,
        courierName: courier.name?.trim() || "Repartidor Shop To Go",
        courierImage: courier.image ?? "",
      });
    }
    return rows;
  },
});

/**
 * El negocio califica al repartidor de una entrega completada. La reseña se
 * guarda separada de la del comprador y actualiza el promedio del repartidor.
 */
export const submitBusinessCourierReview = mutation({
  args: {
    orderId: v.id("orders"),
    rating: v.number(),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .first();
    if (!business) throw new Error("No tenés un negocio asociado");
    const order = await ctx.db.get(args.orderId);
    if (!order || order.businessId !== business._id) {
      throw new Error("Ese pedido no pertenece a tu negocio");
    }
    if (order.status !== "delivered") {
      throw new Error("Podés calificar cuando la entrega ya se completó");
    }
    if (!order.courierId) {
      throw new Error("Ese pedido no tiene un repartidor asignado");
    }
    const rating = clampRating(args.rating);
    if (!rating) throw new Error("Elegí una calificación para el repartidor");
    const existing = await ctx.db
      .query("businessCourierReviews")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .unique();
    if (existing) throw new Error("Ya calificaste esta entrega");

    const courier = await ctx.db.get(order.courierId);
    if (!courier || courier.role !== "courier") {
      throw new Error("Ese repartidor ya no está disponible");
    }
    const comment = (args.comment ?? "").trim().slice(0, 500);
    const reviewId = await ctx.db.insert("businessCourierReviews", {
      orderId: args.orderId,
      businessId: business._id,
      courierId: order.courierId,
      reviewerId: userId,
      rating,
      comment: comment || undefined,
      createdAt: Date.now(),
    });
    const next = average(
      courier.rating ?? 0,
      courier.reviews ?? 0,
      rating,
    );
    await ctx.db.patch(courier._id, next);
    return { reviewId, rating };
  },
});

/** Calificación de un pedido, visible sólo para las partes involucradas. */
export const forOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;
    const business = await ctx.db.get(order.businessId);
    const isBuyer = order.buyerId === userId;
    const isOwner = business?.ownerId === userId;
    const isCourier = order.courierId === userId;
    if (!isBuyer && !isOwner && !isCourier) return null;
    const review = await ctx.db
      .query("reviews")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .unique();
    if (!review) return null;
    return {
      _id: review._id,
      businessRating: review.businessRating,
      courierRating: review.courierRating ?? null,
      comment: review.comment ?? null,
      createdAt: review.createdAt,
    };
  },
});
