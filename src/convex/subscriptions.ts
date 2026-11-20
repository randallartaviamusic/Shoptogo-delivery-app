import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { isAdminEmail } from "./branding";
import {
  DEFAULT_GRACE_DAYS,
  DEFAULT_IBAN,
  DEFAULT_SINPE_PHONE,
  DEFAULT_WHATSAPP_NUMBERS,
  MAX_WHATSAPP_NUMBERS,
  REMINDER_SOUNDS,
  hasSubscriptionAccess,
  nextMonthlyExpiry,
  planOf,
  renewalBase,
  subscriptionStatus,
} from "../lib/subscriptions";
import type { SubscriptionStatus } from "../lib/subscriptions";
import {
  subscriptionMethodValidator,
  subscriptionPlanValidator,
  subscriptionRoleValidator,
} from "./schema";

type DbCtx = QueryCtx | MutationCtx;

const SETTINGS_KEY = "subscription";
const DAY_MS = 86_400_000;

async function requireUserId(ctx: DbCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Necesitás iniciar sesión");
  return userId;
}

async function requireAdmin(ctx: DbCtx) {
  const userId = await requireUserId(ctx);
  const user = await ctx.db.get(userId);
  if (!user || !isAdminEmail(user.email)) {
    throw new Error(
      "Sólo el perfil administrador puede verificar pagos de suscripción",
    );
  }
  return user;
}

async function settingsDoc(ctx: DbCtx) {
  return await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
    .unique();
}

/** Configuración pública de cobro: SINPE, IBAN y WhatsApps de la plataforma. */
export async function subscriptionSettings(ctx: DbCtx) {
  const doc = await settingsDoc(ctx);
  const numbers = (doc?.whatsappNumbers ?? [])
    .map((number) => number.trim())
    .filter(Boolean)
    .slice(0, MAX_WHATSAPP_NUMBERS);
  const graceDays = Math.min(
    15,
    Math.max(0, Math.round(doc?.graceDays ?? DEFAULT_GRACE_DAYS)),
  );
  return {
    sinpePhone: doc?.sinpePhone?.trim() || DEFAULT_SINPE_PHONE,
    iban: doc?.iban?.trim() || DEFAULT_IBAN,
    whatsappNumbers:
      numbers.length > 0 ? numbers : [...DEFAULT_WHATSAPP_NUMBERS],
    graceDays,
  };
}

async function subscriptionDoc(ctx: DbCtx, ownerId: Id<"users">) {
  return await ctx.db
    .query("subscriptions")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .unique();
}

async function upsertSubscription(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  role: "business" | "courier",
  patch: Partial<
    Pick<
      Doc<"subscriptions">,
      | "plan"
      | "price"
      | "activeSince"
      | "activeUntil"
      | "reminderSound"
      | "reminderEnabled"
    >
  >,
) {
  const now = Date.now();
  const existing = await subscriptionDoc(ctx, ownerId);
  if (existing) {
    await ctx.db.patch(existing._id, { ...patch, updatedAt: now });
    return existing._id;
  }
  return await ctx.db.insert("subscriptions", {
    ownerId,
    role,
    plan: patch.plan ?? "basico",
    price: patch.price ?? planOf(patch.plan).price,
    activeSince: patch.activeSince,
    activeUntil: patch.activeUntil,
    reminderSound: patch.reminderSound,
    reminderEnabled: patch.reminderEnabled,
    updatedAt: now,
  });
}

/**
 * Estado de acceso de un negocio o repartidor. Lo usan los pedidos y las
 * entregas para no dejar operar cuentas vencidas.
 */
export async function subscriptionAccess(ctx: DbCtx, ownerId: Id<"users">) {
  const doc = await subscriptionDoc(ctx, ownerId);
  const settings = await subscriptionSettings(ctx);
  const status = subscriptionStatus(doc?.activeUntil, settings.graceDays);
  return {
    status,
    hasAccess: hasSubscriptionAccess(status),
    activeUntil: doc?.activeUntil ?? null,
    plan: doc?.plan ?? null,
    graceDays: settings.graceDays,
  };
}

