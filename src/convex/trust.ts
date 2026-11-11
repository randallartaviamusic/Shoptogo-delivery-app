import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { verificationOf } from "../lib/trust";

async function ordersFor(ctx: QueryCtx, userId: Id<"users">, role: string) {
  if (role === "business") {
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .first();
    if (!business) return { orders: [] as Doc<"orders">[], business: null };
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .collect();
    return { orders, business };
  }
  if (role === "courier") {
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_courier", (q) => q.eq("courierId", userId))
      .collect();
    return { orders, business: null };
  }
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_buyer", (q) => q.eq("buyerId", userId))
    .collect();
  return { orders, business: null };
}

/**
 * Historial de confianza de la cuenta: pedidos, cancelaciones e incidencias
 * de efectivo, más el estado de verificación y la calificación.
 */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const role = user.role ?? "buyer";
    const { orders, business } = await ordersFor(ctx, userId, role);
    const sorted = [...orders].sort((a, b) => b.createdAt - a.createdAt);
    const delivered = sorted.filter((order) => order.status === "delivered");
    const cancelled = sorted.filter((order) => order.status === "cancelled");
    const incidents = sorted.filter((order) => Boolean(order.cashIssue));

    const tickets = await ctx.db
      .query("supportTickets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    let reviewsReceived = 0;
    if (role === "business" && business) {
      reviewsReceived = business.reviews;
    } else if (role === "courier") {
      reviewsReceived = user.reviews ?? 0;
    } else {
      const given = await ctx.db
        .query("reviews")
        .withIndex("by_buyer", (q) => q.eq("buyerId", userId))
        .collect();
      reviewsReceived = given.length;
    }

    return {
      role,
      verificationStatus:
        role === "business" || role === "courier"
          ? verificationOf(user.verificationStatus)
          : null,
      verifiedAt: user.verifiedAt ?? null,
      rating:
        role === "business"
          ? (business?.rating ?? null)
          : role === "courier"
            ? (user.rating ?? null)
            : null,
      reviews: reviewsReceived,
      totals: {
        orders: sorted.length,
        delivered: delivered.length,
        cancelled: cancelled.length,
        incidents: incidents.length,
        openTickets: tickets.filter((ticket) => ticket.status !== "resolved")
          .length,
      },
      recentOrders: sorted.slice(0, 8).map((order) => ({
        _id: order._id,
        code: order.code,
        status: order.status,
        total: order.total,
        createdAt: order.createdAt,
        deliveredAt: order.deliveredAt ?? null,
        cancelledAt: order.cancelledAt ?? null,
      })),
      recentCancellations: cancelled.slice(0, 6).map((order) => ({
        _id: order._id,
        code: order.code,
        total: order.total,
        reason: order.cancellationReason ?? "Sin motivo registrado",
        cancelledAt: order.cancelledAt ?? order.createdAt,
      })),
      recentIncidents: incidents.slice(0, 6).map((order) => ({
        _id: order._id,
        code: order.code,
        kind: order.cashIssue!.kind,
        amount: order.cashIssue!.amount,
        note: order.cashIssue!.note,
        at: order.cashIssue!.at,
        resolvedAt: order.cashIssue!.resolvedAt ?? null,
      })),
    };
  },
});
