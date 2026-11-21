/*
 * Shop To Go — service worker de avisos de pedidos.
 *
 * No cachea la app: sólo recibe los push del servidor y muestra la
 * notificación del sistema. Así funciona igual con la app cerrada y no pelea
 * con el HMR de desarrollo.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Shop To Go";
  const body = data.body || "Tenés un pedido nuevo para confirmar.";
  const url = data.url || "/business?tab=orders";

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body,
        // El logo del local se ve en la barra y en la pantalla bloqueada.
        icon: "/logo.svg",
        badge: "/logo.svg",
        // Una etiqueta por pedido: si llega el mismo aviso dos veces se
        // reemplaza en vez de llenar la bandeja.
        tag: data.tag || "shop-to-go-order",
        renotify: true,
        // El aviso se queda hasta que lo toquen: es un pedido que hay que
        // confirmar, no un mensaje informativo.
        requireInteraction: true,
        // Sonido y vibración del sistema. El sonido exacto lo elige el
        // teléfono: los navegadores no permiten un audio propio en push.
        silent: false,
        vibrate: [280, 120, 280, 120, 420, 120, 280],
        data: { url, at: Date.now() },
      });

      // Si la app está abierta (aunque sea en otra pestaña) le avisamos para
      // que reproduzca la melodía de 5 segundos mientras el teléfono está
      // desbloqueado.
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        client.postMessage({ type: "shop-to-go:order-push", title, body, url });
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/",
    self.location.origin,
  ).href;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(target);
            } catch {
              /* algunos navegadores no permiten navegar una pestaña existente */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