export async function requireSubscriptionAccess(
  ctx: DbCtx,
  ownerId: Id<"users">,
  message: string,
) {
  const access = await subscriptionAccess(ctx, ownerId);
  if (!access.hasAccess) throw new Error(message);
  return access;
}

function normalizeReference(value: string) {
  return value.replace(/[\s-]+/g, "").toUpperCase();
}

/** Busca un comprobante ya usado (pendiente, aprobado o rechazado). */
async function findReference(ctx: DbCtx, reference: string) {
  const target = normalizeReference(reference);
  if (!target) return null;
  const payments = await ctx.db.query("subscriptionPayments").collect();
  return (
    payments.find(
      (payment) => normalizeReference(payment.reference) === target,
    ) ?? null
  );
}

async function pendingPaymentFor(ctx: DbCtx, ownerId: Id<"users">) {
  const payments = await ctx.db
    .query("subscriptionPayments")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .collect();
  return payments
    .filter((payment) => payment.status === "pending")
    .sort((a, b) => b.reportedAt - a.reportedAt)[0];
}

/** Suscripción de la cuenta que está mirando, con estado y recordatorio. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "business" && user.role !== "courier")) {
      return null;
    }

    const doc = await subscriptionDoc(ctx, userId);
    const settings = await subscriptionSettings(ctx);
    // Datos para coordinar el retiro del pago en efectivo. El local usa su
    // dirección comercial; el repartidor, la de su cuenta.
    const business =
      user.role === "business"
        ? await ctx.db
            .query("businesses")
            .withIndex("by_owner", (q) => q.eq("ownerId", userId))
            .first()
        : null;
    const personAddress = [user.address, user.city]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(", ");
    const pickupAddress =
      user.role === "business"
        ? business?.address?.trim() || personAddress
        : personAddress;
    const now = Date.now();
    const status: SubscriptionStatus = subscriptionStatus(
      doc?.activeUntil,
      settings.graceDays,
      now,
    );
    const base = renewalBase(doc?.activeUntil, now);
    const payments = (
      await ctx.db
        .query("subscriptionPayments")
        .withIndex("by_owner", (q) => q.eq("ownerId", userId))
        .collect()
    ).sort((a, b) => b.reportedAt - a.reportedAt);
    const pending = payments.find((payment) => payment.status === "pending");
    // Sólo mostramos un plan contratado si hay un pago aprobado (o una
    // activación manual, que también deja su registro de pago).
    const approvedPlan =
      payments.find((payment) => payment.status === "approved")?.plan ?? null;

    return {
      role: user.role,
      accountName: user.name ?? "",
      contactPhone: user.phone ?? "",
      pickupAddress,
      businessName: business?.name ?? null,
      plan: approvedPlan ? (doc?.plan ?? approvedPlan) : null,
      price: approvedPlan
        ? (doc?.price ?? planOf(approvedPlan).price)
        : null,
      activeSince: doc?.activeSince ?? null,
      activeUntil: doc?.activeUntil ?? null,
      status,
      hasAccess: hasSubscriptionAccess(status),
      graceDays: settings.graceDays,
      reminderSound: doc?.reminderSound ?? "campana",
      reminderEnabled: doc?.reminderEnabled ?? true,
      renewalBase: base,
      // Vista previa del vencimiento mensual con la hora por defecto.
      expiryPreview: nextMonthlyExpiry(base, 20, 0),
      pendingPayment: pending
        ? {
            _id: pending._id,
            plan: pending.plan,
            price: pending.price,
            method: pending.method,
            reference: pending.reference,
            note: pending.note ?? null,
            expiryAt: pending.expiryAt,
            reportedAt: pending.reportedAt,
            status: pending.status,
            onvoPaymentIntentId: pending.onvoPaymentIntentId ?? null,
            onvoDestinationPhone: pending.onvoDestinationPhone ?? null,
          }
        : null,
      onvoConfigured: Boolean(process.env.ONVO_SECRET_KEY?.trim()),
      payments: payments.slice(0, 8).map((payment) => ({
        _id: payment._id,
        plan: payment.plan,
        price: payment.price,
        method: payment.method,
        reference: payment.reference,
        expiryAt: payment.expiryAt,
        reportedAt: payment.reportedAt,
        status: payment.status,
        reviewNote: payment.reviewNote ?? null,
        reviewedAt: payment.reviewedAt ?? null,
      })),
      settings,
      serverNow: now,
    };
  },
});

/**
 * El negocio o repartidor elige plan, método y hora de vencimiento, y reporta
 * el pago. La fecha la fija la plataforma (mensual): no se puede editar.
 */
