import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  businessHourValidator,
  geoPointValidator,
  productBlockedSlotValidator,
  productOptionGroupValidator,
  promoKindValidator,
} from "./schema";
import { normalizeOptionGroups } from "../lib/productOptions";
import { normalizeSubcategory } from "../lib/departments";
import { planTier } from "../lib/subscriptions";
import { normalizeSinpeNumber } from "../lib/sinpe";
import {
  isBusinessOpenAt,
  normalizeBusinessHours,
  type BusinessHour,
} from "../lib/hours";
import { subscriptionAccess } from "./subscriptions";
import { isAccountVerified } from "./verification";
import {
  DELIVERY_RULES,
  deliveryQuote,
  isValidPoint,
  normalizePoint,
  straightLineKm,
  TILARAN_CENTER,
} from "../lib/delivery";
import type { GeoPoint } from "../lib/delivery";

type DbCtx = QueryCtx | MutationCtx;

/** Limpia los bloqueos de agenda: inicio < fin, con tope de 50 tramos. */
function normalizeBlockedSlots(
  slots:
    | Array<{ start: number; end: number; note?: string }>
    | undefined,
) {
  if (!slots) return [];
  return slots
    .filter(
      (slot) =>
        Number.isFinite(slot.start) &&
        Number.isFinite(slot.end) &&
        slot.end > slot.start,
    )
    .slice(0, 50)
    .map((slot) => ({
      start: Math.round(slot.start),
      end: Math.round(slot.end),
      ...(slot.note?.trim() ? { note: slot.note.trim().slice(0, 80) } : {}),
    }))
    .sort((a, b) => a.start - b.start);
}

/** True si la hora cae dentro de un tramo bloqueado por el local. */
export function isSlotBlocked(
  slots:
    | Array<{ start: number; end: number }>
    | undefined,
  at: number,
) {
  if (!slots) return false;
  return slots.some((slot) => at >= slot.start && at < slot.end);
}

const DEFAULT_DEPARTMENT = "comida";
const PRODUCT_VIDEO_MAX_BYTES = 30 * 1024 * 1024;
const PRODUCT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

/** Orden manual del catálogo; sin posición explícita manda la creación. */
function byProductOrder(a: Doc<"products">, b: Doc<"products">) {
  return (a.sortOrder ?? a._creationTime) - (b.sortOrder ?? b._creationTime);
}

const DEPARTMENT_IMAGES: Record<string, string> = {
  comida:
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80",
  ropa: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=900&q=80",
  zapatos:
    "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=900&q=80",
  perfumes:
    "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=900&q=80",
  belleza:
    "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=80",
  "cuidado-personal":
    "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=900&q=80",
  farmacia:
    "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=900&q=80",
  electronicos:
    "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=900&q=80",
  electrodomesticos:
    "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=900&q=80",
  muebles:
    "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=900&q=80",
  instrumentos:
    "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=900&q=80",
  herramientas:
    "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=900&q=80",
  supermercado:
    "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80",
};

/** The main facet of each department, used for the starter catalog. */
const PRIMARY_FACET: Record<string, string> = {
  comida: "cocina",
  ropa: "tipo",
  zapatos: "tipo",
  perfumes: "familia",
  belleza: "tipo",
  "cuidado-personal": "tipo",
  farmacia: "tipo",
  electronicos: "tipo",
  electrodomesticos: "tipo",
  muebles: "ambiente",
  instrumentos: "tipo",
  herramientas: "tipo",
  supermercado: "pasillo",
};

const DEPARTMENT_SLUGS = Object.keys(DEPARTMENT_IMAGES);

