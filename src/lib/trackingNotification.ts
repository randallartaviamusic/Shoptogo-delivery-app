import { ORDER_STATUS } from "@/lib/format";
import type { OrderStatus } from "@/convex/schema";

/**
 * Barra de seguimiento del pedido en la barra de notificaciones.
 *
 * Usa la misma etiqueta (`tracking-<pedido>`) que los avisos del servidor:
 * cada actualización reemplaza a la anterior en vez de apilarse, así la
 * notificación funciona como una barra de progreso persistente aunque la app
 * esté en segundo plano. Al tocarla se abre el pedido con el mapa en vivo.
 */

export function trackingSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "Notification" in window
  );
}

export function trackingTag(orderId: string) {
  return `tracking-${orderId}`;
}

export function trackingUrl(orderId: string) {
  return `/orders?order=${orderId}`;
}

export function trackingCopy(
  status: OrderStatus,
  code: string,
): { title: string; body: string } {
  const label = ORDER_STATUS[status]?.customerLabel ?? "En curso";
  return {
    title: `Pedido ${code} · ${label}`,
    body: ORDER_STATUS[status]?.hint ?? "Tu pedido sigue en curso.",
  };
}

/**
 * Muestra o refresca la barra de seguimiento. Es silenciosa (`silent: true`):
 * no suena en cada avance, sólo mantiene el progreso visible en la barra.
 * Los avisos importantes (repartidor asignado, llegada) siguen sonando desde
 * el servidor.
 */
export async function showTrackingNotification(input: {
  orderId: string;
  code: string;
  status: OrderStatus;
}): Promise<"shown" | "denied" | "unsupported"> {
  if (!trackingSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "denied";
  try {
    const registration = await navigator.serviceWorker.ready;
    const copy = trackingCopy(input.status, input.code);
    await registration.showNotification(copy.title, {
      body: copy.body,
      tag: trackingTag(input.orderId),
      requireInteraction: true,
      silent: true,
      // Opción válida del service worker aunque no esté en los tipos del DOM.
      ...({ renotify: false } as object),
      icon: "/logo.svg",
      badge: "/logo.svg",
      data: { url: trackingUrl(input.orderId), at: Date.now() },
    });
    return "shown";
  } catch {
    return "unsupported";
  }
}

/** Quita la barra de seguimiento de la bandeja (entregado o cancelado). */
export async function hideTrackingNotification(orderId: string) {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const open = await registration?.getNotifications({
      tag: trackingTag(orderId),
    });
    for (const notification of open ?? []) notification.close();
  } catch {
    // Si no hay service worker, no hay nada que cerrar.
  }
}

export function trackingPinKey(orderId: string) {
  return `stg:tracking-pin:${orderId}`;
}

export function isTrackingPinned(orderId: string) {
  try {
    return window.localStorage.getItem(trackingPinKey(orderId)) === "1";
  } catch {
    return false;
  }
}

export function setTrackingPinned(orderId: string, pinned: boolean) {
  try {
    if (pinned) window.localStorage.setItem(trackingPinKey(orderId), "1");
    else window.localStorage.removeItem(trackingPinKey(orderId));
  } catch {
    // Sin almacenamiento la fijación dura hasta cerrar la página.
  }
}
