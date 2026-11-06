import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

function guestClaimToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");

    const patch: Partial<Doc<"users">> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length < 2) throw new Error("Escribí tu nombre completo");
      patch.name = name;
    }
    if (args.phone !== undefined) patch.phone = args.phone.trim();
    if (args.address !== undefined) patch.address = args.address.trim();
    if (args.city !== undefined) patch.city = args.city.trim();

    await ctx.db.patch(userId, patch);
    return null;
  },
});

/**
 * Guests shop with a silent anonymous session. The app keeps this single-use
 * token so the account they create later can adopt that guest activity.
 */
export const issueGuestClaim = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user?.isAnonymous) return null;
    if (user.guestClaim) return user.guestClaim;
    const token = guestClaimToken();
    await ctx.db.patch(userId, { guestClaim: token });
    return token;
  },
});

/** Moves the guest's cart, swipes and orders to the freshly created account. */
export const claimGuestData = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const account = await ctx.db.get(userId);
    if (!account || account.isAnonymous) return { claimed: false };

    const token = args.token.trim();
    if (token.length < 16) return { claimed: false };

    const users = await ctx.db.query("users").collect();
    const guest = users.find((user) => user.guestClaim === token);
    if (
      !guest ||
      guest._id === userId ||
      !guest.isAnonymous ||
      guest.guestClaim !== token
    ) {
      return { claimed: false };
    }

    const guestId = guest._id as Id<"users">;

    const guestCart = await ctx.db
      .query("cartItems")
      .withIndex("by_user", (q) => q.eq("userId", guestId))
      .collect();
    for (const item of guestCart) {
      const existing = await ctx.db
        .query("cartItems")
        .withIndex("by_user_product", (q) =>
          q.eq("userId", userId).eq("productId", item.productId),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          quantity: Math.min(20, existing.quantity + item.quantity),
        });
      } else {
        await ctx.db.patch(item._id, { userId });
      }
    }

    const guestSwipes = await ctx.db
      .query("swipes")
      .withIndex("by_user", (q) => q.eq("userId", guestId))
      .collect();
    for (const swipe of guestSwipes) await ctx.db.patch(swipe._id, { userId });

    const guestOrders = await ctx.db
      .query("orders")
      .withIndex("by_buyer", (q) => q.eq("buyerId", guestId))
      .collect();
    for (const order of guestOrders) {
      await ctx.db.patch(order._id, { buyerId: userId });
    }

    const profilePatch: Partial<Doc<"users">> = {};
    if (!account.name && guest.name) profilePatch.name = guest.name;
    if (!account.address && guest.address) profilePatch.address = guest.address;
    if (!account.phone && guest.phone) profilePatch.phone = guest.phone;
    if (!account.city && guest.city) profilePatch.city = guest.city;
    if (Object.keys(profilePatch).length > 0) {
      await ctx.db.patch(userId, profilePatch);
    }

    await ctx.db.patch(guestId, { guestClaim: undefined });

    return {
      claimed: true,
      items: guestCart.length,
      orders: guestOrders.length,
    };
  },
});

export const setRole = mutation({
  args: {
    role: v.union(
      v.literal("buyer"),
      v.literal("business"),
      v.literal("courier"),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    await ctx.db.patch(userId, {
      role: args.role,
      onboarded: args.role !== "business",
    });
    return { role: args.role };
  },
});
