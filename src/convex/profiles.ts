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

/**
 * Guarda el punto exacto de entrega del comprador (mapa o GPS). El envío se
 * cotiza siempre contra este punto, así que se puede actualizar en cualquier
 * momento.
 */
export const saveLocation = mutation({
  args: {
    lat: v.number(),
    lng: v.number(),
    address: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    if (
      !Number.isFinite(args.lat) ||
      !Number.isFinite(args.lng) ||
      Math.abs(args.lat) > 90 ||
      Math.abs(args.lng) > 180
    ) {
      throw new Error("Ese punto del mapa no es válido");
    }

    const patch: Partial<Doc<"users">> = {
      location: {
        lat: Math.round(args.lat * 1e5) / 1e5,
        lng: Math.round(args.lng * 1e5) / 1e5,
      },
    };
    if (args.address !== undefined) patch.address = args.address.trim();

    await ctx.db.patch(userId, patch);
    return null;
  },
});

// URL firmada para subir la foto desde el teléfono o la computadora.
export const generatePhotoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    return await ctx.storage.generateUploadUrl();
  },
});

export const setPhoto = mutation({
  args: {
    kind: v.union(v.literal("avatar"), v.literal("cover")),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { kind, storageId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");

    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("No pudimos guardar la imagen");

    await ctx.db.patch(
      userId,
      kind === "avatar" ? { image: url } : { coverImage: url },
    );
    return url;
  },
});
