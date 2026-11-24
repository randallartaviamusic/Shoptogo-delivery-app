import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { isAdminEmail } from "./branding";
import { ASSIGNMENT_RULES, deliveryQuote } from "../lib/delivery";
import { DEFAULT_DEPARTMENT, DEPARTMENTS, getDepartment } from "../lib/departments";
import { hasSubscriptionAccess, subscriptionStatus } from "../lib/subscriptions";
import { productOptionGroupValidator } from "./schema";
import { normalizeOptionGroups } from "../lib/productOptions";

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
        // Portada visible en la lista: la tienda para negocios y la portada
        // personal (o el avatar) para repartidores y compradores.
        image:
          businessByOwner.get(user._id)?.image?.trim() ||
          user.coverImage?.trim() ||
          user.image?.trim() ||
          null,
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

/** Tendencias globales para el panel privado de administración. */
export const analytics = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const days = args.days === 7 ? 7 : 30;
    const start = now - days * 86_400_000;
    const localOffset = 6 * 60 * 60 * 1000;
    const localToday = new Date(now - localOffset);
    localToday.setUTCHours(0, 0, 0, 0);
    const todayStart = localToday.getTime() + localOffset;
    const orders = await ctx.db.query("orders").collect();
    const businesses = await ctx.db.query("businesses").collect();
    const users = await ctx.db.query("users").collect();
    const subscriptions = await ctx.db.query("subscriptions").collect();
    const presences = await ctx.db.query("courierPresence").collect();

    const selectedOrders = orders.filter((order) => order.createdAt >= start);
    const delivered = orders.filter(
      (order) => order.status === "delivered" && (order.deliveredAt ?? 0) >= start,
    );
    const cancelled = selectedOrders.filter((order) => order.status === "cancelled");
    const businessById = new Map(businesses.map((business) => [business._id, business]));
    const userById = new Map(users.map((user) => [user._id, user]));

    const orderHours = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${String(hour).padStart(2, "0")}:00`,
      orders: 0,
    }));
    for (const order of orders) {
      if (order.createdAt < todayStart || order.createdAt >= todayStart + 86_400_000) continue;
      const hour = new Date(order.createdAt - localOffset).getUTCHours();
      orderHours[hour].orders += 1;
    }

    let measured = 0;
    let onTime = 0;
    let totalPromisedMinutes = 0;
    let totalActualMinutes = 0;
    let totalDelayMinutes = 0;
    for (const order of delivered) {
      const business = businessById.get(order.businessId);
      const promisedMinutes = deliveryQuote(
        business?.location,
        order.deliveryLocation,
      )?.minutes;
      const deliveredAt = order.deliveredAt;
      if (promisedMinutes === undefined || promisedMinutes === null || !deliveredAt) continue;
      const startsAt = order.pickedUpAt ?? order.readyAt ?? order.acceptedAt ?? order.createdAt;
      const actualMinutes = Math.max(0, (deliveredAt - startsAt) / 60_000);
      const delayMinutes = actualMinutes - promisedMinutes;
      measured += 1;
      totalPromisedMinutes += promisedMinutes;
      totalActualMinutes += actualMinutes;
      totalDelayMinutes += delayMinutes;
      if (delayMinutes <= ASSIGNMENT_RULES.delayToleranceMinutes) onTime += 1;
    }

    const activeUntil = now + 7 * 86_400_000;
    const subscriptionsByOwner = new Map(
      subscriptions.map((subscription) => [subscription.ownerId, subscription]),
    );
    const expiringBusinesses = businesses
      .filter((business) => business.ownerId)
      .flatMap((business) => {
        const owner = userById.get(business.ownerId!);
        if (!owner) return [];
        const subscription = subscriptionsByOwner.get(owner._id);
        const until = subscription?.activeUntil;
        if (until === undefined || until <= now || until > activeUntil) return [];
        return [{
          businessId: business._id,
          name: business.name,
          ownerName: owner.name ?? owner.email ?? "Cuenta",
          activeUntil: until,
          daysLeft: Math.ceil((until - now) / 86_400_000),
        }];
      })
      .sort((a, b) => a.activeUntil - b.activeUntil);

    const usersById = new Map(users.map((user) => [user._id, user]));
    const activeCouriers = [];
    for (const presence of presences) {
      if (now - presence.updatedAt > ASSIGNMENT_RULES.maxLocationAgeMinutes * 60_000) continue;
      const courier = usersById.get(presence.ownerId);
      if (courier?.role !== "courier" || courier.verificationStatus !== "verified") continue;
      const subscription = subscriptionsByOwner.get(courier._id);
      if (!hasSubscriptionAccess(subscriptionStatus(subscription?.activeUntil))) continue;
      activeCouriers.push({
        userId: courier._id,
        name: courier.name ?? "Repartidor",
        lastSeenAt: presence.updatedAt,
      });
    }

    return {
      days,
      generatedAt: now,
      metrics: {
        gmv: delivered.reduce((sum, order) => sum + order.total, 0),
        completedOrders: delivered.length,
        orders: selectedOrders.length,
        cancellations: cancelled.length,
        cancellationRate: selectedOrders.length ? cancelled.length / selectedOrders.length : 0,
        averagePromisedMinutes: measured ? totalPromisedMinutes / measured : null,
        averageActualMinutes: measured ? totalActualMinutes / measured : null,
        averageDelayMinutes: measured ? totalDelayMinutes / measured : null,
        onTimeRate: measured ? onTime / measured : null,
        measuredDeliveries: measured,
        activeCourierCount: activeCouriers.length,
        expiringBusinessCount: expiringBusinesses.length,
      },
      ordersByHour: orderHours,
      activeCouriers: activeCouriers.sort((a, b) => a.name.localeCompare(b.name)),
      expiringBusinesses,
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

/* -------------------------------------------------------------------------- */
/* Catálogo demo                                                              */
/* -------------------------------------------------------------------------- */

const DEPARTMENT_SLUGS = new Set(DEPARTMENTS.map((department) => department.slug));

const STORE_PRODUCT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const STORE_PRODUCT_VIDEO_MAX_BYTES = 30 * 1024 * 1024;

function cleanImage(value: string, label: string) {
  const trimmed = value.trim();
  if (!/^(https?:\/\/|\/)/i.test(trimmed)) {
    throw new ConvexError(
      `${label}: usá un enlace de imagen que empiece con https://`,
    );
  }
  if (trimmed.length > 800) {
    throw new ConvexError(`${label}: el enlace de la imagen es demasiado largo`);
  }
  return trimmed;
}

