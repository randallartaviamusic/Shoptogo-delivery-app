import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { subscriptionAccess } from "./subscriptions";
import { isAccountVerified } from "./verification";

const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ACTIVE_PER_BUSINESS = 20;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 30 * 1024 * 1024;

async function ownedBusiness(ctx: MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("businesses")
    .withIndex("by_owner", (q) => q.eq("ownerId", userId))
    .first();
}

/** Historias sólo para negocios con plan Pro o Élite vigente. */
async function requireProBusiness(ctx: MutationCtx, userId: Id<"users">) {
  const business = await ownedBusiness(ctx, userId);
  if (!business) throw new Error("No tenés un negocio asociado");
  const access = await subscriptionAccess(ctx, userId);
  if (!access.hasAccess || (access.plan !== "pro" && access.plan !== "elite")) {
    throw new Error(
      "Las historias están disponibles sólo con el plan Pro o Élite activo",
    );
  }
  return { business, access };
}

/** URL temporal para subir la foto o el video de una historia. */
export const generateStoryUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    await requireProBusiness(ctx, userId);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Publica una historia de 24 horas con la foto o el video subido. */
export const publish = mutation({
  args: {
    storageId: v.id("_storage"),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const { business } = await requireProBusiness(ctx, userId);

    const metadata = await ctx.storage.getMetadata(args.storageId);
    if (!metadata) throw new Error("No pudimos leer el archivo");
    const contentType = metadata.contentType ?? "";
    let kind: "image" | "video";
    if (contentType.startsWith("image/")) {
      kind = "image";
      if (metadata.size > MAX_IMAGE_BYTES) {
        throw new Error("La foto de la historia no puede pesar más de 8 MB");
      }
    } else if (contentType.startsWith("video/")) {
      kind = "video";
      if (metadata.size > MAX_VIDEO_BYTES) {
        throw new Error("El video de la historia no puede pesar más de 30 MB");
      }
    } else {
      throw new Error("Subí una foto o un video para la historia");
    }

    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("No pudimos publicar la historia");
    const caption = args.caption?.trim().slice(0, 140) || undefined;

    const active = await ctx.db
      .query("businessStories")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .collect();
    const now = Date.now();
    const live = active.filter((story) => story.expiresAt > now);
    if (live.length >= MAX_ACTIVE_PER_BUSINESS) {
      throw new Error("Borrá una historia antes de publicar otra");
    }

    const storyId = await ctx.db.insert("businessStories", {
      businessId: business._id,
      kind,
      url,
      storageId: args.storageId,
      ...(caption ? { caption } : {}),
      createdAt: now,
      expiresAt: now + STORY_TTL_MS,
    });
    return await ctx.db.get(storyId);
  },
});

/** Borra una historia del propio negocio. */
export const remove = mutation({
  args: { storyId: v.id("businessStories") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const business = await ownedBusiness(ctx, userId);
    if (!business) throw new Error("No tenés un negocio asociado");
    const story = await ctx.db.get(args.storyId);
    if (!story || story.businessId !== business._id) {
      throw new Error("Esa historia no es de tu negocio");
    }
    if (story.storageId) {
      try {
        await ctx.storage.delete(story.storageId);
      } catch {
        // Si el archivo ya no está, igual se borra la historia.
      }
    }
    await ctx.db.delete(args.storyId);
    return { deleted: true };
  },
});

/** Cambia el texto de una historia vigente del propio negocio. */
export const update = mutation({
  args: {
    storyId: v.id("businessStories"),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const business = await ownedBusiness(ctx, userId);
    if (!business) throw new Error("No tenés un negocio asociado");
    const story = await ctx.db.get(args.storyId);
    if (!story || story.businessId !== business._id) {
      throw new Error("Esa historia no es de tu negocio");
    }
    if (story.expiresAt <= Date.now()) {
      throw new Error("Esa historia ya venció");
    }
    const caption = args.caption?.trim().slice(0, 140) || undefined;
    await ctx.db.patch(args.storyId, { caption });
    return await ctx.db.get(args.storyId);
  },
});

/** Historias vigentes del negocio que está mirando su panel. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .first();
    if (!business) return [];
    const now = Date.now();
    const stories = await ctx.db
      .query("businessStories")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .collect();
    return stories
      .filter((story) => story.expiresAt > now)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Historias vigentes para compradores: negocios visibles con plan Pro o Élite
 * vigente, agrupadas por local y ordenadas por la historia más reciente.
 */
export const feed = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const stories = await ctx.db.query("businessStories").collect();
    const live = stories
      .filter((story) => story.expiresAt > now)
      .sort((a, b) => b.createdAt - a.createdAt);
    if (live.length === 0) return [];

    const byBusiness = new Map<string, Doc<"businessStories">[]>();
    for (const story of live) {
      const list = byBusiness.get(String(story.businessId)) ?? [];
      list.push(story);
      byBusiness.set(String(story.businessId), list);
    }

    const groups: Array<{
      businessId: Id<"businesses">;
      name: string;
      slug: string;
      image: string;
      stories: Array<{
        _id: Id<"businessStories">;
        kind: "image" | "video";
        url: string;
        caption?: string;
        createdAt: number;
        expiresAt: number;
      }>;
    }> = [];

    for (const [businessId, items] of byBusiness) {
      const business = await ctx.db.get(businessId as Id<"businesses">);
      if (!business || business.isDemo || !business.ownerId) continue;
      const [access, verified] = await Promise.all([
        subscriptionAccess(ctx, business.ownerId),
        isAccountVerified(ctx, business.ownerId),
      ]);
      if (!access.hasAccess || !verified) continue;
      if (access.plan !== "pro" && access.plan !== "elite") continue;
      groups.push({
        businessId: business._id,
        name: business.name,
        slug: business.slug,
        image: business.image,
        stories: items
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((story) => ({
            _id: story._id,
            kind: story.kind,
            url: story.url,
            caption: story.caption,
            createdAt: story.createdAt,
            expiresAt: story.expiresAt,
          })),
      });
    }

    return groups.sort(
      (a, b) =>
        b.stories[b.stories.length - 1].createdAt -
        a.stories[a.stories.length - 1].createdAt,
    );
  },
});

/** Limpieza diaria: borra historias vencidas y sus archivos. */
export const pruneExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("businessStories")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", now))
      .take(200);
    for (const story of expired) {
      if (story.storageId) {
        try {
          await ctx.storage.delete(story.storageId);
        } catch {
          // Si el archivo ya no está, igual se borra la fila.
        }
      }
      await ctx.db.delete(story._id);
    }
    return { deleted: expired.length };
  },
});
