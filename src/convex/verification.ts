import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
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
    };
  },
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
    if ((user.name ?? "").trim().length < 3) {
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
    if (user.role === "business") {
      const business = await ownedBusiness(ctx, userId);
      if (!business) {
        throw new Error("Primero cargá los datos de tu local en el onboarding");
      }
    }

    const business =
      user.role === "business" ? await ownedBusiness(ctx, userId) : null;
    await ctx.db.patch(userId, {
      phone: normalizeCostaRicaPhone(args.phone),
      idNumber: normalizeId(args.idNumber),
      vehicle: user.role === "courier" ? vehicle : undefined,
      verificationStatus: "pending",
      verificationNote: undefined,
      verificationSubmittedAt: Date.now(),
      verifiedAt: undefined,
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
