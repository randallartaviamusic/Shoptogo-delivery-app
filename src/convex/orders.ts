import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type DbCtx = QueryCtx | MutationCtx;

async function myBusiness(ctx: DbCtx, userId: Id<"users">) {
  return await ctx.db
    .query("businesses")
    .withIndex("by_owner", (q) => q.eq("ownerId", userId))
    .first();
}

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

async function decorateOrder(
  ctx: DbCtx,
  order: Doc<"orders">,
  business: Doc<"businesses"> | null,
) {
  const buyer = await ctx.db.get(order.buyerId);
  const courier = order.courierId ? await ctx.db.get(order.courierId) : null;
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
    createdAt: order.createdAt,
    acceptedAt: order.acceptedAt ?? null,
    readyAt: order.readyAt ?? null,
    pickedUpAt: order.pickedUpAt ?? null,
    deliveredAt: order.deliveredAt ?? null,
    cancelledAt: order.cancelledAt ?? null,
    businessId: order.businessId,
    businessName: business?.name ?? "Capricho Express",
    businessImage: business?.image ?? "",
    businessAddress: business?.address ?? "",
    etaMinutes: business?.etaMinutes ?? 25,
    buyerName: buyer?.name ?? "Cliente Capricho",
    buyerPhone: buyer?.phone ?? null,
    courierId: order.courierId ?? null,
    courierName: courier?.name ?? null,
    courierPhone: courier?.phone ?? null,
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
      result.push(await decorateOrder(ctx, order, business));
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
      decorated.push(await decorateOrder(ctx, order, business));
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
      },
      orders: decorated,
      stats: {
        // Lo que el local cubrió de envío por promociones se descuenta de su liquidación.
        revenueToday:
          deliveredToday.reduce(
            (acc, o) => acc + o.subtotal - (o.deliveryDiscount ?? 0),
            0,
          ),
        deliveredToday: deliveredToday.length,
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

    const readyOrders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "ready"))
      .collect();
    const available = [];
    for (const order of readyOrders) {
      if (order.courierId) continue;
      const business = await ctx.db.get(order.businessId);
      available.push(await decorateOrder(ctx, order, business));
    }

    const mine = await ctx.db
      .query("orders")
      .withIndex("by_courier", (q) => q.eq("courierId", userId))
      .collect();
    const sortedMine = mine.sort((a, b) => b.createdAt - a.createdAt);

    const active = [];
    const history = [];
    for (const order of sortedMine) {
      const business = await ctx.db.get(order.businessId);
      const decorated = await decorateOrder(ctx, order, business);
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
        earningsToday: deliveredToday.reduce((acc, o) => acc + o.deliveryFee, 0),
        earningsTotal: history.reduce((acc, o) => acc + o.deliveryFee, 0),
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

    const patch: Partial<Doc<"orders">> = { status: args.status };
    const stamp = TIMESTAMP[args.status];
    if (stamp) patch[stamp] = Date.now();
    await ctx.db.patch(args.orderId, patch);
    return { status: args.status };
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
    if (order.status !== "ready") throw new Error("El pedido todavía no está listo");
    if (order.courierId) throw new Error("Otro repartidor ya tomó este pedido");

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

    await ctx.db.patch(args.orderId, { courierId: userId });
    return { accepted: true };
  },
});

export const courierUpdateStatus = mutation({
  args: {
    orderId: v.id("orders"),
    status: v.union(v.literal("picked_up"), v.literal("delivered")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Ese pedido no existe");
    if (order.courierId !== userId) {
      throw new Error("Este pedido no está asignado a vos");
    }
    if (args.status === "picked_up") {
      if (order.status !== "ready") throw new Error("El pedido no está listo");
      await ctx.db.patch(args.orderId, {
        status: "picked_up",
        pickedUpAt: Date.now(),
      });
    } else {
      if (order.status !== "picked_up") {
        throw new Error("Primero marcá el pedido como recogido");
      }
      await ctx.db.patch(args.orderId, {
        status: "delivered",
        deliveredAt: Date.now(),
      });
    }
    return { status: args.status };
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
    return await decorateOrder(ctx, order, business);
  },
});