function departmentImage(department: string) {
  return DEPARTMENT_IMAGES[department] ?? DEPARTMENT_IMAGES[DEFAULT_DEPARTMENT];
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Valida el archivo y devuelve la URL pública del video del producto. */
async function productVideoUrl(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
) {
  const metadata = await ctx.storage.getMetadata(storageId);
  if (!metadata) throw new ConvexError("No pudimos leer el video");
  if (!metadata.contentType?.startsWith("video/")) {
    throw new ConvexError("El archivo tiene que ser un video");
  }
  if (metadata.size > PRODUCT_VIDEO_MAX_BYTES) {
    throw new ConvexError("El video no puede pesar más de 30 MB");
  }
  const url = await ctx.storage.getUrl(storageId);
  if (!url) throw new ConvexError("No pudimos guardar el video");
  return url;
}

/** Valida la imagen y devuelve la URL pública del producto. */
async function productImageUrl(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
) {
  const metadata = await ctx.storage.getMetadata(storageId);
  if (!metadata) throw new ConvexError("No pudimos leer la imagen");
  if (!metadata.contentType?.startsWith("image/")) {
    throw new ConvexError("El archivo tiene que ser una imagen");
  }
  if (metadata.size > PRODUCT_IMAGE_MAX_BYTES) {
    throw new ConvexError("La imagen no puede pesar más de 8 MB");
  }
  const url = await ctx.storage.getUrl(storageId);
  if (!url) throw new ConvexError("No pudimos guardar la imagen");
  return url;
}

/** El video del producto es un beneficio sólo del plan Élite vigente. */
async function requireEliteVideo(ctx: DbCtx, userId: Id<"users">) {
  const access = await subscriptionAccess(ctx, userId);
  if (access.plan !== "elite" || !access.hasAccess) {
    throw new ConvexError(
      "El video del producto está disponible sólo con la suscripción Élite activa",
    );
  }
}

/** Puerta común de beneficios sólo del plan Élite vigente. */
async function requireElitePlan(ctx: DbCtx, userId: Id<"users">, message: string) {
  const access = await subscriptionAccess(ctx, userId);
  if (access.plan !== "elite" || !access.hasAccess) {
    throw new ConvexError(message);
  }
}

/** Oferta flash visible: título corto, detalle y vencimiento futuro. */
function activeFlash(business: Doc<"businesses">, now = Date.now()) {
  const title = business.flashTitle?.trim() ?? "";
  const detail = business.flashDetail?.trim() ?? "";
  const endsAt = business.flashEndsAt ?? 0;
  if (!title || endsAt <= now) return null;
  return { title, detail, endsAt };
}

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

/** Punto de entrega guardado por quien está mirando el catálogo. */
async function viewerLocation(ctx: DbCtx): Promise<GeoPoint | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  return isValidPoint(user?.location) ? user.location : null;
}

/**
 * Envío que ve el comprador para un local: precio y distancia cuando ya fijó
 * su punto de entrega, o el precio base como referencia.
 */
function describeDelivery(
  businessLocation: GeoPoint | undefined,
  viewer: GeoPoint | null,
) {
  const base = {
    feeFrom: DELIVERY_RULES.baseFee,
    fee: null as number | null,
    distanceKm: null as number | null,
    minutes: null as number | null,
    available: true,
  };
  if (!viewer) return base;
  const quote = deliveryQuote(businessLocation, viewer);
  if (!quote) return { ...base, available: false };
  return {
    ...base,
    fee: quote.fee,
    distanceKm: quote.distanceKm,
    minutes: quote.minutes,
  };
}

/** Tilarán (y alrededores) mientras la app no se expanda a otros cantones. */
function assertInsideBusinessArea(location: GeoPoint) {
  const distance = straightLineKm(TILARAN_CENTER, location);
  if (distance > DELIVERY_RULES.businessAreaKm) {
    throw new Error(
      "Por ahora solo aceptamos locales en Tilarán y sus alrededores",
    );
  }
}

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .first();
    if (!business) return null;
    const products = await ctx.db
      .query("products")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .collect();
    products.sort(byProductOrder);
    return { business, products };
  },
});

/**
 * Modo negocios: todos los locales con su rubro y cuánto catálogo tienen.
 * El filtrado por categoría, subcategoría y búsqueda por nombre se resuelve
 * en el cliente para que la búsqueda responda al instante.
 */
