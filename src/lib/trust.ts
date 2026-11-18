/**
 * Reglas de confianza de Shop To Go: verificación de cuentas, canal de
 * ayuda y reglas de cancelación. Se comparten entre el backend y la interfaz.
 */
export type VerificationStatus =
  | "unverified"
  | "pending"
  | "verified"
  | "rejected";

export const VERIFICATION_META: Record<
  VerificationStatus,
  { label: string; hint: string; tone: "muted" | "ember" | "green" | "chili" }
> = {
  unverified: {
    label: "Sin verificar",
    hint: "Completá tus datos para que la administración confirme tu cuenta.",
    tone: "muted",
  },
  pending: {
    label: "En revisión",
    hint: "Ya recibimos tus datos. La administración los está revisando.",
    tone: "ember",
  },
  verified: {
    label: "Verificado",
    hint: "Tu teléfono y tu cédula quedaron confirmados.",
    tone: "green",
  },
  rejected: {
    label: "Necesita corrección",
    hint: "Revisá la nota del administrador y volvé a enviar tus datos.",
    tone: "chili",
  },
};

export function verificationOf(status?: string | null): VerificationStatus {
  if (
    status === "pending" ||
    status === "verified" ||
    status === "rejected" ||
    status === "unverified"
  ) {
    return status;
  }
  return "unverified";
}

