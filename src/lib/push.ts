import { api } from "@/convex/_generated/api";
import type { ConvexReactClient } from "convex/react";

/**
 * Suscripción del teléfono a los avisos de pedidos (Web Push).
 *
 * El navegador entrega un endpoint único por equipo; la app sólo pide permiso,
 * se suscribe con la llave pública del servidor y guarda las llaves del
 * dispositivo. El envío y la firma viven en Convex.
 */

export type PushState =
  | "unsupported"
  | "ios-install"
  | "denied"
  | "subscribed"
  | "idle";

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** iPhone/iPad con Safari de escritorio disfrazado (iPadOS 13+). */
export function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** iOS sólo permite push si la app está instalada en la pantalla de inicio. */
export function isInstalledApp() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

async function serviceWorker() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  await navigator.serviceWorker.register("/sw.js");
  return await navigator.serviceWorker.ready;
}

/** Convierte la llave pública VAPID (base64url) al formato del navegador. */
function keyToBytes(key: string) {
  const padding = "=".repeat((4 - (key.length % 4)) % 4);
  const base64 = (key + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

function bytesToKey(buffer: ArrayBuffer | null) {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function currentPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (isIosDevice() && !isInstalledApp()) return "ios-install";
  if (Notification.permission === "denied") return "denied";
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    return subscription ? "subscribed" : "idle";
  } catch {
    return "idle";
  }
}

export async function enableOrderPush(
  convex: ConvexReactClient,
): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (isIosDevice() && !isInstalledApp()) return "ios-install";

  // Safari exige que el pedido de permiso salga dentro del gesto del toque:
  // por eso se pide antes de cualquier `await` de red o del service worker.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return permission === "denied" ? "denied" : "idle";
  }

  const registration = await serviceWorker();
  const publicKey = await convex.action(api.pushNode.publicKey, {});
  const applicationServerKey = keyToBytes(publicKey);
  let subscription = await registration.pushManager.getSubscription();

  // Si el teléfono se suscribió con otra llave (por ejemplo, antes de
  // configurar VAPID), esa suscripción no recibe nada: se renueva.
  if (subscription?.options.applicationServerKey) {
    const current = new Uint8Array(
      subscription.options.applicationServerKey as ArrayBuffer,
    );
    const changed =
      current.length !== applicationServerKey.length ||
      current.some((byte, index) => byte !== applicationServerKey[index]);
    if (changed) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }

  await convex.mutation(api.push.saveSubscription, {
    endpoint: subscription.endpoint,
    p256dh: bytesToKey(subscription.getKey("p256dh")),
    auth: bytesToKey(subscription.getKey("auth")),
    userAgent: navigator.userAgent.slice(0, 240),
  });
  return "subscribed";
}

export async function disableOrderPush(
  convex: ConvexReactClient,
): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return "idle";
  await convex.mutation(api.push.removeSubscription, {
    endpoint: subscription.endpoint,
  });
  await subscription.unsubscribe();
  return "idle";
}
