"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import * as webpush from "web-push";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";

/**
 * Envío de notificaciones al teléfono (Web Push con VAPID).
 *
 * Este archivo corre en Node porque la firma del protocolo usa criptografía del
 * sistema. Las llaves VAPID viven en variables de entorno si están configuradas;
 * si no, se generan una vez y se guardan en `meta` para que los avisos
 * funcionen sin configuración extra.
 */

const SUBJECT =
  process.env.VAPID_SUBJECT?.trim() || "mailto:soporte@shoptogo.cr";

type VapidPair = { publicKey: string; privateKey: string };

async function loadVapid(ctx: ActionCtx): Promise<VapidPair> {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (publicKey && privateKey) return { publicKey, privateKey };

  const stored = await ctx.runQuery(internal.push.readVapid, {});
  if (stored) return stored;

  // La mutación devuelve la pareja vigente, no necesariamente la recién
  // generada: dos activaciones simultáneas no pueden quedar con llaves
  // distintas.
  return await ctx.runMutation(
    internal.push.writeVapid,
    webpush.generateVAPIDKeys(),
  );
}

/** Llave pública que el navegador necesita para suscribirse. */
export const publicKey = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    return (await loadVapid(ctx)).publicKey;
  },
});

/**
 * Manda el aviso a todos los equipos del negocio. Nunca lanza: si un teléfono
 * ya no existe se descarta esa suscripción y se sigue con los demás, porque un
 * navegador viejo no puede impedir que suene el pedido en los otros.
 */
export const sendOrderAlert = internalAction({
  args: {
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
    tag: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const subscriptions = await ctx.runQuery(
      internal.push.subscriptionsForUser,
      { userId: args.userId },
    );
    if (subscriptions.length === 0) return { sent: 0, dropped: 0, failed: 0 };

    const vapid = await loadVapid(ctx);
    const payload = JSON.stringify({
      title: args.title,
      body: args.body,
      url: args.url ?? "/",
      tag: args.tag ?? "shop-to-go",
    });

    let sent = 0;
    let dropped = 0;
    let failed = 0;

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
            {
              vapidDetails: {
                subject: SUBJECT,
                publicKey: vapid.publicKey,
                privateKey: vapid.privateKey,
              },
              // Alta prioridad: FCM puede retrasar los avisos normales con la
              // pantalla apagada, y acá el pedido tiene que sonar ahora.
              urgency: "high",
              TTL: 600,
            },
          );
          sent += 1;
          await ctx.runMutation(internal.push.markDelivery, {
            id: subscription._id,
            ok: true,
          });
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            dropped += 1;
            await ctx.runMutation(internal.push.dropSubscription, {
              id: subscription._id,
            });
            return;
          }
          failed += 1;
          await ctx.runMutation(internal.push.markDelivery, {
            id: subscription._id,
            ok: false,
            error: error instanceof Error ? error.message : "Error de envío",
          });
        }
      }),
    );

    return { sent, dropped, failed };
  },
});