export const directory = query({
  args: {},
  handler: async (ctx) => {
    const viewerId = await getAuthUserId(ctx);
    const viewerDoc = viewerId ? await ctx.db.get(viewerId) : null;
    const favorites = new Set(
      (viewerDoc?.favoriteBusinessIds ?? []).map(String),
    );
    const businesses = await ctx.db.query("businesses").collect();
    const products = await ctx.db.query("products").collect();
    const viewer = await viewerLocation(ctx);

    const productSearch = new Map<string, Array<{ name: string; category: string; price: number }>>();
    for (const product of products) {
      const items = productSearch.get(product.businessId) ?? [];
      if (product.isAvailable) {
        items.push({ name: product.name, category: product.category, price: product.price });
      }
      productSearch.set(product.businessId, items);
    }

    const stats = new Map<string, { count: number; minPrice: number | null }>();
    for (const product of products) {
      const entry = stats.get(product.businessId) ?? {
        count: 0,
        minPrice: null,
      };
      if (product.isAvailable) {
        entry.count += 1;
        entry.minPrice =
          entry.minPrice === null
            ? product.price
            : Math.min(entry.minPrice, product.price);
      }
      stats.set(product.businessId, entry);
    }

    // Los locales con suscripción vencida no se muestran ni reciben pedidos;
    // los planes Pro y Élite se destacan en el orden.
    const accessByBusiness = new Map<
      string,
      { allowed: boolean; tier: number }
    >();
    for (const business of businesses) {
      if (business.isDemo || !business.ownerId) {
        accessByBusiness.set(business._id, { allowed: true, tier: 1 });
        continue;
      }
      const [access, verified] = await Promise.all([
        subscriptionAccess(ctx, business.ownerId),
        isAccountVerified(ctx, business.ownerId),
      ]);
      accessByBusiness.set(business._id, {
        allowed: access.hasAccess && verified,
        tier: planTier(access.plan),
      });
    }

    return businesses
      .filter((business) => accessByBusiness.get(business._id)?.allowed ?? true)
      .map((business) => {
        const entry = stats.get(business._id);
        const verified = Boolean(business.verifiedAt);
        const elite = accessByBusiness.get(business._id)?.tier === 3;
        return {
          _id: business._id,
          name: business.name,
          slug: business.slug,
          tagline: business.tagline,
          image: business.image,
          department: business.department ?? DEFAULT_DEPARTMENT,
          category: business.category,
          rating: business.rating,
          reviews: business.reviews,
          verified,
          isFavorite: favorites.has(String(business._id)),
          isOpen: business.isOpen,
          elite,
          // Sello Élite verificado: plan Élite vigente + cuenta verificada.
          eliteVerified: elite && verified,
          // La oferta flash sólo existe si el local es Élite ahora mismo.
          flash: elite ? activeFlash(business) : null,
          etaMinutes: business.etaMinutes,
          delivery: describeDelivery(business.location, viewer),
          promo: business.deliveryPromo ?? null,
          address: business.address,
          location: business.location ?? null,
          productCount: entry?.count ?? 0,
          minPrice: entry?.minPrice ?? null,
          productSearch: productSearch.get(business._id) ?? [],
        };
      })
      .sort((a, b) => {
        // Élite comparte la prioridad de Pro: su diferencial son las cards
        // animadas, no una primera posición garantizada.
        const priority = (id: Id<"businesses">) =>
          Math.min(2, accessByBusiness.get(id)?.tier ?? 1);
        return (
          Number(b.isOpen) - Number(a.isOpen) ||
          priority(b._id) - priority(a._id) ||
          b.rating - a.rating ||
          a.name.localeCompare(b.name)
        );
      });
  },
});

/** Catálogo completo de venta de un local, agrupable por rubro. */
export const toggleFavorite = mutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    // ConvexError conserva el mensaje para la persona; un Error plano se
    // reemplaza por "Server Error" en producción y no dice nada útil.
    if (!userId) {
      throw new ConvexError("Iniciá sesión para guardar locales favoritos");
    }
    const user = await ctx.db.get(userId);
    if (!user || user.isAnonymous) {
      throw new ConvexError(
        "Creá una cuenta para guardar tus locales favoritos",
      );
    }
    if (!(await ctx.db.get(args.businessId))) {
      throw new ConvexError("Ese local ya no existe");
    }
    const favorites = user.favoriteBusinessIds ?? [];
    const exists = favorites.includes(args.businessId);
    await ctx.db.patch(userId, {
      favoriteBusinessIds: exists
        ? favorites.filter((id) => id !== args.businessId)
        : [...favorites, args.businessId],
    });
    return { favorite: !exists };
  },
});

export const favorites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user?.favoriteBusinessIds?.length) return [];
    const viewer = isValidPoint(user.location) ? user.location : null;
    const results = [];
    for (const businessId of user.favoriteBusinessIds) {
      const business = await ctx.db.get(businessId);
      if (!business) continue;
      const access =
        business.isDemo || !business.ownerId
          ? { hasAccess: true }
          : await subscriptionAccess(ctx, business.ownerId);
      const verified =
        business.isDemo || !business.ownerId
          ? true
          : await isAccountVerified(ctx, business.ownerId);
      if (!access.hasAccess || !verified) continue;
      const products = await ctx.db
        .query("products")
        .withIndex("by_business", (q) => q.eq("businessId", business._id))
        .collect();
      const available = products.filter(
        (product) => product.isAvailable && business.isOpen,
      );
      results.push({
        _id: business._id,
        slug: business.slug,
        name: business.name,
        image: business.image,
        category: business.category,
        tagline: business.tagline,
        rating: business.rating,
        isOpen: business.isOpen,
        delivery: describeDelivery(business.location, viewer),
        promo: business.deliveryPromo ?? null,
        productCount: available.length,
        minPrice:
          available.length > 0
            ? Math.min(...available.map((product) => product.price))
            : null,
      });
    }
    return results;
  },
});