async function storeProductImageUrl(ctx: MutationCtx, storageId: string) {
  const metadata = await ctx.storage.getMetadata(storageId as never);
  if (!metadata) throw new ConvexError("No pudimos leer la imagen");
  const contentType = (metadata as { contentType?: string }).contentType;
  if (!contentType?.startsWith("image/")) {
    throw new ConvexError("El archivo tiene que ser una imagen");
  }
  const size = (metadata as { size?: number }).size ?? 0;
  if (size > STORE_PRODUCT_IMAGE_MAX_BYTES) {
    throw new ConvexError("La imagen no puede pesar mas de 8 MB");
  }
  const url = await ctx.storage.getUrl(storageId as never);
  if (!url) throw new ConvexError("No pudimos guardar la imagen");
  return url;
}

async function storeProductVideoUrl(ctx: MutationCtx, storageId: string) {
  const metadata = await ctx.storage.getMetadata(storageId as never);
  if (!metadata) throw new ConvexError("No pudimos leer el video");
  const contentType = (metadata as { contentType?: string }).contentType;
  if (!contentType?.startsWith("video/")) {
    throw new ConvexError("El archivo tiene que ser un video");
  }
  const size = (metadata as { size?: number }).size ?? 0;
  if (size > STORE_PRODUCT_VIDEO_MAX_BYTES) {
    throw new ConvexError("El video no puede pesar mas de 30 MB");
  }
  const url = await ctx.storage.getUrl(storageId as never);
  if (!url) throw new ConvexError("No pudimos guardar el video");
  return url;
}

