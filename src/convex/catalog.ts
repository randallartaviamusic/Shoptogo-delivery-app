import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { DELIVERY_RULES, deliveryQuote, isValidPoint } from "../lib/delivery";
import type { GeoPoint } from "../lib/delivery";
import { planTier } from "../lib/subscriptions";
import { productFulfillmentMethods } from "../lib/fulfillment";
import { normalizeSubcategory } from "../lib/departments";
import { subscriptionAccess } from "./subscriptions";
import { isAccountVerified } from "./verification";
import { productOptionChoiceValidator } from "./schema";
import {
  choiceKey,
  defaultChoices,
  validateChoices,
} from "../lib/productOptions";

/**
 * Baraja con semilla: el cliente manda una nueva al entrar para que el mazo
 * cambie en cada visita, pero se mantiene estable mientras se desliza.
 */
function hash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const DEFAULT_DEPARTMENT = "comida";

export const deck = query({
  args: {
    department: v.optional(v.string()),
    filters: v.optional(v.record(v.string(), v.array(v.string()))),
    seed: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const department = args.department ?? DEFAULT_DEPARTMENT;
    const seed = args.seed ?? "sin-semilla";
    const products = await ctx.db.query("products").collect();
    const businesses = await ctx.db.query("businesses").collect();
    const swipes = userId
      ? await ctx.db
          .query("swipes")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect()
      : [];

    const swiped = new Set(swipes.map((s) => s.productId));
    const businessMap = new Map(businesses.map((b) => [b._id, b]));
    // Una suscripción vencida no recibe pedidos: su catálogo sale del mazo.
    const accessByBusiness = new Map<
      string,
      { allowed: boolean; tier: number }
    >();
    for (const business of businesses) {
      if (business.isDemo || !business.ownerId) {
        accessByBusiness.set(business._id, { allowed: true, tier: 1 });
        continue;
      }
      const [access, verified] = await Promise.all([
        subscriptionAccess(ctx, business.ownerId),
        isAccountVerified(ctx, business.ownerId),
      ]);
      accessByBusiness.set(business._id, {
        allowed: access.hasAccess && verified,
        tier: planTier(access.plan),
      });
    }
    const viewerDoc = userId ? await ctx.db.get(userId) : null;
    const viewer = isValidPoint(viewerDoc?.location) ? viewerDoc.location : null;

    const deliveryFor = (businessLocation: GeoPoint | undefined) => {
      const quote = deliveryQuote(businessLocation, viewer);
      return {
        feeFrom: DELIVERY_RULES.baseFee,
        fee: quote?.fee ?? null,
        distanceKm: quote?.distanceKm ?? null,
        available: quote !== null || viewer === null,
      };
    };

    const departmentOf = (product: (typeof products)[number]) =>
      product.department ??
      businessMap.get(product.businessId)?.department ??
      DEFAULT_DEPARTMENT;

    const available = products.filter((product) => {
      const business = businessMap.get(product.businessId);
      return (
        Boolean(business?.isOpen) &&
        product.isAvailable &&
        (accessByBusiness.get(product.businessId)?.allowed ?? true)
      );
    });

    const departmentCounts = new Map<string, number>();
    for (const product of available) {
      const slug = departmentOf(product);
      departmentCounts.set(slug, (departmentCounts.get(slug) ?? 0) + 1);
    }

    // "todos" mezcla todos los rubros en un solo mazo.
    const inDepartment =
      department === "todos"
        ? available
        : available.filter((product) => departmentOf(product) === department);

    // Facet values can contain accents, so they are returned as a flat list
    // instead of an object (Convex object keys must be ASCII).
    const facetCounts = new Map<string, number>();
    for (const product of inDepartment) {
      for (const attribute of product.attributes ?? []) {
        const composite = `${attribute.key}\u0000${attribute.value}`;
        facetCounts.set(composite, (facetCounts.get(composite) ?? 0) + 1);
      }
    }

    const activeFilters = Object.entries(args.filters ?? {}).filter(
      ([, values]) => values.length > 0,
    );

    const cards = inDepartment
      .filter((product) => {
        if (swiped.has(product._id)) return false;
        return activeFilters.every(([key, values]) =>
          (product.attributes ?? []).some(
            (attribute) =>
              attribute.key === key && values.includes(attribute.value),
          ),
        );
      })
      .map((product) => {
        const business = businessMap.get(product.businessId)!;
        const tier = accessByBusiness.get(business._id)?.tier ?? 1;
        const elite = tier === 3;
        const flashTitle = business.flashTitle?.trim() ?? "";
        const flashEndsAt = business.flashEndsAt ?? 0;
        return {
          _id: product._id,
          name: product.name,
          description: product.description,
          price: product.price,
          image: product.image,
          video: product.video ?? null,
          category: normalizeSubcategory(product.category),
          department: departmentOf(product),
          attributes: product.attributes ?? [],
          optionGroups: product.optionGroups ?? [],
          tags: product.tags,
          // La promo es de la tienda completa, no de un producto suelto.
          promo: business.deliveryPromo ?? null,
          businessId: business._id,
          businessName: business.name,
          businessSlug: business.slug,
          businessCategory: business.category,
          businessImage: business.image,
          elite,
          eliteVerified: elite && Boolean(business.verifiedAt),
          flash:
            elite && flashTitle && flashEndsAt > Date.now()
              ? {
                  title: flashTitle,
                  detail: business.flashDetail?.trim() ?? "",
                  mediaUrl: business.flashMediaUrl ?? null,
                  mediaKind: business.flashMediaKind ?? null,
                  endsAt: flashEndsAt,
                }
              : null,
          rating: business.rating,
          reviews: business.reviews,
          etaMinutes: business.etaMinutes,
          delivery: deliveryFor(business.location),
          address: business.address,
          stockEnabled: product.stockEnabled ?? false,
          stock: product.stockEnabled ? (product.stock ?? 0) : null,
          reservable: product.reservable ?? false,
          fulfillmentMethods: productFulfillmentMethods(product),
        };
      })
      .sort(
        (a, b) =>
          hash(`${seed}:${a._id}`) - hash(`${seed}:${b._id}`),
      )
      .slice(0, 40);

    return {
      department,
      cards,
      departments: Array.from(departmentCounts.entries()).map(
        ([slug, count]) => ({ slug, count }),
      ),
      facetCounts: Array.from(facetCounts.entries()).map(
        ([composite, count]) => {
          const [facet, value] = composite.split("\u0000");
          return { facet, value, count };
        },
      ),
      total: inDepartment.length,
    };
  },
});