export const storefront = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!business) return null;

    const products = await ctx.db
      .query("products")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .collect();

    const viewer = await viewerLocation(ctx);

    const userId = await getAuthUserId(ctx);
    const viewerDoc = userId ? await ctx.db.get(userId) : null;
    const verified = Boolean(business.verifiedAt);
    const ownerAccess =
      business.isDemo || !business.ownerId
        ? { hasAccess: false, plan: "basico" as const }
        : await subscriptionAccess(ctx, business.ownerId);
    const elite = ownerAccess.plan === "elite" && ownerAccess.hasAccess;
    return {
      business: {
        ...business,
        verified,
        elite,
        eliteVerified: elite && verified,
        flash: elite ? activeFlash(business) : null,
        isFavorite: Boolean(
          viewerDoc?.favoriteBusinessIds?.includes(business._id),
        ),
      },
      delivery: describeDelivery(business.location, viewer),
      products: products
        .sort(
          (a, b) =>
            a.category.localeCompare(b.category) || byProductOrder(a, b),
        )
        .map((product) => ({
          _id: product._id,
          name: product.name,
          description: product.description,
          price: product.price,
          image: product.image,
          video: product.video ?? null,
          category: normalizeSubcategory(product.category),
          optionGroups: product.optionGroups ?? [],
          tags: product.tags,
          isAvailable: product.isAvailable,
          promo: business.deliveryPromo ?? null,
        })),
    };
  },
});

