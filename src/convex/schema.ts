import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// Capricho Express roles. Buyers swipe and order, businesses cook, couriers deliver.
export const ROLES = {
  BUYER: "buyer",
  BUSINESS: "business",
  COURIER: "courier",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.BUYER),
  v.literal(ROLES.BUSINESS),
  v.literal(ROLES.COURIER),
);
export type Role = Infer<typeof roleValidator>;

export const swipeDirectionValidator = v.union(
  v.literal("like"),
  v.literal("pass"),
  v.literal("save"),
);
export type SwipeDirection = Infer<typeof swipeDirectionValidator>;

export const promoKindValidator = v.union(
  v.literal("free_delivery"),
  v.literal("half_delivery"),
);
export type PromoKind = Infer<typeof promoKindValidator>;

export const orderStatusValidator = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("preparing"),
  v.literal("ready"),
  v.literal("picked_up"),
  v.literal("delivered"),
  v.literal("cancelled"),
);
export type OrderStatus = Infer<typeof orderStatusValidator>;

/** Punto exacto en el mapa (latitud/longitud) dentro de la zona de reparto. */
export const geoPointValidator = v.object({
  lat: v.number(),
  lng: v.number(),
});
export type GeoPoint = Infer<typeof geoPointValidator>;

export const orderItemValidator = v.object({
  productId: v.id("products"),
  name: v.string(),
  price: v.number(),
  quantity: v.number(),
  image: v.string(),
});

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
      phone: v.optional(v.string()),
      address: v.optional(v.string()),
      city: v.optional(v.string()),
      onboarded: v.optional(v.boolean()),
      // Single-use token that lets a guest carry their cart and orders over
      // when they decide to create an account.
      guestClaim: v.optional(v.string()),
      // Foto de portada del perfil (la de perfil va en `image`).
      coverImage: v.optional(v.string()),
      // Punto exacto donde el usuario recibe sus pedidos.
      location: v.optional(geoPointValidator),
    }).index("email", ["email"]), // index for the email. do not remove or modify

    businesses: defineTable({
      ownerId: v.optional(v.id("users")),
      name: v.string(),
      slug: v.string(),
      department: v.string(),
      category: v.string(),
      tagline: v.string(),
      image: v.string(),
      address: v.string(),
      // Dirección exacta fijada en el mapa por el negocio. Obligatoria para
      // los locales nuevos; los viejos se completan en la migración del seed.
      location: v.optional(geoPointValidator),
      // Campo heredado: el envío lo calcula la app según la distancia.
      deliveryFee: v.number(),
      // Promoción de envío que financia el local desde los ajustes de su
      // tienda. Ausente = sin promoción (el cliente paga el envío completo).
      // Se aplica a la parte del envío de su tienda en cada entrega y queda
      // registrada como gasto promocional, nunca como comisión de la app.
      deliveryPromo: v.optional(promoKindValidator),
      etaMinutes: v.number(),
      rating: v.number(),
      reviews: v.number(),
      isOpen: v.boolean(),
      isDemo: v.optional(v.boolean()),
    })
      .index("by_owner", ["ownerId"])
      .index("by_slug", ["slug"]),

    products: defineTable({
      businessId: v.id("businesses"),
      department: v.string(),
      name: v.string(),
      description: v.string(),
      price: v.number(),
      image: v.string(),
      category: v.string(),
      attributes: v.array(v.object({ key: v.string(), value: v.string() })),
      tags: v.array(v.string()),
      isAvailable: v.boolean(),
      isDemo: v.optional(v.boolean()),
    })
      .index("by_business", ["businessId"])
      .index("by_department", ["department"]),

    swipes: defineTable({
      userId: v.id("users"),
      productId: v.id("products"),
      direction: swipeDirectionValidator,
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_product", ["userId", "productId"]),

    cartItems: defineTable({
      userId: v.id("users"),
      productId: v.id("products"),
      businessId: v.id("businesses"),
      quantity: v.number(),
      addedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_product", ["userId", "productId"]),

    orders: defineTable({
      code: v.string(),
      // Compra que se partió en varias entregas (máximo 3 productos cada una).
      groupCode: v.optional(v.string()),
      batchIndex: v.optional(v.number()),
      batchCount: v.optional(v.number()),
      // Tiendas que se retiran en esta misma entrega (1 = sólo este local).
      tripStops: v.optional(v.number()),
      // Heredado: recargo por tienda adicional guardado aparte del envío.
      // Las órdenes nuevas ya lo incluyen repartido dentro de `deliveryFee`.
      extraStopFee: v.optional(v.number()),
      // El cliente pidió que el mismo repartidor haga todas las entregas.
      sameCourier: v.optional(v.boolean()),
      // Repartidor que tomó la primera entrega y queda reservado para el resto.
      reservedCourierId: v.optional(v.id("users")),
      buyerId: v.id("users"),
      businessId: v.id("businesses"),
      courierId: v.optional(v.id("users")),
      courierAcceptedAt: v.optional(v.number()),
      courierLocation: v.optional(geoPointValidator),
      courierLocationAt: v.optional(v.number()),
      items: v.array(orderItemValidator),
      subtotal: v.number(),
      deliveryFee: v.number(),
      // Parte del envío de esta tienda que cubrió su promoción. Es un gasto
      // promocional del local, no una comisión: su liquidación sigue siendo el
      // 100% del valor de sus productos menos lo que él mismo prometió cubrir.
      deliveryDiscount: v.optional(v.number()),
      total: v.number(),
      status: orderStatusValidator,
      address: v.string(),
      // Punto de entrega y distancia del repartidor que definieron la tarifa.
      deliveryLocation: v.optional(geoPointValidator),
      distanceKm: v.optional(v.number()),
      notes: v.optional(v.string()),
      createdAt: v.number(),
      acceptedAt: v.optional(v.number()),
      readyAt: v.optional(v.number()),
      pickedUpAt: v.optional(v.number()),
      deliveredAt: v.optional(v.number()),
      cancelledAt: v.optional(v.number()),
    })
      .index("by_buyer", ["buyerId"])
      .index("by_business", ["businessId"])
      .index("by_group", ["groupCode"])
      .index("by_courier", ["courierId"])
      .index("by_status", ["status"]),

    meta: defineTable({
      key: v.string(),
      value: v.string(),
    }).index("by_key", ["key"]),

    // Identidad visual de la plataforma que edita el perfil administrador.
    settings: defineTable({
      key: v.string(),
      logoUrl: v.optional(v.string()),
      logoSize: v.optional(v.number()),
      brandTitle: v.optional(v.string()),
      brandTitleColor: v.optional(v.string()),
      brandTitleFont: v.optional(v.string()),
      brandTitleSize: v.optional(v.number()),
      updatedAt: v.optional(v.number()),
    }).index("by_key", ["key"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