/** Tiendas demo con su catálogo, para editar o borrar desde el perfil admin. */
export const demoCatalog = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const businesses = await ctx.db.query("businesses").collect();
    const products = await ctx.db.query("products").collect();
    const demoBusinesses = businesses.filter((business) => business.isDemo);
    const demoIds = new Set(demoBusinesses.map((business) => business._id));

    const productsByBusiness = new Map<string, Doc<"products">[]>();
    for (const product of products) {
      if (!demoIds.has(product.businessId)) continue;
      const list = productsByBusiness.get(product.businessId) ?? [];
      list.push(product);
      productsByBusiness.set(product.businessId, list);
    }

    const term = (args.search ?? "").trim().toLowerCase();
    const matches = (value: string | null | undefined) =>
      (value ?? "").toLowerCase().includes(term);

    const rows = demoBusinesses
      .filter((business) => {
        if (!term) return true;
        const list = productsByBusiness.get(business._id) ?? [];
        return (
          matches(business.name) ||
          matches(business.tagline) ||
          matches(business.category) ||
          matches(business.address) ||
          matches(getDepartment(business.department).label) ||
          list.some(
            (product) =>
              matches(product.name) || matches(product.category),
          )
        );
      })
      .map((business) => {
        const list = productsByBusiness.get(business._id) ?? [];
        return {
          _id: business._id,
          name: business.name,
          slug: business.slug,
          department: business.department ?? DEFAULT_DEPARTMENT,
          category: business.category,
          tagline: business.tagline,
          image: business.image,
          address: business.address,
          etaMinutes: business.etaMinutes,
          isOpen: business.isOpen,
          rating: business.rating,
          reviews: business.reviews,
          products: list.map((product) => ({
            _id: product._id,
            name: product.name,
            description: product.description,
            price: product.price,
            image: product.image,
            category: product.category,
            tags: product.tags,
            isAvailable: product.isAvailable,
          })),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      businesses: rows,
      totals: {
        businesses: demoBusinesses.length,
        products: demoBusinesses.reduce(
          (sum, business) =>
            sum + (productsByBusiness.get(business._id)?.length ?? 0),
          0,
        ),
      },
    };
  },
});