/** URL temporal para subir la portada del local desde la galería. */
export const generateCoverUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** URL temporal para subir una imagen de producto desde la galería. */
export const generateProductImageUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    if (!(await ownedBusiness(ctx, userId))) {
      throw new ConvexError("No tenés un negocio asociado");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

/** URL temporal para subir el video de un producto (sólo plan Élite vigente). */
export const generateProductVideoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    if (!(await ownedBusiness(ctx, userId))) {
      throw new ConvexError("No tenés un negocio asociado");
    }
    await requireEliteVideo(ctx, userId);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Oferta flash Élite: anuncio corto con cuenta regresiva. Dura como máximo
 * 24 horas y sólo se muestra mientras el plan Élite está vigente.
 */
export const setFlashSale = mutation({
  args: {
    title: v.optional(v.string()),
    detail: v.optional(v.string()),
    durationHours: v.optional(v.number()),
    clear: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const business = await ownedBusiness(ctx, userId);
    if (!business) throw new ConvexError("No tenés un negocio asociado");
    await requireElitePlan(
      ctx,
      userId,
      "Las ofertas flash están disponibles sólo con la suscripción Élite activa",
    );
    if (args.clear) {
      await ctx.db.patch(business._id, {
        flashTitle: undefined,
        flashDetail: undefined,
        flashEndsAt: undefined,
      });
      return { endsAt: null as number | null, cleared: true };
    }
    const title = (args.title ?? "").trim().slice(0, 60);
    if (title.length < 3) {
      throw new ConvexError("Poné un título corto para la oferta flash");
    }
    const detail = (args.detail ?? "").trim().slice(0, 140);
    const duration = Math.round(args.durationHours ?? 4);
    if (!Number.isFinite(duration) || duration < 1 || duration > 24) {
      throw new ConvexError("La oferta flash puede durar de 1 a 24 horas");
    }
    const endsAt = Date.now() + duration * 60 * 60 * 1000;
    await ctx.db.patch(business._id, {
      flashTitle: title,
      flashDetail: detail || undefined,
      flashEndsAt: endsAt,
    });
    return { endsAt };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    department: v.string(),
    category: v.string(),
    tagline: v.string(),
    address: v.string(),
    location: geoPointValidator,
    etaMinutes: v.number(),
    addStarterMenu: v.optional(v.boolean()),
    // Imagen de portada subida desde la galería; si falta, se usa la del rubro.
    coverStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ownedBusiness(ctx, userId);
    if (existing) return { businessId: existing._id };

    const name = args.name.trim();
    if (name.length < 2) throw new Error("Poné un nombre de negocio válido");
    if (args.address.trim().length < 5) {
      throw new Error("Necesitamos una dirección del local");
    }
    if (!isValidPoint(args.location)) {
      throw new Error("Marcá la ubicación exacta del local en el mapa");
    }
    const location = normalizePoint(args.location);
    assertInsideBusinessArea(location);
    const department = DEPARTMENT_SLUGS.includes(args.department)
      ? args.department
      : DEFAULT_DEPARTMENT;
    const category = args.category.trim() || "General";

    const coverUrl = args.coverStorageId
      ? await ctx.storage.getUrl(args.coverStorageId)
      : null;
    const businessId = await ctx.db.insert("businesses", {
      ownerId: userId,
      name,
      slug: `${slugify(name) || "capricho"}-${Math.floor(Math.random() * 900 + 100)}`,
      department,
      category,
      tagline: args.tagline.trim() || "Productos elegidos con criterio",
      image: coverUrl ?? departmentImage(department),
      address: args.address.trim(),
      location,
      // Heredado: el envío se calcula por distancia, no lo define el local.
      deliveryFee: 0,
      etaMinutes: Math.max(5, Math.round(args.etaMinutes)),
      rating: 5,
      reviews: 0,
      isOpen: true,
    });

    await ctx.db.patch(userId, {
      role: "business",
      onboarded: true,
      address: args.address.trim(),
    });

    if (args.addStarterMenu !== false) {
      const image = departmentImage(department);
      const primaryFacet = PRIMARY_FACET[department] ?? "tipo";
      const isFood = department === DEFAULT_DEPARTMENT;
      const starters = isFood
        ? [
            {
              name: "Especial de la casa",
              description:
                "La receta que nos hizo conocidos. Preparada al momento con ingredientes frescos.",
              price: 8900,
              tags: ["Más pedido"],
            },
            {
              name: "Opción clásica",
              description:
                "El clásico que nunca falla, con nuestra salsa insignia y guarnición.",
              price: 6900,
              tags: ["Clásico"],
            },
            {
              name: "Para compartir",
              description:
                "Porción generosa para dos personas, ideal para probar la carta.",
              price: 12900,
              tags: ["Para compartir"],
            },
          ]
        : [
            {
              name: "Producto destacado",
              description:
                "Nuestra pieza insignia, elegida por la mayoría de los clientes.",
              price: 28900,
              tags: ["Más vendido"],
            },
            {
              name: "Opción clásica",
              description:
                "El básico que siempre funciona, con la calidad de la casa.",
              price: 18900,
              tags: ["Clásico"],
            },
            {
              name: "Ideal para regalar",
              description:
                "Presentación cuidada y lista para sorprender a alguien.",
              price: 34900,
              tags: ["Regalo"],
            },
          ];

      for (const starter of starters) {
        await ctx.db.insert("products", {
          businessId,
          department,
          name: starter.name,
          description: starter.description,
          price: starter.price,
          image,
          category,
          attributes: [{ key: primaryFacet, value: category }],
          tags: starter.tags,
          isAvailable: true,
        });
      }
    }

    return { businessId };
  },
});

export const update = mutation({
  args: {
    name: v.optional(v.string()),
    tagline: v.optional(v.string()),
    address: v.optional(v.string()),
    location: v.optional(geoPointValidator),
    etaMinutes: v.optional(v.number()),
    isOpen: v.optional(v.boolean()),
    image: v.optional(v.string()),
    // Portada nueva subida desde la galería. Tiene prioridad sobre `image`.
    coverStorageId: v.optional(v.id("_storage")),
    // Horario semanal. null = se borra y vuelve el control manual.
    hours: v.optional(v.union(v.array(businessHourValidator), v.null())),
    // Promoción de envío del local. null = queda sin promoción.
    deliveryPromo: v.optional(v.union(promoKindValidator, v.null())),
    // Cobro directo por SINPE Móvil. Se guardan 8 dígitos y son obligatorios
    // cuando la tienda guarda sus ajustes de cobro.
    sinpePhone: v.optional(v.string()),
    whatsappPhone: v.optional(v.string()),
    pickupInstructions: v.optional(v.string()),
    packagingInstructions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const business = await ownedBusiness(ctx, userId);
    if (!business) throw new Error("No tenés un negocio asociado");

    const patch: Partial<Doc<"businesses">> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.tagline !== undefined) patch.tagline = args.tagline.trim();
    if (args.address !== undefined) patch.address = args.address.trim();
    if (args.location !== undefined) {
      if (!isValidPoint(args.location)) {
        throw new Error("Marcá la ubicación exacta del local en el mapa");
      }
      const location = normalizePoint(args.location);
      assertInsideBusinessArea(location);
      patch.location = location;
    }
    if (args.etaMinutes !== undefined)
      patch.etaMinutes = Math.max(5, Math.round(args.etaMinutes));

    // El horario manda sobre el interruptor: se recalcula el estado actual
    // cada vez que se guarda, y el cron lo mantiene al día después.
    let nextHours: BusinessHour[] | undefined = business.hours;
    if (args.hours !== undefined) {
      if (args.hours === null) {
        patch.hours = undefined;
        nextHours = undefined;
      } else {
        let normalized: BusinessHour[];
        try {
          normalized = normalizeBusinessHours(args.hours);
        } catch (error) {
          throw new ConvexError(
            error instanceof Error ? error.message : "El horario no es válido",
          );
        }
        if (normalized.length > 0) {
          patch.hours = normalized;
          nextHours = normalized;
        } else {
          patch.hours = undefined;
          nextHours = undefined;
        }
      }
    }
    if (args.isOpen !== undefined) {
      if (nextHours?.length) {
        throw new ConvexError(
          "Tu local se abre y cierra solo según el horario configurado",
        );
      }
      patch.isOpen = args.isOpen;
    } else if (nextHours?.length) {
      patch.isOpen = isBusinessOpenAt(nextHours);
    }

    if (args.image !== undefined && args.image.trim().length > 0)
      patch.image = args.image.trim();
    if (args.coverStorageId) {
      const coverUrl = await ctx.storage.getUrl(args.coverStorageId);
      if (!coverUrl) throw new Error("No pudimos guardar la portada");
      patch.image = coverUrl;
    }
    if (args.deliveryPromo !== undefined)
      patch.deliveryPromo = args.deliveryPromo ?? undefined;

    // Los números se piden juntos: sin SINPE y WhatsApp el comprador no puede
    // pagar ni enviar el comprobante. El interruptor de abierto/cerrado no
    // envía estos campos, así que los locales viejos igual pueden operar
    // mientras completan sus ajustes.
    let nextSinpe = business.sinpePhone;
    let nextWhatsapp = business.whatsappPhone;
    if (args.sinpePhone !== undefined) {
      const sinpe = normalizeSinpeNumber(args.sinpePhone);
      if (!sinpe) {
        throw new ConvexError(
          "El número de SINPE Móvil debe tener 8 dígitos (ej. 8888-1234)",
        );
      }
      patch.sinpePhone = sinpe;
      nextSinpe = sinpe;
    }
    if (args.whatsappPhone !== undefined) {
      const whatsapp = normalizeSinpeNumber(args.whatsappPhone);
      if (!whatsapp) {
        throw new ConvexError(
          "El número de WhatsApp debe tener 8 dígitos (ej. 8888-1234)",
        );
      }
      patch.whatsappPhone = whatsapp;
      nextWhatsapp = whatsapp;
    }
    if (
      (args.sinpePhone !== undefined || args.whatsappPhone !== undefined) &&
      (!nextSinpe || !nextWhatsapp)
    ) {
      throw new ConvexError(
        "Agregá el SINPE Móvil y el WhatsApp de la tienda: son obligatorios para recibir pagos",
      );
    }

    if (args.pickupInstructions !== undefined) {
      const instructions = args.pickupInstructions.trim();
      if (instructions.length > 500) {
        throw new Error("Las instrucciones de retiro no pueden pasar de 500 caracteres");
      }
      patch.pickupInstructions = instructions || undefined;
    }
    if (args.packagingInstructions !== undefined) {
      const instructions = args.packagingInstructions.trim();
      if (instructions.length > 500) {
        throw new Error("Las instrucciones de empaque no pueden pasar de 500 caracteres");
      }
      patch.packagingInstructions = instructions || undefined;
    }

    await ctx.db.patch(business._id, patch);
    return null;
  },
});

