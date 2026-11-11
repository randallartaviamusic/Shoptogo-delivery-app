import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { geoPointValidator } from "./schema";
import {
  DELIVERY_RULES,
  deliveryQuote,
  isValidPoint,
  MAX_UNITS_PER_DELIVERY,
  normalizePoint,
  splitIntoDeliveries,
} from "../lib/delivery";
import { bestPromoKind, promoBadge, promoDiscount } from "../lib/promo";
import type { PromoKind } from "../lib/promo";

type DbCtx = QueryCtx | MutationCtx;

type CheckoutLine = {
  productId: Id<"products">;
  name: string;
  price: number;
  quantity: number;
  image: string;
  promoKind: PromoKind | null;
};

async function requireUserId(ctx: DbCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Necesitás iniciar sesión");
  return userId;
}

export type CartGroup = {
  businessId: Id<"businesses">;
  businessName: string;
  businessImage: string;
  /** Envío que paga el cliente; null si todavía no hay punto de entrega. */
  deliveryFee: number | null;
  /** Envío sin promo, para mostrar el precio original. */
  deliveryFullFee: number | null;
  /** Parte del envío que absorbe el local por la promoción. */
  deliveryDiscount: number;
  promo: { kind: PromoKind; label: string } | null;
  feeFrom: number;
  /** Cuántas entregas necesita este local (máximo 3 productos cada una). */
  deliveryBatches: number;
  /** Suma de los envíos de todas las entregas, ya con la promo de la primera. */
  deliveryTotal: number;
  distanceKm: number | null;
  deliveryMinutes: number | null;
  deliveryAvailable: boolean;
  etaMinutes: number;
  isOpen: boolean;
  rating: number;
  items: Array<{
    cartItemId: Id<"cartItems">;
    productId: Id<"products">;
    name: string;
    price: number;
    quantity: number;
    image: string;
  }>;
  subtotal: number;
};

async function buildCart(ctx: DbCtx, userId: Id<"users">) {
  const buyer = await ctx.db.get(userId);
  const dropoff = isValidPoint(buyer?.location) ? buyer.location : null;
  const cartItems = await ctx.db
    .query("cartItems")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const byBusiness = new Map<string, CartGroup>();
  const groups: CartGroup[] = [];
  const promosByBusiness = new Map<string, PromoKind[]>();

  for (const item of cartItems) {
    const product = await ctx.db.get(item.productId);
    if (!product) continue;
    const business = await ctx.db.get(item.businessId);
    if (!business) continue;
    const promoKind: PromoKind | null =
      product.promo && product.promo.endsAt > Date.now()
        ? product.promo.kind
        : null;

    let group = byBusiness.get(item.businessId);
    if (!group) {
      const quote = deliveryQuote(business.location, dropoff);
      group = {
        businessId: item.businessId,
        businessName: business.name,
        businessImage: business.image,
        deliveryFee: quote?.fee ?? null,
        deliveryFullFee: quote?.fee ?? null,
        deliveryDiscount: 0,
        promo: null,
        feeFrom: DELIVERY_RULES.baseFee,
        deliveryBatches: 1,
        deliveryTotal: 0,
        distanceKm: quote?.distanceKm ?? null,
        deliveryMinutes: quote?.minutes ?? null,
        deliveryAvailable: quote !== null || dropoff === null,
        etaMinutes: business.etaMinutes,
        isOpen: business.isOpen,
        rating: business.rating,
        items: [],
        subtotal: 0,
      };
      byBusiness.set(item.businessId, group);
      groups.push(group);
    }
    group.items.push({
      cartItemId: item._id,
      productId: item.productId,
      name: product.name,
      price: product.price,
      quantity: item.quantity,
      image: product.image,
    });
    group.subtotal += product.price * item.quantity;

    if (promoKind) {
      const list = promosByBusiness.get(item.businessId) ?? [];
      list.push(promoKind);
      promosByBusiness.set(item.businessId, list);
    }
  }

  // La promo se aplica una vez por local: si algún producto tiene envío gratis,
  // ese pedido no paga envío; si el mejor es 50%, paga la mitad.
  for (const group of groups) {
    const kind = bestPromoKind(promosByBusiness.get(group.businessId) ?? []);
    if (!kind || group.deliveryFullFee === null) continue;
    const discount = promoDiscount(group.deliveryFullFee, kind);
    group.deliveryDiscount = discount;
    group.deliveryFee = group.deliveryFullFee - discount;
    group.promo = { kind, label: promoBadge(kind) };
  }

  for (const group of groups) {
    const units = group.items.reduce((acc, item) => acc + item.quantity, 0);
    group.deliveryBatches = Math.max(
      1,
      Math.ceil(units / MAX_UNITS_PER_DELIVERY),
    );
    group.deliveryTotal =
      (group.deliveryFullFee ?? 0) * group.deliveryBatches - group.deliveryDiscount;
  }

  const subtotal = groups.reduce((acc, g) => acc + g.subtotal, 0);
  const deliveryTotal = groups.reduce((acc, g) => acc + g.deliveryTotal, 0);
  const deliveryBatches = groups.reduce((acc, g) => acc + g.deliveryBatches, 0);
  const count = groups.reduce(
    (acc, g) => acc + g.items.reduce((a, i) => a + i.quantity, 0),
    0,
  );

  return {
    groups,
    count,
    deliveryBatches,
    subtotal,
    deliveryTotal,
    deliverySaved: groups.reduce((acc, g) => acc + g.deliveryDiscount, 0),
    total: subtotal + deliveryTotal,
  };
}

