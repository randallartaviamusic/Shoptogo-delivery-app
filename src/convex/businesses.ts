import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type DbCtx = QueryCtx | MutationCtx;

const DEFAULT_DEPARTMENT = "comida";

const DEPARTMENT_IMAGES: Record<string, string> = {
  comida:
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80",
  ropa: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=900&q=80",
  zapatos:
    "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=900&q=80",
  perfumes:
    "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=900&q=80",
  belleza:
    "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=80",
  "cuidado-personal":
    "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=900&q=80",
  farmacia:
    "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=900&q=80",
  electronicos:
    "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=900&q=80",
  electrodomesticos:
    "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=900&q=80",
  muebles:
    "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=900&q=80",
  instrumentos:
    "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=900&q=80",
  herramientas:
    "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=900&q=80",
  supermercado:
    "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80",
};

/** The main facet of each department, used for the starter catalog. */
const PRIMARY_FACET: Record<string, string> = {
  comida: "cocina",
  ropa: "tipo",
  zapatos: "tipo",
  perfumes: "familia",
  belleza: "tipo",
  "cuidado-personal": "tipo",
  farmacia: "tipo",
  electronicos: "tipo",
  electrodomesticos: "tipo",
  muebles: "ambiente",
  instrumentos: "tipo",
  herramientas: "tipo",
  supermercado: "pasillo",
};

const DEPARTMENT_SLUGS = Object.keys(DEPARTMENT_IMAGES);

function departmentImage(department: string) {
  return DEPARTMENT_IMAGES[department] ?? DEPARTMENT_IMAGES[DEFAULT_DEPARTMENT];
}

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

/**
 * Modo negocios: todos los locales con su rubro y cuánto catálogo tienen.
 * El filtrado por categoría, subcategoría y búsqueda por nombre se resuelve
 * en el cliente para que la búsqueda responda al instante.
 */
export const directory = query({
  args: {},
  handler: async (ctx) => {
    const businesses = await ctx.db.query("businesses").collect();
    const products = await ctx.db.query("products").collect();

    const stats = new Map<string, { count: number; minPrice: number }>();
    for (const product of products) {
      if (!product.isAvailable) continue;
      const entry = stats.get(product.businessId) ?? {
        count: 0,
        minPrice: product.price,
      };
      entry.count += 1;
      entry.minPrice = Math.min(entry.minPrice, product.price);
      stats.set(product.businessId, entry);
    }

    return businesses
      .map((business) => {
        const entry = stats.get(business._id);
        return {
          _id: business._id,
          name: business.name,
          slug: business.slug,
          tagline: business.tagline,
          image: business.image,
          department: business.department ?? DEFAULT_DEPARTMENT,
          category: business.category,
          rating: business.rating,
          reviews: business.reviews,
          isOpen: business.isOpen,
          etaMinutes: business.etaMinutes,
          deliveryFee: business.deliveryFee,
          address: business.address,
          productCount: entry?.count ?? 0,
          minPrice: entry?.minPrice ?? null,
        };
      })
      .sort(
        (a, b) =>
          Number(b.isOpen) - Number(a.isOpen) ||
          b.rating - a.rating ||
          a.name.localeCompare(b.name),
      );
  },
});

/** Catálogo completo de venta de un local, agrupable por rubro. */
export const storefront = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!business) return null;

    const products = await ctx.db
      .query("products")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .collect();

    return {
      business,
      products: products
        .filter((product) => product.isAvailable)
        .sort(
          (a, b) =>
            a.category.localeCompare(b.category) ||
            a.name.localeCompare(b.name),
        )
        .map((product) => ({
          _id: product._id,
          name: product.name,
          description: product.description,
          price: product.price,
          image: product.image,
          category: product.category,
          tags: product.tags,
        })),
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    department: v.string(),
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
    const department = DEPARTMENT_SLUGS.includes(args.department)
      ? args.department
      : DEFAULT_DEPARTMENT;
    const category = args.category.trim() || "General";

    const businessId = await ctx.db.insert("businesses", {
      ownerId: userId,
      name,
      slug: `${slugify(name) || "capricho"}-${Math.floor(Math.random() * 900 + 100)}`,
      department,
      category,
      tagline: args.tagline.trim() || "Productos elegidos con criterio",
      image: departmentImage(department),
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
      const image = departmentImage(department);
      const primaryFacet = PRIMARY_FACET[department] ?? "tipo";
      const isFood = department === DEFAULT_DEPARTMENT;
      const starters = isFood
        ? [
            {
              name: "Especial de la casa",
              description:
                "La receta que nos hizo conocidos. Preparada al momento con ingredientes frescos.",
              price: 8900,
              tags: ["Más pedido"],
            },
            {
              name: "Opción clásica",
              description:
                "El clásico que nunca falla, con nuestra salsa insignia y guarnición.",
              price: 6900,
              tags: ["Clásico"],
            },
            {
              name: "Para compartir",
              description:
                "Porción generosa para dos personas, ideal para probar la carta.",
              price: 12900,
              tags: ["Para compartir"],
            },
          ]
        : [
            {
              name: "Producto destacado",
              description:
                "Nuestra pieza insignia, elegida por la mayoría de los clientes.",
              price: 28900,
              tags: ["Más vendido"],
            },
            {
              name: "Opción clásica",
              description:
                "El básico que siempre funciona, con la calidad de la casa.",
              price: 18900,
              tags: ["Clásico"],
            },
            {
              name: "Ideal para regalar",
              description:
                "Presentación cuidada y lista para sorprender a alguien.",
              price: 34900,
              tags: ["Regalo"],
            },
          ];

      for (const starter of starters) {
        await ctx.db.insert("products", {
          businessId,
          department,
          name: starter.name,
          description: starter.description,
          price: starter.price,
          image,
          category,
          attributes: [{ key: primaryFacet, value: category }],
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
    attributes: v.optional(
      v.array(v.object({ key: v.string(), value: v.string() })),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const business = await ownedBusiness(ctx, userId);
    if (!business) throw new Error("No tenés un negocio asociado");
    const name = args.name.trim();
    if (name.length < 2) throw new Error("El producto necesita un nombre");
    if (args.price <= 0) throw new Error("El precio tiene que ser mayor a 0");
    const department = business.department ?? DEFAULT_DEPARTMENT;

    const productId = await ctx.db.insert("products", {
      businessId: business._id,
      department,
      name,
      description: args.description.trim(),
      price: Math.round(args.price),
      image:
        args.image?.trim() ||
        departmentImage(department) ||
        business.image,
      category: args.category.trim() || "General",
      attributes: args.attributes ?? [],
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
    attributes: v.optional(
      v.array(v.object({ key: v.string(), value: v.string() })),
    ),
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
    if (args.attributes !== undefined) patch.attributes = args.attributes;

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
