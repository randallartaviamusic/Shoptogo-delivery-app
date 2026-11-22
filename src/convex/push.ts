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

/** Teléfonos de compradores con avisos activados para la difusión de la plataforma. */
export const buyerPushTargets = internalQuery({
  args: {},
  handler: async (ctx) => {
    const buyers = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "buyer"))
      .collect();
    const buyerIds = new Set(
      buyers
        .filter((user) => user.isAnonymous !== true)
        .map((user) => user._id),
    );
    const [subscriptions, devices] = await Promise.all([
      ctx.db.query("pushSubscriptions").collect(),
      ctx.db.query("pushDevices").collect(),
    ]);
    return {
      subscriptions: subscriptions.filter((subscription) =>
        buyerIds.has(subscription.userId),
      ),
      devices: devices.filter((device) => buyerIds.has(device.userId)),
    };
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

/** Dispositivos Android registrados con Firebase para esta cuenta. */
export const devicesForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pushDevices")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/**
 * Guarda el token FCM del APK. Si el mismo teléfono se usa con otra cuenta,
 * el token se reasigna para que los avisos no se crucen.
 */
export const saveDeviceToken = mutation({
  args: {
    token: v.string(),
    platform: v.literal("android"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");

    const token = args.token.trim();
    if (!token || token.length > 4096) {
      throw new Error("Firebase devolvió un token inválido");
    }

    const existing = await ctx.db
      .query("pushDevices")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        userId,
        platform: args.platform,
        failures: 0,
        lastError: undefined,
      });
      return existing._id;
    }

    const mine = await ctx.db
      .query("pushDevices")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (mine.length >= MAX_PER_USER) {
      const oldest = mine.sort((a, b) => a.createdAt - b.createdAt)[0];
      await ctx.db.delete(oldest._id);
    }

    return await ctx.db.insert("pushDevices", {
      userId,
      token,
      platform: args.platform,
      createdAt: Date.now(),
    });
  },
});

/** Quita el token de este teléfono al cerrar sesión o reinstalar. */
export const removeDeviceToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const existing = await ctx.db
      .query("pushDevices")
      .withIndex("by_token", (q) => q.eq("token", args.token.trim()))
      .first();
    if (existing && existing.userId === userId) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const markDeviceDelivery = internalMutation({
  args: {
    id: v.id("pushDevices"),
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

/** Firebase avisó que el token ya no existe: se descarta. */
export const dropDevice = internalMutation({
  args: { id: v.id("pushDevices") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (row) await ctx.db.delete(args.id);
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

