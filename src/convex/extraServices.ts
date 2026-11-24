import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { isAdminEmail } from "./branding";
import { DEFAULT_EXTRA_SERVICES } from "../lib/extraServices";

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Necesitás iniciar sesión");
  const user = await ctx.db.get(userId);
  if (!user || !isAdminEmail(user.email)) {
    throw new Error("Sólo el perfil administrador puede gestionar servicios");
  }
  return user;
}

function cleanDetails(details: string[]) {
  const cleaned = Array.from(
    new Set(details.map((detail) => detail.trim()).filter((d) => d.length > 0)),
  ).slice(0, 8);
  if (cleaned.length === 0) {
    throw new ConvexError("Agregá al menos un detalle del servicio");
  }
  if (cleaned.some((d) => d.length > 200)) {
    throw new ConvexError("Cada detalle puede tener hasta 200 letras");
  }
  return cleaned;
}

/**
 * Servicios activos para la pestaña Servicios de la cuenta de negocio.
 * Si el admin todavía no guardó ninguno, se muestran los iniciales.
 */
export const active = query({
  args: {},
  handler: async (ctx) => {
    const services = await ctx.db
      .query("extraServices")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    if (services.length > 0) {
      return services
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((service) => ({
          _id: service._id,
          name: service.name,
          headline: service.headline,
          price: service.price,
          details: service.details,
          icon: service.icon,
        }));
    }
    return DEFAULT_EXTRA_SERVICES.map((service, index) => ({
      _id: `default-${index}`,
      name: service.name,
      headline: service.headline,
      price: service.price,
      details: service.details,
      icon: service.icon,
    }));
  },
});

/** Todos los servicios (activos e inactivos) para el panel admin. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const services = await ctx.db.query("extraServices").collect();
    return services.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/** Carga los 4 servicios iniciales. Sólo si la tabla está vacía. */
export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.query("extraServices").collect();
    if (existing.length > 0) {
      throw new ConvexError("Ya hay servicios guardados");
    }
    const now = Date.now();
    for (const [index, service] of DEFAULT_EXTRA_SERVICES.entries()) {
      await ctx.db.insert("extraServices", {
        name: service.name,
        headline: service.headline,
        price: service.price,
        details: service.details,
        icon: service.icon,
        isActive: true,
        sortOrder: now + index,
      });
    }
    return { seeded: DEFAULT_EXTRA_SERVICES.length };
  },
});

export const createService = mutation({
  args: {
    name: v.string(),
    headline: v.string(),
    price: v.number(),
    details: v.array(v.string()),
    icon: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const name = args.name.trim();
    if (name.length < 2 || name.length > 90) {
      throw new ConvexError("El nombre necesita entre 2 y 90 letras");
    }
    const headline = args.headline.trim();
    if (headline.length < 2 || headline.length > 80) {
      throw new ConvexError("El titular necesita entre 2 y 80 letras");
    }
    if (!Number.isFinite(args.price) || args.price <= 0) {
      throw new ConvexError("El precio tiene que ser mayor a 0");
    }
    return await ctx.db.insert("extraServices", {
      name,
      headline,
      price: Math.round(args.price),
      details: cleanDetails(args.details),
      icon: args.icon.trim() || "sparkles",
      isActive: true,
      sortOrder: Date.now(),
    });
  },
});

export const updateService = mutation({
  args: {
    serviceId: v.id("extraServices"),
    name: v.optional(v.string()),
    headline: v.optional(v.string()),
    price: v.optional(v.number()),
    details: v.optional(v.array(v.string())),
    icon: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const service: Doc<"extraServices"> | null = await ctx.db.get(
      args.serviceId,
    );
    if (!service) throw new ConvexError("Ese servicio ya no existe");

    const patch: Partial<Doc<"extraServices">> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length < 2 || name.length > 90) {
        throw new ConvexError("El nombre necesita entre 2 y 90 letras");
      }
      patch.name = name;
    }
    if (args.headline !== undefined) {
      const headline = args.headline.trim();
      if (headline.length < 2 || headline.length > 80) {
        throw new ConvexError("El titular necesita entre 2 y 80 letras");
      }
      patch.headline = headline;
    }
    if (args.price !== undefined) {
      if (!Number.isFinite(args.price) || args.price <= 0) {
        throw new ConvexError("El precio tiene que ser mayor a 0");
      }
      patch.price = Math.round(args.price);
    }
    if (args.details !== undefined) patch.details = cleanDetails(args.details);
    if (args.icon !== undefined) patch.icon = args.icon.trim() || "sparkles";
    if (args.isActive !== undefined) patch.isActive = args.isActive;

    if (Object.keys(patch).length === 0) return { updated: false };
    await ctx.db.patch(service._id, patch);
    return { updated: true };
  },
});

export const removeService = mutation({
  args: { serviceId: v.id("extraServices") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const service = await ctx.db.get(args.serviceId);
    if (!service) throw new ConvexError("Ese servicio ya no existe");
    await ctx.db.delete(service._id);
    return { deleted: true };
  },
});
