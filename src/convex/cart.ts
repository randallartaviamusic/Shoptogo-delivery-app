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
  normalizePoint,
  planDeliveryTrips,
  splitIntoDeliveries,
} from "../lib/delivery";
import { promoBadge, promoDiscount } from "../lib/promo";
import type { PromoKind } from "../lib/promo";

type DbCtx = QueryCtx | MutationCtx;

type CheckoutLine = {
  productId: Id<"products">;
  name: string;
  price: number;
  quantity: number;
  image: string;
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
  /** Envío de referencia del local; null si no hay punto de entrega. */
  deliveryFee: number | null;
  /** Parte de los envíos del carrito que cubre el local con su promoción. */
  deliveryDiscount: number;
  promo: { kind: PromoKind; label: string } | null;
  feeFrom: number;
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
  const promoByBusiness = new Map<string, PromoKind | null>();
  const routeFeeByBusiness = new Map<string, number>();

  for (const item of cartItems) {
    const product = await ctx.db.get(item.productId);
    if (!product) continue;
    const business = await ctx.db.get(item.businessId);
    if (!business) continue;

    let group = byBusiness.get(item.businessId);
    if (!group) {
      const quote = deliveryQuote(business.location, dropoff);
      // La promoción es del local y se elige en los ajustes de su tienda.
      const promoKind = business.deliveryPromo ?? null;
      group = {
        businessId: item.businessId,
        businessName: business.name,
        businessImage: business.image,
        deliveryFee: quote?.fee ?? null,
        deliveryDiscount: 0,
        promo: promoKind
          ? { kind: promoKind, label: promoBadge(promoKind) }
          : null,
        feeFrom: DELIVERY_RULES.baseFee,
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
      promoByBusiness.set(item.businessId, promoKind);
      routeFeeByBusiness.set(item.businessId, quote?.fee ?? 0);
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
  }

  // Las entregas se arman con el carrito en orden. El envío se cobra una sola
  // vez por entrega y se reparte entre las tiendas que retira; cada local con
  // promoción activa cubre su parte.
  const trips = planDeliveryTrips(
    cartItems.map((item) => ({
      businessId: item.businessId as string,
      quantity: item.quantity,
    })),
    (businessId) => routeFeeByBusiness.get(businessId) ?? 0,
  ).map((trip) => {
    const stops = trip.stops.map((stop) => {
      const group = byBusiness.get(stop.businessId);
      const promoKind = promoByBusiness.get(stop.businessId) ?? null;
      return {
        ...stop,
        businessName: group?.businessName ?? "Local",
        promoKind,
        deliveryDiscount: promoKind
          ? Math.min(stop.fee, promoDiscount(stop.fee, promoKind))
          : 0,
      };
    });
    const discount = stops.reduce(
      (acc, stop) => acc + stop.deliveryDiscount,
      0,
    );
    return { ...trip, stops, discount, clientFee: trip.fee - discount };
  });

  for (const trip of trips) {
    for (const stop of trip.stops) {
      const group = byBusiness.get(stop.businessId);
      if (group) group.deliveryDiscount += stop.deliveryDiscount;
    }
  }

  const subtotal = groups.reduce((acc, g) => acc + g.subtotal, 0);
  const discountTotal = trips.reduce((acc, trip) => acc + trip.discount, 0);
  const deliveryTotal = trips.reduce((acc, trip) => acc + trip.clientFee, 0);
  const count = groups.reduce(
    (acc, g) => acc + g.items.reduce((a, i) => a + i.quantity, 0),
    0,
  );

  return {
    groups,
    trips,
    count,
    deliveryBatches: Math.max(trips.length, dropoff ? 1 : 0),
    subtotal,
    deliveryTotal,
    deliverySaved: discountTotal,
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
        trips: [],
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
      });
    }

    // Datos de cada local: recorrido hasta el cliente y promo de su tienda.
    const stores = new Map<
      string,
      {
        id: Id<"businesses">;
        fee: number;
        distanceKm: number;
        promoKind: PromoKind | null;
      }
    >();

    for (const businessId of businessIds) {
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
      stores.set(businessId, {
        id: businessId,
        fee: quote.fee,
        distanceKm: quote.distanceKm,
        promoKind: business.deliveryPromo ?? null,
      });
    }

    // Cada entrega lleva hasta 3 productos y puede retirar en varias tiendas.
    // El envío se cobra una sola vez por entrega y se reparte entre las
    // tiendas para que cada una cubra su parte si tiene promoción activa.
    const lines = cartItems.map((item) => {
      const product = byBusiness
        .get(item.businessId)!
        .find((line) => line.productId === item.productId)!;
      return {
        businessId: item.businessId as string,
        productId: item.productId,
        name: product.name,
        price: product.price,
        image: product.image,
        quantity: item.quantity,
      };
    });
    const chunks = splitIntoDeliveries(lines);
    const trips = planDeliveryTrips(lines, (businessId) => {
      return stores.get(businessId)?.fee ?? 0;
    }).map((trip, index) => ({
      ...trip,
      lines: chunks[index],
      stops: trip.stops.map((stop) => ({
        ...stop,
        promoKind: stores.get(stop.businessId)?.promoKind ?? null,
      })),
    }));

    let total = 0;
    let created = 0;
    const now = Date.now();
    const groupCode = `CE-${Math.floor(1000 + Math.random() * 9000)}`;

    for (const trip of trips) {
      const tripStops = trip.stops.length;

      for (const [position, tripStop] of trip.stops.entries()) {
        const store = stores.get(tripStop.businessId);
        if (!store) continue;

        // Productos de este local dentro de la entrega, en orden de carrito.
        const storeLines = trip.lines.filter(
          (line) => line.businessId === tripStop.businessId,
        );
        if (storeLines.length === 0) continue;

        const items = storeLines.map((line) => ({
          productId: line.productId,
          name: line.name,
          price: line.price,
          quantity: line.quantity,
          image: line.image,
        }));
        const subtotal = items.reduce(
          (acc, item) => acc + item.price * item.quantity,
          0,
        );

        // El local cubre la parte de envío que le corresponde en esta entrega
        // (100% o 50%). Queda como gasto promocional suyo, no como comisión.
        const deliveryDiscount = store.promoKind
          ? Math.min(
              tripStop.fee,
              promoDiscount(tripStop.fee, store.promoKind),
            )
          : 0;

        const orderTotal = subtotal + tripStop.fee - deliveryDiscount;
        total += orderTotal;
        created += 1;

        const suffix =
          trips.length > 1 || tripStops > 1
            ? `-${trip.index}${tripStops > 1 ? String.fromCharCode(65 + position) : ""}`
            : "";

        await ctx.db.insert("orders", {
          code: `${groupCode}${suffix}`,
          groupCode,
          batchIndex: trip.index,
          batchCount: trips.length,
          tripStops,
          sameCourier: args.sameCourier ?? false,
          buyerId: userId,
          businessId: store.id,
          items,
          subtotal,
          deliveryFee: tripStop.fee,
          deliveryDiscount: deliveryDiscount || undefined,
          total: orderTotal,
          status: "pending",
          address,
          deliveryLocation: dropoff,
          distanceKm: store.distanceKm,
          notes: args.notes?.trim() || undefined,
          createdAt: now,
        });
      }
    }

    for (const item of cartItems) await ctx.db.delete(item._id);
    await ctx.db.patch(userId, { address, location: dropoff });

    return { created: trips.length, orders: created, total };
  },
});
