import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";

/**
 * Avisos Web Push para el teléfono del negocio.
 *
 * El navegador entrega un endpoint propio de su servicio de notificaciones; acá
 * sólo se guarda junto a las llaves del dispositivo. El envío real vive en
 * `pushNode.ts` porque la firma VAPID necesita el runtime de Node.
 */

/** Tope de equipos por cuenta: un local no debería acumular navegadores. */
const MAX_PER_USER = 10;

/** Llave VAPID guardada en la base cuando no vienen por variables de entorno. */
export const readVapid = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", "push_vapid"))
      .first();
    if (!row) return null;
    try {
      const parsed = JSON.parse(row.value) as {
        publicKey?: string;
        privateKey?: string;
      };
      if (!parsed.publicKey || !parsed.privateKey) return null;
      return { publicKey: parsed.publicKey, privateKey: parsed.privateKey };
    } catch {
      return null;
    }
  },
});

/**
 * Guarda la pareja sólo si todavía no existe y devuelve la que quedó vigente:
 * si dos celulares activan avisos al mismo tiempo, ambos terminan con la
 * misma llave pública.
 */
export const writeVapid = internalMutation({
  args: { publicKey: v.string(), privateKey: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", "push_vapid"))
      .first();
    if (existing) {
      try {
        const parsed = JSON.parse(existing.value) as {
          publicKey?: string;
          privateKey?: string;
        };
        if (parsed.publicKey && parsed.privateKey) {
          return { publicKey: parsed.publicKey, privateKey: parsed.privateKey };
        }
      } catch {
        /* fila dañada: se reemplaza abajo */
      }
      await ctx.db.patch(existing._id, { value: JSON.stringify(args) });
      return args;
    }
    await ctx.db.insert("meta", {
      key: "push_vapid",
      value: JSON.stringify(args),
    });
    return args;
  },
});

/** Dispositivos que deben recibir el aviso de esta cuenta. */
export const subscriptionsForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const markDelivery = internalMutation({
  args: {
    id: v.id("pushSubscriptions"),
    ok: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return;
    await ctx.db.patch(args.id, {
      lastSuccessAt: args.ok ? Date.now() : row.lastSuccessAt,
      failures: args.ok ? 0 : (row.failures ?? 0) + 1,
      lastError: args.ok ? undefined : args.error?.slice(0, 300),
    });
  },
});

/** El servicio de push avisó que el endpoint ya no existe. */
export const dropSubscription = internalMutation({
  args: { id: v.id("pushSubscriptions") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (row) await ctx.db.delete(args.id);
  },
});

/**
 * Guarda el dispositivo actual. Si el mismo navegador ya estaba suscrito se
 * actualiza y se reasigna a la cuenta que acaba de activar los avisos.
 */
export const saveSubscription = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");

    const endpoint = args.endpoint.trim();
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000) {
      throw new Error("El servicio de notificaciones devolvió un endpoint inválido");
    }
    if (!args.p256dh || !args.auth) {
      throw new Error("Faltan las llaves del dispositivo");
    }

    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        userId,
        p256dh: args.p256dh,
        auth: args.auth,
        userAgent: args.userAgent,
        createdAt: existing.userId === userId ? existing.createdAt : Date.now(),
        failures: 0,
        lastError: undefined,
      });
      return existing._id;
    }

    const mine = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (mine.length >= MAX_PER_USER) {
      const oldest = mine.sort((a, b) => a.createdAt - b.createdAt)[0];
      await ctx.db.delete(oldest._id);
    }

    return await ctx.db.insert("pushSubscriptions", {
      userId,
      endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      userAgent: args.userAgent,
      createdAt: Date.now(),
    });
  },
});

/** Quita el dispositivo actual, por ejemplo al desactivar los avisos. */
export const removeSubscription = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();
    if (existing && existing.userId === userId) {
      await ctx.db.delete(existing._id);
    }
  },
});

