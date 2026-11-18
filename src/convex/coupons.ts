import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { couponKindValidator } from "./schema";
import {
  COUPON_RULES,
  couponBlocker,
  couponCodeError,
  couponDiscount,
  normalizeCouponCode,
} from "../lib/coupons";

type DbCtx = QueryCtx | MutationCtx;

async function requireUserId(ctx: DbCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Necesitás iniciar sesión");
  return userId;
}

async function ownedBusiness(ctx: DbCtx, userId: Id<"users">) {
  return await ctx.db
    .query("businesses")
    .withIndex("by_owner", (q) => q.eq("ownerId", userId))
    .first();
}

async function requireBusiness(ctx: DbCtx) {
  const userId = await requireUserId(ctx);
  const business = await ownedBusiness(ctx, userId);
  if (!business) throw new Error("No tenés un negocio asociado");
  return { userId, business };
}

/** Cupón activo de un local, por código. Se usa en el carrito y el checkout. */
export async function findCoupon(
  ctx: DbCtx,
  businessId: Id<"businesses">,
  code?: string | null,
) {
  const normalized = normalizeCouponCode(code);
  if (!normalized) return null;
  const coupon = await ctx.db
    .query("coupons")
    .withIndex("by_code", (q) => q.eq("code", normalized))
    .unique();
  if (!coupon || coupon.businessId !== businessId) return null;
  return coupon;
}

/** Descuento vigente de un cupón para un subtotal de esa tienda. */
export function discountFor(
  coupon: Doc<"coupons"> | null,
  subtotal: number,
) {
  if (!coupon) return 0;
  const blocker = couponBlocker(coupon, subtotal);
  if (blocker) return 0;
  return couponDiscount(coupon, subtotal);
}

/** Cupones activos y vigentes de un local, para mostrarlos en su catálogo. */
export const forSlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!business) return [];
    const now = Date.now();
    const coupons = await ctx.db
      .query("coupons")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .collect();
    return coupons
      .filter(
        (coupon) =>
          coupon.active &&
          (!coupon.expiresAt || coupon.expiresAt > now) &&
          (coupon.maxRedemptions === undefined ||
            coupon.redemptions < coupon.maxRedemptions),
      )
      .sort((a, b) => a.minSubtotal - b.minSubtotal)
      .map((coupon) => ({
        code: coupon.code,
        label:
          coupon.kind === "percent"
            ? `${coupon.value}% de descuento`
            : `₡${coupon.value.toLocaleString("es-CR")} de descuento`,
        kind: coupon.kind,
        value: coupon.value,
        minSubtotal: coupon.minSubtotal,
        expiresAt: coupon.expiresAt ?? null,
      }));
  },
});

/** Cupones del local, con cuántas veces se usaron, para sus ajustes. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const business = await ownedBusiness(ctx, userId);
    if (!business) return [];
    const coupons = await ctx.db
      .query("coupons")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .collect();
    return coupons.sort((a, b) => b.createdAt - a.createdAt).map((coupon) => ({
      _id: coupon._id,
      code: coupon.code,
      kind: coupon.kind,
      value: coupon.value,
      minSubtotal: coupon.minSubtotal,
      maxDiscount: coupon.maxDiscount ?? null,
      active: coupon.active,
      expiresAt: coupon.expiresAt ?? null,
      maxRedemptions: coupon.maxRedemptions ?? null,
      redemptions: coupon.redemptions,
      createdAt: coupon.createdAt,
    }));
  },
});

/** Crea un cupón. El descuento lo financia el local, nunca la plataforma. */
export const create = mutation({
  args: {
    code: v.string(),
    kind: couponKindValidator,
    value: v.number(),
    minSubtotal: v.number(),
    maxDiscount: v.optional(v.number()),
    expiresInDays: v.optional(v.number()),
    maxRedemptions: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { business } = await requireBusiness(ctx);
    const code = normalizeCouponCode(args.code);
    const codeError = couponCodeError(code);
    if (codeError) throw new Error(codeError);

    const value = Math.round(args.value);
    if (args.kind === "percent" && (value < 1 || value > COUPON_RULES.maxPercent)) {
      throw new Error(`El porcentaje tiene que estar entre 1 y ${COUPON_RULES.maxPercent}`);
    }
    if (args.kind === "amount" && (value < 100 || value > COUPON_RULES.maxAmount)) {
      throw new Error(
        `El monto tiene que estar entre ₡100 y ₡${COUPON_RULES.maxAmount.toLocaleString("es-CR")}`,
      );
    }
    const minSubtotal = Math.max(0, Math.round(args.minSubtotal));
    const maxDiscount =
      args.kind === "percent" && args.maxDiscount !== undefined
        ? Math.max(0, Math.round(args.maxDiscount))
        : undefined;
    const maxRedemptions = args.maxRedemptions
      ? Math.max(1, Math.round(args.maxRedemptions))
      : undefined;
    const expiresAt = args.expiresInDays
      ? Date.now() + Math.max(1, Math.round(args.expiresInDays)) * 86_400_000
      : undefined;

    const existing = await ctx.db
      .query("coupons")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (existing) {
      throw new Error("Ese código ya existe: probá con otro");
    }

    const now = Date.now();
    const couponId = await ctx.db.insert("coupons", {
      businessId: business._id,
      code,
      kind: args.kind,
      value,
      minSubtotal,
      maxDiscount,
      active: true,
      expiresAt,
      maxRedemptions,
      redemptions: 0,
      createdAt: now,
      updatedAt: now,
    });
    return { couponId, code };
  },
});

/** Prende o apaga un cupón sin borrar su historial de usos. */
export const setActive = mutation({
  args: { couponId: v.id("coupons"), active: v.boolean() },
  handler: async (ctx, args) => {
    const { business } = await requireBusiness(ctx);
    const coupon = await ctx.db.get(args.couponId);
    if (!coupon || coupon.businessId !== business._id) {
      throw new Error("Ese cupón no es de tu local");
    }
    await ctx.db.patch(coupon._id, {
      active: args.active,
      updatedAt: Date.now(),
    });
    return { active: args.active };
  },
});

/** Borra un cupón que nunca se usó; si ya se usó, se desactiva. */
export const remove = mutation({
  args: { couponId: v.id("coupons") },
  handler: async (ctx, args) => {
    const { business } = await requireBusiness(ctx);
    const coupon = await ctx.db.get(args.couponId);
    if (!coupon || coupon.businessId !== business._id) {
      throw new Error("Ese cupón no es de tu local");
    }
    if (coupon.redemptions > 0) {
      await ctx.db.patch(coupon._id, { active: false, updatedAt: Date.now() });
      return { removed: false };
    }
    await ctx.db.delete(coupon._id);
    return { removed: true };
  },
});