export const requestPayment = mutation({
  args: {
    plan: subscriptionPlanValidator,
    method: subscriptionMethodValidator,
    reference: v.string(),
    note: v.optional(v.string()),
    expiryHour: v.number(),
    expiryMinute: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "business" && user.role !== "courier")) {
      throw new Error("Las suscripciones son para negocios y repartidores");
    }
    if (args.method === "onvo") {
      throw new Error("Usá el flujo ONVO directo para iniciar el pago automático");
    }
    const reference = args.reference.trim();
    if (reference.length < 3) {
      throw new Error("Escribí la referencia o el número de comprobante");
    }
    if (await pendingPaymentFor(ctx, userId)) {
      throw new Error(
        "Ya tenés un pago en revisión. Esperá la verificación del administrador",
      );
    }
    // Un mismo comprobante no puede sostener dos pagos ni dos cuentas: es la
    // primera defensa contra reenviar la misma transferencia.
    const duplicate = await findReference(ctx, reference);
    if (duplicate) {
      throw new Error(
        "Ese comprobante ya fue registrado. Revisá la referencia o escribinos por WhatsApp",
      );
    }

    const existing = await subscriptionDoc(ctx, userId);
    const plan = planOf(args.plan);
    const hour = Math.min(23, Math.max(0, Math.round(args.expiryHour)));
    const minute = Math.min(59, Math.max(0, Math.round(args.expiryMinute)));
    // La fecha nunca se adelanta: si todavía está vigente, se renueva desde ahí.
    const expiryAt = nextMonthlyExpiry(
      renewalBase(existing?.activeUntil),
      hour,
      minute,
    );

    const paymentId = await ctx.db.insert("subscriptionPayments", {
      ownerId: userId,
      role: user.role,
      plan: plan.id,
      price: plan.price,
      method: args.method,
      reference,
      note: args.note?.trim() || undefined,
      expiryAt,
      reportedAt: Date.now(),
      status: "pending",
    });
    // El plan se actualiza recién cuando el administrador aprueba el pago:
    // así nadie obtiene beneficios de un plan superior sin haberlo pagado.
    return { paymentId, expiryAt, price: plan.price };
  },
});

/** Estado mínimo de una cuenta para crear una intención SINPE. */
export const onvoRequestState = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || (user.role !== "business" && user.role !== "courier")) {
      return null;
    }
    const pending = await pendingPaymentFor(ctx, args.userId);
    const subscription = await subscriptionDoc(ctx, args.userId);
    return {
      ownerId: user._id,
      role: user.role,
      name: user.name ?? "Cuenta Shop To Go",
      email: user.email ?? undefined,
      activeUntil: subscription?.activeUntil ?? null,
      pending: Boolean(pending),
    };
  },
});

/** Reserva pago antes de llamar a ONVO para no crear dos intenciones a la vez. */
export const reserveOnvoPayment = internalMutation({
  args: {
    ownerId: v.id("users"),
    role: subscriptionRoleValidator,
    plan: subscriptionPlanValidator,
    price: v.number(),
    reference: v.string(),
    note: v.optional(v.string()),
    expiryAt: v.number(),
    payerPhone: v.string(),
  },
  handler: async (ctx, args) => {
    if (await pendingPaymentFor(ctx, args.ownerId)) {
      throw new Error("Ya tenés un pago en revisión");
    }
    return await ctx.db.insert("subscriptionPayments", {
      ownerId: args.ownerId,
      role: args.role,
      plan: args.plan,
      price: args.price,
      method: "onvo",
      reference: args.reference,
      note: args.note,
      expiryAt: args.expiryAt,
      reportedAt: Date.now(),
      status: "pending",
      onvoPayerPhone: args.payerPhone,
    });
  },
});

