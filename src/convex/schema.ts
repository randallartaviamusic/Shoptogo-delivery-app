import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// Shop To Go roles. Buyers swipe and order, businesses cook, couriers deliver.
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

/** Un tramo de atención semanal: día 0 = domingo, 1 = lunes ... 6 = sábado. */
export const businessHourValidator = v.object({
  day: v.number(),
  open: v.string(),
  close: v.string(),
});
export type BusinessHour = Infer<typeof businessHourValidator>;

/** Suscripción mensual: tres planes de precio fijo, sin comisión por venta. */
export const subscriptionPlanValidator = v.union(
  v.literal("basico"),
  v.literal("pro"),
  v.literal("elite"),
);
export type SubscriptionPlanId = Infer<typeof subscriptionPlanValidator>;

export const subscriptionRoleValidator = v.union(
  v.literal("business"),
  v.literal("courier"),
);
export type SubscriptionRole = Infer<typeof subscriptionRoleValidator>;

export const subscriptionMethodValidator = v.union(
  v.literal("sinpe"),
  v.literal("onvo"),
  v.literal("cash"),
  v.literal("deposit"),
);
export type SubscriptionMethod = Infer<typeof subscriptionMethodValidator>;

export const subscriptionPaymentStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
);
export type SubscriptionPaymentStatus = Infer<
  typeof subscriptionPaymentStatusValidator
>;

export const verificationStatusValidator = v.union(
  v.literal("unverified"),
  v.literal("pending"),
  v.literal("verified"),
  v.literal("rejected"),
);
export type VerificationStatus = Infer<typeof verificationStatusValidator>;

export const supportCategoryValidator = v.union(
  // Problemas con el pago en efectivo o una diferencia de monto.
  v.literal("payment"),
  // Producto faltante, incorrecto o en mal estado.
  v.literal("product"),
  // El punto o la dirección de entrega no coincide.
  v.literal("address"),
  // El pedido no llegó o el repartidor no pudo entregarlo.
  v.literal("delivery"),
  v.literal("account"),
  v.literal("other"),
);
export type SupportCategory = Infer<typeof supportCategoryValidator>;

export const supportStatusValidator = v.union(
  v.literal("open"),
  v.literal("in_review"),
  v.literal("resolved"),
);
export type SupportStatus = Infer<typeof supportStatusValidator>;

export const cashIssueKindValidator = v.union(
  // El cliente pagó menos de lo que correspondía.
  v.literal("shortfall"),
  // El repartidor entregó menos al local.
  v.literal("incomplete"),
  // Devolución de efectivo por un pedido cancelado.
  v.literal("refund"),
  // Reclamo de cualquiera de las partes.
  v.literal("claim"),
);
export type CashIssueKind = Infer<typeof cashIssueKindValidator>;

export const notificationKindValidator = v.union(
  v.literal("new_order"),
  v.literal("order_ready"),
  v.literal("courier_assigned"),
  v.literal("order_update"),
);
export type NotificationKind = Infer<typeof notificationKindValidator>;

export const notificationChannelValidator = v.union(
  v.literal("whatsapp"),
  v.literal("webhook"),
);
export type NotificationChannel = Infer<
  typeof notificationChannelValidator
>;

export const notificationRoleValidator = v.union(
  v.literal("buyer"),
  v.literal("business"),
  v.literal("courier"),
);
export type NotificationRole = Infer<typeof notificationRoleValidator>;

export const notificationStatusValidator = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("skipped"),
  v.literal("failed"),
);
export type NotificationStatus = Infer<typeof notificationStatusValidator>;

export const offerStatusValidator = v.union(
  v.literal("open"),
  v.literal("accepted"),
  v.literal("expired"),
  v.literal("declined"),
);
export type OfferStatus = Infer<typeof offerStatusValidator>;

/** Quién canceló un pedido: sirve para separar faltas propias de las ajenas. */
export const cancellationActorValidator = v.union(
  v.literal("buyer"),
  v.literal("business"),
  v.literal("system"),
);
export type CancellationActor = Infer<typeof cancellationActorValidator>;