export function digitsOnly(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

/** Acepta 8 dígitos locales o 11 con el prefijo 506 de Costa Rica. */
export function isValidCostaRicaPhone(value?: string | null) {
  const digits = digitsOnly(value);
  return digits.length === 8 || (digits.length === 11 && digits.startsWith("506"));
}

export function normalizeCostaRicaPhone(value: string) {
  const digits = digitsOnly(value);
  const local = digits.length === 11 && digits.startsWith("506")
    ? digits.slice(3)
    : digits;
  if (local.length !== 8) return value.trim();
  return `+506 ${local.slice(0, 4)} ${local.slice(4)}`;
}

/** Cédula de Costa Rica: 9 dígitos. */
export function isValidCostaRicaId(value?: string | null) {
  return digitsOnly(value).length === 9;
}

export function normalizeId(value: string) {
  const digits = digitsOnly(value);
  if (digits.length !== 9) return value.trim();
  return `${digits.slice(0, 1)}-${digits.slice(1, 5)}-${digits.slice(5)}`;
}

export const COURIER_VEHICLES = [
  "Moto",
  "Bicicleta",
  "Carro",
  "A pie",
] as const;

/** Reglas de convivencia cuando hay cancelaciones o efectivo sin resolver. */
export const STANDING_RULES = {
  /** Cancelaciones propias en 30 días que encienden la alerta. */
  watchCancellations: 2,
  /** Cancelaciones propias en 30 días que restringen al repartidor. */
  restrictCancellations: 3,
  /** Incidencias de efectivo abiertas que restringen al repartidor. */
  restrictCashIssues: 2,
} as const;

export type StandingLevel = "ok" | "watch" | "restricted";

export type Standing = {
  level: StandingLevel;
  label: string;
  hint: string;
  /** Sólo el repartidor queda restringido automáticamente. */
  restricted: boolean;
};

/**
 * Posición de una cuenta según sus propias cancelaciones y sus incidencias de
 * efectivo. Las cancelaciones del sistema (nadie tomó el pedido) y las del
 * local no se cuentan: no son una falta del comprador ni del repartidor.
 *
 * Al repartidor se le restringe tomar entregas nuevas con dos incidencias de
 * efectivo abiertas o tres cancelaciones propias en 30 días. El negocio queda
 * marcado para revisión de la administración, sin bloquear la operación desde
 * el código: suspender un local es una decisión humana.
 */
export function cancellationStanding(input: {
  role: "buyer" | "business" | "courier";
  cancellations30d: number;
  openCashIssues: number;
}): Standing {
  const cancellations = Math.max(0, input.cancellations30d);
  const issues = Math.max(0, input.openCashIssues);

  if (input.role === "courier") {
    if (
      cancellations >= STANDING_RULES.restrictCancellations ||
      issues >= STANDING_RULES.restrictCashIssues
    ) {
      return {
        level: "restricted",
        label: "Entregas restringidas",
        hint:
          issues >= STANDING_RULES.restrictCashIssues
            ? `Tenés ${issues} incidencias de efectivo abiertas: resolvelas con la administración para volver a tomar entregas.`
            : `Tenés ${cancellations} cancelaciones propias en 30 días. La administración tiene que habilitarte de nuevo.`,
        restricted: true,
      };
    }
    if (cancellations >= STANDING_RULES.watchCancellations || issues >= 1) {
      return {
        level: "watch",
        label: "En observación",
        hint:
          issues >= 1
            ? "Tenés una incidencia de efectivo sin resolver. Cerrá el caso antes de que se sume otra."
            : "Sumaste cancelaciones propias este mes. Cuidá las entregas que aceptás.",
        restricted: false,
      };
    }
    return {
      level: "ok",
      label: "Buen historial",
      hint: "Sin cancelaciones propias ni efectivo pendiente.",
      restricted: false,
    };
  }

  if (input.role === "business") {
    if (cancellations >= 5) {
      return {
        level: "restricted",
        label: "Revisión de la administración",
        hint: `Tenés ${cancellations} cancelaciones en 30 días. La administración revisa la cuenta antes de tomar medidas.`,
        restricted: false,
      };
    }
    if (cancellations >= STANDING_RULES.watchCancellations) {
      return {
        level: "watch",
        label: "En observación",
        hint: "Hubo varias cancelaciones este mes. El historial queda visible en tu cuenta.",
        restricted: false,
      };
    }
    return {
      level: "ok",
      label: "Buen historial",
      hint: "Sin cancelaciones propias este mes.",
      restricted: false,
    };
  }

  // Comprador: cancelar antes de que el local confirme es parte del flujo y no
  // tiene costo. Sólo se avisa cuando se repite mucho.
  if (cancellations >= 5) {
    return {
      level: "watch",
      label: "Cancelaciones frecuentes",
      hint: `Cancelaste ${cancellations} pedidos en 30 días antes de que el local los confirmara.`,
      restricted: false,
    };
  }
  return {
    level: "ok",
    label: "Buen historial",
    hint: "Tus cancelaciones fueron sólo antes de la confirmación del local.",
    restricted: false,
  };
}

export const CANCELLATION_ACTOR_LABEL: Record<
  "buyer" | "business" | "system" | "unknown",
  string
> = {
  buyer: "Cancelado por el comprador",
  business: "Cancelado por el local",
  system: "Cancelado automáticamente",
  unknown: "Cancelación sin responsable registrado",
};

export type SupportCategory =
  | "payment"
  | "product"
  | "address"
  | "delivery"
  | "account"
  | "other";

export const SUPPORT_CATEGORY_META: Record<
  SupportCategory,
  { label: string; hint: string }
> = {
  payment: {
    label: "Pago en efectivo",
    hint: "Diferencias de monto, faltantes, devoluciones o confirmaciones.",
  },
  product: {
    label: "Producto",
    hint: "Producto faltante, incorrecto o en mal estado.",
  },
  address: {
    label: "Dirección o ubicación",
    hint: "El punto de entrega no coincide o no se encontró.",
  },
  delivery: {
    label: "Entrega",
    hint: "El pedido no llegó o el repartidor no pudo entregarlo.",
  },
  account: {
    label: "Mi cuenta",
    hint: "Verificación, acceso o datos personales.",
  },
  other: {
    label: "Otro problema",
    hint: "Contanos qué pasó y lo revisamos.",
  },
};

export const SUPPORT_CATEGORIES = Object.keys(
  SUPPORT_CATEGORY_META,
) as SupportCategory[];

export type SupportStatus = "open" | "in_review" | "resolved";

export const SUPPORT_STATUS_META: Record<
  SupportStatus,
  { label: string; tone: "chili" | "ember" | "green" }
> = {
  open: { label: "Abierto", tone: "chili" },
  in_review: { label: "En revisión", tone: "ember" },
  resolved: { label: "Resuelto", tone: "green" },
};

export function supportStatusOf(status?: string | null): SupportStatus {
  if (status === "in_review" || status === "resolved" || status === "open") {
    return status;
  }
  return "open";
}

/** Reglas visibles para que nadie cancele un pedido que ya no corresponde. */
export const CANCELLATION_RULES = [
  {
    audience: "Comprador",
    rules: [
      "Podés cancelar sin costo mientras el local no haya confirmado el pedido.",
      "Si el local ya lo confirmó, pedí ayuda: el local decide si alcanzó a prepararlo.",
      "Una vez que el repartidor retiró el pedido no se puede cancelar; se resuelve como incidencia.",
      "Si el pedido se cancela antes de entregarse, no se cobra el efectivo.",
    ],
  },
  {
    audience: "Negocio",
    rules: [
      "Podés rechazar un pedido pendiente o recién aceptado antes de empezar a prepararlo.",
      "Cuando el pedido está en preparación ya no se cancela desde el panel: si hay un problema, abrí un caso de ayuda.",
      "Si nadie retira un pedido listo, podés cancelarlo a los 30 minutos; a los 60 se cancela solo.",
      "Toda cancelación queda con fecha, motivo y visible para el comprador.",
    ],
  },
  {
    audience: "Repartidor",
    rules: [
      "El repartidor no cancela pedidos por su cuenta: si no puede entregar, abre un caso de ayuda.",
      "No se puede marcar una entrega como completada sin el PIN del comprador y el registro del efectivo.",
      "Si el cliente no aparece o la dirección es incorrecta, se registra la incidencia antes de cerrar.",
      "Las diferencias de efectivo quedan asentadas y las revisa la administración.",
      "Con dos incidencias de efectivo abiertas no se pueden tomar entregas nuevas hasta resolverlas.",
      "Las cancelaciones propias cuentan: con tres en 30 días la administración revisa la cuenta.",
    ],
  },
] as const;
