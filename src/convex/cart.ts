import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  fulfillmentMethodValidator,
  geoPointValidator,
  productOptionChoiceValidator,
} from "./schema";
import { requireSubscriptionAccess } from "./subscriptions";
import { requireVerifiedAccount } from "./verification";
import {
  DELIVERY_RULES,
  deliveryQuote,
  isValidPoint,
  normalizePoint,
  planDeliveryTrips,
  splitIntoDeliveries,
} from "../lib/delivery";
import { promoBadge, promoDiscount } from "../lib/promo";
import { businessDue, checkoutSummary } from "../lib/orders";
import { money } from "../lib/format";
import { normalizePhone } from "../lib/notify";
import { normalizeSinpeNumber } from "../lib/sinpe";
import { scheduleBlocker } from "../lib/scheduling";
import { fulfillmentNotice } from "../lib/fulfillment";
import { discountFor, findCoupon } from "./coupons";
import { queueNotice } from "./notifications";
import { internal } from "./_generated/api";
import type { PromoKind } from "../lib/promo";
import {
  choiceKey,
  defaultChoices,
  validateChoices,
  type ProductOptionChoice,
  type SelectedProductOption,
} from "../lib/productOptions";

type DbCtx = QueryCtx | MutationCtx;

type CheckoutLine = {
  cartItemId: Id<"cartItems">;
  productId: Id<"products">;
  name: string;
  price: number;
  quantity: number;
  image: string;
  options: SelectedProductOption[];
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
  /** Cupón del local aplicado a esta tienda, si el código sirve. */
  coupon: { code: string; label: string } | null;
  couponDiscount: number;
  feeFrom: number;
  distanceKm: number | null;
  deliveryMinutes: number | null;
  deliveryAvailable: boolean;
  etaMinutes: number;
  isOpen: boolean;
  rating: number;
  /** Cobro directo: SINPE Móvil y WhatsApp configurados por el local. */
  sinpePhone: string | null;
  whatsappPhone: string | null;
  sinpeReady: boolean;
  /** Total de esta tienda si el comprador paga por SINPE (productos + envío). */
  paymentAmount: number;
  items: Array<{
    cartItemId: Id<"cartItems">;
    productId: Id<"products">;
    name: string;
    price: number;
    quantity: number;
    image: string;
    options: SelectedProductOption[];
    isAvailable: boolean;
    stockEnabled: boolean;
    stock: number | null;
    reservable: boolean;
    blockedSlots: Array<{ start: number; end: number; note?: string }>;
  }>;
  subtotal: number;
};

