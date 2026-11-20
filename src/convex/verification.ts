import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { isAdminEmail } from "./branding";
import {
  digitsOnly,
  isValidCostaRicaId,
  isValidCostaRicaPhone,
  normalizeCostaRicaPhone,
  normalizeId,
  verificationOf,
} from "../lib/trust";

type DbCtx = QueryCtx | MutationCtx;

async function requireAdmin(ctx: DbCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Necesitás iniciar sesión");
  const user = await ctx.db.get(userId);
  if (!user || !isAdminEmail(user.email)) {
    throw new Error("Sólo el perfil administrador puede revisar verificaciones");
  }
  return user;
}

async function ownedBusiness(ctx: DbCtx, ownerId: Id<"users">) {
  return await ctx.db
    .query("businesses")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .first();
}

/** Exigimos la verificación para operar: recibir pedidos o tomar entregas. */
export async function requireVerifiedAccount(
  ctx: DbCtx,
  userId: Id<"users">,
  message: string,
) {
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Esa cuenta ya no existe");
  if (user.verificationStatus !== "verified") {
    throw new Error(message);
  }
  return user;
}

export async function isAccountVerified(
  ctx: DbCtx,
  userId?: Id<"users"> | null,
) {
  if (!userId) return false;
  const user = await ctx.db.get(userId);
  return user?.verificationStatus === "verified";
}

/** Datos de verificación de la cuenta que está mirando. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "business" && user.role !== "courier")) {
      return null;
    }
    const business =
      user.role === "business" ? await ownedBusiness(ctx, user._id) : null;
    return {
      role: user.role,
      name: user.name ?? null,
      email: user.email ?? null,
      phone: user.phone ?? null,
      idNumber: user.idNumber ?? null,
      vehicle: user.vehicle ?? null,
      status: verificationOf(user.verificationStatus),
      note: user.verificationNote ?? null,
      submittedAt: user.verificationSubmittedAt ?? null,
      verifiedAt: user.verifiedAt ?? null,
      businessName: business?.name ?? null,
      businessAddress: business?.address ?? null,
      businessVerifiedAt: business?.verifiedAt ?? null,
      rating: user.rating ?? null,
      reviews: user.reviews ?? 0,
      phoneVerifiedAt: user.phoneVerifiedAt ?? null,
      idVerifiedAt: user.idVerifiedAt ?? null,
      idVerifiedName: user.idVerifiedName ?? null,
      verifiedAutomatically: user.verifiedAutomatically ?? false,
      pendingPhone: user.pendingVerificationPhone ?? null,
      automation: automationAvailability(),
    };
  },
});

/**
 * Qué verificaciones automáticas están configuradas. No expone credenciales:
 * sólo si el proveedor está listo, para que la interfaz no prometa algo que no
 * va a pasar.
 */
function automationAvailability() {
  return {
    phone: Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_VERIFY_SERVICE_SID,
    ),
    identity: Boolean(process.env.DIDIT_API_KEY),
  };
}

export const automation = query({
  args: {},
  handler: async () => automationAvailability(),
});

/**
 * Negocios y repartidores completan sus datos. La cuenta queda en revisión
 * hasta que la administración confirme el teléfono y la cédula.
 */
export const submit = mutation({
  args: {
    phone: v.string(),
    idNumber: v.string(),
    vehicle: v.optional(v.string()),
    accepted: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "business" && user.role !== "courier")) {
      throw new Error("La verificación es para cuentas de negocio y repartidor");
    }
    if (!args.accepted) {
      throw new Error("Confirmá que los datos son tuyos y que podés recibir llamadas");
    }
    if ((user.name ?? "").trim().length < 2) {
      throw new Error("Completá tu nombre completo antes de verificar la cuenta");
    }
    if (!isValidCostaRicaPhone(args.phone)) {
      throw new Error("Escribí un teléfono de Costa Rica de 8 dígitos");
    }
    if (!isValidCostaRicaId(args.idNumber)) {
      throw new Error("Escribí la cédula con 9 dígitos");
    }
    const vehicle = (args.vehicle ?? "").trim();
    if (user.role === "courier" && vehicle.length < 3) {
      throw new Error("Contanos en qué vehículo repartís");
    }
    // La cuenta puede guardar teléfono y cédula antes de publicar el local: la
    // aprobación automática sí espera al negocio, pero la revisión manual no.
    const business =
      user.role === "business" ? await ownedBusiness(ctx, userId) : null;
    const phone = normalizeCostaRicaPhone(args.phone);
    const idNumber = normalizeId(args.idNumber);
    // Si el teléfono o la cédula cambian, su confirmación anterior deja de
    // valer: se vuelve a pedir el código y la consulta al registro.
    const phoneChanged = phone !== (user.phone ?? "");
    const idChanged = idNumber !== (user.idNumber ?? "");
    await ctx.db.patch(userId, {
      phone,
      idNumber,
      vehicle: user.role === "courier" ? vehicle : undefined,
      verificationStatus: "pending",
      verificationNote: undefined,
      verificationSubmittedAt: Date.now(),
      verifiedAt: undefined,
      verifiedAutomatically: false,
      phoneVerifiedAt: phoneChanged ? undefined : user.phoneVerifiedAt,
      pendingVerificationPhone: undefined,
      idVerifiedAt: idChanged ? undefined : user.idVerifiedAt,
      idVerifiedName: idChanged ? undefined : user.idVerifiedName,
    });
    if (business?.verifiedAt) {
      await ctx.db.patch(business._id, { verifiedAt: undefined });
    }
    return { status: "pending" as const };
  },
});

