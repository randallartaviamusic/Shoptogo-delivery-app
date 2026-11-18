/**
 * Suscripciones de Capricho Express.
 *
 * Tarifas fijas y visibles: nunca un porcentaje de los pedidos. Cada plan
 * cambia por beneficios definidos (visibilidad y herramientas), no por una
 * comisión. El pago es mensual y lo verifica una persona administradora:
 * SINPE Móvil, efectivo o depósito.
 */
const moneyFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 0,
});

function money(value: number) {
  return `₡${moneyFormatter.format(Math.round(value))}`;
}

export const SUBSCRIPTION_PLAN_IDS = ["basico", "pro", "elite"] as const;
export type SubscriptionPlanId = (typeof SUBSCRIPTION_PLAN_IDS)[number];

export type SubscriptionAudience = "business" | "courier";

export type SubscriptionPlan = {
  id: SubscriptionPlanId;
  name: string;
  price: number;
  tagline: string;
  benefits: Record<SubscriptionAudience, string[]>;
};

/** Los tres planes tienen el mismo precio para negocios y repartidores. */
export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanId, SubscriptionPlan> = {
  basico: {
    id: "basico",
    name: "Básico",
    price: 5000,
    tagline: "Lo esencial para operar",
    benefits: {
      business: [
        "Catálogo visible en el mazo",
        "Pedidos, seguimiento en vivo y control de efectivo",
        "Promoción de envío opcional",
        "Perfil del local y horario de atención",
      ],
      courier: [
        "Entregas en Tilarán",
        "Seguimiento en vivo y registro de efectivo",
        "Historial y ganancias del día",
        "Códigos de retiro y PIN de entrega",
      ],
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 10000,
    tagline: "Más visibilidad y herramientas",
    benefits: {
      business: [
        "Todo lo del plan Básico",
        "Local destacado en el directorio y el mazo",
        "Estadísticas de ventas y gasto promocional",
        "Soporte por WhatsApp",
      ],
      courier: [
        "Todo lo del plan Básico",
        "Resumen de ganancias por período",
        "Historial completo de entregas",
        "Soporte por WhatsApp",
      ],
    },
  },
  elite: {
    id: "elite",
    name: "Élite",
    price: 20000,
    tagline: "Primera fila y soporte prioritario",
    benefits: {
      business: [
        "Todo lo del plan Pro",
        "Primera posición en el directorio y el mazo",
        "Soporte prioritario por WhatsApp",
        "Revisión prioritaria de reclamos de efectivo",
      ],
      courier: [
        "Todo lo del plan Pro",
        "Soporte prioritario por WhatsApp",
        "Revisión prioritaria de reclamos de efectivo",
        "Acompañamiento en la conciliación de efectivo",
      ],
    },
  },
};

export function planOf(id?: string | null): SubscriptionPlan {
  if (id === "pro" || id === "elite" || id === "basico") {
    return SUBSCRIPTION_PLANS[id];
  }
  return SUBSCRIPTION_PLANS.basico;
}

export function planTier(id?: string | null) {
  if (id === "elite") return 3;
  if (id === "pro") return 2;
  return 1;
}

/** Datos de pago por defecto; el administrador los puede cambiar. */
export const DEFAULT_SINPE_PHONE = "70735003";
export const DEFAULT_IBAN = "CR75015202001311947709";
export const DEFAULT_WHATSAPP_NUMBERS = ["+506 8492 3074"];
export const DEFAULT_GRACE_DAYS = 3;
export const EXPIRING_DAYS = 7;
export const MAX_WHATSAPP_NUMBERS = 5;

export type SubscriptionStatus =
  | "none"
  | "active"
  | "expiring"
  | "grace"
  | "expired";

const DAY_MS = 86_400_000;

export function subscriptionStatus(
  activeUntil?: number | null,
  graceDays: number = DEFAULT_GRACE_DAYS,
  now: number = Date.now(),
): SubscriptionStatus {
  if (!activeUntil) return "none";
  if (now < activeUntil - EXPIRING_DAYS * DAY_MS) return "active";
  if (now < activeUntil) return "expiring";
  const grace = Math.max(0, graceDays) * DAY_MS;
  if (now < activeUntil + grace) return "grace";
  return "expired";
}

/** Durante la gracia la cuenta sigue operando, pero con aviso. */
export function hasSubscriptionAccess(status: SubscriptionStatus) {
  return status === "active" || status === "expiring" || status === "grace";
}

export const SUBSCRIPTION_STATUS_META: Record<
  SubscriptionStatus,
  { label: string; tone: "green" | "ember" | "chili" | "muted"; hint: string }
> = {
  none: {
    label: "Sin activar",
    tone: "muted",
    hint: "Elegí un plan y reportá el pago para que lo verifiquemos.",
  },
  active: {
    label: "Activa",
    tone: "green",
    hint: "Tu suscripción está al día.",
  },
  expiring: {
    label: "Próxima a vencer",
    tone: "ember",
    hint: "Renová antes del vencimiento para no suspender la operación.",
  },
  grace: {
    label: "En período de gracia",
    tone: "ember",
    hint: "Todavía podés operar, pero regularizá el pago cuanto antes.",
  },
  expired: {
    label: "Vencida",
    tone: "chili",
    hint: "La operación está suspendida hasta que se acredite el pago.",
  },
};

export const SUSPENDED_CAPABILITIES: Record<SubscriptionAudience, string[]> = {
  business: [
    "No recibe pedidos nuevos en el mazo ni en el directorio.",
    "Sus productos dejan de mostrarse a los compradores.",
    "Conserva el catálogo, los pedidos y todo su historial.",
    "Puede seguir entrando a su panel y a su perfil.",
  ],
  courier: [
    "No puede aceptar entregas nuevas.",
    "Las entregas que ya tiene asignadas puede terminarlas.",
    "Conserva su historial y sus ganancias.",
    "Puede seguir entrando a su panel y a su perfil.",
  ],
};

// Costa Rica es UTC-6 todo el año (no hay horario de verano).
const CR_OFFSET_MS = -6 * 60 * 60 * 1000;

export function costaRicaParts(timestamp: number) {
  const date = new Date(timestamp + CR_OFFSET_MS);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  };
}