/**
 * Mantiene `isOpen` alineado con el horario de cada local. Lo llama el cron
 * cada minuto: así el interruptor, el directorio y el carrito cambian solos
 * al llegar la hora de apertura o cierre.
 */
export const syncOpenState = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const businesses = await ctx.db.query("businesses").collect();
    let updated = 0;

    for (const business of businesses) {
      if (!business.hours?.length) continue;
      const nextOpen = isBusinessOpenAt(business.hours, now);
      if (business.isOpen !== nextOpen) {
        await ctx.db.patch(business._id, { isOpen: nextOpen });
        updated += 1;
      }
    }

    return { updated };
  },
});

export const addProduct = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    price: v.number(),
    category: v.string(),
    image: v.optional(v.string()),
    // Imagen subida desde la galería; tiene prioridad sobre la URL.
    imageStorageId: v.optional(v.id("_storage")),
    // Video subido desde la galería; sólo plan Élite vigente.
    videoStorageId: v.optional(v.id("_storage")),
    tags: v.optional(v.array(v.string())),
    attributes: v.optional(
      v.array(v.object({ key: v.string(), value: v.string() })),
    ),
    optionGroups: v.optional(v.array(productOptionGroupValidator)),
    stockEnabled: v.optional(v.boolean()),
    stock: v.optional(v.number()),
    reservable: v.optional(v.boolean()),
    blockedSlots: v.optional(v.array(productBlockedSlotValidator)),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const business = await ownedBusiness(ctx, userId);
    if (!business) throw new Error("No tenés un negocio asociado");
    const name = args.name.trim();
    if (name.length < 2) throw new Error("El producto necesita un nombre");
    if (args.price <= 0) throw new Error("El precio tiene que ser mayor a 0");
    const department = business.department ?? DEFAULT_DEPARTMENT;
    const uploadedImage = args.imageStorageId
      ? await productImageUrl(ctx, args.imageStorageId)
      : null;
    if (args.videoStorageId) await requireEliteVideo(ctx, userId);
    const video = args.videoStorageId
      ? await productVideoUrl(ctx, args.videoStorageId)
      : undefined;
    const optionGroups = normalizeOptionGroups(args.optionGroups);
    const stockEnabled = args.stockEnabled ?? false;
    const stock = stockEnabled ? Math.max(0, Math.floor(args.stock ?? 0)) : undefined;
    const blockedSlots = normalizeBlockedSlots(args.blockedSlots);

    const productId = await ctx.db.insert("products", {
      businessId: business._id,
      department,
      name,
      description: args.description.trim(),
      price: Math.round(args.price),
      image:
        uploadedImage ||
        args.image?.trim() ||
        departmentImage(department) ||
        business.image,
      ...(video ? { video } : {}),
      category: args.category.trim() || "General",
      attributes: args.attributes ?? [],
      ...(optionGroups.length > 0 ? { optionGroups } : {}),
      tags: args.tags ?? [],
      isAvailable: true,
      sortOrder: Date.now(),
      ...(stockEnabled ? { stockEnabled: true, stock: stock ?? 0 } : {}),
      ...(args.reservable ? { reservable: true } : {}),
      ...(blockedSlots.length > 0 ? { blockedSlots } : {}),
    });
    await ctx.scheduler.runAfter(0, internal.marketing.announceNewProduct, {
      productId,
    });
    return { productId };
  },
});

