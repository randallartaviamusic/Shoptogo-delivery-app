import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation } from "./_generated/server";

/**
 * Cuando alguien navegó como invitado y después crea su cuenta, el carrito que
 * armó tiene que seguirlo. Movemos esos productos a la cuenta nueva.
 */
export const adoptGuestCart = mutation({
  args: { guestId: v.id("users") },
  handler: async (ctx, { guestId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId || userId === guestId) return { moved: 0 };

    const me = await ctx.db.get(userId);
    if (!me || me.isAnonymous) return { moved: 0 };

    const guest = await ctx.db.get(guestId);
    if (!guest?.isAnonymous) return { moved: 0 };

    const items = await ctx.db
      .query("cartItems")
      .withIndex("by_user", (q) => q.eq("userId", guestId))
      .collect();

    let moved = 0;
    for (const item of items) {
      const mine = await ctx.db
        .query("cartItems")
        .withIndex("by_user_product", (q) =>
          q.eq("userId", userId).eq("productId", item.productId),
        )
        .unique();
      if (mine) {
        await ctx.db.patch(mine._id, {
          quantity: Math.min(mine.quantity + item.quantity, 20),
        });
        await ctx.db.delete(item._id);
      } else {
        await ctx.db.patch(item._id, { userId });
      }
      moved += 1;
    }

    return { moved };
  },
});