async function buildCart(
  ctx: DbCtx,
  userId: Id<"users">,
  couponCode?: string | null,
  fulfillment?: "dine_in" | "pickup" | "delivery" | "reservation",
) {
  const buyer = await ctx.db.get(userId);
  const needsDelivery = (fulfillment ?? "delivery") === "delivery";
  const dropoff = isValidPoint(buyer?.location) ? buyer.location : null;
  const cartItems = await ctx.db
    .query("cartItems")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const byBusiness = new Map<string, CartGroup>();
  const groups: CartGroup[] = [];
  const promoByBusiness = new Map<string, PromoKind | null>();
  const routeFeeByBusiness = new Map<string, number>();
  const couponByBusiness = new Map<string, Doc<"coupons"> | null>();

  for (const item of cartItems) {
    const product = await ctx.db.get(item.productId);
    if (!product) continue;
    const business = await ctx.db.get(item.businessId);
    if (!business) continue;

    let group = byBusiness.get(item.businessId);
    if (!group) {
      // Sin entrega a domicilio no hay envío: el comprador pasa por el local.
      const quote = needsDelivery ? deliveryQuote(business.location, dropoff) : null;
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
        coupon: null,
        couponDiscount: 0,
        feeFrom: DELIVERY_RULES.baseFee,
        distanceKm: quote?.distanceKm ?? null,
        deliveryMinutes: quote?.minutes ?? null,
        deliveryAvailable: !needsDelivery || quote !== null || dropoff === null,
        etaMinutes: business.etaMinutes,
        isOpen: business.isOpen,
        rating: business.rating,
        sinpePhone: normalizeSinpeNumber(business.sinpePhone),
        whatsappPhone: normalizeSinpeNumber(business.whatsappPhone),
        sinpeReady: Boolean(
          normalizeSinpeNumber(business.sinpePhone) &&
            normalizeSinpeNumber(business.whatsappPhone),
        ),
        paymentAmount: 0,
        items: [],
        subtotal: 0,
      };
      byBusiness.set(item.businessId, group);
      groups.push(group);
      promoByBusiness.set(item.businessId, promoKind);
      routeFeeByBusiness.set(item.businessId, quote?.fee ?? 0);
      const coupon = await findCoupon(ctx, item.businessId, couponCode);
      couponByBusiness.set(item.businessId, coupon);
    }
    const unitPrice = product.price + (item.optionPrice ?? 0);
    group.items.push({
      cartItemId: item._id,
      productId: item.productId,
      name: product.name,
      price: unitPrice,
      quantity: item.quantity,
      image: product.image,
      options: item.options ?? [],
      isAvailable: product.isAvailable,
      stockEnabled: product.stockEnabled ?? false,
      stock: product.stockEnabled ? (product.stock ?? 0) : null,
      reservable: product.reservable ?? false,
      blockedSlots: product.blockedSlots ?? [],
    });
    group.subtotal += unitPrice * item.quantity;
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

  // Lo que cada tienda cobra por SINPE: sus productos menos su cupón más la
  // parte del envío que le corresponde en cada entrega. El comprador lo
  // transfiere directo al número del local.
  const deliveryByBusiness = new Map<string, number>();
  for (const trip of trips) {
    for (const stop of trip.stops) {
      deliveryByBusiness.set(
        stop.businessId,
        (deliveryByBusiness.get(stop.businessId) ?? 0) +
          stop.fee -
          stop.deliveryDiscount,
      );
    }
  }

  // El cupón es de un local concreto: descuenta sólo los productos de esa
  // tienda y nunca toca el envío ni la parte de los demás locales.
  for (const group of groups) {
    const coupon = couponByBusiness.get(group.businessId) ?? null;
    const discount = discountFor(coupon, group.subtotal);
    group.couponDiscount = discount;
    group.paymentAmount =
      group.subtotal -
      discount +
      (deliveryByBusiness.get(group.businessId) ?? 0);
    group.coupon = coupon
      ? {
          code: coupon.code,
          label:
            coupon.kind === "percent"
              ? `${coupon.value}% de descuento`
              : `₡${coupon.value.toLocaleString("es-CR")} de descuento`,
        }
      : null;
  }

  const subtotal = groups.reduce((acc, g) => acc + g.subtotal, 0);
  const discountTotal = trips.reduce((acc, trip) => acc + trip.discount, 0);
  const couponTotal = groups.reduce((acc, g) => acc + g.couponDiscount, 0);
  const deliveryTotal = trips.reduce((acc, trip) => acc + trip.clientFee, 0);
  const count = groups.reduce(
    (acc, g) => acc + g.items.reduce((a, i) => a + i.quantity, 0),
    0,
  );

  return {
    groups,
    trips,
    count,
    deliveryBatches: needsDelivery ? Math.max(trips.length, dropoff ? 1 : 0) : 0,
    subtotal,
    deliveryTotal,
    deliverySaved: discountTotal,
    couponTotal,
    couponCode:
      couponTotal > 0
        ? (groups.find((group) => group.coupon)?.coupon?.code ?? null)
        : null,
    // El código se cargó pero ningún local del carrito lo acepta.
    couponMessage:
      couponCode && couponTotal === 0
        ? "Ese cupón no aplica a los productos de tu carrito"
        : null,
    total: subtotal + deliveryTotal - couponTotal,
  };
}