export const updateProduct = mutation({
  args: {
    productId: v.id("products"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    price: v.optional(v.number()),
    category: v.optional(v.string()),
    image: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    videoStorageId: v.optional(v.id("_storage")),
    removeVideo: v.optional(v.boolean()),
    isAvailable: v.optional(v.boolean()),
    attributes: v.optional(
      v.array(v.object({ key: v.string(), value: v.string() })),
    ),
    optionGroups: v.optional(v.array(productOptionGroupValidator)),
    stockEnabled: v.optional(v.boolean()),
    stock: v.optional(v.number()),
    reservable: v.optional(v.boolean()),
    blockedSlots: v.optional(v.array(productBlockedSlotValidator)),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const business = await ownedBusiness(ctx, userId);
    if (!business) throw new Error("No tenés un negocio asociado");
    const product = await ctx.db.get(args.productId);
    if (!product || product.businessId !== business._id) {
      throw new Error("Ese producto no pertenece a tu negocio");
    }

    const patch: Partial<Doc<"products">> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined)
      patch.description = args.description.trim();
    if (args.price !== undefined) patch.price = Math.round(args.price);
    if (args.category !== undefined) patch.category = args.category.trim();
    if (args.stockEnabled !== undefined) patch.stockEnabled = args.stockEnabled;
    if (args.stock !== undefined)
      patch.stock = Math.max(0, Math.floor(args.stock));
    if (args.reservable !== undefined) patch.reservable = args.reservable;
    if (args.blockedSlots !== undefined)
      patch.blockedSlots = normalizeBlockedSlots(args.blockedSlots);
    if (args.imageStorageId) {
      patch.image = await productImageUrl(ctx, args.imageStorageId);
    } else if (args.image !== undefined && args.image.trim().length > 0) {
      patch.image = args.image.trim();
    }
    if (args.removeVideo) patch.video = undefined;
    if (args.videoStorageId) {
      await requireEliteVideo(ctx, userId);
      patch.video = await productVideoUrl(ctx, args.videoStorageId);
    }
    if (args.isAvailable !== undefined) patch.isAvailable = args.isAvailable;
    if (args.attributes !== undefined) patch.attributes = args.attributes;
    if (args.optionGroups !== undefined) {
      const groups = normalizeOptionGroups(args.optionGroups);
      patch.optionGroups = groups.length > 0 ? groups : undefined;
    }

    await ctx.db.patch(args.productId, patch);
    return null;
  },
});