/** Asocia la intención con el pago reservado para validar el webhook exacto. */
export const attachOnvoIntent = internalMutation({
  args: {
    paymentId: v.id("subscriptionPayments"),
    intentId: v.string(),
    destinationPhone: v.string(),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.status !== "pending" || payment.method !== "onvo") {
      throw new Error("El pago ONVO ya no está pendiente");
    }
    const existing = await ctx.db.query("subscriptionPayments").collect();
    if (existing.some((candidate) => candidate.onvoPaymentIntentId === args.intentId)) {
      throw new Error("ONVO devolvió una intención ya asociada a otro pago");
    }
    await ctx.db.patch(payment._id, {
      onvoPaymentIntentId: args.intentId,
      onvoDestinationPhone: args.destinationPhone,
    });
  },
});

/** No deja una reserva sin intención si la API de ONVO devuelve un error. */
export const failOnvoPayment = internalMutation({
  args: { paymentId: v.id("subscriptionPayments"), note: v.string() },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.status !== "pending") return;
    await ctx.db.patch(payment._id, {
      status: "rejected",
      reviewedAt: Date.now(),
      reviewNote: args.note.slice(0, 300),
    });
  },
});

/** Crea una intención y método ONVO, y muestra instrucciones para SINPE. */
export const requestOnvoPayment = action({
  args: {
    plan: subscriptionPlanValidator,
    payerIdentification: v.string(),
    identificationType: v.number(),
    payerPhone: v.string(),
    note: v.optional(v.string()),
    expiryHour: v.number(),
    expiryMinute: v.number(),
  },
  handler: async (
    ctx: ActionCtx,
    args,
  ): Promise<{
    paymentId: Id<"subscriptionPayments">;
    intentId: string;
    reference: string;
    price: number;
    expiryAt: number;
    destinationPhone: string;
  }> => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Necesitás iniciar sesión");
    const apiKey = process.env.ONVO_SECRET_KEY?.trim();
    if (!apiKey) throw new Error("El pago automático por SINPE todavía no está configurado");
    const state = await ctx.runQuery(internal.subscriptions.onvoRequestState, {
      userId: ownerId,
    });
    if (!state) throw new Error("Las suscripciones son para negocios y repartidores");
    if (state.pending) throw new Error("Ya tenés un pago en revisión. Esperá que se confirme antes de crear otro");

    const idType = Math.round(args.identificationType);
    const identification = args.payerIdentification.trim();
    const patterns: Record<number, RegExp> = {
      0: /^\d{2}-\d{4}-\d{4}$/,
      1: /^1\d{11}$/,
      2: /^2-\d{3}-\d{6}$/,
      3: /^3-\d{3}-\d{6}$/,
      4: /^4-000-\d{6}$/,
      5: /^5\d{12}$/,
      9: /^9[A-Za-z0-9]{11}$/,
    };
    if (!patterns[idType]?.test(identification)) {
      throw new Error("La identificación debe coincidir con la que muestra el banco, incluyendo guiones");
    }
    const digits = args.payerPhone.replace(/\D/g, "");
    if (!(digits.length === 8 || (digits.length === 11 && digits.startsWith("506")))) {
      throw new Error("Escribí el teléfono SINPE de Costa Rica con 8 dígitos");
    }
    const payerPhone = `+506${digits.slice(-8)}`;
    const plan = planOf(args.plan);
    const expiryAt = nextMonthlyExpiry(
      renewalBase(state.activeUntil ?? undefined),
      Math.min(23, Math.max(0, Math.round(args.expiryHour))),
      Math.min(59, Math.max(0, Math.round(args.expiryMinute))),
    );
    const reference = `ONVO-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const paymentId = await ctx.runMutation(internal.subscriptions.reserveOnvoPayment, {
      ownerId,
      role: state.role,
      plan: plan.id,
      price: plan.price,
      reference,
      note: args.note?.trim() || undefined,
      expiryAt,
      payerPhone,
    });

    try {
      const headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
      const intentResponse = await fetch("https://api.onvopay.com/v1/payment-intents", {
        method: "POST",
        headers,
        body: JSON.stringify({
          amount: plan.price * 100,
          currency: "CRC",
          description: `Suscripción Shop To Go ${plan.name} ${reference}`,
          metadata: { paymentReference: reference, accountId: String(ownerId) },
        }),
      });
      const intentPayload = (await intentResponse.json().catch(() => null)) as {
        id?: string;
        data?: { id?: string };
        message?: string;
      } | null;
      if (!intentResponse.ok) {
        throw new Error(intentPayload?.message ?? `ONVO intención ${intentResponse.status}`);
      }
      const intentId = intentPayload?.id ?? intentPayload?.data?.id;
      if (!intentId) throw new Error("ONVO no devolvió el ID de la intención de pago");

      const methodResponse = await fetch("https://api.onvopay.com/v1/payment-methods", {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: "mobile_number",
          mobileNumber: {
            identification,
            identificationType: idType,
            number: payerPhone,
          },
          billing: {
            name: state.name,
            ...(state.email ? { email: state.email } : {}),
          },
        }),
      });
      const methodPayload = (await methodResponse.json().catch(() => null)) as {
        id?: string;
        paymentMethodId?: string;
        type?: string;
        mobileNumber?: { number?: string; identification?: string };
        data?: {
          id?: string;
          type?: string;
          mobileNumber?: { number?: string; identification?: string };
        };
        message?: string;
      } | null;
      if (!methodResponse.ok) {
        throw new Error(methodPayload?.message ?? `ONVO método de pago ${methodResponse.status}`);
      }
      const paymentMethodId =
        methodPayload?.id ?? methodPayload?.paymentMethodId ?? methodPayload?.data?.id;
      const methodDetails = methodPayload?.data ?? methodPayload;
      if (!paymentMethodId || methodDetails?.type !== "mobile_number") {
        throw new Error("ONVO no devolvió un método SINPE Móvil válido");
      }
      if (
        methodDetails.mobileNumber?.number !== payerPhone ||
        methodDetails.mobileNumber?.identification !== identification
      ) {
        throw new Error("ONVO devolvió datos SINPE distintos a los enviados; no iniciamos el pago");
      }

      const destinationPhone = process.env.ONVO_SINPE_DESTINATION_PHONE?.trim() || "+50670196686";
      await ctx.runMutation(internal.subscriptions.attachOnvoIntent, {
        paymentId,
        intentId,
        destinationPhone,
      });

      const confirmResponse = await fetch(
        `https://api.onvopay.com/v1/payment-intents/${encodeURIComponent(intentId)}/confirm`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ paymentMethodId }),
        },
      );
      const confirmPayload = (await confirmResponse.json().catch(() => null)) as {
        id?: string;
        status?: string;
        data?: { id?: string; status?: string };
        message?: string;
      } | null;
      if (!confirmResponse.ok) {
        throw new Error(confirmPayload?.message ?? `ONVO confirmación ${confirmResponse.status}`);
      }
      const confirmedIntent = confirmPayload?.data ?? confirmPayload;
      if (
        (confirmedIntent?.id && confirmedIntent.id !== intentId) ||
        confirmedIntent?.status !== "processing"
      ) {
        throw new Error("ONVO no dejó la transferencia en estado de espera; revisá el pago antes de continuar");
      }
      return {
        paymentId,
        intentId,
        reference,
        price: plan.price,
        expiryAt,
        destinationPhone,
      };
    } catch (error) {
      await ctx.runMutation(internal.subscriptions.failOnvoPayment, {
        paymentId,
        note: error instanceof Error ? error.message : "No se pudo iniciar el pago ONVO",
      });
      throw error;
    }
  },
});

