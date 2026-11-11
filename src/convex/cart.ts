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

  const subtotal = groups.reduce((acc, g) => acc + g.subtotal, 0);
  const discountTotal = groups.reduce(
    (acc, g) => acc + g.deliveryDiscount,
    0,
  );

  // Las entregas se arman con el carrito en orden. Una entrega puede retirar
  // en varias tiendas y por eso suma las tarifas de cada recorrido más el
  // recargo por tienda adicional.
  const feeByBusiness = new Map<string, number>(
    groups.map((group) => [group.businessId, group.deliveryFullFee ?? 0]),
  );
  const trips = planDeliveryTrips(
    cartItems.map((item) => ({
      businessId: item.businessId as string,
      quantity: item.quantity,
    })),
    (businessId) => feeByBusiness.get(businessId) ?? 0,
  ).map((trip) => ({
    ...trip,
    stops: trip.stops.map((stop) => ({
      ...stop,
      businessName:
        groups.find((group) => group.businessId === stop.businessId)
          ?.businessName ?? "Local",
    })),
  }));

  const deliveryTotal =
    trips.reduce((acc, trip) => acc + trip.fee, 0) - discountTotal;
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
        promoKind:
          product.promo && product.promo.endsAt > Date.now()
            ? product.promo.kind
            : null,
      });
    }

    // Datos de cada local: recorrido hasta el cliente y promo vigente.
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
      stores.set(businessId, {
        id: businessId,
        fee: quote.fee,
        distanceKm: quote.distanceKm,
        promoKind: bestPromoKind(
          items
            .map((item) => item.promoKind)
            .filter((kind): kind is PromoKind => kind !== null),
        ),
      });
    }

    // Cada entrega lleva hasta 3 productos y puede retirar en varias tiendas;
    // en ese caso se cobra el recorrido de cada una más el recargo por parada.
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
    const trips = splitIntoDeliveries(lines).map((chunk, index) => {
      const storeIds: string[] = [];
      for (const line of chunk) {
        if (!storeIds.includes(line.businessId)) storeIds.push(line.businessId);
      }
      const tripStops = storeIds.map((businessId) => ({
        businessId,
        fee: stores.get(businessId)?.fee ?? 0,
      }));
      const stopFee =
        DELIVERY_RULES.extraStopFee * Math.max(0, tripStops.length - 1);
      return {
        index: index + 1,
        stops: tripStops,
        stopFee,
        fee: tripStops.reduce((acc, stop) => acc + stop.fee, 0) + stopFee,
        lines: chunk,
      };
    });

    let total = 0;
    let created = 0;
    const now = Date.now();
    const groupCode = `CE-${Math.floor(1000 + Math.random() * 9000)}`;
    // La promo de envío se aplica una sola vez por local, en su primera entrega.
    const discounted = new Set<string>();

    for (const trip of trips) {
      const tripStops = trip.stops.length;
      // El recargo por tienda adicional se cobra una sola vez por entrega y
      // queda visible en la primera parada del viaje.
      let pendingStopFee = trip.stopFee;

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

        const firstForStore = !discounted.has(tripStop.businessId);
        const deliveryDiscount =
          firstForStore && store.promoKind
            ? Math.min(
                store.fee,
                promoDiscount(store.fee, store.promoKind),
              )
            : 0;
        if (firstForStore) discounted.add(tripStop.businessId);

        const extraStopFee = position === 0 ? pendingStopFee : 0;
        pendingStopFee -= extraStopFee;
        const orderTotal =
          subtotal + store.fee - deliveryDiscount + extraStopFee;
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
          extraStopFee: extraStopFee || undefined,
          sameCourier: args.sameCourier ?? false,
          buyerId: userId,
          businessId: store.id,
          items,
          subtotal,
          deliveryFee: store.fee,
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