/** Para reservación: dice por producto si la hora elegida está libre. */
export const reservationCheck = query({
  args: { productIds: v.array(v.id("products")), scheduledFor: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const at = args.scheduledFor ? Math.round(args.scheduledFor) : null;
    const results: Array<{
      productId: Id<"products">;
      name: string;
      reservable: boolean;
      blocked: boolean;
      booked: boolean;
      stockLeft: number | null;
    }> = [];
    const bookedAt = new Map<string, number[]>();
    if (at !== null) {
      const orders = await ctx.db.query("orders").collect();
      for (const order of orders) {
        if (order.status === "cancelled" || order.status === "delivered") continue;
        if (!order.scheduledFor) continue;
        for (const item of order.items) {
          const list = bookedAt.get(String(item.productId)) ?? [];
          list.push(order.scheduledFor);
          bookedAt.set(String(item.productId), list);
        }
      }
    }
    for (const productId of args.productIds) {
      const product = await ctx.db.get(productId);
      if (!product) continue;
      const blocked =
        at !== null && (product.blockedSlots ?? []).some((slot) => at >= slot.start && at < slot.end);
      const booked =
        at !== null &&
        (bookedAt.get(String(productId)) ?? []).some((other) => Math.abs(other - at) < 60 * 60 * 1000);
      results.push({
        productId,
        name: product.name,
        reservable: product.reservable ?? false,
        blocked,
        booked,
        stockLeft: product.stockEnabled ? (product.stock ?? 0) : null,
      });
    }
    return results;
  },
});

export const myCart = query({
  args: {
    couponCode: v.optional(v.string()),
    fulfillmentMethod: v.optional(fulfillmentMethodValidator),
  },
  handler: async (ctx, args) => {
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
        couponTotal: 0,
        couponCode: null,
        couponMessage: null,
        total: 0,
      };
    }
    return await buildCart(ctx, userId, args.couponCode, args.fulfillmentMethod);
  },
});

export const add = mutation({
  args: {
    productId: v.id("products"),
    quantity: v.optional(v.number()),
    options: v.optional(v.array(productOptionChoiceValidator)),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const quantity = Math.min(20, Math.max(1, Math.round(args.quantity ?? 1)));
    const product = await ctx.db.get(args.productId);
    if (!product || !product.isAvailable) {
      throw new Error("Ese producto está agotado o ya no está disponible");
    }
    const business = await ctx.db.get(product.businessId);
    if (!business?.isOpen) {
      throw new Error(`${business?.name ?? "El negocio"} está cerrado ahora`);
    }
    if (!business.isDemo && business.ownerId) {
      await requireSubscriptionAccess(
        ctx,
        business.ownerId,
        `${business.name} no está recibiendo pedidos: su suscripción está vencida`,
      );
      await requireVerifiedAccount(
        ctx,
        business.ownerId,
        `${business.name} todavía está en verificación: por ahora no recibe pedidos nuevos`,
      );
    }

    const groups = product.optionGroups ?? [];
    const choices = args.options ?? defaultChoices(groups);
    const selection = validateChoices(groups, choices);
    if (!selection.ok) throw new Error(selection.error);
    const selectionKey = choiceKey(selection.choices);

    if (product.stockEnabled && (product.stock ?? 0) <= 0) {
      throw new Error(`${product.name} ya se agotó. El local debe reponer stock.`);
    }
    const existing = await ctx.db
      .query("cartItems")
      .withIndex("by_user_selection", (q) =>
        q
          .eq("userId", userId)
          .eq("productId", args.productId)
          .eq("selectionKey", selectionKey),
      )
      .unique();
    if (product.stockEnabled) {
      const inCart = await ctx.db
        .query("cartItems")
        .withIndex("by_user_product", (q) => q.eq("userId", userId).eq("productId", args.productId))
        .collect();
      const current = inCart.reduce((sum, item) => sum + item.quantity, 0);
      if (current + quantity > (product.stock ?? 0)) {
        throw new Error(`Solo quedan ${product.stock ?? 0} de ${product.name} en stock`);
      }
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        quantity: Math.min(20, existing.quantity + quantity),
      });
    } else {
      await ctx.db.insert("cartItems", {
        userId,
        productId: args.productId,
        businessId: product.businessId,
        quantity,
        options: selection.selected,
        optionPrice: selection.extra,
        selectionKey,
        addedAt: Date.now(),
      });
    }
    return { added: product.name, options: selection.selected };
  },
});

export const setQuantity = mutation({
  args: { cartItemId: v.id("cartItems"), quantity: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.get(args.cartItemId);
    if (!existing || existing.userId !== userId) return null;
    if (args.quantity <= 0) {
      await ctx.db.delete(existing._id);
      return null;
    }
    const product = await ctx.db.get(existing.productId);
    if (product?.stockEnabled) {
      const siblings = await ctx.db
        .query("cartItems")
        .withIndex("by_user_product", (q) => q.eq("userId", userId).eq("productId", existing.productId))
        .collect();
      const others = siblings.filter((item) => item._id !== existing._id).reduce((sum, item) => sum + item.quantity, 0);
      if (others + Math.round(args.quantity) > (product.stock ?? 0)) {
        throw new Error(`Solo quedan ${product.stock ?? 0} de ${product.name} en stock`);
      }
    }
    await ctx.db.patch(existing._id, {
      quantity: Math.min(Math.round(args.quantity), 20),
    });
    return null;
  },
});