/** Cola de revisión para el perfil administrador. */
export const adminQueue = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    const businesses = await ctx.db.query("businesses").collect();
    const businessByOwner = new Map(
      businesses
        .filter((business) => business.ownerId)
        .map((business) => [business.ownerId!, business]),
    );
    const term = (args.search ?? "").trim().toLowerCase();

    const accounts = users
      .filter((user) => user.role === "business" || user.role === "courier")
      .map((user) => {
        const business = businessByOwner.get(user._id);
        return {
          userId: user._id,
          name: user.name ?? null,
          email: user.email ?? null,
          phone: user.phone ?? null,
          role: user.role as "business" | "courier",
          businessName: business?.name ?? null,
          businessAddress: business?.address ?? null,
          idNumber: user.idNumber ?? null,
          vehicle: user.vehicle ?? null,
          status: verificationOf(user.verificationStatus),
          note: user.verificationNote ?? null,
          submittedAt: user.verificationSubmittedAt ?? null,
          verifiedAt: user.verifiedAt ?? null,
          autoVerified: user.verifiedAutomatically ?? false,
          phoneVerifiedAt: user.phoneVerifiedAt ?? null,
          idVerifiedAt: user.idVerifiedAt ?? null,
          createdAt: user._creationTime,
          rating: user.rating ?? null,
          reviews: user.reviews ?? 0,
        };
      })
      .filter((account) => {
        if (!term) return true;
        return [
          account.name,
          account.email,
          account.phone,
          account.businessName,
          account.idNumber,
        ].some((value) => (value ?? "").toLowerCase().includes(term));
      })
      .sort((a, b) => {
        const order = (status: string) =>
          status === "pending" ? 0 : status === "rejected" ? 1 : 2;
        return (
          order(a.status) - order(b.status) ||
          (b.submittedAt ?? b.createdAt) - (a.submittedAt ?? a.createdAt)
        );
      });

    return {
      accounts,
      totals: {
        pending: accounts.filter((account) => account.status === "pending")
          .length,
        verified: accounts.filter((account) => account.status === "verified")
          .length,
        rejected: accounts.filter((account) => account.status === "rejected")
          .length,
        unverified: accounts.filter(
          (account) => account.status === "unverified",
        ).length,
      },
    };
  },
});

/** Aprobar o rechazar la verificación de una cuenta. */
export const adminReview = mutation({
  args: {
    userId: v.id("users"),
    approve: v.boolean(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user || (user.role !== "business" && user.role !== "courier")) {
      throw new Error("Esa cuenta no es de negocio ni de repartidor");
    }
    if (args.approve) {
      if (!isValidCostaRicaPhone(user.phone)) {
        throw new Error("La cuenta no tiene un teléfono válido: pedile que lo complete");
      }
      if (!isValidCostaRicaId(user.idNumber)) {
        throw new Error("La cuenta no tiene una cédula válida registrada");
      }
      if (user.role === "courier" && (user.vehicle ?? "").trim().length < 3) {
        throw new Error("Falta el vehículo del repartidor");
      }
    }

    const now = Date.now();
    const note = args.note?.trim() || undefined;
    await ctx.db.patch(user._id, {
      verificationStatus: args.approve ? "verified" : "rejected",
      verificationNote: note,
      verifiedAt: args.approve ? now : undefined,
    });

    if (user.role === "business") {
      const business = await ownedBusiness(ctx, user._id);
      if (business) {
        await ctx.db.patch(business._id, {
          verifiedAt: args.approve ? now : undefined,
        });
      }
    }
    return {
      userId: user._id,
      status: args.approve ? ("verified" as const) : ("rejected" as const),
      verifiedAt: args.approve ? now : null,
      digits: digitsOnly(user.idNumber).length,
    };
  },
});

// ---------------------------------------------------------------------------
// Verificación automática: código al teléfono (Twilio Verify) y cédula contra
// el registro del TSE (Didit). Sin credenciales, estas acciones fallan con un
// mensaje claro y la cuenta sigue por la revisión manual de siempre.
// ---------------------------------------------------------------------------