export const myCart = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        groups: [] as CartGroup[],
        count: 0,
        deliveryBatches: 0,
        subtotal: 0,
        deliveryTotal: 0,
        deliverySaved: 0,
        total: 0,
      };
    }
    return await buildCart(ctx, userId);
  },
});

export const add = mutation({
  args: { productId: v.id("products"), quantity: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Ese producto ya no está disponible");
    const business = await ctx.db.get(product.businessId);
    if (!business?.isOpen) {
      throw new Error(`${business?.name ?? "El negocio"} está cerrado ahora`);
    }

    const existing = await ctx.db
      .query("cartItems")
      .withIndex("by_user_product", (q) =>
        q.eq("userId", userId).eq("productId", args.productId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        quantity: existing.quantity + (args.quantity ?? 1),
      });
    } else {
      await ctx.db.insert("cartItems", {
        userId,
        productId: args.productId,
        businessId: product.businessId,
        quantity: args.quantity ?? 1,
        addedAt: Date.now(),
      });
    }
    return { added: product.name };
  },
});

export const setQuantity = mutation({
  args: { productId: v.id("products"), quantity: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("cartItems")
      .withIndex("by_user_product", (q) =>
        q.eq("userId", userId).eq("productId", args.productId),
      )
      .unique();
    if (!existing) return null;
    if (args.quantity <= 0) {
      await ctx.db.delete(existing._id);
      return null;
    }
    await ctx.db.patch(existing._id, {
      quantity: Math.min(Math.round(args.quantity), 20),
    });
    return null;
  },
});

export const remove = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("cartItems")
      .withIndex("by_user_product", (q) =>
        q.eq("userId", userId).eq("productId", args.productId),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const items = await ctx.db
      .query("cartItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const item of items) await ctx.db.delete(item._id);
    return null;
  },
});