/** Edita los datos visibles de una tienda demo. */
export const updateDemoBusiness = mutation({
  args: {
    businessId: v.id("businesses"),
    name: v.optional(v.string()),
    tagline: v.optional(v.string()),
    category: v.optional(v.string()),
    department: v.optional(v.string()),
    image: v.optional(v.string()),
    address: v.optional(v.string()),
    etaMinutes: v.optional(v.number()),
    isOpen: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const business = await ctx.db.get(args.businessId);
    if (!business) throw new ConvexError("Esa tienda ya no existe");
    if (!business.isDemo) {
      throw new ConvexError("Sólo se pueden editar las tiendas demo");
    }

    const patch: Partial<Doc<"businesses">> = {};
    let departmentChanged = false;

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length < 2) {
        throw new ConvexError("El nombre de la tienda necesita al menos 2 letras");
      }
      if (name.length > 80) {
        throw new ConvexError("El nombre de la tienda no puede pasar de 80 letras");
      }
      patch.name = name;
    }
    if (args.tagline !== undefined) {
      const tagline = args.tagline.trim();
      if (tagline.length > 140) {
        throw new ConvexError("La frase de la tienda no puede pasar de 140 letras");
      }
      patch.tagline = tagline;
    }
    if (args.category !== undefined) {
      const category = args.category.trim();
      if (category.length < 2) {
        throw new ConvexError("La categoría de la tienda necesita al menos 2 letras");
      }
      if (category.length > 60) {
        throw new ConvexError("La categoría de la tienda no puede pasar de 60 letras");
      }
      patch.category = category;
    }
    if (args.department !== undefined) {
      if (!DEPARTMENT_SLUGS.has(args.department)) {
        throw new ConvexError("Elegí un departamento válido");
      }
      patch.department = args.department;
      departmentChanged =
        (business.department ?? DEFAULT_DEPARTMENT) !== args.department;
    }
    if (args.image !== undefined) {
      patch.image = cleanImage(args.image, "La foto de la tienda");
    }
    if (args.address !== undefined) {
      const address = args.address.trim();
      if (address.length < 3) {
        throw new ConvexError("Escribí la dirección de la tienda");
      }
      if (address.length > 200) {
        throw new ConvexError("La dirección no puede pasar de 200 letras");
      }
      patch.address = address;
    }
    if (args.etaMinutes !== undefined) {
      if (!Number.isFinite(args.etaMinutes)) {
        throw new ConvexError("El tiempo estimado no es válido");
      }
      patch.etaMinutes = Math.min(180, Math.max(5, Math.round(args.etaMinutes)));
    }
    if (args.isOpen !== undefined) patch.isOpen = args.isOpen;

    if (Object.keys(patch).length === 0) return { updated: false, productsUpdated: 0 };

    await ctx.db.patch(business._id, patch);

    // El catálogo del local vive en el mismo departamento: si la tienda cambia
    // de rubro, sus productos también para que aparezcan en el catálogo nuevo.
    let productsUpdated = 0;
    if (departmentChanged) {
      const products = await ctx.db
        .query("products")
        .withIndex("by_business", (q) => q.eq("businessId", business._id))
        .collect();
      for (const product of products) {
        await ctx.db.patch(product._id, { department: args.department! });
        productsUpdated += 1;
      }
    }

    return { updated: true, productsUpdated };
  },
});

/** Borra una tienda demo con su catálogo y los datos que la referencian. */
export const deleteDemoBusiness = mutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const business = await ctx.db.get(args.businessId);
    if (!business) throw new ConvexError("Esa tienda ya no existe");
    if (!business.isDemo) {
      throw new ConvexError("Sólo se pueden borrar las tiendas demo");
    }

    const products = await ctx.db
      .query("products")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .collect();
    const productIds = new Set(products.map((product) => product._id));

    const cleared = {
      products: products.length,
      cartItems: 0,
      swipes: 0,
      coupons: 0,
      favorites: 0,
      openOrders: 0,
    };

    for (const item of await ctx.db.query("cartItems").collect()) {
      if (
        item.businessId !== business._id &&
        !productIds.has(item.productId)
      ) {
        continue;
      }
      await ctx.db.delete(item._id);
      cleared.cartItems += 1;
    }

    for (const swipe of await ctx.db.query("swipes").collect()) {
      if (!productIds.has(swipe.productId)) continue;
      await ctx.db.delete(swipe._id);
      cleared.swipes += 1;
    }

    for (const coupon of await ctx.db
      .query("coupons")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .collect()) {
      await ctx.db.delete(coupon._id);
      cleared.coupons += 1;
    }

    // Los favoritos y pedidos entregados se conservan; los abiertos de una
    // tienda que ya no existe se cierran para no quedar colgados.
    for (const user of await ctx.db.query("users").collect()) {
      const favorites = user.favoriteBusinessIds ?? [];
      if (!favorites.includes(business._id)) continue;
      await ctx.db.patch(user._id, {
        favoriteBusinessIds: favorites.filter(
          (businessId) => businessId !== business._id,
        ),
      });
      cleared.favorites += 1;
    }

    const openOrderIds = new Set<string>();
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
      openOrderIds.add(order._id);
      for (const notification of await ctx.db
        .query("notifications")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect()) {
        await ctx.db.delete(notification._id);
      }
      await ctx.db.delete(order._id);
      cleared.openOrders += 1;
    }
    for (const offer of await ctx.db.query("deliveryOffers").collect()) {
      if (!openOrderIds.has(offer.orderId)) continue;
      await ctx.db.delete(offer._id);
    }

    for (const product of products) await ctx.db.delete(product._id);
    await ctx.db.delete(business._id);

    return cleared;
  },
});