export const swipe = mutation({
  args: {
    productId: v.id("products"),
    direction: v.union(v.literal("like"), v.literal("pass"), v.literal("save")),
    // Para productos con sabor, acompañamientos o ingredientes.
    options: v.optional(v.array(productOptionChoiceValidator)),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Ese producto ya no está disponible");
    if (args.direction === "like") {
      if (!product.isAvailable) {
        throw new Error("Ese producto está agotado o ya no está disponible");
      }
      if (product.stockEnabled && (product.stock ?? 0) <= 0) {
        throw new Error(`${product.name} ya se agotó. Probá con otro antojo.`);
      }
      const business = await ctx.db.get(product.businessId);
      if (!business?.isOpen) {
        throw new Error(`${business?.name ?? "El negocio"} está cerrado ahora`);
      }
      if (!business.isDemo && business.ownerId) {
        const access = await subscriptionAccess(ctx, business.ownerId);
        const verified = await isAccountVerified(ctx, business.ownerId);
        if (!access.hasAccess || !verified) {
          throw new Error("Este negocio no puede recibir pedidos ahora");
        }
      }
    }

    let selectedOptions: NonNullable<Doc<"cartItems">["options"]> = [];
    let optionPrice = 0;
    let selectionKey = "base";
    if (args.direction === "like") {
      const choices =
        args.options ?? defaultChoices(product.optionGroups ?? []);
      const selection = validateChoices(product.optionGroups ?? [], choices);
      if (!selection.ok) throw new Error(selection.error);
      selectedOptions = selection.selected;
      optionPrice = selection.extra;
      selectionKey = choiceKey(selection.choices);
    }

    const cartItem =
      args.direction === "like"
        ? await ctx.db
            .query("cartItems")
            .withIndex("by_user_selection", (q) =>
              q
                .eq("userId", userId)
                .eq("productId", args.productId)
                .eq("selectionKey", selectionKey),
            )
            .unique()
        : null;
    if (cartItem && cartItem.quantity >= 20) {
      throw new Error("El carrito admite hasta 20 unidades de cada producto");
    }

    const existing = await ctx.db
      .query("swipes")
      .withIndex("by_user_product", (q) =>
        q.eq("userId", userId).eq("productId", args.productId),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);

    await ctx.db.insert("swipes", {
      userId,
      productId: args.productId,
      direction: args.direction,
      createdAt: Date.now(),
    });

    if (args.direction === "like" && product.stockEnabled) {
      const inCart = await ctx.db
        .query("cartItems")
        .withIndex("by_user_product", (q) => q.eq("userId", userId).eq("productId", args.productId))
        .collect();
      const current = inCart.reduce((sum, item) => sum + item.quantity, 0);
      if (current + 1 > (product.stock ?? 0)) {
        throw new Error(`Solo quedan ${product.stock ?? 0} de ${product.name} en stock`);
      }
    }

    if (args.direction === "like") {
      if (cartItem) {
        await ctx.db.patch(cartItem._id, {
          quantity: Math.min(20, cartItem.quantity + 1),
        });
      } else {
        await ctx.db.insert("cartItems", {
          userId,
          productId: args.productId,
          businessId: product.businessId,
          quantity: 1,
          options: selectedOptions,
          optionPrice,
          selectionKey,
          addedAt: Date.now(),
        });
      }
    }

    if (args.direction === "pass" || args.direction === "save") {
      const items = await ctx.db
        .query("cartItems")
        .withIndex("by_user_product", (q) =>
          q.eq("userId", userId).eq("productId", args.productId),
        )
        .collect();
      for (const item of items) await ctx.db.delete(item._id);
    }

    return {
      productName: product.name,
      businessName: (await ctx.db.get(product.businessId))?.name ?? "",
      direction: args.direction,
    };
  },
});

