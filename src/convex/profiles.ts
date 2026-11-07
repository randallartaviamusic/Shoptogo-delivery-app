import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

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