/** Edita un producto de una tienda demo. */
export const updateDemoProduct = mutation({
  args: {
    productId: v.id("products"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    price: v.optional(v.number()),
    category: v.optional(v.string()),
    image: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    isAvailable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError("Ese producto ya no existe");
    const business = await ctx.db.get(product.businessId);
    if (!business?.isDemo) {
      throw new ConvexError("Sólo se pueden editar productos demo");
    }

    const patch: Partial<Doc<"products">> = {};

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length < 2) {
        throw new ConvexError("El producto necesita al menos 2 letras");
      }
      if (name.length > 90) {
        throw new ConvexError("El nombre del producto no puede pasar de 90 letras");
      }
      patch.name = name;
    }
    if (args.description !== undefined) {
      const description = args.description.trim();
      if (description.length > 500) {
        throw new ConvexError("La descripción no puede pasar de 500 letras");
      }
      patch.description = description;
    }
    if (args.price !== undefined) {
      if (!Number.isFinite(args.price) || args.price <= 0) {
        throw new ConvexError("El precio tiene que ser mayor a 0");
      }
      patch.price = Math.round(args.price);
    }
    if (args.category !== undefined) {
      const category = args.category.trim();
      if (category.length < 2) {
        throw new ConvexError("La categoría del producto necesita al menos 2 letras");
      }
      if (category.length > 60) {
        throw new ConvexError("La categoría del producto no puede pasar de 60 letras");
      }
      patch.category = category;
    }
    if (args.image !== undefined) {
      patch.image = cleanImage(args.image, "La foto del producto");
    }
    if (args.tags !== undefined) {
      const tags = Array.from(
        new Set(
          args.tags
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0),
        ),
      ).slice(0, 12);
      if (tags.some((tag) => tag.length > 40)) {
        throw new ConvexError("Cada etiqueta puede tener hasta 40 letras");
      }
      patch.tags = tags;
    }
    if (args.isAvailable !== undefined) patch.isAvailable = args.isAvailable;

    if (Object.keys(patch).length === 0) return { updated: false };
    await ctx.db.patch(product._id, patch);
    return { updated: true };
  },
});

/** Borra un producto demo y lo saca de carritos y antojos guardados. */
export const deleteDemoProduct = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError("Ese producto ya no existe");
    const business = await ctx.db.get(product.businessId);
    if (!business?.isDemo) {
      throw new ConvexError("Sólo se pueden borrar productos demo");
    }

    let cartItems = 0;
    for (const item of await ctx.db.query("cartItems").collect()) {
      if (item.productId !== product._id) continue;
      await ctx.db.delete(item._id);
      cartItems += 1;
    }

    let swipes = 0;
    for (const swipe of await ctx.db.query("swipes").collect()) {
      if (swipe.productId !== product._id) continue;
      await ctx.db.delete(swipe._id);
      swipes += 1;
    }

    await ctx.db.delete(product._id);
    return { deleted: true, cartItems, swipes };
  },
});

/* -------------------------------------------------------------------------- */
/* Tiendas reales (cuentas de negocio)                                         */
/* -------------------------------------------------------------------------- */

/**
 * Tiendas reales con su catálogo y la cuenta dueña, para que el administrador
 * edite datos de la tienda, corrija productos y publique productos nuevos a
 * solicitud del negocio. Las tiendas demo se gestionan en su propia pestaña.
 */
