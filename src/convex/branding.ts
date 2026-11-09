import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

/**
 * Perfil administrador de la plataforma. Con este correo se puede cambiar el
 * logo de Capricho Express y su tamaño.
 */
const ADMIN_EMAILS = ["rartavia42@gmail.com"];

const BRAND_KEY = "brand";
export const DEFAULT_LOGO_SIZE = 40;
export const MIN_LOGO_SIZE = 20;
export const MAX_LOGO_SIZE = 88;

export const DEFAULT_BRAND_TITLE = "Capricho Express";
export const DEFAULT_BRAND_TITLE_COLOR = "";
export const DEFAULT_BRAND_TITLE_FONT = "";

async function brandDoc(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", BRAND_KEY))
    .unique();
}

function isAdminEmail(email?: string | null) {
  return ADMIN_EMAILS.includes((email ?? "").trim().toLowerCase());
}

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Necesitás iniciar sesión");
  const user = await ctx.db.get(userId);
  if (!isAdminEmail(user?.email)) {
    throw new Error("Sólo el perfil administrador puede cambiar el logo");
  }
  return user;
}

/** Logo y tamaño actuales. Es público: toda la app dibuja la misma marca. */
export const brand = query({
  args: {},
  handler: async (ctx) => {
    const doc = await brandDoc(ctx);
    const size = doc?.logoSize ?? DEFAULT_LOGO_SIZE;
    return {
      logoUrl: doc?.logoUrl ?? null,
      logoSize: Math.min(MAX_LOGO_SIZE, Math.max(MIN_LOGO_SIZE, size)),
      updatedAt: doc?.updatedAt ?? null,
    };
  },
});

/** Título, color y familia de letra del nombre en la barra superior. Es público. */
export const brandHeadline = query({
  args: {},
  handler: async (ctx) => {
    const doc = await brandDoc(ctx);
    return {
      title: doc?.brandTitle ?? DEFAULT_BRAND_TITLE,
      color: doc?.brandTitleColor ?? DEFAULT_BRAND_TITLE_COLOR,
      font: doc?.brandTitleFont ?? DEFAULT_BRAND_TITLE_FONT,
    };
  },
});

/** ¿La cuenta con la que estoy dentro es la administradora? */
export const amIAdmin = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const user = await ctx.db.get(userId);
    return isAdminEmail(user?.email);
  },
});

export const generateLogoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const setLogo = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await requireAdmin(ctx);
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("No pudimos guardar la imagen");

    const doc = await brandDoc(ctx);
    if (doc) {
      await ctx.db.patch(doc._id, { logoUrl: url, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("settings", {
        key: BRAND_KEY,
        logoUrl: url,
        logoSize: DEFAULT_LOGO_SIZE,
        updatedAt: Date.now(),
      });
    }
    return url;
  },
});

export const setLogoSize = mutation({
  args: { size: v.number() },
  handler: async (ctx, { size }) => {
    await requireAdmin(ctx);
    const next = Math.min(MAX_LOGO_SIZE, Math.max(MIN_LOGO_SIZE, Math.round(size)));

    const doc = await brandDoc(ctx);
    if (doc) {
      await ctx.db.patch(doc._id, { logoSize: next, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("settings", {
        key: BRAND_KEY,
        logoSize: next,
        updatedAt: Date.now(),
      });
    }
    return next;
  },
});

/** Vuelve al logo original de Capricho Express. */
export const resetLogo = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const doc = await brandDoc(ctx);
    if (doc) await ctx.db.patch(doc._id, { logoUrl: undefined, updatedAt: Date.now() });
    return null;
  },
});

export const setBrandTitle = mutation({
  args: { title: v.string() },
  handler: async (ctx, { title }) => {
    await requireAdmin(ctx);
    const doc = await brandDoc(ctx);
    const trimmed = title.trim();
    if (!trimmed) throw new Error("El título no puede estar vacío");
    if (doc) {
      await ctx.db.patch(doc._id, { brandTitle: trimmed, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("settings", {
        key: BRAND_KEY,
        brandTitle: trimmed,
        updatedAt: Date.now(),
      });
    }
    return trimmed;
  },
});

export const setBrandTitleColor = mutation({
  args: { color: v.string() },
  handler: async (ctx, { color }) => {
    await requireAdmin(ctx);
    const doc = await brandDoc(ctx);
    if (doc) {
      await ctx.db.patch(doc._id, { brandTitleColor: color, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("settings", {
        key: BRAND_KEY,
        brandTitleColor: color,
        updatedAt: Date.now(),
      });
    }
    return color;
  },
});

export const setBrandTitleFont = mutation({
  args: { font: v.string() },
  handler: async (ctx, { font }) => {
    await requireAdmin(ctx);
    const doc = await brandDoc(ctx);
    if (doc) {
      await ctx.db.patch(doc._id, { brandTitleFont: font, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("settings", {
        key: BRAND_KEY,
        brandTitleFont: font,
        updatedAt: Date.now(),
      });
    }
    return font;
  },
});