/** Cupón que financia el local: nunca es una comisión de la plataforma. */
export const couponKindValidator = v.union(
  v.literal("percent"),
  v.literal("amount"),
);
export type CouponKind = Infer<typeof couponKindValidator>;

export const deliveryProofValidator = v.object({
  storageId: v.id("_storage"),
  url: v.string(),
  at: v.number(),
  by: v.id("users"),
});

/** Confirmación del comprador (PIN) y del repartidor (cierre del pedido). */
export const deliveryConfirmationValidator = v.object({
  buyerPinVerifiedAt: v.number(),
  courierConfirmedAt: v.number(),
  courierId: v.id("users"),
});

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
      // El usuario aceptó recibir avisos del pedido por WhatsApp. Se pide
      // explícitamente en el perfil: sin esto no se le escribe.
      notifyWhatsapp: v.optional(v.boolean()),
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
      // Direcciones favoritas de entrega del comprador, con punto exacto.
      savedAddresses: v.optional(
        v.array(
          v.object({
            id: v.string(),
            label: v.string(),
            address: v.string(),
            location: geoPointValidator,
            createdAt: v.number(),
          }),
        ),
      ),
      // Locales favoritos del comprador, separados de los productos guardados.
      favoriteBusinessIds: v.optional(v.array(v.id("businesses"))),
      // Verificación de negocios y repartidores. El teléfono se confirma con
      // un código (Twilio Verify) y la cédula contra el registro del TSE
      // (Didit); si no hay proveedores configurados queda la revisión manual.
      verificationStatus: v.optional(verificationStatusValidator),
      idNumber: v.optional(v.string()),
      vehicle: v.optional(v.string()),
      verificationNote: v.optional(v.string()),
      verificationSubmittedAt: v.optional(v.number()),
      verifiedAt: v.optional(v.number()),
      // Teléfono que se está confirmando por código, antes de reemplazar el
      // número de contacto de la cuenta.
      pendingVerificationPhone: v.optional(v.string()),
      phoneVerificationSentAt: v.optional(v.number()),
      phoneVerifiedAt: v.optional(v.number()),
      // Cédula confirmada contra el registro y nombre devuelto por la fuente.
      idVerifiedAt: v.optional(v.number()),
      idVerifiedName: v.optional(v.string()),
      // Fechas en las que el repartidor soltó entregas ya aceptadas. Se usan
      // para las reglas de penalización, con ventana de 30 días.
      courierRenouncements: v.optional(v.array(v.number())),
      // Se aprueba sin intervención humana cuando ambos controles coinciden.
      verifiedAutomatically: v.optional(v.boolean()),
      // Calificación que recibe un repartidor (promedio y cantidad).
      rating: v.optional(v.number()),
      reviews: v.optional(v.number()),
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
      // Información operativa que el repartidor necesita al llegar al local.
      pickupInstructions: v.optional(v.string()),
      packagingInstructions: v.optional(v.string()),
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
      // Horario semanal opcional. Cuando existe, `isOpen` se calcula solo a
      // partir de estos tramos y el interruptor manual queda deshabilitado.
      hours: v.optional(v.array(businessHourValidator)),
      isDemo: v.optional(v.boolean()),
      // Se completa cuando la administración verifica al dueño del local.
      // Sirve para mostrar el sello de confianza sin exponer datos privados.
      verifiedAt: v.optional(v.number()),
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
      // Posición de la tienda dentro de la entrega (0 = líder del viaje).
      tripPosition: v.optional(v.number()),
      // Custodia: el local entrega el código de retiro al repartidor y el
      // comprador da su PIN al recibir. Confirman que el pedido correcto
      // cambió de manos, pero no reemplazan el registro del efectivo.
      pickupCode: v.optional(v.string()),
      deliveryPin: v.optional(v.string()),
      // Efectivo cobrado al comprador. Se guarda en la orden líder del viaje.
      cashCollected: v.optional(v.number()),
      cashCollectedAt: v.optional(v.number()),
      cashCollectedBy: v.optional(v.id("users")),
      // Cada confirmación queda con monto, fecha y usuario.
      cashCollectedLog: v.optional(
        v.array(
          v.object({
            amount: v.number(),
            at: v.number(),
            by: v.id("users"),
          }),
        ),
      ),
      // Efectivo entregado al negocio, confirmado por el negocio.
      cashHanded: v.optional(v.number()),
      cashHandedAt: v.optional(v.number()),
      cashHandedBy: v.optional(v.id("users")),
      cashHandedLog: v.optional(
        v.array(
          v.object({
            amount: v.number(),
            at: v.number(),
            by: v.id("users"),
          }),
        ),
      ),
      // Problema de efectivo del viaje (faltante, pago incompleto, etc.).
      cashIssue: v.optional(
        v.object({
          kind: cashIssueKindValidator,
          amount: v.number(),
          note: v.string(),
          at: v.number(),
          by: v.id("users"),
          orderId: v.optional(v.id("orders")),
          resolvedAt: v.optional(v.number()),
          resolvedBy: v.optional(v.id("users")),
        }),
      ),
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
      // Clave del intento de compra que creó esta orden. Un reintento de red
      // con la misma clave devuelve lo ya registrado en vez de duplicarlo.
      requestKey: v.optional(v.string()),
      createdAt: v.number(),
      acceptedAt: v.optional(v.number()),
      readyAt: v.optional(v.number()),
      pickedUpAt: v.optional(v.number()),
      deliveredAt: v.optional(v.number()),
      cancelledAt: v.optional(v.number()),
      // Quién canceló: una cancelación automática o del local no puede contar
      // como falta del comprador.
      cancelledBy: v.optional(cancellationActorValidator),
      // Motivo visible para el comprador cuando se cancela, por ejemplo un
      // pedido listo que nadie tomó después de la ventana de asignación.
      cancellationReason: v.optional(v.string()),
      // Pedido programado: el local lo prepara para esa hora, no antes.
      scheduledFor: v.optional(v.number()),
      // Cupón del local aplicado a esta tienda dentro de la entrega.
      couponCode: v.optional(v.string()),
      couponDiscount: v.optional(v.number()),
      // Evidencia de entrega: foto del pedido entregado, subida por el
      // repartidor al cerrar el viaje. El PIN del comprador sigue siendo la
      // confirmación principal; la foto queda como respaldo verificable.
      deliveryProof: v.optional(deliveryProofValidator),
      deliveryConfirmation: v.optional(deliveryConfirmationValidator),
    })
      .index("by_buyer", ["buyerId"])
      .index("by_business", ["businessId"])
      .index("by_group", ["groupCode"])
      .index("by_courier", ["courierId"])
      .index("by_request_key", ["buyerId", "requestKey"])
      .index("by_status", ["status"]),

    // Cierre diario de caja de un repartidor: foto de lo que cobró, lo que
    // entregó a cada local y lo que quedó pendiente, firmado con su nombre.
    // Es un registro histórico: no se edita, se firma una sola vez por día.
    cashClosures: defineTable({
      courierId: v.id("users"),
      // Medianoche del día civil de Costa Rica (UTC-6) en milisegundos.
      dayStart: v.number(),
      // Fecha legible del cierre, por ejemplo "2026-11-12".
      day: v.string(),
      orders: v.number(),
      deliveries: v.number(),
      expectedToCollect: v.number(),
      collected: v.number(),
      collectionDifference: v.number(),
      earnings: v.number(),
      dueToBusinesses: v.number(),
      handedToBusinesses: v.number(),
      pendingToBusinesses: v.number(),
      overpaidToBusinesses: v.number(),
      // Pendiente que venía de días anteriores y seguía en su mano al cerrar.
      carryOverPending: v.number(),
      // Total que declaró tener pendiente de entregar a los locales.
      totalPending: v.number(),
      businesses: v.array(
        v.object({
          businessId: v.id("businesses"),
          name: v.string(),
          orders: v.number(),
          due: v.number(),
          handed: v.number(),
          pending: v.number(),
        }),
      ),
      // Firma: nombre de la cuenta escrito por el repartidor, nota y huella.
      signedName: v.string(),
      note: v.optional(v.string()),
      signature: v.string(),
      signedAt: v.number(),
      signedBy: v.id("users"),
    })
      .index("by_courier", ["courierId", "dayStart"])
      .index("by_day", ["dayStart"]),

    meta: defineTable({
      key: v.string(),
      value: v.string(),
    }).index("by_key", ["key"]),

    // Última ubicación conocida de cada repartidor, incluso sin una entrega
    // activa. Sirve para ordenar los pedidos por cercanía y evitar que alguien
    // acepte una entrega que está demasiado lejos.
    courierPresence: defineTable({
      ownerId: v.id("users"),
      location: geoPointValidator,
      updatedAt: v.number(),
    }).index("by_owner", ["ownerId"]),

    // Suscripción vigente de cada negocio o repartidor. Se crea al elegir un
    // plan o al confirmar el pago, y la administración la activa o renueva.
    subscriptions: defineTable({
      ownerId: v.id("users"),
      role: subscriptionRoleValidator,
      plan: subscriptionPlanValidator,
      // Precio fijo del plan al momento de la activación (nunca un % de venta).
      price: v.number(),
      activeSince: v.optional(v.number()),
      activeUntil: v.optional(v.number()),
      // Recordatorio de pago: sonido elegido y si está habilitado.
      reminderSound: v.optional(v.string()),
      reminderEnabled: v.optional(v.boolean()),
      updatedAt: v.number(),
    }).index("by_owner", ["ownerId"]),

    // Comprobantes que el negocio o repartidor reporta y la administración
    // revisa. Cada pago conserva monto, referencia, fecha y quién lo aprobó.
    subscriptionPayments: defineTable({
      ownerId: v.id("users"),
      role: subscriptionRoleValidator,
      plan: subscriptionPlanValidator,
      price: v.number(),
      method: subscriptionMethodValidator,
      reference: v.string(),
      note: v.optional(v.string()),
      // Fecha y hora exactas de vencimiento que se muestran antes de pagar.
      expiryAt: v.number(),
      reportedAt: v.number(),
      status: subscriptionPaymentStatusValidator,
      reviewedAt: v.optional(v.number()),
      reviewedBy: v.optional(v.id("users")),
      reviewNote: v.optional(v.string()),
      // ONVO SINPE Móvil confirma transferencias por webhook sin revisión
      // manual. Las instrucciones quedan asociadas a la intención específica.
      onvoPaymentIntentId: v.optional(v.string()),
      onvoDestinationPhone: v.optional(v.string()),
      onvoPayerPhone: v.optional(v.string()),
    })
      .index("by_owner", ["ownerId"])
      .index("by_status", ["status"]),

    // Calificación del comprador al negocio y al repartidor, por separado.
    reviews: defineTable({
      orderId: v.id("orders"),
      buyerId: v.id("users"),
      businessId: v.id("businesses"),
      courierId: v.optional(v.id("users")),
      businessRating: v.number(),
      courierRating: v.optional(v.number()),
      comment: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_order", ["orderId"])
      .index("by_business", ["businessId"])
      .index("by_courier", ["courierId"])
      .index("by_buyer", ["buyerId"]),

    // Canal de ayuda para pagos, productos, direcciones y entregas. Cada caso
    // queda con estado y respuesta del administrador.
    supportTickets: defineTable({
      userId: v.id("users"),
      role: v.optional(roleValidator),
      orderId: v.optional(v.id("orders")),
      category: supportCategoryValidator,
      message: v.string(),
      status: supportStatusValidator,
      adminNote: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
      resolvedAt: v.optional(v.number()),
      resolvedBy: v.optional(v.id("users")),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"]),

    // Cierre de caja diario que firma cada repartidor: cuánto cobró, cuánto
    // entregó a cada local y qué quedó pendiente. Es un snapshot inmutable:
    // si algo cambia después, la firma deja de coincidir y la app lo avisa.
    cashClosings: defineTable({
      courierId: v.id("users"),
      // Día civil de Costa Rica, "YYYY-MM-DD".
      day: v.string(),
      from: v.number(),
      to: v.number(),
      // Nombre completo con el que firmó; debe coincidir con su cuenta.
      signedName: v.string(),
      note: v.optional(v.string()),
      orders: v.number(),
      deliveries: v.number(),
      expectedToCollect: v.number(),
      collected: v.number(),
      collectionDifference: v.number(),
      earnings: v.number(),
      dueToBusinesses: v.number(),
      handedToBusinesses: v.number(),
      pendingToBusinesses: v.number(),
      overpaidToBusinesses: v.number(),
      // Pendiente que viene de días anteriores a este cierre.
      carryOverPending: v.number(),
      openIssues: v.number(),
      businesses: v.array(
        v.object({
          businessId: v.id("businesses"),
          name: v.string(),
          orders: v.number(),
          due: v.number(),
          handed: v.number(),
          pending: v.number(),
        }),
      ),
      orderIds: v.array(v.id("orders")),
      signature: v.string(),
      signedAt: v.number(),
    })
      .index("by_courier_day", ["courierId", "day"])
      .index("by_day", ["day"]),

    // Bandeja de avisos externos (WhatsApp o webhook). Cada evento del pedido
    // deja una fila con el texto ya armado: la acción de despacho sólo envía y
    // anota el resultado, así un fallo del proveedor no bloquea el pedido.
    notifications: defineTable({
      kind: notificationKindValidator,
      orderId: v.id("orders"),
      tripKey: v.string(),
      recipientId: v.id("users"),
      recipientRole: notificationRoleValidator,
      phone: v.optional(v.string()),
      title: v.string(),
      body: v.string(),
      // Enlace de aceptación en un toque (ofertas) o al pedido.
      link: v.optional(v.string()),
      channel: notificationChannelValidator,
      status: notificationStatusValidator,
      attempts: v.number(),
      lastError: v.optional(v.string()),
      createdAt: v.number(),
      sentAt: v.optional(v.number()),
    })
      .index("by_status", ["status", "createdAt"])
      .index("by_recipient", ["recipientId", "createdAt"])
      .index("by_order", ["orderId"]),

    // Oferta directa de una entrega lista a un repartidor concreto. El token va
    // en el aviso de WhatsApp: abrirlo permite aceptar con un toque.
    deliveryOffers: defineTable({
      token: v.string(),
      courierId: v.id("users"),
      orderId: v.id("orders"),
      tripKey: v.string(),
      status: offerStatusValidator,
      expiresAt: v.number(),
      createdAt: v.number(),
      acceptedAt: v.optional(v.number()),
    })
      .index("by_token", ["token"])
      .index("by_courier", ["courierId", "status"])
      .index("by_trip", ["tripKey"])
      .index("by_status", ["status", "expiresAt"]),

    // Cupones que crea cada local desde sus ajustes. El descuento lo financia
    // el propio negocio y se descuenta de su liquidación, nunca del envío ni
    // como comisión de la plataforma. El código es único en toda la app.
    coupons: defineTable({
      businessId: v.id("businesses"),
      code: v.string(),
      kind: couponKindValidator,
      // Porcentaje (1-50) o monto fijo en colones.
      value: v.number(),
      minSubtotal: v.number(),
      // Tope del descuento para cupones de porcentaje.
      maxDiscount: v.optional(v.number()),
      active: v.boolean(),
      expiresAt: v.optional(v.number()),
      maxRedemptions: v.optional(v.number()),
      redemptions: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_business", ["businessId"])
      .index("by_code", ["code"]),

    // Caché de rutas y geocodificación. Evita repetir consultas al proveedor y
    // respeta los límites de uso de los servicios públicos.
    routeCache: defineTable({
      key: v.string(),
      km: v.number(),
      minutes: v.number(),
      geometry: v.array(
        v.object({ lat: v.number(), lng: v.number() }),
      ),
      source: v.string(),
      createdAt: v.number(),
    }).index("by_key", ["key"]),

    geocodeCache: defineTable({
      key: v.string(),
      results: v.array(
        v.object({
          label: v.string(),
          lat: v.number(),
          lng: v.number(),
        }),
      ),
      createdAt: v.number(),
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
      // Configuración de cobro de suscripciones (la edita el administrador).
      sinpePhone: v.optional(v.string()),
      iban: v.optional(v.string()),
      whatsappNumbers: v.optional(v.array(v.string())),
      graceDays: v.optional(v.number()),
      updatedAt: v.optional(v.number()),
    }).index("by_key", ["key"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