export const storeCatalog = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const businesses = await ctx.db.query("businesses").collect();
    const products = await ctx.db.query("products").collect();
    const users = await ctx.db.query("users").collect();
    const realBusinesses = businesses.filter((business) => !business.isDemo);
    const realIds = new Set(realBusinesses.map((business) => business._id));
    const userById = new Map(users.map((user) => [user._id, user]));

    const productsByBusiness = new Map<string, Doc<"products">[]>();
    for (const product of products) {
      if (!realIds.has(product.businessId)) continue;
      const list = productsByBusiness.get(product.businessId) ?? [];
      list.push(product);
      productsByBusiness.set(product.businessId, list);
    }

    const term = (args.search ?? "").trim().toLowerCase();
    const matches = (value: string | null | undefined) =>
      (value ?? "").toLowerCase().includes(term);

    const rows = realBusinesses
      .filter((business) => {
        if (!term) return true;
        const list = productsByBusiness.get(business._id) ?? [];
        const owner = business.ownerId
          ? userById.get(business.ownerId)
          : null;
        return (
          matches(business.name) ||
          matches(business.tagline) ||
          matches(business.category) ||
          matches(business.address) ||
          matches(owner?.name) ||
          matches(owner?.email) ||
          list.some(
            (product) =>
              matches(product.name) || matches(product.category),
          )
        );
      })
      .map((business) => {
        const list = productsByBusiness.get(business._id) ?? [];
        const owner = business.ownerId
          ? userById.get(business.ownerId)
          : null;
        return {
          _id: business._id,
          name: business.name,
          slug: business.slug,
          department: business.department ?? DEFAULT_DEPARTMENT,
          category: business.category,
          tagline: business.tagline,
          image: business.image,
          address: business.address,
          etaMinutes: business.etaMinutes,
          isOpen: business.isOpen,
          rating: business.rating,
          reviews: business.reviews,
          ownerName: owner?.name ?? null,
          ownerEmail: owner?.email ?? null,
          products: list.map((product) => ({
            _id: product._id,
            name: product.name,
            description: product.description,
            price: product.price,
            image: product.image,
            video: product.video ?? null,
            category: product.category,
            attributes: product.attributes ?? [],
            optionGroups: product.optionGroups ?? [],
            tags: product.tags,
            isAvailable: product.isAvailable,
          })),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      businesses: rows,
      totals: {
        businesses: realBusinesses.length,
        products: realBusinesses.reduce(
          (sum, business) =>
            sum + (productsByBusiness.get(business._id)?.length ?? 0),
          0,
        ),
      },
    };
  },
});

function requireRealBusiness(business: Doc<"businesses"> | null) {
  if (!business) throw new ConvexError("Esa tienda ya no existe");
  if (business.isDemo) {
    throw new ConvexError("Las tiendas demo se editan en la pestaña Demo");
  }
  return business;
}

