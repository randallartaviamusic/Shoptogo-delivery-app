import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  isValidCostaRicaPhone,
  normalizeCostaRicaPhone,
} from "../lib/trust";

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    // Opt-in explícito para recibir avisos del pedido por WhatsApp.
    notifyWhatsapp: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Esa cuenta ya no existe");

    const patch: Partial<Doc<"users">> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length < 2) throw new Error("Escribí tu nombre completo");
      patch.name = name;
    }
    let phoneChanged = false;
    if (args.phone !== undefined) {
      const phone = args.phone.trim();
      const needsPhone = user.role === "business" || user.role === "courier";
      if (!phone && needsPhone) {
        throw new Error("El teléfono es obligatorio para operar en la plataforma");
      }
      if (phone && !isValidCostaRicaPhone(phone)) {
        throw new Error("Escribí un teléfono de Costa Rica de 8 dígitos");
      }
      patch.phone = phone ? normalizeCostaRicaPhone(phone) : "";
      phoneChanged = patch.phone !== (user.phone ?? "");
    }
    if (args.address !== undefined) patch.address = args.address.trim();
    if (args.city !== undefined) patch.city = args.city.trim();
    if (args.notifyWhatsapp !== undefined) {
      // Sin teléfono no hay a dónde escribir: pedirlo antes de aceptar.
      if (args.notifyWhatsapp && !(patch.phone ?? user.phone ?? "").trim()) {
        throw new Error(
          "Guardá primero tu número de WhatsApp para recibir los avisos",
        );
      }
      patch.notifyWhatsapp = args.notifyWhatsapp;
    }

    // Cambiar el teléfono de una cuenta verificada obliga a revisarlo de nuevo:
    // es el dato con el que se contacta a la persona en una entrega.
    if (
      phoneChanged &&
      (user.role === "business" || user.role === "courier") &&
      user.verificationStatus === "verified"
    ) {
      patch.verificationStatus = "pending";
      patch.verifiedAt = undefined;
      patch.verificationNote = "Actualizaste tu teléfono: queda pendiente de revisión.";
      const business = await ctx.db
        .query("businesses")
        .withIndex("by_owner", (q) => q.eq("ownerId", userId))
        .first();
      if (business?.verifiedAt) {
        await ctx.db.patch(business._id, { verifiedAt: undefined });
      }
    }

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
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Esa cuenta ya no existe");
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
    const address = args.address?.trim();
    const label = args.label?.trim();
    if (address !== undefined) patch.address = address;

    if (label !== undefined && address !== undefined) {
      if (label.length < 1 || label.length > 40) {
        throw new Error("La etiqueta debe tener entre 1 y 40 caracteres");
      }
      const savedAddresses = user.savedAddresses ?? [];
      const existingIndex = savedAddresses.findIndex(
        (entry) => entry.address.toLowerCase() === address.toLowerCase(),
      );
      const entry = {
        id: existingIndex >= 0 ? savedAddresses[existingIndex].id : crypto.randomUUID(),
        label,
        address,
        location: {
          lat: Math.round(args.lat * 1e5) / 1e5,
          lng: Math.round(args.lng * 1e5) / 1e5,
        },
        createdAt:
          existingIndex >= 0
            ? savedAddresses[existingIndex].createdAt
            : Date.now(),
      };
      const next = [...savedAddresses];
      if (existingIndex >= 0) next[existingIndex] = entry;
      else next.unshift(entry);
      patch.savedAddresses = next.slice(0, 8);
    }

    await ctx.db.patch(userId, patch);
    return null;
  },
});

/** Direcciones favoritas y punto de entrega actual del comprador. */
export const savedAddresses = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { addresses: [], current: null };
    const user = await ctx.db.get(userId);
    return {
      addresses: user?.savedAddresses ?? [],
      current: user?.location ?? null,
    };
  },
});

/** Quita una dirección favorita sin alterar los pedidos anteriores. */
export const removeSavedAddress = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Esa cuenta ya no existe");
    await ctx.db.patch(userId, {
      savedAddresses: (user.savedAddresses ?? []).filter(
        (address) => address.id !== args.id,
      ),
    });
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
