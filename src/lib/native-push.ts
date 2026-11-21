import { Capacitor } from "@capacitor/core";
import {
  PushNotifications,
  type PushNotificationSchema,
} from "@capacitor/push-notifications";
import { api } from "@/convex/_generated/api";
import type { ConvexReactClient } from "convex/react";

/**
 * Avisos nativos del APK con Firebase Cloud Messaging.
 *
 * El WebView de Android no entrega Web Push cuando la app está cerrada; FCM sí.
 * El token se guarda en Convex y el backend lo usa para los mismos eventos que
 * ya se mandan por WhatsApp: pedido nuevo, entrega disponible y llegada.
 */

export type NativePushState =
  | "subscribed"
  | "idle"
  | "denied"
  | "unsupported";

let started = false;
let lastToken: string | null = null;

export function isNativePushPlatform() {
  return Capacitor.getPlatform() === "android";
}

export async function currentNativePushState(): Promise<NativePushState> {
  if (!isNativePushPlatform()) return "unsupported";
  try {
    const permission = await PushNotifications.checkPermissions();
    if (permission.receive === "denied") return "denied";
    return permission.receive === "granted" ? "subscribed" : "idle";
  } catch {
    return "idle";
  }
}

async function saveToken(convex: ConvexReactClient, token: string) {
  lastToken = token;
  try {
    await convex.mutation(api.push.saveDeviceToken, {
      token,
      platform: "android",
    });
  } catch {
    // Si todavía no hay sesión, el registro de la cuenta lo vuelve a intentar.
  }
}

function notifyForeground(notification: PushNotificationSchema) {
  const data = notification.data ?? {};
  window.dispatchEvent(
    new CustomEvent("shop-to-go:native-push", {
      detail: {
        title: notification.title,
        body: notification.body,
        url: typeof data.url === "string" ? data.url : undefined,
      },
    }),
  );
}

async function start(
  convex: ConvexReactClient,
  requestPermission: boolean,
): Promise<NativePushState> {
  if (!isNativePushPlatform()) return "unsupported";

  let permission = (await PushNotifications.checkPermissions()).receive;
  if (permission !== "granted" && requestPermission) {
    permission = (await PushNotifications.requestPermissions()).receive;
  }
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "idle";

  if (started) {
    if (lastToken) {
      await saveToken(convex, lastToken);
    } else {
      await PushNotifications.register();
    }
    return "subscribed";
  }

  await PushNotifications.removeAllListeners();

  await PushNotifications.addListener("registration", (token) => {
    void saveToken(convex, token.value);
  });

  await PushNotifications.addListener("registrationError", () => {
    // Falta google-services.json o Firebase todavía no está configurado: la
    // app sigue funcionando y WhatsApp continúa avisando.
  });

  await PushNotifications.addListener(
    "pushNotificationReceived",
    (notification) => {
      // Con la app abierta Android no muestra solo la notificación: suena la
      // campanita y el aviso aparece dentro de la app.
      notifyForeground(notification);
    },
  );

  await PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (action) => {
      const url = action.notification.data?.url;
      if (typeof url === "string" && url.startsWith("/")) {
        window.location.assign(url);
      }
    },
  );

  await PushNotifications.register();
  started = true;
  return "subscribed";
}

/** Se llama al entrar a la app: registra sin volver a pedir permiso. */
export async function setupNativePush(convex: ConvexReactClient) {
  return await start(convex, false);
}

/** Botón de la configuración: pide permiso y registra este teléfono. */
export async function enableNativePush(convex: ConvexReactClient) {
  return await start(convex, true);
}

/** Al cerrar sesión, este teléfono deja de recibir avisos de esa cuenta. */
export async function removeNativePushToken(convex: ConvexReactClient) {
  if (!isNativePushPlatform() || !lastToken) return;
  const token = lastToken;
  lastToken = null;
  try {
    await convex.mutation(api.push.removeDeviceToken, { token });
  } catch {
    // Si la sesión ya se cerró, el próximo inicio la vuelve a registrar.
  }
}
