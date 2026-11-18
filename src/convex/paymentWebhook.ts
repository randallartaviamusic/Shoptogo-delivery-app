import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

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

/** Webhook ONVO: firma vigente, timestamp fresco, pago e intención asociados. */
export const confirmPayment = httpAction(async (ctx, request) => {
  const secret = process.env.ONVO_WEBHOOK_SECRET?.trim();
  if (!secret) return respond({ error: "Webhook ONVO no configurado" }, 503);

  const raw = await request.text();
  const header = request.headers.get("x-onvo-signature") ?? "";
  const pairs = header.split(",").flatMap((part) => {
    const separator = part.indexOf("=");
    return separator < 0
      ? []
      : [[part.slice(0, separator).trim(), part.slice(separator + 1).trim()] as const];
  });
  const timestamp = Number(pairs.find(([key]) => key === "t")?.[1]);
  const signatures = pairs
    .filter(([key]) => key === "v1")
    .map(([, signature]) => signature.toLowerCase())
    .filter((signature) => /^[0-9a-f]{64}$/.test(signature));
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300 ||
    signatures.length === 0
  ) {
    return respond({ error: "Firma ausente o vencida" }, 401);
  }
  const expected = await hmacHex(secret, `${timestamp}.${raw}`);
  if (!signatures.some((candidate) => sameSignature(expected, candidate))) {
    return respond({ error: "Firma inválida" }, 401);
  }

  let payload: {
    id?: unknown;
    type?: unknown;
    data?: {
      object?: {
        id?: unknown;
        amount?: unknown;
        currency?: unknown;
        status?: unknown;
      };
    };
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return respond({ error: "El cuerpo no es JSON válido" }, 400);
  }

  if (payload.type !== "payment_intent.succeeded") {
    return respond({ received: true, ignored: payload.type ?? "unknown" });
  }
  const intent = payload.data?.object;
  if (
    !intent ||
    typeof intent.id !== "string" ||
    typeof intent.amount !== "number" ||
    typeof intent.currency !== "string" ||
    intent.status !== "succeeded"
  ) {
    return respond({ error: "La intención confirmada está incompleta" }, 400);
  }
  const result = await ctx.runMutation(internal.subscriptions.confirmOnvoPayment, {
    intentId: intent.id,
    amount: intent.amount,
    currency: intent.currency,
  });
  return respond(result);
});
