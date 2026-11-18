import { money } from "./format";

/**
 * Reglas puras de los avisos externos. Nada de red ni base de datos: acá se
 * decide a qué número se escribe y qué texto exacto recibe cada persona.
 *
 * Los mensajes son cortos y con los datos que sirven para actuar (cuánto se
 * cobra, cuánto se gana, cuánto falta). WhatsApp cobra por mensaje, así que no
 * se repite información que ya está en el enlace.
 */

/**
 * Costa Rica: el número se guarda como dígitos con código de país, que es el
 * formato que pide la API de WhatsApp (50688881234).
 *
 * Acepta 8888-1234, 88881234, +506 8888 1234 y 50688881234. Devuelve null si
 * no parece un número tico válido: preferimos no avisar antes que escribirle a
 * un desconocido.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 8) return `506${digits}`;
  if (digits.length === 11 && digits.startsWith("506")) return digits;
  return null;
}

/** Número listo para mostrar en pantalla: +506 8888-1234. */
export function displayPhone(raw: string | null | undefined): string | null {
  const normalized = normalizePhone(raw);
  if (!normalized) return null;
  const local = normalized.slice(3);
  return `+506 ${local.slice(0, 4)}-${local.slice(4)}`;
}

/** Enlace de aceptación en un toque para una oferta de entrega. */
export function offerLink(appUrl: string, token: string): string {
  const base = appUrl.replace(/\/+$/, "");
  return `${base}/courier?offer=${encodeURIComponent(token)}`;
}

/** Enlace al detalle de un pedido. */
export function orderLink(appUrl: string, orderId: string): string {
  const base = appUrl.replace(/\/+$/, "");
  return `${base}/orders/${orderId}`;
}

export type NotifyDraft = { title: string; body: string };

export type NotifyInput =
  | {
      kind: "new_order";
      tripNumber: string;
      itemCount: number;
      /** Lo que el local recibe en efectivo por los productos. */
      businessAmount: number;
      /** A dónde va el pedido, en una línea. */
      dropAddress: string;
    }
  | {
      kind: "order_ready";
      orderNumber: string;
      pickups: number;
      /** Kilómetros reales, si ya se conoce la ruta. */
      km?: number | null;
      /** Lo que gana el repartidor por la entrega. */
      payout: number;
      /** Minutos que la oferta queda abierta. */
      expiresInMin: number;
    }
  | {
      kind: "courier_assigned";
      orderNumber: string;
      courierName: string;
      courierPhone: string | null;
      etaMin?: number | null;
    }
  | {
      kind: "order_update";
      orderNumber: string;
      statusLabel: string;
    };

export function buildNotifyDraft(input: NotifyInput): NotifyDraft {
  switch (input.kind) {
    case "new_order": {
      const items =
        input.itemCount === 1 ? "1 producto" : `${input.itemCount} productos`;
      return {
        title: "Pedido nuevo",
        body: [
          `Pedido ${input.tripNumber}: ${items}.`,
          `Cobrás ${money(input.businessAmount)} en efectivo.`,
          `Entrega en ${input.dropAddress}.`,
          "Confirmalo en Shop To Go para arrancar la cocina.",
        ].join("\n"),
      };
    }
    case "order_ready": {
      const stops =
        input.pickups > 1
          ? `${input.pickups} retiros en un solo viaje`
          : "1 retiro";
      const distance =
        typeof input.km === "number" && input.km > 0
          ? `Ruta de ${input.km.toFixed(1)} km.`
          : null;
      return {
        title: "Entrega disponible",
        body: [
          `Pedido ${input.orderNumber} listo: ${stops}.`,
          distance,
          `Ganás ${money(input.payout)} por la entrega.`,
          `Tenés ${input.expiresInMin} min para aceptar desde el enlace.`,
        ]
          .filter(Boolean)
          .join("\n"),
      };
    }
    case "courier_assigned": {
      const phone = displayPhone(input.courierPhone);
      const eta =
        typeof input.etaMin === "number" && input.etaMin > 0
          ? `Llega en ~${Math.round(input.etaMin)} min.`
          : null;
      return {
        title: "Repartidor asignado",
        body: [
          `Pedido ${input.orderNumber}: lo lleva ${input.courierName}.`,
          phone ? `Contacto: ${phone}.` : null,
          eta,
          "Seguí la entrega en Shop To Go.",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    }
    case "order_update":
      return {
        title: "Actualización del pedido",
        body: `Pedido ${input.orderNumber}: ${input.statusLabel}.`,
      };
  }
}
