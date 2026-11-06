import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type DbCtx = QueryCtx | MutationCtx;

const CATEGORY_IMAGES: Record<string, string> = {
  Hamburguesas:
    "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80",
  Pizza:
    "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80",
  Sushi:
    "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=900&q=80",
  Mexicana:
    "https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=900&q=80",
  Asiática:
    "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=80",
  Postres:
    "https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=900&q=80",
  Saludable:
    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80",
  Café:
    "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=900&q=80",
  "Pollo frito":
    "https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=900&q=80",
  Pasta:
    "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=900&q=80",
  Otro: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80",
};

const DEFAULT_IMAGE = CATEGORY_IMAGES.Otro;

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function requireUserId(ctx: DbCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Necesitás iniciar sesión");
  return userId;
}

async function ownedBusiness(ctx: DbCtx, userId: Id<"users">) {
  return await ctx.db
    .query("businesses")
    .withIndex("by_owner", (q) => q.eq("ownerId", userId))
    .first();
}

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .first();
    if (!business) return null;
    const products = await ctx.db
      .query("products")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .collect();
    return { business, products };
  },
});

export const categories = query({
  args: {},
  handler: async () => Object.keys(CATEGORY_IMAGES),
});

export const create = mutation({
  args: {
    name: v.string(),
    category: v.string(),
    tagline: v.string(),
    address: v.string(),
    deliveryFee: v.number(),
    etaMinutes: v.number(),
    addStarterMenu: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ownedBusiness(ctx, userId);
    if (existing) return { businessId: existing._id };

    const name = args.name.trim();
    if (name.length < 2) throw new Error("Poné un nombre de negocio válido");
    if (args.address.trim().length < 5) {
      throw new Error("Necesitamos una dirección del local");
    }

    const businessId = await ctx.db.insert("businesses", {
      ownerId: userId,
      name,
      slug: `${slugify(name) || "whimy"}-${Math.floor(Math.random() * 900 + 100)}`,
      category: args.category,
      tagline: args.tagline.trim() || "Antojos hechos en casa",
      image: CATEGORY_IMAGES[args.category] ?? DEFAULT_IMAGE,
      address: args.address.trim(),
      deliveryFee: Math.max(0, Math.round(args.deliveryFee)),
      etaMinutes: Math.max(5, Math.round(args.etaMinutes)),
      rating: 5,
      reviews: 0,
      isOpen: true,
    });

    await ctx.db.patch(userId, {
      role: "business",
      onboarded: true,
      address: args.address.trim(),
    });

    if (args.addStarterMenu !== false) {
      const categoryImage = CATEGORY_IMAGES[args.category] ?? DEFAULT_IMAGE;
      const starters = [
        {
          name: "Especial de la casa",
          description:
            "La receta que nos hizo conocidos. Preparada al momento con ingredientes frescos.",
          price: 8900,
          category: args.category,
          tags: ["Más pedido"],
        },
        {
          name: "Opción clásica",
          description:
            "El clásico que nunca falla, con nuestra salsa insignia y guarnición.",
          price: 6900,
          category: args.category,
          tags: ["Clásico"],
        },
        {
          name: "Para compartir",
          description:
            "Porción generosa para dos personas, ideal para probar la carta.",
          price: 12900,
          category: args.category,
          tags: ["Para compartir"],
        },
      ];
      for (const starter of starters) {
        await ctx.db.insert("products", {
          businessId,
          name: starter.name,
          description: starter.description,
          price: starter.price,
          image: categoryImage,
          category: starter.category,
          tags: starter.tags,
          isAvailable: true,
        });
      }
    }

    return { businessId };
  },
});

export const update = mutation({
  args: {
    name: v.optional(v.string()),
    tagline: v.optional(v.string()),
    address: v.optional(v.string()),
    deliveryFee: v.optional(v.number()),
    etaMinutes: v.optional(v.number()),
    isOpen: v.optional(v.boolean()),
    image: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const business = await ownedBusiness(ctx, userId);
    if (!business) throw new Error("No tenés un negocio asociado");

    const patch: Partial<Doc<"businesses">> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.tagline !== undefined) patch.tagline = args.tagline.trim();
    if (args.address !== undefined) patch.address = args.address.trim();
    if (args.deliveryFee !== undefined)
      patch.deliveryFee = Math.max(0, Math.round(args.deliveryFee));
    if (args.etaMinutes !== undefined)
      patch.etaMinutes = Math.max(5, Math.round(args.etaMinutes));
    if (args.isOpen !== undefined) patch.isOpen = args.isOpen;
    if (args.image !== undefined && args.image.trim().length > 0)
      patch.image = args.image.trim();

    await ctx.db.patch(business._id, patch);
    return null;
  },
});

export const addProduct = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    price: v.number(),
    category: v.string(),
    image: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const business = await ownedBusiness(ctx, userId);
    if (!business) throw new Error("No tenés un negocio asociado");
    const name = args.name.trim();
    if (name.length < 2) throw new Error("El producto necesita un nombre");
    if (args.price <= 0) throw new Error("El precio tiene que ser mayor a 0");

    const productId = await ctx.db.insert("products", {
      businessId: business._id,
      name,
      description: args.description.trim(),
      price: Math.round(args.price),
      image:
        args.image?.trim() ||
        CATEGORY_IMAGES[args.category] ||
        business.image ||
        DEFAULT_IMAGE,
      category: args.category.trim() || "Otro",
      tags: args.tags ?? [],
      isAvailable: true,
    });
    return { productId };
  },
});

export const updateProduct = mutation({
  args: {
    productId: v.id("products"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    price: v.optional(v.number()),
    category: v.optional(v.string()),
    image: v.optional(v.string()),
    isAvailable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const business = await ownedBusiness(ctx, userId);
    if (!business) throw new Error("No tenés un negocio asociado");
    const product = await ctx.db.get(args.productId);
    if (!product || product.businessId !== business._id) {
      throw new Error("Ese producto no pertenece a tu negocio");
    }

    const patch: Partial<Doc<"products">> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined)
      patch.description = args.description.trim();
    if (args.price !== undefined) patch.price = Math.round(args.price);
    if (args.category !== undefined) patch.category = args.category.trim();
    if (args.image !== undefined && args.image.trim().length > 0)
      patch.image = args.image.trim();
    if (args.isAvailable !== undefined) patch.isAvailable = args.isAvailable;

    await ctx.db.patch(args.productId, patch);
    return null;
  },
});

export const removeProduct = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const business = await ownedBusiness(ctx, userId);
    if (!business) throw new Error("No tenés un negocio asociado");
    const product = await ctx.db.get(args.productId);
    if (!product || product.businessId !== business._id) {
      throw new Error("Ese producto no pertenece a tu negocio");
    }
    await ctx.db.delete(args.productId);
    return { deleted: true };
  },
});
