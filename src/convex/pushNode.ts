"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { createSign } from "node:crypto";
import * as webpush from "web-push";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";

/**
 * Envío de notificaciones al teléfono.
 *
 * Hay dos caminos en paralelo:
 *   - Web Push (VAPID) para la app en el navegador.
 *   - Firebase Cloud Messaging para el APK de Android, que es el único que
 *     puede mostrar la notificación en la barra con la app cerrada.
 *
 * Las llaves VAPID viven en variables de entorno si están configuradas; si no,
 * se generan una vez y se guardan en `meta`. FCM necesita una cuenta de
 * servicio de Firebase en `FIREBASE_SERVICE_ACCOUNT_JSON`.
 */

const SUBJECT =
  process.env.VAPID_SUBJECT?.trim() || "mailto:soporte@shoptogo.cr";
const FCM_CHANNEL_ID = "shop_to_go_orders";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const FCM_TOKEN_URL = "https://oauth2.googleapis.com/token";

type VapidPair = { publicKey: string; privateKey: string };
type FcmAccount = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};
type AlertArgs = {
  userId: Id<"users">;
  title: string;
  body: string;
  url?: string;
  tag?: string;
};
type DeliverySummary = { sent: number; dropped: number; failed: number };
type AlertResult = DeliverySummary & {
  error?: string;
  native: DeliverySummary & { configured: boolean; error?: string };
};

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

/** Cuenta de servicio de Firebase, desde el JSON completo o variables sueltas. */
function fcmAccount(): FcmAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key.replace(/\\n/g, "\n"),
        };
      }
    } catch {
      // Si el JSON está mal pegado, probamos con las variables sueltas.
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (projectId && clientEmail && privateKey) {
    return {
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n"),
    };
  }
  return null;
}

function base64url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

let cachedFcm:
  | { accessToken: string; expiresAt: number; projectId: string }
  | null = null;

/** Token OAuth de Google para la API HTTP v1 de FCM. */
async function fcmAccessToken(account: FcmAccount) {
  if (
    cachedFcm &&
    cachedFcm.projectId === account.projectId &&
    cachedFcm.expiresAt > Date.now() + 60_000
  ) {
    return cachedFcm.accessToken;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: account.clientEmail,
      scope: FCM_SCOPE,
      aud: FCM_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = base64url(
    createSign("RSA-SHA256")
      .update(`${header}.${claims}`)
      .sign(account.privateKey),
  );

  const response = await fetch(FCM_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`FCM OAuth ${response.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) throw new Error("FCM no devolvió un token de acceso");

  cachedFcm = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    projectId: account.projectId,
  };
  return data.access_token;
}

async function sendFcmMessage(
  account: FcmAccount,
  deviceToken: string,
  args: AlertArgs,
) {
  const payload = {
    message: {
      token: deviceToken,
      notification: { title: args.title, body: args.body },
      data: {
        url: args.url ?? "/",
        tag: args.tag ?? "shop-to-go",
      },
      android: {
        priority: "HIGH",
        notification: {
          channel_id: FCM_CHANNEL_ID,
          sound: "default",
          default_vibrate_timings: true,
          notification_priority: "PRIORITY_HIGH",
          visibility: "PUBLIC",
          tag: args.tag ?? "shop-to-go",
        },
      },
    },
  };

  const post = async (accessToken: string) =>
    await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
        account.projectId,
      )}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

  let accessToken = await fcmAccessToken(account);
  let response = await post(accessToken);

  // El token OAuth puede vencer entre dos avisos. Se renueva una vez.
  if (response.status === 401) {
    cachedFcm = null;
    accessToken = await fcmAccessToken(account);
    response = await post(accessToken);
  }
  return response;
}

/** Envía a todos los equipos Web Push de la cuenta. */
async function sendWebAlert(
  ctx: ActionCtx,
  args: AlertArgs,
  subscriptions: Doc<"pushSubscriptions">[],
): Promise<DeliverySummary> {
  if (subscriptions.length === 0) {
    return { sent: 0, dropped: 0, failed: 0 };
  }

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
}

/** Envía a los teléfonos Android registrados por Firebase. */
async function sendNativeAlert(
  ctx: ActionCtx,
  args: AlertArgs,
  devices: Doc<"pushDevices">[],
): Promise<DeliverySummary & { configured: boolean }> {
  if (devices.length === 0) {
    return { configured: fcmAccount() !== null, sent: 0, dropped: 0, failed: 0 };
  }

  const account = fcmAccount();
  if (!account) {
    return { configured: false, sent: 0, dropped: 0, failed: 0 };
  }

  let sent = 0;
  let dropped = 0;
  let failed = 0;

  for (const device of devices) {
    try {
      const response = await sendFcmMessage(account, device.token, args);
      if (response.ok) {
        sent += 1;
        await ctx.runMutation(internal.push.markDeviceDelivery, {
          id: device._id,
          ok: true,
        });
        continue;
      }

      const detail = await response.text();
      if (
        response.status === 404 ||
        /UNREGISTERED|not-registered|registration-token-not-registered/i.test(
          detail,
        )
      ) {
        dropped += 1;
        await ctx.runMutation(internal.push.dropDevice, { id: device._id });
        continue;
      }

      failed += 1;
      await ctx.runMutation(internal.push.markDeviceDelivery, {
        id: device._id,
        ok: false,
        error: `FCM ${response.status}: ${detail.slice(0, 200)}`,
      });
    } catch (error) {
      failed += 1;
      await ctx.runMutation(internal.push.markDeviceDelivery, {
        id: device._id,
        ok: false,
        error: error instanceof Error ? error.message : "Error de FCM",
      });
    }
  }

  return { configured: true, sent, dropped, failed };
}

/**
 * Manda el aviso a todos los equipos de la cuenta. Nunca lanza: si un
 * teléfono ya no existe se descarta esa suscripción y se sigue con los demás,
 * porque un equipo viejo no puede impedir que suene el pedido en los otros.
 */
export const sendOrderAlert = internalAction({
  args: {
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
    tag: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<AlertResult> => {
    const [subscriptions, devices]: [
      Doc<"pushSubscriptions">[],
      Doc<"pushDevices">[],
    ] = await Promise.all([
      ctx.runQuery(internal.push.subscriptionsForUser, {
        userId: args.userId,
      }),
      ctx.runQuery(internal.push.devicesForUser, {
        userId: args.userId,
      }),
    ]);

    // Web y nativo en paralelo: un navegador lento no puede retrasar el
    // aviso que tiene que sonar en el teléfono con la app cerrada.
    const [web, native] = await Promise.all([
      sendWebAlert(ctx, args, subscriptions).catch(
        (error): DeliverySummary & { error?: string } => ({
          sent: 0,
          dropped: 0,
          failed: subscriptions.length,
          error: error instanceof Error ? error.message : "Error de Web Push",
        }),
      ),
      sendNativeAlert(ctx, args, devices).catch(
        (
          error,
        ): DeliverySummary & { configured: boolean; error?: string } => ({
          configured: fcmAccount() !== null,
          sent: 0,
          dropped: 0,
          failed: devices.length,
          error: error instanceof Error ? error.message : "Error de FCM",
        }),
      ),
    ]);

    return { ...web, native };
  },
});
