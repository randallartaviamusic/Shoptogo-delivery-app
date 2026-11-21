import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

/**
 * Perfil administrador de la plataforma. Con este correo se puede cambiar el
 * logo de Shop To Go y su tamaño.
 */
export const ADMIN_EMAILS = ["rartavia42@gmail.com"];

const BRAND_KEY = "brand";
export const DEFAULT_LOGO_SIZE = 40;
export const MIN_LOGO_SIZE = 20;
export const MAX_LOGO_SIZE = 88;

const APP_ICON_MAX_BYTES = 8 * 1024 * 1024;
const APP_SPLASH_MAX_BYTES = 30 * 1024 * 1024;

export const DEFAULT_BRAND_TITLE = "Shop To Go";
export const DEFAULT_BRAND_TITLE_COLOR = "#f7f5f0";
export const DEFAULT_BRAND_TITLE_FONT = "sora";
export const DEFAULT_BRAND_TITLE_SIZE = 18;
export const MIN_BRAND_TITLE_SIZE = 12;
export const MAX_BRAND_TITLE_SIZE = 30;
const BRAND_TITLE_FONTS = ["sora", "manrope", "serif", "mono"];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

async function brandDoc(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", BRAND_KEY))
    .unique();
}

export function isAdminEmail(email?: string | null) {
  return ADMIN_EMAILS.includes((email ?? "").trim().toLowerCase());
}

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Necesitás iniciar sesión");
  const user = await ctx.db.get(userId);
  if (!isAdminEmail(user?.email)) {
    throw new Error(
      "Sólo el perfil administrador puede cambiar la identidad de la app",
    );
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

/**
 * Icono y splash de la app. El icono cae al logo si todavía no se subió uno
 * propio; la splash sólo existe cuando el administrador la cargó.
 */
export const appBranding = query({
  args: {},
  handler: async (ctx) => {
    const doc = await brandDoc(ctx);
    return {
      iconUrl: doc?.appIconUrl ?? doc?.logoUrl ?? null,
      customIconUrl: doc?.appIconUrl ?? null,
      splashUrl: doc?.splashUrl ?? null,
      splashKind: doc?.splashKind ?? null,
      updatedAt: doc?.updatedAt ?? null,
    };
  },
});

/** Título que acompaña al logo y su estilo. Público, igual que el logo. */
export const brandHeadline = query({
  args: {},
  handler: async (ctx) => {
    const doc = await brandDoc(ctx);
    const size = doc?.brandTitleSize ?? DEFAULT_BRAND_TITLE_SIZE;
    const font = doc?.brandTitleFont ?? DEFAULT_BRAND_TITLE_FONT;
    const stored = doc?.brandTitle?.trim();
    return {
      // El nombre viejo quedaba guardado en el perfil administrador: se ignora.
      title:
        !stored || stored.toLowerCase() === "capricho express"
          ? DEFAULT_BRAND_TITLE
          : stored,
      color: doc?.brandTitleColor ?? DEFAULT_BRAND_TITLE_COLOR,
      font: BRAND_TITLE_FONTS.includes(font) ? font : DEFAULT_BRAND_TITLE_FONT,
      size: Math.min(
        MAX_BRAND_TITLE_SIZE,
        Math.max(MIN_BRAND_TITLE_SIZE, Math.round(size)),
      ),
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

export const generateAppAssetUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const setAppIcon = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await requireAdmin(ctx);
    const metadata = await ctx.storage.getMetadata(storageId);
    if (!metadata) throw new Error("No pudimos leer el icono");
    if (!metadata.contentType?.startsWith("image/")) {
      throw new Error("El icono tiene que ser una imagen");
    }
    if (metadata.size > APP_ICON_MAX_BYTES) {
      throw new Error("El icono no puede pesar más de 8 MB");
    }
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("No pudimos guardar el icono");

    const doc = await brandDoc(ctx);
    if (doc) {
      await ctx.db.patch(doc._id, { appIconUrl: url, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("settings", {
        key: BRAND_KEY,
        appIconUrl: url,
        updatedAt: Date.now(),
      });
    }
    return url;
  },
});

export const setSplash = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await requireAdmin(ctx);
    const metadata = await ctx.storage.getMetadata(storageId);
    if (!metadata) throw new Error("No pudimos leer la splash");

    let kind: "image" | "video";
    if (metadata.contentType?.startsWith("video/")) {
      kind = "video";
    } else if (metadata.contentType?.startsWith("image/")) {
      kind = "image";
    } else {
      throw new Error("La splash tiene que ser una imagen o un video");
    }
    if (metadata.size > APP_SPLASH_MAX_BYTES) {
      throw new Error("La splash no puede pesar más de 30 MB");
    }

    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("No pudimos guardar la splash");

    const doc = await brandDoc(ctx);
    if (doc) {
      await ctx.db.patch(doc._id, {
        splashUrl: url,
        splashKind: kind,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("settings", {
        key: BRAND_KEY,
        splashUrl: url,
        splashKind: kind,
        updatedAt: Date.now(),
      });
    }
    return { url, kind };
  },
});

export const resetAppIcon = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const doc = await brandDoc(ctx);
    if (doc) {
      await ctx.db.patch(doc._id, {
        appIconUrl: undefined,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const resetSplash = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const doc = await brandDoc(ctx);
    if (doc) {
      await ctx.db.patch(doc._id, {
        splashUrl: undefined,
        splashKind: undefined,
        updatedAt: Date.now(),
      });
    }
    return null;
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

/**Texto, color, tipografía y tamaño del título que va al lado del logo. */
export const setBrandHeadline = mutation({
  args: {
    title: v.optional(v.string()),
    color: v.optional(v.string()),
    font: v.optional(v.string()),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const patch: {
      updatedAt: number;
      brandTitle?: string;
      brandTitleColor?: string;
      brandTitleFont?: string;
      brandTitleSize?: number;
    } = { updatedAt: Date.now() };

    if (args.title !== undefined) {
      const title = args.title.trim().slice(0, 40);
      if (!title) throw new Error("El título no puede quedar vacío");
      patch.brandTitle = title;
    }
    if (args.color !== undefined) {
      if (!HEX_COLOR.test(args.color)) throw new Error("Usá un color hexadecimal");
      patch.brandTitleColor = args.color.toLowerCase();
    }
    if (args.font !== undefined) {
      if (!BRAND_TITLE_FONTS.includes(args.font)) {
        throw new Error("Esa tipografía no está disponible");
      }
      patch.brandTitleFont = args.font;
    }
    if (args.size !== undefined) {
      patch.brandTitleSize = Math.min(
        MAX_BRAND_TITLE_SIZE,
        Math.max(MIN_BRAND_TITLE_SIZE, Math.round(args.size)),
      );
    }

    const doc = await brandDoc(ctx);
    if (doc) {
      await ctx.db.patch(doc._id, patch);
    } else {
      await ctx.db.insert("settings", {
        key: BRAND_KEY,
        brandTitle: DEFAULT_BRAND_TITLE,
        brandTitleColor: DEFAULT_BRAND_TITLE_COLOR,
        brandTitleFont: DEFAULT_BRAND_TITLE_FONT,
        brandTitleSize: DEFAULT_BRAND_TITLE_SIZE,
        ...patch,
      });
    }
    return null;
  },
});

/** Devuelve el título a su texto y estilo originales. */
export const resetBrandHeadline = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const doc = await brandDoc(ctx);
    if (doc) {
      await ctx.db.patch(doc._id, {
        brandTitle: undefined,
        brandTitleColor: undefined,
        brandTitleFont: undefined,
        brandTitleSize: undefined,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

/** Vuelve al logo original de Shop To Go. */
export const resetLogo = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const doc = await brandDoc(ctx);
    if (doc) await ctx.db.patch(doc._id, { logoUrl: undefined, updatedAt: Date.now() });
    return null;
  },
});