/** Sonido y aviso del recordatorio de pago (lo elige el suscriptor). */
export const setReminder = mutation({
  args: {
    sound: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "business" && user.role !== "courier")) {
      throw new Error("Las suscripciones son para negocios y repartidores");
    }
    const sound = REMINDER_SOUNDS.some((option) => option.id === args.sound)
      ? args.sound
      : "campana";
    await upsertSubscription(ctx, userId, user.role, {
      reminderSound: sound,
      reminderEnabled: args.enabled,
    });
    return { sound, enabled: args.enabled };
  },
});

/** Cola de verificación y cuentas, sólo para el perfil administrador. */
export const adminOverview = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const settings = await subscriptionSettings(ctx);
    const users = await ctx.db.query("users").collect();
    const subscriptions = await ctx.db.query("subscriptions").collect();
    const payments = await ctx.db.query("subscriptionPayments").collect();
    const businesses = await ctx.db.query("businesses").collect();

    const userById = new Map(users.map((user) => [user._id, user]));
    const subscriptionByOwner = new Map(
      subscriptions.map((subscription) => [
        subscription.ownerId,
        subscription,
      ]),
    );
    const businessByOwner = new Map(
      businesses
        .filter((business) => business.ownerId)
        .map((business) => [business.ownerId!, business]),
    );

    const displayName = (ownerId: Id<"users">) => {
      const user = userById.get(ownerId);
      return user?.name ?? user?.email ?? "Cuenta";
    };
    const displayBusiness = (ownerId: Id<"users">) =>
      businessByOwner.get(ownerId)?.name ?? null;

    const pending = payments
      .filter((payment) => payment.status === "pending")
      .sort((a, b) => a.reportedAt - b.reportedAt)
      .map((payment) => ({
        _id: payment._id,
        ownerId: payment.ownerId,
        name: displayName(payment.ownerId),
        email: userById.get(payment.ownerId)?.email ?? null,
        phone: userById.get(payment.ownerId)?.phone ?? null,
        businessName: displayBusiness(payment.ownerId),
        role: payment.role,
        plan: payment.plan,
        price: payment.price,
        method: payment.method,
        reference: payment.reference,
        note: payment.note ?? null,
        expiryAt: payment.expiryAt,
        reportedAt: payment.reportedAt,
      }));

    const term = (args.search ?? "").trim().toLowerCase();
    const accounts = users
      .filter((user) => user.role === "business" || user.role === "courier")
      .map((user) => {
        const subscription = subscriptionByOwner.get(user._id);
        const status = subscriptionStatus(
          subscription?.activeUntil,
          settings.graceDays,
          now,
        );
        return {
          ownerId: user._id,
          name: user.name ?? null,
          email: user.email ?? null,
          phone: user.phone ?? null,
          role: user.role as "business" | "courier",
          businessName: displayBusiness(user._id),
          plan: subscription?.plan ?? null,
          price: subscription?.price ?? null,
          activeUntil: subscription?.activeUntil ?? null,
          status,
          hasAccess: hasSubscriptionAccess(status),
          pending: pending.some((payment) => payment.ownerId === user._id),
        };
      })
      .filter((account) => {
        if (!term) return true;
        return [
          account.name,
          account.email,
          account.phone,
          account.businessName,
        ].some((value) => (value ?? "").toLowerCase().includes(term));
      })
      .sort((a, b) => {
        const suspended = Number(a.hasAccess) - Number(b.hasAccess);
        if (suspended !== 0) return suspended;
        return (a.name ?? a.email ?? "").localeCompare(
          b.name ?? b.email ?? "",
        );
      });

    const recent = payments
      .filter((payment) => payment.status !== "pending")
      .sort((a, b) => (b.reviewedAt ?? b.reportedAt) - (a.reviewedAt ?? a.reportedAt))
      .slice(0, 8)
      .map((payment) => ({
        _id: payment._id,
        ownerId: payment.ownerId,
        name: displayName(payment.ownerId),
        businessName: displayBusiness(payment.ownerId),
        role: payment.role,
        plan: payment.plan,
        price: payment.price,
        status: payment.status,
        reference: payment.reference,
        reportedAt: payment.reportedAt,
        reviewedAt: payment.reviewedAt ?? null,
        reviewNote: payment.reviewNote ?? null,
      }));

    return {
      settings,
      pending,
      accounts,
      recent,
      totals: {
        pending: pending.length,
        accounts: accounts.length,
        suspended: accounts.filter((account) => !account.hasAccess).length,
      },
      serverNow: now,
    };
  },
});