export const checkout = mutation({
  args: {
    address: v.string(),
    location: geoPointValidator,
    notes: v.optional(v.string()),
    // El cliente prefiere que el mismo repartidor haga todas las entregas.
    sameCourier: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    // El invitado puede armar el carrito, pero para confirmar necesita cuenta.
    const buyer = await ctx.db.get(userId);
    if (buyer?.isAnonymous) {
      throw new Error(
        "Creá tu cuenta o iniciá sesión para confirmar el pedido",
      );
    }

    const address = args.address.trim();
    if (address.length < 6) {
      throw new Error("Necesitamos una dirección de entrega válida");
    }
    if (!isValidPoint(args.location)) {
      throw new Error("Marcá en el mapa el punto donde querés recibir el pedido");
    }
    const dropoff = normalizePoint(args.location);

    const cartItems = await ctx.db
      .query("cartItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (cartItems.length === 0) throw new Error("Tu carrito está vacío");

    const byBusiness = new Map<string, CheckoutLine[]>();
    const businessIds: Id<"businesses">[] = [];

    for (const item of cartItems) {
      const product = await ctx.db.get(item.productId);
      if (!product) throw new Error("Un producto de tu carrito ya no existe");
      const business = await ctx.db.get(item.businessId);
      if (!business) throw new Error("Un negocio de tu carrito ya no existe");
      if (!business.isOpen) {
        throw new Error(
          `${business.name} cerró. Quitá sus productos para continuar.`,
        );
      }
      if (!byBusiness.has(item.businessId)) {
        byBusiness.set(item.businessId, []);
        businessIds.push(item.businessId);
      }
      byBusiness.get(item.businessId)!.push({
        productId: product._id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        image: product.image,
        promoKind:
          product.promo && product.promo.endsAt > Date.now()
            ? product.promo.kind
            : null,
      });
    }

    let total = 0;
    let created = 0;
    const now = Date.now();
    const groupCode = `CE-${Math.floor(1000 + Math.random() * 9000)}`;

    // Se arma el plan de entregas: máximo 3 productos por entrega, en el mismo
    // orden en que el cliente cargó el carrito.
    const plan: Array<{
      businessId: Id<"businesses">;
      quote: NonNullable<ReturnType<typeof deliveryQuote>>;
      promoKind: PromoKind | null;
      batches: CheckoutLine[][];
    }> = [];

    for (const businessId of businessIds) {
      const items = byBusiness.get(businessId)!;
      const business = await ctx.db.get(businessId);
      if (!business) continue;
      if (!business.location) {
        throw new Error(
          `${business.name} todavía no fijó su ubicación en el mapa. Probá más tarde.`,
        );
      }
      const quote = deliveryQuote(business.location, dropoff);
      if (!quote) {
        throw new Error(
          `Tu punto de entrega queda fuera del área de reparto de ${business.name}.`,
        );
      }
      const promoKind = bestPromoKind(
        items
          .map((item) => item.promoKind)
          .filter((kind): kind is PromoKind => kind !== null),
      );
      plan.push({
        businessId,
        quote,
        promoKind,
        batches: splitIntoDeliveries(items),
      });
    }

    for (const entry of plan) {
      const batchCount = entry.batches.length;
      for (let index = 0; index < batchCount; index += 1) {
        const batch = entry.batches[index];
        const subtotal = batch.reduce((acc, i) => acc + i.price * i.quantity, 0);
        // La promo de envío se aplica una sola vez por local, en su primera entrega.
        const deliveryDiscount =
          index === 0 && entry.promoKind
            ? Math.min(
                entry.quote.fee,
                promoDiscount(entry.quote.fee, entry.promoKind),
              )
            : 0;
        const orderTotal = subtotal + entry.quote.fee - deliveryDiscount;
        total += orderTotal;
        created += 1;
        await ctx.db.insert("orders", {
          code: batchCount > 1 ? `${groupCode}-${index + 1}` : groupCode,
          groupCode,
          batchIndex: index + 1,
          batchCount,
          sameCourier: args.sameCourier ?? false,
          buyerId: userId,
          businessId: entry.businessId,
          items: batch.map((item) => ({
            productId: item.productId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            image: item.image,
          })),
          subtotal,
          deliveryFee: entry.quote.fee,
          deliveryDiscount: deliveryDiscount || undefined,
          total: orderTotal,
          status: "pending",
          address,
          deliveryLocation: dropoff,
          distanceKm: entry.quote.distanceKm,
          notes: args.notes?.trim() || undefined,
          createdAt: now,
        });
      }
    }

    for (const item of cartItems) await ctx.db.delete(item._id);
    await ctx.db.patch(userId, { address, location: dropoff });

    return { created, total };
  },
});