function fromCostaRica(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
) {
  return Date.UTC(year, month, day, hour, minute, 0, 0) - CR_OFFSET_MS;
}

/**
 * Vencimiento mensual: la plataforma fija la fecha (el mismo día del mes
 * siguiente, ajustado a meses cortos) y la persona suscriptora elige la hora.
 */
export function nextMonthlyExpiry(
  baseTimestamp: number,
  hour: number,
  minute: number,
) {
  const base = costaRicaParts(baseTimestamp);
  const targetMonth = base.month + 1;
  const lastDay = new Date(Date.UTC(base.year, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(base.day, lastDay);
  return fromCostaRica(
    base.year,
    targetMonth,
    day,
    Math.min(23, Math.max(0, Math.round(hour))),
    Math.min(59, Math.max(0, Math.round(minute))),
  );
}

/** Desde cuándo se cuenta la renovación: nunca antes del vencimiento actual. */
export function renewalBase(
  activeUntil?: number | null,
  now: number = Date.now(),
) {
  return activeUntil && activeUntil > now ? activeUntil : now;
}

export function formatExpiry(timestamp: number) {
  return new Intl.DateTimeFormat("es-CR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Costa_Rica",
  }).format(timestamp);
}

export function formatExpiryDate(timestamp: number) {
  return new Intl.DateTimeFormat("es-CR", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Costa_Rica",
  }).format(timestamp);
}

export const EXPIRY_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
export const EXPIRY_MINUTES = [0, 15, 30, 45];

/** Sonidos de recordatorio (la síntesis vive en `lib/reminderSounds`). */
export const REMINDER_SOUNDS = [
  { id: "campana", label: "Campana" },
  { id: "alarma", label: "Alarma" },
  { id: "suave", label: "Timbre suave" },
  { id: "digital", label: "Digital" },
] as const;

export type ReminderSoundId = (typeof REMINDER_SOUNDS)[number]["id"];

export function reminderSoundId(id?: string | null): ReminderSoundId {
  return REMINDER_SOUNDS.some((sound) => sound.id === id)
    ? (id as ReminderSoundId)
    : "campana";
}

export type PaymentMethod = "sinpe" | "onvo" | "cash" | "deposit";

export const PAYMENT_METHODS: Array<{
  id: PaymentMethod;
  label: string;
  hint: string;
}> = [
  {
    id: "sinpe",
    label: "SINPE Móvil",
    hint: "Transferí al número indicado y guardá el comprobante.",
  },
  {
    id: "onvo",
    label: "SINPE automático",
    hint: "ONVO confirma la transferencia con identidad y monto exactos.",
  },
  {
    id: "cash",
    label: "Efectivo",
    hint: "Entregá el monto a la persona administradora.",
  },
  {
    id: "deposit",
    label: "Depósito",
    hint: "Depositá en la cuenta IBAN indicada.",
  },
];

const METHOD_LABEL: Record<PaymentMethod, string> = {
  sinpe: "SINPE Móvil manual",
  onvo: "SINPE Móvil automático",
  cash: "Efectivo",
  deposit: "Depósito",
};

export function whatsappHref(number: string, message: string) {
  const digits = number.replace(/\D/g, "");
  const full = digits.length === 8 ? `506${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}

export function paymentWhatsappMessage(input: {
  name: string;
  audience: SubscriptionAudience;
  plan: SubscriptionPlanId;
  amount: number;
  method: PaymentMethod;
  reference: string;
  expiryAt: number;
}) {
  const plan = planOf(input.plan);
  return [
    `Hola, soy ${input.name || "una cuenta de Capricho Express"}.`,
    `Reporto el pago de mi suscripción de ${input.audience === "business" ? "negocio" : "repartidor"}.`,
    `Plan: ${plan.name} (${money(input.amount)} por mes).`,
    `Método: ${METHOD_LABEL[input.method]}.`,
    `Referencia: ${input.reference}.`,
    `Vencimiento solicitado: ${formatExpiry(input.expiryAt)}.`,
    "Adjunto el comprobante para que activen la cuenta.",
  ].join("\n");
}

export function countdownText(msRemaining: number) {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  if (days > 0) return `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
}