const PHONE_CODE_COOLDOWN_MS = 60_000;
const DIDIT_URL = "https://verification.didit.me/v3/database-validation/";

/** Datos mínimos para las acciones, sin exponer nada al cliente. */
export const stateForAutomation = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    const lastSent = user.phoneVerificationSentAt ?? 0;
    return {
      role: user.role ?? null,
      name: user.name ?? null,
      email: user.email ?? null,
      phone: user.phone ?? null,
      idNumber: user.idNumber ?? null,
      phoneVerifiedAt: user.phoneVerifiedAt ?? null,
      idVerifiedAt: user.idVerifiedAt ?? null,
      pendingPhone: user.pendingVerificationPhone ?? null,
      cooldownMsLeft: Math.max(0, lastSent + PHONE_CODE_COOLDOWN_MS - Date.now()),
    };
  },
});

/** Registra el envío del código y el teléfono que se está confirmando. */
export const markPhoneCodeSent = internalMutation({
  args: { userId: v.id("users"), phone: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      pendingVerificationPhone: args.phone,
      phoneVerificationSentAt: Date.now(),
    });
  },
});

/** El código fue aprobado: el teléfono pasa a ser el contacto de la cuenta. */
export const markPhoneVerified = internalMutation({
  args: { userId: v.id("users"), phone: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      phone: args.phone,
      phoneVerifiedAt: Date.now(),
      pendingVerificationPhone: undefined,
    });
    await maybeAutoVerify(ctx, args.userId);
  },
});

/** El registro del TSE confirmó la cédula. */
export const markIdVerified = internalMutation({
  args: {
    userId: v.id("users"),
    idNumber: v.string(),
    verifiedName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      idNumber: normalizeId(args.idNumber),
      idVerifiedAt: Date.now(),
      idVerifiedName: args.verifiedName,
    });
    await maybeAutoVerify(ctx, args.userId);
  },
});

/** El registro dijo que la cédula no coincide: se rechaza con motivo. */
export const markIdRejected = internalMutation({
  args: { userId: v.id("users"), reason: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      idVerifiedAt: undefined,
      verificationStatus: "rejected",
      verificationNote: args.reason,
      verifiedAt: undefined,
      verifiedAutomatically: false,
    });
  },
});

/**
 * Con teléfono y cédula confirmados por sus fuentes, la cuenta se aprueba sin
 * intervención humana. Si falta uno de los dos, sigue en revisión manual.
 */
async function maybeAutoVerify(ctx: MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user || (user.role !== "business" && user.role !== "courier")) return;
  if (!user.phoneVerifiedAt || !user.idVerifiedAt) return;
  if (!user.name || user.name.trim().length < 3) return;
  if (user.role === "courier" && (user.vehicle ?? "").trim().length < 3) return;
  if (user.role === "business" && !(await ownedBusiness(ctx, userId))) return;

  const now = Date.now();
  await ctx.db.patch(userId, {
    verificationStatus: "verified",
    verificationNote: undefined,
    verificationSubmittedAt: user.verificationSubmittedAt ?? now,
    verifiedAt: now,
    verifiedAutomatically: true,
  });
  if (user.role === "business") {
    const business = await ownedBusiness(ctx, userId);
    if (business) await ctx.db.patch(business._id, { verifiedAt: now });
  }
}