/** Copia un producto del mismo negocio para editarlo como uno nuevo. */
export const duplicateProduct = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const business = await ownedBusiness(ctx, userId);
    if (!business) throw new Error("No tenés un negocio asociado");
    const product = await ctx.db.get(args.productId);
    if (!product || product.businessId !== business._id) {
      throw new Error("Ese producto no pertenece a tu negocio");
    }

    // El video sigue siendo exclusivo de Élite vigente: si la cuenta perdió
    // el acceso, la copia se crea sin video.
    let video = product.video;
    if (video) {
      const access = await subscriptionAccess(ctx, userId);
      if (access.plan !== "elite" || !access.hasAccess) video = undefined;
    }

    const productId = await ctx.db.insert("products", {
      businessId: business._id,
      department: product.department,
      name: `Copia de ${product.name}`,
      description: product.description,
      price: product.price,
      image: product.image,
      ...(video ? { video } : {}),
      category: product.category,
      attributes: product.attributes,
      ...(product.optionGroups?.length
        ? { optionGroups: product.optionGroups }
        : {}),
      tags: product.tags,
      isAvailable: product.isAvailable,
      sortOrder: Date.now(),
      ...(product.stockEnabled ? { stockEnabled: true, stock: product.stock ?? 0 } : {}),
      ...(product.reservable ? { reservable: true } : {}),
      ...(product.blockedSlots?.length ? { blockedSlots: product.blockedSlots } : {}),
    });
    return await ctx.db.get(productId);
  },
});

/** Guarda el orden en que el local arrastró sus productos. */
export const reorderProducts = mutation({
  args: { productIds: v.array(v.id("products")) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const business = await ownedBusiness(ctx, userId);
    if (!business) throw new Error("No tenés un negocio asociado");
    const products = await ctx.db
      .query("products")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .collect();
    if (args.productIds.length !== products.length) {
      throw new Error(
        "La lista cambió mientras movías el producto. Probá otra vez.",
      );
    }
    const ownedIds = new Set(products.map((product) => product._id));
    const seen = new Set<Id<"products">>();
    for (const productId of args.productIds) {
      if (!ownedIds.has(productId) || seen.has(productId)) {
        throw new Error("El orden incluye un producto inválido");
      }
      seen.add(productId);
    }
    await Promise.all(
      args.productIds.map((productId, index) =>
        ctx.db.patch(productId, { sortOrder: index * 1000 }),
      ),
    );
    return null;
  },
});

export const removeProduct = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const business = await ownedBusiness(ctx, userId);
    if (!business) throw new Error("No tenés un negocio asociado");
    const product = await ctx.db.get(args.productId);
    if (!product || product.businessId !== business._id) {
      throw new Error("Ese producto no pertenece a tu negocio");
    }
    await ctx.db.delete(args.productId);
    return { deleted: true };
  },
});

/** Agenda de un producto reservable: bloqueos manuales + reservas vigentes.
 * La usa el local para editar qué días/horas no están disponibles y el
 * comprador para elegir sólo horarios libres. */
export const productAvailability = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) return null;
    const blocked = (product.blockedSlots ?? []).slice().sort((a, b) => a.start - b.start);
    const booked: Array<{ at: number; code: string; quantity: number }> = [];
    const orders = await ctx.db.query("orders").collect();
    for (const order of orders) {
      if (order.status === "cancelled" || order.status === "delivered") continue;
      if (!order.scheduledFor) continue;
      if (!order.items.some((item) => item.productId === product._id)) continue;
      booked.push({
        at: order.scheduledFor,
        code: order.code,
        quantity: order.items
          .filter((item) => item.productId === product._id)
          .reduce((sum, item) => sum + item.quantity, 0),
      });
    }
    booked.sort((a, b) => a.at - b.at);
    return {
      stockEnabled: product.stockEnabled ?? false,
      stock: product.stock ?? null,
      reservable: product.reservable ?? false,
      blocked,
      booked: booked.slice(0, 50),
    };
  },
});
