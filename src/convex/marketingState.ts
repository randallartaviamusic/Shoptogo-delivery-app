import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

export type MarketingState = {
  count: number;
  nextAt: number;
  recentProducts: string[];
  lastCreative: number;
};

const STATE_KEY = "marketing_cycle";

function readState(value: string | undefined): MarketingState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<MarketingState>;
    if (
      typeof parsed.count !== "number" ||
      typeof parsed.nextAt !== "number" ||
      !Array.isArray(parsed.recentProducts) ||
      typeof parsed.lastCreative !== "number"
    ) {
      return null;
    }
    return {
      count: Math.max(0, Math.floor(parsed.count)),
      nextAt: parsed.nextAt,
      recentProducts: parsed.recentProducts.filter(
        (item): item is string => typeof item === "string",
      ),
      lastCreative: parsed.lastCreative,
    };
  } catch {
    return null;
  }
}

export const marketingState = internalQuery({
  args: {},
  handler: async (ctx): Promise<MarketingState | null> => {
    const row = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", STATE_KEY))
      .unique();
    return readState(row?.value);
  },
});

export const saveMarketingState = internalMutation({
  args: {
    count: v.number(),
    nextAt: v.number(),
    recentProducts: v.array(v.string()),
    lastCreative: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", STATE_KEY))
      .unique();
    const value = JSON.stringify({
      count: args.count,
      nextAt: args.nextAt,
      recentProducts: args.recentProducts,
      lastCreative: args.lastCreative,
    });
    if (row) {
      await ctx.db.patch(row._id, { value });
      return row._id;
    }
    return await ctx.db.insert("meta", { key: STATE_KEY, value });
  },
});

export type ProductPick =
  | {
      status: "picked";
      productId: string;
      name: string;
      price: number;
      businessName: string;
      slug: string;
    }
  | { status: "empty" | "exhausted" | "unavailable" };

/** Elige un producto comprable al azar, sin repetir los recientes. */
export const randomProductPick = internalQuery({
  args: { exclude: v.array(v.string()) },
  handler: async (ctx, args): Promise<ProductPick> => {
    const products = await ctx.db.query("products").collect();
    const available = products.filter(
      (product) => product.isAvailable && !product.isDemo,
    );
    if (available.length === 0) return { status: "empty" };

    const fresh = available.filter(
      (product) => !args.exclude.includes(String(product._id)),
    );
    if (fresh.length === 0) return { status: "exhausted" };

    const start = Math.floor(Math.random() * fresh.length);
    for (let offset = 0; offset < fresh.length; offset += 1) {
      const product: Doc<"products"> = fresh[(start + offset) % fresh.length];
      const business = await ctx.db.get(product.businessId);
      if (!business || business.isDemo || !business.isOpen) continue;
      return {
        status: "picked",
        productId: String(product._id),
        name: product.name,
        price: product.price,
        businessName: business.name,
        slug: business.slug,
      };
    }
    return { status: "unavailable" };
  },
});

/** Datos para anunciar un producto recién publicado, si sigue vigente. */
export const productAnnouncement = internalQuery({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product || !product.isAvailable || product.isDemo) return null;
    const business = await ctx.db.get(product.businessId);
    if (!business || business.isDemo) return null;
    return {
      name: product.name,
      price: product.price,
      businessName: business.name,
      slug: business.slug,
    };
  },
});
