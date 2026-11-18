import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Confirmación automática de pagos de suscripción.
 *
 * El proveedor de pagos (SINPE Móvil, pasarela o banco) hace POST acá cuando
 * una transferencia quedó acreditada. El cuerpo se firma con HMAC-SHA256 y el
 * secreto `PAYMENT_WEBHOOK_SECRET`; sin firma válida no se aprueba nada.
 *
 * Cuerpo esperado:
 *   { "reference": "ABC123", "amount": 8500, "status": "paid", "note": "..." }
 *
 * Se responde 200 con `matched:false` cuando no hay un pago pendiente que
 * coincida, para que el proveedor no reintente algo que ya no existe.
 */

const encoder = new TextEncoder();

async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Comparación de tiempo constante: no filtra cuántos caracteres coinciden. */
function sameSignature(expected: string, received: string) {
  if (expected.length !== received.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) {
    diff |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  }
  return diff === 0;
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const PAID_STATUSES = new Set(["paid", "approved", "succeeded", "completed"]);

export const confirmPayment = httpAction(async (ctx, request) => {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return respond({ error: "Webhook de pagos no configurado" }, 503);
  }

  const raw = await request.text();
  const received = (request.headers.get("x-signature") ?? "")
    .trim()
    .replace(/^sha256=/i, "")
    .toLowerCase();
  if (!received) return respond({ error: "Falta la firma" }, 401);
  const expected = await hmacHex(secret, raw);
  if (!sameSignature(expected, received)) {
    return respond({ error: "Firma inválida" }, 401);
  }

  let payload: {
    reference?: unknown;
    amount?: unknown;
    status?: unknown;
    note?: unknown;
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return respond({ error: "El cuerpo no es JSON válido" }, 400);
  }

  const reference =
    typeof payload.reference === "string" ? payload.reference.trim() : "";
  const amount = Number(payload.amount);
  const status =
    typeof payload.status === "string" ? payload.status.toLowerCase() : "paid";
  if (!reference || !Number.isFinite(amount)) {
    return respond({ error: "Faltan la referencia o el monto" }, 400);
  }
  if (!PAID_STATUSES.has(status)) {
    // Un pago rechazado o pendiente no activa nada; se acusa recibo igual.
    return respond({ matched: false, ignored: status });
  }

  const result = await ctx.runMutation(
    internal.subscriptions.confirmProviderPayment,
    {
      reference,
      amount,
      note: typeof payload.note === "string" ? payload.note : undefined,
    },
  );
  return respond(result);
});
