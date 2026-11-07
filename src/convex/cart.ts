import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type DbCtx = QueryCtx | MutationCtx;

async function requireUserId(ctx: DbCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Necesitás iniciar sesión");
  return userId;
}

export type CartGroup = {
  businessId: Id<"businesses">;
  businessName: string;
  businessImage: string;
  deliveryFee: number;
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
  const cartItems = await ctx.db
    .query("cartItems")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const byBusiness = new Map<string, CartGroup>();
  const groups: CartGroup[] = [];

  for (const item of cartItems) {
    const product = await ctx.db.get(item.productId);
    if (!product) continue;
    const business = await ctx.db.get(item.businessId);
    if (!business) continue;

    let group = byBusiness.get(item.businessId);
    if (!group) {
      group = {
        businessId: item.businessId,
        businessName: business.name,
        businessImage: business.image,
        deliveryFee: business.deliveryFee,
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
  }

  const subtotal = groups.reduce((acc, g) => acc + g.subtotal, 0);
  const deliveryTotal = groups.reduce((acc, g) => acc + g.deliveryFee, 0);
  const count = groups.reduce(
    (acc, g) => acc + g.items.reduce((a, i) => a + i.quantity, 0),
    0,
  );

  return {
    groups,
    count,
    subtotal,
    deliveryTotal,
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
        subtotal: 0,
        deliveryTotal: 0,
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
    notes: v.optional(v.string()),
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

    const cartItems = await ctx.db
      .query("cartItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (cartItems.length === 0) throw new Error("Tu carrito está vacío");

    const byBusiness = new Map<
      string,
      Array<{
        productId: Id<"products">;
        name: string;
        price: number;
        quantity: number;
        image: string;
      }>
    >();
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

    let total = 0;
    let created = 0;
    const now = Date.now();

    for (const businessId of businessIds) {
      const items = byBusiness.get(businessId)!;
      const business = await ctx.db.get(businessId);
      if (!business) continue;
      const subtotal = items.reduce((acc, i) => acc + i.price * i.quantity, 0);
      const orderTotal = subtotal + business.deliveryFee;
      total += orderTotal;
      await ctx.db.insert("orders", {
        code: `CE-${Math.floor(1000 + Math.random() * 9000)}`,
        buyerId: userId,
        businessId,
        items,
        subtotal,
        deliveryFee: business.deliveryFee,
        total: orderTotal,
        status: "pending",
        address,
        notes: args.notes?.trim() || undefined,
        createdAt: now,
      });
      created += 1;
    }

    for (const item of cartItems) await ctx.db.delete(item._id);
    await ctx.db.patch(userId, { address });

    return { created, total };
  },
});