/** Tinder's rewind: brings the last card back and reverses its cart change. */
export const undo = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");

    const swipes = await ctx.db
      .query("swipes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (swipes.length === 0) return { reverted: null };

    const last = swipes.sort((a, b) => b.createdAt - a.createdAt)[0];
    await ctx.db.delete(last._id);

    if (last.direction === "like") {
      const items = await ctx.db
        .query("cartItems")
        .withIndex("by_user_product", (q) =>
          q.eq("userId", userId).eq("productId", last.productId),
        )
        .collect();
      // Con variantes puede haber varias líneas: deshacemos la última suma.
      const item = items.sort((a, b) => b.addedAt - a.addedAt)[0];
      if (item) {
        if (item.quantity > 1) {
          await ctx.db.patch(item._id, { quantity: item.quantity - 1 });
        } else {
          await ctx.db.delete(item._id);
        }
      }
    }

    const product = await ctx.db.get(last.productId);
    return { reverted: product?.name ?? null };
  },
});

/**
 * Refill the deck: brings back passed products, plus liked ones that are no
 * longer in the cart (so an ordered dish can be discovered again). Super
 * antojos stay saved.
 */
export const resetDeck = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const swipes = await ctx.db
      .query("swipes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    let restored = 0;
    for (const swipeDoc of swipes) {
      if (swipeDoc.direction === "save") continue;
      if (swipeDoc.direction === "like") {
        const inCart = await ctx.db
          .query("cartItems")
          .withIndex("by_user_product", (q) =>
            q.eq("userId", userId).eq("productId", swipeDoc.productId),
          )
          .first();
        if (inCart) continue;
      }
      await ctx.db.delete(swipeDoc._id);
      restored += 1;
    }
    return { restored };
  },
});

export const saved = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const swipes = await ctx.db
      .query("swipes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const savedSwipes = swipes
      .filter((s) => s.direction === "save")
      .sort((a, b) => b.createdAt - a.createdAt);

    const viewerDoc = await ctx.db.get(userId);
    const viewer = isValidPoint(viewerDoc?.location) ? viewerDoc.location : null;
    const deliveryFor = (businessLocation: GeoPoint | undefined) => {
      const quote = deliveryQuote(businessLocation, viewer);
      return {
        feeFrom: DELIVERY_RULES.baseFee,
        fee: quote?.fee ?? null,
        distanceKm: quote?.distanceKm ?? null,
        available: quote !== null || viewer === null,
      };
    };

    const results = [];
    for (const swipeDoc of savedSwipes) {
      const product = await ctx.db.get(swipeDoc.productId);
      if (!product) continue;
      const business = await ctx.db.get(product.businessId);
      if (!business) continue;
      results.push({
        _id: product._id,
        name: product.name,
        description: product.description,
        price: product.price,
        image: product.image,
        video: product.video ?? null,
        category: product.category,
        optionGroups: product.optionGroups ?? [],
        tags: product.tags,
        promo: business.deliveryPromo ?? null,
        businessId: business._id,
        businessName: business.name,
        businessImage: business.image,
        rating: business.rating,
        etaMinutes: business.etaMinutes,
        delivery: deliveryFor(business.location),
        isOpen: business.isOpen,
        savedAt: swipeDoc.createdAt,
      });
    }
    return results;
  },
});

export const myStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { likes: 0, passes: 0, saved: 0, orders: 0 };
    }
    const swipes = await ctx.db
      .query("swipes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_buyer", (q) => q.eq("buyerId", userId))
      .collect();
    return {
      likes: swipes.filter((s) => s.direction === "like").length,
      passes: swipes.filter((s) => s.direction === "pass").length,
      saved: swipes.filter((s) => s.direction === "save").length,
      orders: orders.length,
    };
  },
});