/** Aprobar o rechazar un comprobante: activa o renueva la suscripción. */
export const adminReviewPayment = mutation({
  args: {
    paymentId: v.id("subscriptionPayments"),
    approve: v.boolean(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Ese pago ya no existe");
    if (payment.status !== "pending") {
      throw new Error("Ese pago ya fue revisado");
    }
    if (payment.method === "onvo") {
      throw new Error("Los pagos ONVO sólo se aprueban con su webhook firmado");
    }

    const now = Date.now();
    const reviewNote = args.note?.trim() || undefined;
    await ctx.db.patch(payment._id, {
      status: args.approve ? "approved" : "rejected",
      reviewedAt: now,
      reviewedBy: admin._id,
      reviewNote,
    });

    if (!args.approve) return { approved: false, activeUntil: null };

    const existing = await subscriptionDoc(ctx, payment.ownerId);
    const plan = planOf(payment.plan);
    const activeUntil = Math.max(
      payment.expiryAt,
      existing?.activeUntil ?? 0,
      now + DAY_MS,
    );
    await upsertSubscription(ctx, payment.ownerId, payment.role, {
      plan: plan.id,
      price: plan.price,
      activeSince: existing?.activeSince ?? now,
      activeUntil,
    });
    return { approved: true, activeUntil };
  },
});

/** Confirma únicamente la intención ONVO asociada al pago y CRC exactos. */
export const confirmOnvoPayment = internalMutation({
  args: { intentId: v.string(), amount: v.number(), currency: v.string() },
  handler: async (ctx, args) => {
    if (!args.intentId || args.currency !== "CRC" || !Number.isSafeInteger(args.amount)) {
      return { matched: false, reason: "Datos de la intención inválidos" };
    }
    const payments = await ctx.db.query("subscriptionPayments").collect();
    const payment = payments.find(
      (candidate) => candidate.method === "onvo" && candidate.onvoPaymentIntentId === args.intentId,
    );
    if (!payment) return { matched: false, reason: "Intención ONVO no asociada a un pago" };
    if (payment.status === "approved") return { matched: true, alreadyApproved: true };
    if (payment.status !== "pending") return { matched: false, reason: "El pago ya no está pendiente" };
    if (args.amount !== payment.price * 100) {
      return { matched: false, reason: "El monto ONVO no coincide con el monto de la suscripción" };
    }

    const now = Date.now();
    await ctx.db.patch(payment._id, {
      status: "approved",
      reviewedAt: now,
      reviewNote: "Confirmado automáticamente por ONVO SINPE Móvil",
    });
    const existing = await subscriptionDoc(ctx, payment.ownerId);
    const plan = planOf(payment.plan);
    const activeUntil = Math.max(
      payment.expiryAt,
      existing?.activeUntil ?? 0,
      now + DAY_MS,
    );
    await upsertSubscription(ctx, payment.ownerId, payment.role, {
      plan: plan.id,
      price: plan.price,
      activeSince: existing?.activeSince ?? now,
      activeUntil,
    });
    return { matched: true, approved: true, activeUntil };
  },
});

/** Activación o renovación manual (pago en efectivo o ajuste del administrador). */
export const adminGrant = mutation({
  args: {
    ownerId: v.id("users"),
    plan: subscriptionPlanValidator,
    months: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const user = await ctx.db.get(args.ownerId);
    if (!user || (user.role !== "business" && user.role !== "courier")) {
      throw new Error("Esa cuenta no es de negocio ni de repartidor");
    }
    const plan = planOf(args.plan);
    const months = Math.min(12, Math.max(1, Math.round(args.months ?? 1)));
    const existing = await subscriptionDoc(ctx, user._id);
    const now = Date.now();
    let activeUntil = renewalBase(existing?.activeUntil, now);
    for (let index = 0; index < months; index += 1) {
      activeUntil = nextMonthlyExpiry(activeUntil, 20, 0);
    }

    await ctx.db.insert("subscriptionPayments", {
      ownerId: user._id,
      role: user.role,
      plan: plan.id,
      price: plan.price * months,
      method: "cash",
      reference: "Activación manual del administrador",
      note: `Activación de ${months} ${months === 1 ? "mes" : "meses"}`,
      expiryAt: activeUntil,
      reportedAt: now,
      status: "approved",
      reviewedAt: now,
      reviewedBy: admin._id,
    });
    await upsertSubscription(ctx, user._id, user.role, {
      plan: plan.id,
      price: plan.price,
      activeSince: existing?.activeSince ?? now,
      activeUntil,
    });
    return { activeUntil, months, plan: plan.id };
  },
});

/** Datos de cobro: número SINPE, IBAN, WhatsApps y días de gracia. */
export const adminSaveSettings = mutation({
  args: {
    sinpePhone: v.string(),
    iban: v.string(),
    whatsappNumbers: v.array(v.string()),
    graceDays: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const sinpePhone = args.sinpePhone.replace(/\s+/g, "");
    if (!/^\d{8}$/.test(sinpePhone)) {
      throw new Error("El número de SINPE Móvil debe tener 8 dígitos");
    }
    const iban = args.iban.replace(/\s+/g, "").toUpperCase();
    if (!/^CR\d{20}$/.test(iban)) {
      throw new Error("El IBAN debe empezar con CR y tener 22 caracteres");
    }
    const numbers = args.whatsappNumbers
      .map((number) => number.trim())
      .filter(Boolean);
    if (numbers.length === 0) {
      throw new Error("Agregá al menos un número de WhatsApp");
    }
    if (numbers.length > MAX_WHATSAPP_NUMBERS) {
      throw new Error(`Podés guardar hasta ${MAX_WHATSAPP_NUMBERS} números`);
    }
    for (const number of numbers) {
      if (number.replace(/\D/g, "").length < 8) {
        throw new Error(`El número ${number} no es válido`);
      }
    }
    const graceDays = Math.min(15, Math.max(0, Math.round(args.graceDays)));
    const now = Date.now();

    const doc = await settingsDoc(ctx);
    const patch = {
      sinpePhone,
      iban,
      whatsappNumbers: numbers,
      graceDays,
      updatedAt: now,
    };
    if (doc) {
      await ctx.db.patch(doc._id, patch);
    } else {
      await ctx.db.insert("settings", { key: SETTINGS_KEY, ...patch });
    }
    return subscriptionSettings(ctx);
  },
});

/** Datos de cobro públicos para mostrar antes de pagar. */
export const paymentSettings = query({
  args: {},
  handler: async (ctx) => {
    return await subscriptionSettings(ctx);
  },
});

/** Estado de suscripción de una cuenta concreta (administrador). */
export const adminAccount = query({
  args: { ownerId: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(args.ownerId);
    if (!user) return null;
    const doc = await subscriptionDoc(ctx, args.ownerId);
    const settings = await subscriptionSettings(ctx);
    const status = subscriptionStatus(doc?.activeUntil, settings.graceDays);
    return {
      ownerId: user._id,
      name: user.name ?? null,
      email: user.email ?? null,
      role: user.role ?? null,
      plan: doc?.plan ?? null,
      price: doc?.price ?? null,
      activeSince: doc?.activeSince ?? null,
      activeUntil: doc?.activeUntil ?? null,
      status,
      hasAccess: hasSubscriptionAccess(status),
      graceDays: settings.graceDays,
    };
  },
});