/** Edita los datos visibles de una tienda real a solicitud del negocio. */
export const updateStoreBusiness = mutation({
  args: {
    businessId: v.id("businesses"),
    name: v.optional(v.string()),
    tagline: v.optional(v.string()),
    category: v.optional(v.string()),
    department: v.optional(v.string()),
    image: v.optional(v.string()),
    address: v.optional(v.string()),
    etaMinutes: v.optional(v.number()),
    isOpen: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const business = requireRealBusiness(await ctx.db.get(args.businessId));

    const patch: Partial<Doc<"businesses">> = {};
    let departmentChanged = false;

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length < 2) {
        throw new ConvexError("El nombre de la tienda necesita al menos 2 letras");
      }
      if (name.length > 80) {
        throw new ConvexError("El nombre de la tienda no puede pasar de 80 letras");
      }
      patch.name = name;
    }
    if (args.tagline !== undefined) {
      const tagline = args.tagline.trim();
      if (tagline.length > 140) {
        throw new ConvexError("La frase de la tienda no puede pasar de 140 letras");
      }
      patch.tagline = tagline;
    }
    if (args.category !== undefined) {
      const category = args.category.trim();
      if (category.length < 2) {
        throw new ConvexError("La categoría de la tienda necesita al menos 2 letras");
      }
      if (category.length > 60) {
        throw new ConvexError("La categoría de la tienda no puede pasar de 60 letras");
      }
      patch.category = category;
    }
    if (args.department !== undefined) {
      if (!DEPARTMENT_SLUGS.has(args.department)) {
        throw new ConvexError("Elegí un departamento válido");
      }
      patch.department = args.department;
      departmentChanged =
        (business.department ?? DEFAULT_DEPARTMENT) !== args.department;
    }
    if (args.image !== undefined) {
      patch.image = cleanImage(args.image, "La foto de la tienda");
    }
    if (args.address !== undefined) {
      const address = args.address.trim();
      if (address.length < 3) {
        throw new ConvexError("Escribí la dirección de la tienda");
      }
      if (address.length > 200) {
        throw new ConvexError("La dirección no puede pasar de 200 letras");
      }
      patch.address = address;
    }
    if (args.etaMinutes !== undefined) {
      if (!Number.isFinite(args.etaMinutes)) {
        throw new ConvexError("El tiempo estimado no es válido");
      }
      patch.etaMinutes = Math.min(180, Math.max(5, Math.round(args.etaMinutes)));
    }
    if (args.isOpen !== undefined) patch.isOpen = args.isOpen;

    if (Object.keys(patch).length === 0) return { updated: false, productsUpdated: 0 };

    await ctx.db.patch(business._id, patch);

    let productsUpdated = 0;
    if (departmentChanged) {
      const products = await ctx.db
        .query("products")
        .withIndex("by_business", (q) => q.eq("businessId", business._id))
        .collect();
      for (const product of products) {
        await ctx.db.patch(product._id, { department: args.department! });
        productsUpdated += 1;
      }
    }

    return { updated: true, productsUpdated };
  },
});

