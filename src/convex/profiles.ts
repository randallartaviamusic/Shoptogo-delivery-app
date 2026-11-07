import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export const createAccount = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
    passwordConfirm: v.string(),
    role: v.union(
      v.literal("buyer"),
      v.literal("business"),
      v.literal("courier"),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    if (args.password !== args.passwordConfirm) {
      throw new Error("Las contraseñas no coinciden");
    }
    if (args.password.length < 8) {
      throw new Error("La contraseña debe tener al menos 8 caracteres");
    }

    await ctx.db.patch(userId, {
      name: args.name.trim(),
      email: args.email.trim().toLowerCase(),
      role: args.role,
    });

    return null;
  },
});

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