/** Envía un código SMS al teléfono indicado con Twilio Verify. */
export const sendPhoneCode = action({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();
    if (!accountSid || !authToken || !serviceSid) {
      throw new Error(
        "La verificación por SMS no está configurada. La administración puede revisar tu cuenta manualmente",
      );
    }
    if (!isValidCostaRicaPhone(args.phone)) {
      throw new Error("Escribí un teléfono de Costa Rica de 8 dígitos");
    }
    const state = await ctx.runQuery(internal.verification.stateForAutomation, {
      userId,
    });
    if (!state) throw new Error("Esa cuenta ya no existe");
    if (state.role !== "business" && state.role !== "courier") {
      throw new Error("La verificación es para cuentas de negocio y repartidor");
    }
    if (state.cooldownMsLeft > 0) {
      throw new Error(
        `Esperá ${Math.ceil(state.cooldownMsLeft / 1000)} segundos antes de pedir otro código`,
      );
    }

    const e164 = `+506${digitsOnly(args.phone).slice(-8)}`;
    const body = new URLSearchParams({ To: e164, Channel: "sms" });
    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Twilio ${response.status}: ${detail.slice(0, 160)}`);
    }
    await ctx.runMutation(internal.verification.markPhoneCodeSent, {
      userId,
      phone: normalizeCostaRicaPhone(args.phone),
    });
    return { sent: true, to: e164 };
  },
});

/** Confirma el código SMS y deja el teléfono verificado. */
export const checkPhoneCode = action({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();
    if (!accountSid || !authToken || !serviceSid) {
      throw new Error("La verificación por SMS no está configurada");
    }
    const state = await ctx.runQuery(internal.verification.stateForAutomation, {
      userId,
    });
    if (!state?.pendingPhone) {
      throw new Error("Primero pedí el código al teléfono que querés verificar");
    }
    const code = args.code.replace(/\D/g, "");
    if (code.length < 4) throw new Error("Escribí el código que te llegó por SMS");

    const body = new URLSearchParams({
      To: `+506${digitsOnly(state.pendingPhone).slice(-8)}`,
      Code: code,
    });
    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
    const payload = (await response.json().catch(() => null)) as {
      status?: string;
      message?: string;
    } | null;
    if (!response.ok) {
      throw new Error(payload?.message ?? `Twilio ${response.status}`);
    }
    if (payload?.status !== "approved") {
      throw new Error(
        payload?.status === "pending"
          ? "El código no coincide. Revisalo y volvé a intentar"
          : "El código venció o se agotaron los intentos. Pedí uno nuevo",
      );
    }
    await ctx.runMutation(internal.verification.markPhoneVerified, {
      userId,
      phone: state.pendingPhone,
    });
    return { verified: true };
  },
});

/**
 * Consulta la cédula en el registro civil del TSE con Didit. En caso de
 * coincidencia, el nombre del registro se guarda como respaldo y la cuenta se
 * aprueba automáticamente si ya confirmó el teléfono.
 */
export const checkId = action({
  args: { idNumber: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    if (!isValidCostaRicaId(args.idNumber)) {
      throw new Error("Escribí la cédula con 9 dígitos");
    }
    const apiKey = process.env.DIDIT_API_KEY?.trim();
    if (!apiKey) {
      // Sin proveedor no se rechaza ni se aprueba: la cuenta sigue por revisión
      // manual, igual que cuando el registro civil no responde.
      return {
        matched: false,
        pendingReview: true,
        reason: "La consulta automática no está configurada; la cédula quedará en revisión manual",
      };
    }
    const state = await ctx.runQuery(internal.verification.stateForAutomation, {
      userId,
    });
    if (!state) throw new Error("Esa cuenta ya no existe");
    if (state.role !== "business" && state.role !== "courier") {
      throw new Error("La verificación es para cuentas de negocio y repartidor");
    }
    const nameParts = (state.name ?? "").trim().split(/\s+/).filter(Boolean);

    const response = await fetch(DIDIT_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        issuing_state: "CRI",
        services: ["cri_cedula"],
        personal_number: digitsOnly(args.idNumber),
        ...(nameParts.length > 0 ? { first_name: nameParts[0] } : {}),
        ...(nameParts.length > 1
          ? { last_name: nameParts.slice(1).join(" ") }
          : {}),
        vendor_data: String(userId),
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      status?: string;
      match_type?: string;
      validations?: Array<{
        outcome_code?: string;
        source_data?: { full_name?: string };
      }>;
      detail?: string;
    } | null;
    if (!response.ok) {
      throw new Error(
        payload?.detail ?? `No pudimos consultar la cédula (Didit ${response.status})`,
      );
    }

    const validation = payload?.validations?.[0];
    const outcome = validation?.outcome_code ?? "";
    const matched =
      payload?.status === "Approved" ||
      payload?.match_type === "full_match" ||
      outcome === "MATCH";
    if (matched) {
      await ctx.runMutation(internal.verification.markIdVerified, {
        userId,
        idNumber: args.idNumber,
        verifiedName: validation?.source_data?.full_name,
      });
      return { matched: true };
    }
    if (
      outcome === "NO_MATCH" ||
      outcome === "DOCUMENT_NOT_FOUND" ||
      payload?.match_type === "no_match"
    ) {
      await ctx.runMutation(internal.verification.markIdRejected, {
        userId,
        reason:
          outcome === "DOCUMENT_NOT_FOUND"
            ? "El registro civil no encontró esa cédula. Revisá el número y volvé a intentar."
            : "La cédula no coincide con el registro civil. Revisá el número o abrí un caso en Ayuda.",
      });
      return {
        matched: false,
        reason:
          outcome === "DOCUMENT_NOT_FOUND"
            ? "El registro no encontró esa cédula"
            : "La cédula no coincide con el registro",
      };
    }
    // El proveedor no pudo concluir (registro caído o dato incompleto): no se
    // rechaza a nadie por un problema técnico.
    return {
      matched: false,
      pendingReview: true,
      reason: "El registro no respondió con un resultado concluyente",
    };
  },
});
