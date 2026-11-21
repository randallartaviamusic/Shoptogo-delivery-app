import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { NotifyDraft, NotifyInput } from "../lib/notify";
import {
  PLATFORM_APP_URL,
  PLATFORM_WHATSAPP_NUMBER,
  buildNotifyDraft,
  displayPhone,
  normalizePhone,
} from "../lib/notify";

/**
 * Avisos fuera de la app.
 *
 * Cada evento del pedido deja una fila en `notifications` con el texto ya
 * armado; una acción programada la envía. Así el pedido nunca se traba porque
 * un proveedor esté lento o sin configurar: el peor caso es un aviso en
 * `skipped` con el motivo escrito.
 *
 * Transportes soportados, en este orden:
 *   1. WhatsApp Cloud API (WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID).
 *   2. Webhook propio (NOTIFY_WEBHOOK_URL) para conectar un proveedor de SMS.
 * Sin ninguno de los dos los avisos quedan como `skipped`: no simulamos envíos.
 */

/** URL pública de la app, necesaria para los enlaces de un toque. */
const APP_URL_ENV = ["PUBLIC_APP_URL", "APP_URL"] as const;

export function appUrl() {
  for (const name of APP_URL_ENV) {
    const value = process.env[name]?.trim();
    if (value) return value.replace(/\/+$/, "");
  }
  // SITE_URL es el endpoint de Convex (....convex.site), no la app: no sirve
  // para los enlaces que abre una persona. Usamos el dominio publicado.
  return PLATFORM_APP_URL;
}

const GRAPH_VERSION = "v21.0";

type QueueInput = {
  kind: Doc<"notifications">["kind"];
  order: Doc<"orders">;
  tripKey: string;
  recipientId: Id<"users">;
  recipientRole: Doc<"notifications">["recipientRole"];
  /** Número ya normalizado (506XXXXXXXX) o null si no hay. */
  phone?: string | null;
  /** Ruta interna del enlace, sin dominio. */
  link?: string;
  draft: NotifyDraft;
};

/**
 * Encola un aviso. Se llama desde las mutaciones del pedido con los datos ya
 * calculados: acá no hay red ni decisiones de negocio, sólo el registro.
 */
export async function queueNotification(ctx: MutationCtx, input: QueueInput) {
  const phone = input.phone?.trim() || null;
  const id = await ctx.db.insert("notifications", {
    kind: input.kind,
    orderId: input.order._id,
    tripKey: input.tripKey,
    recipientId: input.recipientId,
    recipientRole: input.recipientRole,
    phone: phone ?? undefined,
    title: input.draft.title,
    body: input.draft.body,
    link: input.link,
    channel: phone ? "whatsapp" : "webhook",
    status: "queued",
    attempts: 0,
    createdAt: Date.now(),
  });
  // Enviar ya mismo: el cron es la red de seguridad, no la vía principal.
  // Si el proveedor no está configurado, el despacho lo marca como omitido.
  await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
    limit: 20,
  });
  return id;
}

/** Igual que `queueNotification`, pero arma el texto desde los datos crudos. */
export async function queueNotice(
  ctx: MutationCtx,
  input: Omit<QueueInput, "draft" | "kind"> & { draft: NotifyInput },
) {
  return await queueNotification(ctx, {
    ...input,
    kind: input.draft.kind,
    draft: buildNotifyDraft(input.draft),
  });
}

/** Lote de avisos pendientes, del más viejo al más nuevo. */
export const pendingBatch = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("notifications")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .order("asc")
      .take(Math.max(1, Math.min(50, args.limit)));
  },
});

/** Cierra un aviso con su resultado real de envío. */
export const markResult = internalMutation({
  args: {
    id: v.id("notifications"),
    status: v.union(
      v.literal("sent"),
      v.literal("skipped"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.id);
    if (!notification) return;
    await ctx.db.patch(args.id, {
      status: args.status,
      attempts: notification.attempts + 1,
      lastError: args.error,
      sentAt: args.status === "sent" ? Date.now() : undefined,
    });
  },
});

/**
 * Limpieza: la bandeja es un registro operativo, no un archivo histórico. Se
 * conservan 30 días para poder revisar un reclamo y después se descarta.
 */
export const prune = internalMutation({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const cutoff =
      Date.now() - Math.max(1, args.days ?? 30) * 24 * 60 * 60 * 1000;
    let deleted = 0;
    for (const status of ["sent", "skipped", "failed"] as const) {
      const old = await ctx.db
        .query("notifications")
        .withIndex("by_status", (q) =>
          q.eq("status", status).lt("createdAt", cutoff),
        )
        .take(200);
      for (const row of old) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    }
    return { deleted };
  },
});

/**
 * Estado de los canales externos, sin exponer secretos: la UI del negocio
 * muestra si el WhatsApp automático ya está conectado.
 */