export const remove = mutation({
  args: { cartItemId: v.id("cartItems") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.get(args.cartItemId);
    if (existing && existing.userId === userId) {
      await ctx.db.delete(existing._id);
    }
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
    location: v.optional(geoPointValidator),
    // Cómo recibe el comprador su pedido. Sin entrega a domicilio no hay
    // envío ni punto en el mapa: el comprador pasa por el local.
    fulfillmentMethod: v.optional(fulfillmentMethodValidator),
    notes: v.optional(v.string()),
    // El cliente prefiere que el mismo repartidor haga todas las entregas.
    sameCourier: v.optional(v.boolean()),
    // Clave estable por intento de compra: reintentar no duplica el pedido.
    requestKey: v.optional(v.string()),
    // Cupón de un local del carrito. El descuento lo financia ese local.
    couponCode: v.optional(v.string()),
    // Pedido programado: hora exacta en la que el local debe prepararlo.
    scheduledFor: v.optional(v.number()),
    // Efectivo al entregar o SINPE directo a cada local (productos + envío).
    paymentMethod: v.optional(
      v.union(v.literal("cash"), v.literal("sinpe")),
    ),
    // Capturas del SINPE ya subidas desde el carrito: se adjuntan a cada
    // pedido para no pedirlas de nuevo en Pedidos si se sale a WhatsApp.
    sinpeReceiptStorageIds: v.optional(v.array(v.id("_storage"))),
    // Tiendas a las que ya se les envió el comprobante por WhatsApp.
    sinpeWhatsappSentBusinessIds: v.optional(v.array(v.string())),
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

    const requestKey = args.requestKey?.trim() || null;
    if (requestKey && requestKey.length > 100) {
      throw new Error("La clave del pedido no es válida");
    }
    // Reintento del mismo intento de compra (doble clic o red inestable): se
    // devuelve lo ya registrado en vez de crear entregas duplicadas. Se revisa
    // antes del carrito porque el checkout anterior ya lo vació.
    if (requestKey) {
      const previous = await ctx.db
        .query("orders")
        .withIndex("by_request_key", (q) =>
          q.eq("buyerId", userId).eq("requestKey", requestKey),
        )
        .collect();
      if (previous.length > 0) {
        return { ...checkoutSummary(previous), replayed: true };
      }
    }

    const fulfillment = args.fulfillmentMethod ?? "delivery";
    const needsDelivery = fulfillment === "delivery";
    const address = (args.address ?? "").trim();
    if (needsDelivery) {
      if (address.length < 6) {
        throw new Error("Necesitamos una dirección de entrega válida");
      }
      if (!isValidPoint(args.location)) {
        throw new Error("Marcá en el mapa el punto donde querés recibir el pedido");
      }
    }
    const dropoff = isValidPoint(args.location)
      ? normalizePoint(args.location)
      : null;
    const paymentMethod = args.paymentMethod === "sinpe" ? "sinpe" : "cash";
    const scheduledFor = args.scheduledFor
      ? Math.round(args.scheduledFor)
      : null;
    if (scheduledFor !== null) {
      const blocker = scheduleBlocker(scheduledFor);
      if (blocker) throw new Error(blocker);
    }
    // La reserva es con fecha y hora exacta: sin ese dato no se puede pedir.
    if (fulfillment === "reservation" && scheduledFor === null) {
      throw new Error("Elegí la fecha y hora exacta de tu reserva");
    }

    const cartItems = await ctx.db
      .query("cartItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (cartItems.length === 0) throw new Error("Tu carrito está vacío");

    const byBusiness = new Map<string, CheckoutLine[]>();
    const businessIds: Id<"businesses">[] = [];

    // Cantidad pedida por producto (varias líneas pueden usar el mismo).
    const wantedByProduct = new Map<string, number>();
    for (const item of cartItems) {
      wantedByProduct.set(String(item.productId), (wantedByProduct.get(String(item.productId)) ?? 0) + item.quantity);
    }
    // Reservas vigentes por producto (para no dar dos citas a la misma hora).
    const activeBookedByProduct = new Map<string, number[]>();
    if (fulfillment === "reservation" && scheduledFor !== null) {
      const allOrders = await ctx.db.query("orders").collect();
      for (const order of allOrders) {
        if (order.status === "cancelled" || order.status === "delivered") continue;
        if (!order.scheduledFor) continue;
        for (const item of order.items) {
          const list = activeBookedByProduct.get(String(item.productId)) ?? [];
          list.push(order.scheduledFor);
          activeBookedByProduct.set(String(item.productId), list);
        }
      }
    }

    for (const item of cartItems) {
      const product = await ctx.db.get(item.productId);
      if (!product || !product.isAvailable) {
        throw new Error("Un producto de tu carrito está agotado o ya no disponible; quitalo para continuar");
      }
      if (product.stockEnabled && (product.stock ?? 0) < (wantedByProduct.get(String(product._id)) ?? item.quantity)) {
        throw new Error(`Solo quedan ${product.stock ?? 0} de ${product.name} en stock; bajá la cantidad para continuar`);
      }
      if (fulfillment === "reservation") {
        if (!(product.reservable ?? false)) {
          throw new Error(`${product.name} no aplica para reservación o cita; quitalo o cambiá a retiro/entrega`);
        }
        if (scheduledFor !== null) {
          const blocked = (product.blockedSlots ?? []).some((slot) => scheduledFor >= slot.start && scheduledFor < slot.end);
          if (blocked) {
            throw new Error(`${product.name} no está disponible en la fecha y hora elegida; elegí otro horario`);
          }
          const overlap = (activeBookedByProduct.get(String(product._id)) ?? []).some(
            (at) => Math.abs(at - scheduledFor) < 60 * 60 * 1000,
          );
          if (overlap) {
            throw new Error(`${product.name} ya tiene esa hora reservada; elegí otro horario`);
          }
        }
      }
      const business = await ctx.db.get(item.businessId);
      if (!business) throw new Error("Un negocio de tu carrito ya no existe");
      if (!business.isOpen) {
        throw new Error(
          `${business.name} cerró. Quitá sus productos para continuar.`,
        );
      }
      if (!business.isDemo && business.ownerId) {
        await requireSubscriptionAccess(
          ctx,
          business.ownerId,
          `${business.name} no está recibiendo pedidos: su suscripción está vencida`,
        );
        await requireVerifiedAccount(
          ctx,
          business.ownerId,
          `${business.name} todavía está en verificación: quitá sus productos para continuar`,
        );
      }
      if (!byBusiness.has(item.businessId)) {
        byBusiness.set(item.businessId, []);
        businessIds.push(item.businessId);
      }
      byBusiness.get(item.businessId)!.push({
        cartItemId: item._id,
        productId: product._id,
        name: product.name,
        price: product.price + (item.optionPrice ?? 0),
        quantity: item.quantity,
        image: product.image,
        options: item.options ?? [],
      });
    }

    // Datos de cada local: recorrido hasta el cliente y promo de su tienda.
    const stores = new Map<
      string,
      {
        id: Id<"businesses">;
        name: string;
        address: string;
        ownerId: Id<"users"> | null;
        fee: number;
        distanceKm: number;
        promoKind: PromoKind | null;
        sinpePhone: string | null;
        whatsappPhone: string | null;
      }
    >();

    for (const businessId of businessIds) {
      const business = await ctx.db.get(businessId);
      if (!business) continue;
      // Sin entrega a domicilio el comprador pasa por el local: no hay
      // envío, distancia ni zona de reparto que validar.
      if (!needsDelivery) {
        const sinpePhone = normalizeSinpeNumber(business.sinpePhone);
        const whatsappPhone = normalizeSinpeNumber(business.whatsappPhone);
        if (paymentMethod === "sinpe" && (!sinpePhone || !whatsappPhone)) {
          throw new Error(
            `${business.name} todavía no configuró su cobro por SINPE. Elegí efectivo o quitá sus productos.`,
          );
        }
        stores.set(businessId, {
          id: businessId,
          name: business.name,
          address: business.address,
          ownerId: business.ownerId ?? null,
          fee: 0,
          distanceKm: 0,
          promoKind: business.deliveryPromo ?? null,
          sinpePhone,
          whatsappPhone,
        });
        continue;
      }
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
      const sinpePhone = normalizeSinpeNumber(business.sinpePhone);
      const whatsappPhone = normalizeSinpeNumber(business.whatsappPhone);
      if (paymentMethod === "sinpe" && (!sinpePhone || !whatsappPhone)) {
        throw new Error(
          `${business.name} todavía no configuró su cobro por SINPE. Elegí efectivo o quitá sus productos.`,
        );
      }
      stores.set(businessId, {
        id: businessId,
        name: business.name,
        address: business.address,
        ownerId: business.ownerId ?? null,
        fee: quote.fee,
        distanceKm: quote.distanceKm,
        promoKind: business.deliveryPromo ?? null,
        sinpePhone,
        whatsappPhone,
      });
    }

    // Cada entrega lleva hasta 3 productos y puede retirar en varias tiendas.
    // El envío se cobra una sola vez por entrega y se reparte entre las
    // tiendas para que cada una cubra su parte si tiene promoción activa.
    const lines = cartItems.map((item) => {
      const product = byBusiness
        .get(item.businessId)!
        .find((line) => line.cartItemId === item._id)!;
      return {
        businessId: item.businessId as string,
        productId: item.productId,
        name: product.name,
        price: product.price,
        image: product.image,
        quantity: item.quantity,
        options: product.options,
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

    // El código se consume una vez por tienda y compra. Cuando un pedido del
    // mismo local se divide en varios viajes, el descuento total del cupón se
    // reparte por subtotal entre esos viajes para nunca duplicarlo.
    const couponByBusiness = new Map<string, Doc<"coupons"> | null>();
    const couponDiscountByTrip = new Map<string, number>();
    const appliedCouponIds = new Set<Id<"coupons">>();
    for (const businessId of businessIds) {
      const coupon = await findCoupon(ctx, businessId, args.couponCode);
      couponByBusiness.set(businessId, coupon);
      if (!coupon) continue;
      const entries = trips
        .map((trip) => ({
          key: `${trip.index}:${businessId}`,
          subtotal: trip.lines
            .filter((line) => line.businessId === businessId)
            .reduce((sum, line) => sum + line.price * line.quantity, 0),
        }))
        .filter((entry) => entry.subtotal > 0);
      const subtotal = entries.reduce((sum, entry) => sum + entry.subtotal, 0);
      const totalDiscount = discountFor(coupon, subtotal);
      let remaining = totalDiscount;
      entries.forEach((entry, index) => {
        const allocation =
          index === entries.length - 1
            ? remaining
            : Math.min(
                remaining,
                Math.round((totalDiscount * entry.subtotal) / subtotal),
              );
        couponDiscountByTrip.set(entry.key, allocation);
        remaining -= allocation;
      });
    }

    let total = 0;
    let created = 0;
    const now = Date.now();
    const groupCode = `CE-${Math.floor(1000 + Math.random() * 9000)}`;

    // Comprobante del carrito: se guarda una vez y se adjunta a cada pedido
    // SINPE para que en Pedidos ya aparezca listo y con el envío marcado.
    let sinpeReceipt:
      | { storageId: Id<"_storage">; url: string; at: number; by: Id<"users"> }
      | undefined;
    if (paymentMethod === "sinpe") {
      for (const storageId of args.sinpeReceiptStorageIds ?? []) {
        const url = await ctx.storage.getUrl(storageId);
        if (url) {
          sinpeReceipt = { storageId, url, at: now, by: userId };
          break;
        }
      }
    }
    const sinpeSentStores = new Set(args.sinpeWhatsappSentBusinessIds ?? []);

    for (const trip of trips) {
      const tripStops = trip.stops.length;
      // Un código de retiro y un PIN de entrega por entrega, no por tienda: el
      // repartidor lo recibe del local al retirar y del comprador al entregar.
      const pickupCode = String(Math.floor(1000 + Math.random() * 9000));
      const deliveryPin = String(Math.floor(1000 + Math.random() * 9000));

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
          options: line.options,
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

        // El cupón del local descuenta sus productos, no el envío. La porción
        // ya viene prorrateada si la compra usa varias entregas del mismo local.
        const coupon = couponByBusiness.get(store.id) ?? null;
        const couponDiscount =
          couponDiscountByTrip.get(`${trip.index}:${store.id}`) ?? 0;
        const orderTotal =
          subtotal + tripStop.fee - deliveryDiscount - couponDiscount;
        total += orderTotal;
        created += 1;

        const suffix =
          trips.length > 1 || tripStops > 1
            ? `-${trip.index}${tripStops > 1 ? String.fromCharCode(65 + position) : ""}`
            : "";

        const orderAddress = needsDelivery ? address : address || store.address;
        const orderId = await ctx.db.insert("orders", {
          code: `${groupCode}${suffix}`,
          groupCode,
          batchIndex: trip.index,
          batchCount: trips.length,
          tripStops,
          tripPosition: position,
          pickupCode,
          deliveryPin,
          fulfillment,
          sameCourier: needsDelivery ? (args.sameCourier ?? false) : false,
          buyerId: userId,
          businessId: store.id,
          items,
          subtotal,
          deliveryFee: tripStop.fee,
          deliveryDiscount: deliveryDiscount || undefined,
          couponCode: couponDiscount > 0 ? coupon?.code : undefined,
          couponDiscount: couponDiscount || undefined,
          total: orderTotal,
          status: "pending",
          paymentMethod,
          paymentSinpePhone:
            paymentMethod === "sinpe" ? store.sinpePhone ?? undefined : undefined,
          paymentWhatsappPhone:
            paymentMethod === "sinpe"
              ? store.whatsappPhone ?? undefined
              : undefined,
          paymentReceipt: sinpeReceipt,
          paymentWhatsappSentAt:
            paymentMethod === "sinpe" &&
            sinpeReceipt &&
            sinpeSentStores.has(store.id)
              ? now
              : undefined,
          address: orderAddress,
          deliveryLocation: dropoff ?? undefined,
          distanceKm: store.distanceKm,
          notes: args.notes?.trim() || undefined,
          requestKey: requestKey ?? undefined,
          scheduledFor: scheduledFor ?? undefined,
          createdAt: now,
          // En efectivo el pedido entra confirmado. Con SINPE el comprador
          // primero transfiere y manda el comprobante, y recién entonces lo
          // confirma desde Pedidos: ahí se avisa a la tienda.
          buyerConfirmedAt: paymentMethod === "cash" ? now : undefined,
        });

        if (coupon && couponDiscount > 0) {
          appliedCouponIds.add(coupon._id);
        }

        // Aviso fuera de la app: el local se entera aunque nadie tenga el panel
        // abierto. Sin opt-in ni teléfono queda encolado y el despacho lo marca
        // como omitido, sin frenar la compra. Con SINPE se difiere: la tienda
        // se entera cuando el comprador confirma el pago en Pedidos.
        if (store.ownerId && args.paymentMethod !== "sinpe") {
          const owner = await ctx.db.get(store.ownerId);
          const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);
          // Con SINPE el local recibe el total de su pedido (productos más su
          // parte del envío); en efectivo recibe los productos.
          const businessAmount =
            paymentMethod === "sinpe"
              ? orderTotal
              : businessDue({ subtotal, deliveryDiscount, couponDiscount });
          const phone =
            normalizePhone(store.whatsappPhone) ?? normalizePhone(owner?.phone);

          await queueNotice(ctx, {
            order: (await ctx.db.get(orderId))!,
            tripKey: `${groupCode}#${trip.index}`,
            recipientId: store.ownerId,
            recipientRole: "business",
            phone,
            link: "/business?tab=orders",
            draft: {
              kind: "new_order",
              tripNumber: `${groupCode}${suffix}`,
              itemCount,
              businessAmount,
              paidBySinpe: paymentMethod === "sinpe",
              dropAddress: orderAddress,
            },
          });

          // Aviso al teléfono: despierta al dueño aunque la app esté cerrada.
          // Si el equipo no está suscrito la acción no envía nada y termina.
          await ctx.scheduler.runAfter(0, internal.pushNode.sendOrderAlert, {
            userId: store.ownerId,
            title: "¡Pedido nuevo! 🎉",
            body: `${groupCode}${suffix}: ${itemCount} ${
              itemCount === 1 ? "producto" : "productos"
            } por ${money(businessAmount)}. ${fulfillmentNotice(fulfillment, orderAddress)}.`,
            url: "/business?tab=orders",
            tag: `order-${orderId}`,
          });
        }
      }
    }

    for (const couponId of appliedCouponIds) {
      const coupon = await ctx.db.get(couponId);
      if (coupon) {
        await ctx.db.patch(couponId, {
          redemptions: coupon.redemptions + 1,
          updatedAt: now,
        });
      }
    }
    // Descuenta el stock sólo al confirmar la compra (una vez por producto).
    for (const [productId, qty] of wantedByProduct) {
      const product = await ctx.db.get(productId as Id<"products">);
      if (!product?.stockEnabled) continue;
      const next = Math.max(0, (product.stock ?? 0) - qty);
      await ctx.db.patch(product._id, { stock: next });
    }
    for (const item of cartItems) await ctx.db.delete(item._id);
    // La dirección y el punto se guardan sólo con entrega a domicilio: en
    // las demás modalidades el comprador pasa por el local.
    if (needsDelivery && dropoff) {
      await ctx.db.patch(userId, { address, location: dropoff });
    }

    return { created: trips.length, orders: created, total, replayed: false };
  },
});

/** Copia a un carrito los productos disponibles de un pedido anterior. */
export const repeatOrder = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const order = await ctx.db.get(args.orderId);
    if (!order || order.buyerId !== userId) {
      throw new Error("Ese pedido no pertenece a tu cuenta");
    }
    const added: string[] = [];
    const skipped: string[] = [];
    const siblings = order.groupCode
      ? await ctx.db
          .query("orders")
          .withIndex("by_group", (q) => q.eq("groupCode", order.groupCode!))
          .collect()
      : [order];
    const requested = new Map<
      string,
      {
        productId: Id<"products">;
        businessId: Id<"businesses">;
        name: string;
        quantity: number;
        options: SelectedProductOption[];
      }
    >();
    for (const sibling of siblings) {
      if (sibling.buyerId !== userId || sibling.status === "cancelled") continue;
      for (const item of sibling.items) {
        const options = item.options ?? [];
        const choices: ProductOptionChoice[] = options.map((option) => ({
          groupId: option.groupId,
          optionId: option.optionId,
        }));
        const key = `${item.productId}:${choiceKey(choices)}`;
        const previous = requested.get(key);
        requested.set(key, {
          productId: item.productId,
          businessId: sibling.businessId,
          name: item.name,
          quantity: (previous?.quantity ?? 0) + item.quantity,
          options,
        });
      }
    }
    for (const item of requested.values()) {
      const business = await ctx.db.get(item.businessId);
      const product = await ctx.db.get(item.productId);
      if (!product || !product.isAvailable || !business?.isOpen) {
        skipped.push(item.name);
        continue;
      }
      if (!business.isDemo && business.ownerId) {
        try {
          await requireSubscriptionAccess(
            ctx,
            business.ownerId,
            `${business.name} no está recibiendo pedidos ahora`,
          );
          await requireVerifiedAccount(
            ctx,
            business.ownerId,
            `${business.name} todavía no puede recibir pedidos`,
          );
        } catch {
          skipped.push(item.name);
          continue;
        }
      }
      const choices: ProductOptionChoice[] = item.options.map((option) => ({
        groupId: option.groupId,
        optionId: option.optionId,
      }));
      const selection = validateChoices(
        product.optionGroups ?? [],
        choices.length > 0
          ? choices
          : defaultChoices(product.optionGroups ?? []),
      );
      if (!selection.ok) {
        skipped.push(item.name);
        continue;
      }
      const selectionKey = choiceKey(selection.choices);
      const existing = await ctx.db
        .query("cartItems")
        .withIndex("by_user_selection", (q) =>
          q
            .eq("userId", userId)
            .eq("productId", product._id)
            .eq("selectionKey", selectionKey),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          quantity: Math.min(20, existing.quantity + item.quantity),
        });
      } else {
        await ctx.db.insert("cartItems", {
          userId,
          productId: product._id,
          businessId: business._id,
          quantity: Math.min(20, item.quantity),
          options: selection.selected,
          optionPrice: selection.extra,
          selectionKey,
          addedAt: Date.now(),
        });
      }
      added.push(item.name);
    }
    return { added, skipped };
  },
});