/** URL temporal para que el admin suba la foto de un producto desde la galeria. */
export const generateStoreProductImageUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** URL temporal para que el admin suba el video de un producto desde la galeria. */
export const generateStoreProductVideoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Publica un producto nuevo en una tienda real a solicitud del negocio. */
export const createStoreProduct = mutation({
  args: {
    businessId: v.id("businesses"),
    name: v.string(),
    description: v.string(),
    price: v.number(),
    category: v.string(),
    image: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    videoStorageId: v.optional(v.id("_storage")),
    tags: v.optional(v.array(v.string())),
    attributes: v.optional(
      v.array(v.object({ key: v.string(), value: v.string() })),
    ),
    optionGroups: v.optional(v.array(productOptionGroupValidator)),
    isAvailable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const business = requireRealBusiness(await ctx.db.get(args.businessId));

    const name = args.name.trim();
    if (name.length < 2) {
      throw new ConvexError("El producto necesita al menos 2 letras");
    }
    if (name.length > 90) {
      throw new ConvexError("El nombre del producto no puede pasar de 90 letras");
    }
    const description = args.description.trim();
    if (description.length > 500) {
      throw new ConvexError("La descripción no puede pasar de 500 letras");
    }
    if (!Number.isFinite(args.price) || args.price <= 0) {
      throw new ConvexError("El precio tiene que ser mayor a 0");
    }
    const category = args.category.trim() || "General";
    if (category.length > 60) {
      throw new ConvexError("La categoría del producto no puede pasar de 60 letras");
    }
    const tags = Array.from(
      new Set(
        (args.tags ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0),
      ),
    ).slice(0, 12);
    if (tags.some((tag) => tag.length > 40)) {
      throw new ConvexError("Cada etiqueta puede tener hasta 40 letras");
    }
    const uploadedImage = args.imageStorageId
      ? await storeProductImageUrl(ctx, args.imageStorageId)
      : null;
    const image = uploadedImage ?? (args.image?.trim()
      ? cleanImage(args.image, "La foto del producto")
      : business.image);
    const video = args.videoStorageId
      ? await storeProductVideoUrl(ctx, args.videoStorageId)
      : undefined;
    const optionGroups = normalizeOptionGroups(args.optionGroups);

    const productId = await ctx.db.insert("products", {
      businessId: business._id,
      department: business.department ?? DEFAULT_DEPARTMENT,
      name,
      description,
      price: Math.round(args.price),
      image,
      ...(video ? { video } : {}),
      category,
      attributes: args.attributes ?? [],
      ...(optionGroups.length > 0 ? { optionGroups } : {}),
      tags,
      isAvailable: args.isAvailable ?? true,
      sortOrder: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.marketing.announceNewProduct, {
      productId,
    });
    return { productId };
  },
});

/** Edita un producto de una tienda real a solicitud del negocio. */
export const updateStoreProduct = mutation({
  args: {
    productId: v.id("products"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    price: v.optional(v.number()),
    category: v.optional(v.string()),
    image: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    videoStorageId: v.optional(v.id("_storage")),
    removeVideo: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    attributes: v.optional(
      v.array(v.object({ key: v.string(), value: v.string() })),
    ),
    optionGroups: v.optional(v.array(productOptionGroupValidator)),
    isAvailable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError("Ese producto ya no existe");
    requireRealBusiness(await ctx.db.get(product.businessId));

    const patch: Partial<Doc<"products">> = {};

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length < 2) {
        throw new ConvexError("El producto necesita al menos 2 letras");
      }
      if (name.length > 90) {
        throw new ConvexError("El nombre del producto no puede pasar de 90 letras");
      }
      patch.name = name;
    }
    if (args.description !== undefined) {
      const description = args.description.trim();
      if (description.length > 500) {
        throw new ConvexError("La descripción no puede pasar de 500 letras");
      }
      patch.description = description;
    }
    if (args.price !== undefined) {
      if (!Number.isFinite(args.price) || args.price <= 0) {
        throw new ConvexError("El precio tiene que ser mayor a 0");
      }
      patch.price = Math.round(args.price);
    }
    if (args.category !== undefined) {
      const category = args.category.trim();
      if (category.length < 2) {
        throw new ConvexError("La categoría del producto necesita al menos 2 letras");
      }
      if (category.length > 60) {
        throw new ConvexError("La categoría del producto no puede pasar de 60 letras");
      }
      patch.category = category;
    }
    if (args.imageStorageId) {
      patch.image = await storeProductImageUrl(ctx, args.imageStorageId);
    } else if (args.image !== undefined) {
      patch.image = cleanImage(args.image, "La foto del producto");
    }
    if (args.removeVideo) patch.video = undefined;
    if (args.videoStorageId) {
      patch.video = await storeProductVideoUrl(ctx, args.videoStorageId);
    }
    if (args.attributes !== undefined) patch.attributes = args.attributes;
    if (args.optionGroups !== undefined) {
      const groups = normalizeOptionGroups(args.optionGroups);
      patch.optionGroups = groups.length > 0 ? groups : undefined;
    }
    if (args.tags !== undefined) {
      const tags = Array.from(
        new Set(
          args.tags
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0),
        ),
      ).slice(0, 12);
      if (tags.some((tag) => tag.length > 40)) {
        throw new ConvexError("Cada etiqueta puede tener hasta 40 letras");
      }
      patch.tags = tags;
    }
    if (args.isAvailable !== undefined) patch.isAvailable = args.isAvailable;

    if (Object.keys(patch).length === 0) return { updated: false };
    await ctx.db.patch(product._id, patch);
    return { updated: true };
  },
});

/** Borra un producto de una tienda real y lo saca de carritos y antojos. */
export const deleteStoreProduct = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError("Ese producto ya no existe");
    requireRealBusiness(await ctx.db.get(product.businessId));

    let cartItems = 0;
    for (const item of await ctx.db.query("cartItems").collect()) {
      if (item.productId !== product._id) continue;
      await ctx.db.delete(item._id);
      cartItems += 1;
    }

    let swipes = 0;
    for (const swipe of await ctx.db.query("swipes").collect()) {
      if (swipe.productId !== product._id) continue;
      await ctx.db.delete(swipe._id);
      swipes += 1;
    }

    await ctx.db.delete(product._id);
    return { deleted: true, cartItems, swipes };
  },
});