export const channelStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const senderNumber =
      normalizePhone(process.env.WHATSAPP_SENDER_NUMBER) ??
      PLATFORM_WHATSAPP_NUMBER;
    return {
      whatsappReady: Boolean(
        process.env.WHATSAPP_TOKEN?.trim() &&
          process.env.WHATSAPP_PHONE_NUMBER_ID?.trim(),
      ),
      // La plantilla no es obligatoria para probar dentro de la ventana de 24 h,
      // pero sí para escribirle a alguien que nunca inició la conversación.
      whatsappTemplateReady: Boolean(
        process.env.WHATSAPP_TEMPLATE_NAME?.trim(),
      ),
      senderNumber,
      senderDisplay: displayPhone(senderNumber),
      webhookReady: Boolean(process.env.NOTIFY_WEBHOOK_URL?.trim()),
    };
  },
});

/**
 * Envía los avisos en cola. Se ejecuta por cron y también puede dispararse a
 * mano desde el panel de administración.
 */
export const dispatch = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const batch = await ctx.runQuery(internal.notifications.pendingBatch, {
      limit: args.limit ?? 20,
    });
    if (batch.length === 0) return { sent: 0, skipped: 0, failed: 0 };

    const token = process.env.WHATSAPP_TOKEN?.trim();
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    const template = process.env.WHATSAPP_TEMPLATE_NAME?.trim();
    const webhook = process.env.NOTIFY_WEBHOOK_URL?.trim();
    const base = appUrl();
    // El enlace es opcional: el pedido se avisa igual aunque la URL pública no
    // esté configurada todavía.
    const whatsappReady = Boolean(token && phoneId);

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const notification of batch) {
      const link = notification.link && base ? `${base}${notification.link}` : null;
      const text = link
        ? `${notification.title}\n${notification.body}\n${link}`
        : `${notification.title}\n${notification.body}`;

      // Sin proveedor configurado el aviso no se envía, pero queda constancia.
      if (!whatsappReady && !webhook) {
        await ctx.runMutation(internal.notifications.markResult, {
          id: notification._id,
          status: "skipped",
          error:
            "Falta configurar WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID, o NOTIFY_WEBHOOK_URL",
        });
        skipped++;
        continue;
      }

      try {
        if (notification.phone && whatsappReady) {
          await sendWhatsapp({
            token: token!,
            phoneId: phoneId!,
            to: notification.phone,
            text,
            template,
          });
          await ctx.runMutation(internal.notifications.markResult, {
            id: notification._id,
            status: "sent",
          });
          sent++;
          continue;
        }

        if (webhook) {
          await sendWebhook(webhook, {
            kind: notification.kind,
            title: notification.title,
            body: notification.body,
            to: notification.phone ?? null,
            link,
            orderId: notification.orderId,
          });
          await ctx.runMutation(internal.notifications.markResult, {
            id: notification._id,
            status: "sent",
          });
          sent++;
          continue;
        }

        // Hay WhatsApp configurado pero el destinatario no dejó un número.
        await ctx.runMutation(internal.notifications.markResult, {
          id: notification._id,
          status: "skipped",
          error: "El destinatario no tiene un WhatsApp válido",
        });
        skipped++;
      } catch (error) {
        failed++;
        await ctx.runMutation(internal.notifications.markResult, {
          id: notification._id,
          status: "failed",
          error: error instanceof Error ? error.message.slice(0, 300) : "Error de envío",
        });
      }
    }

    return { sent, skipped, failed };
  },
});

export async function sendWhatsapp(input: {
  token: string;
  phoneId: string;
  to: string;
  text: string;
  template?: string;
}) {
  // El remitente lo define WHATSAPP_PHONE_NUMBER_ID: debe ser el número
  // 84923074 registrado en Meta. WHATSAPP_SENDER_NUMBER es sólo para mostrarlo
  // en la app; la API no acepta un "from" por mensaje.
  // Meta exige plantilla aprobada para escribir fuera de la ventana de 24 h.
  // Con WHATSAPP_TEMPLATE_NAME configurada mandamos la plantilla con el texto
  // como único parámetro; sin ella, mensaje de texto (sólo válido dentro de la
  // ventana, útil para pruebas).
  const payload = input.template
    ? {
        messaging_product: "whatsapp",
        to: input.to,
        type: "template",
        template: {
          name: input.template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? "es" },
          components: [
            {
              type: "body",
              parameters: [
                {
                  type: "text",
                  // Meta rechaza saltos de línea dentro de un parámetro de
                  // plantilla: el texto va en una sola línea.
                  text: input.text.replace(/\s*\n+\s*/g, " · ").slice(0, 1000),
                },
              ],
            },
          ],
        },
      }
    : {
        messaging_product: "whatsapp",
        to: input.to,
        type: "text",
        text: { preview_url: true, body: input.text },
      };

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${input.phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`WhatsApp ${response.status}: ${detail.slice(0, 200)}`);
  }
}

async function sendWebhook(
  url: string,
  body: {
    kind: string;
    title: string;
    body: string;
    to: string | null;
    link: string | null;
    orderId: string;
  },
) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Webhook ${response.status}: ${detail.slice(0, 200)}`);
  }
}
