import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { DELIVERY_RULES, deliveryQuote, isValidPoint } from "../lib/delivery";
import type { GeoPoint } from "../lib/delivery";

/** Stable per-user shuffle so the deck feels random but doesn't jump around. */
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
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const department = args.department ?? DEFAULT_DEPARTMENT;
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
      return Boolean(business?.isOpen) && product.isAvailable;
    });

    const departmentCounts = new Map<string, number>();
    for (const product of available) {
      const slug = departmentOf(product);
      departmentCounts.set(slug, (departmentCounts.get(slug) ?? 0) + 1);
    }

    const inDepartment = available.filter(
      (product) => departmentOf(product) === department,
    );

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
        return {
          _id: product._id,
          name: product.name,
          description: product.description,
          price: product.price,
          image: product.image,
          category: product.category,
          department: departmentOf(product),
          attributes: product.attributes ?? [],
          tags: product.tags,
          businessId: business._id,
          businessName: business.name,
          businessCategory: business.category,
          businessImage: business.image,
          rating: business.rating,
          reviews: business.reviews,
          etaMinutes: business.etaMinutes,
          delivery: deliveryFor(business.location),
          address: business.address,
        };
      })
      .sort(
        (a, b) =>
          hash(`${userId ?? "guest"}:${a._id}`) -
          hash(`${userId ?? "guest"}:${b._id}`),
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
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Ese antojo ya no está disponible");

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

    if (args.direction === "like") {
      const item = await ctx.db
        .query("cartItems")
        .withIndex("by_user_product", (q) =>
          q.eq("userId", userId).eq("productId", args.productId),
        )
        .unique();
      if (item) {
        await ctx.db.patch(item._id, { quantity: item.quantity + 1 });
      } else {
        await ctx.db.insert("cartItems", {
          userId,
          productId: args.productId,
          businessId: product.businessId,
          quantity: 1,
          addedAt: Date.now(),
        });
      }
    }

    if (args.direction === "pass" || args.direction === "save") {
      const item = await ctx.db
        .query("cartItems")
        .withIndex("by_user_product", (q) =>
          q.eq("userId", userId).eq("productId", args.productId),
        )
        .unique();
      if (item) await ctx.db.delete(item._id);
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
      const item = await ctx.db
        .query("cartItems")
        .withIndex("by_user_product", (q) =>
          q.eq("userId", userId).eq("productId", last.productId),
        )
        .unique();
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
          .unique();
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
        category: product.category,
        tags: product.tags,
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
