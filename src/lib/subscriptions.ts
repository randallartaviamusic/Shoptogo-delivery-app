/**
 * Suscripciones de Shop To Go.
 *
 * Tarifas fijas y visibles: nunca un porcentaje de los pedidos. Cada plan
 * cambia por beneficios definidos (visibilidad y herramientas), no por una
 * comisión. El pago es mensual y lo verifica una persona administradora:
 * SINPE Móvil, efectivo o depósito.
 */
import { normalizeCostaRicaPhone } from "./trust";
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
  /** Mensaje destacado del plan, por ejemplo el aporte simbólico del Básico. */
  note?: string;
  benefits: Record<SubscriptionAudience, string[]>;
};

/** Los tres planes tienen el mismo precio para negocios y repartidores. */
export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanId, SubscriptionPlan> = {
  basico: {
    id: "basico",
    name: "Básico",
    price: 5000,
    tagline: "Casi gratis: lo esencial para operar",
    note: "Los ₡5.000 al mes no son un cobro por usar la app: son un aporte simbólico para mantener la plataforma en funcionamiento. Cubren la administración, el mantenimiento, el marketing que te trae clientes y el salario de los colaboradores que te atienden cada día. Por menos de ₡170 al día, tenés tu negocio vendiendo las 24 horas.",
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
        "Publicación de historias tipo Instagram",
        "Estadísticas de ventas y gasto promocional",
        "Soporte por WhatsApp",
      ],
      courier: [
        "Todo lo del plan Básico",
        "Radar de zona caliente",
        "Ofertas cercanas primero, con aviso de sonido",
        "Turnos de disponibilidad programada",
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
        "Ofertas flash con cuenta regresiva",
        "Portada Élite: local de la semana en el directorio",
        "Sello Élite verificado",
        "Tarjetas animadas y borde dorado en el directorio y el mazo",
        "Videos de productos",
        "Soporte prioritario por WhatsApp",
        "Revisión prioritaria de reclamos de efectivo",
      ],
      courier: [
        "Todo lo del plan Pro",
        "Sello Élite visible",
        "Acceso anticipado a pedidos grandes y prioridad en empates",
        "Reasignación rápida de entregas",
        "Caja mensual automática exportable en CSV",
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

/**
 * Oferta de bienvenida: el primer mes del plan Básico sale gratis para las
 * cuentas que nunca tuvieron suscripción. El administrador la puede activar,
 * pausar o cambiar por otra (plan, días y texto) desde su panel.
 */
export type WelcomeOffer = {
  enabled: boolean;
  plan: SubscriptionPlanId;
  freeDays: number;
  title: string;
  description: string;
};

export const DEFAULT_WELCOME_OFFER: WelcomeOffer = {
  enabled: true,
  plan: "basico",
  freeDays: 30,
  title: "Estrená Shop To Go sin pagar el primer mes",
  description:
    "Si es tu primera suscripción, te regalamos 30 días del plan Básico para que publiques tu local o tomes entregas sin poner un colón. Sin tarjeta y sin comprobante: tocás el botón y quedás activo al instante. Al vencimiento seguís con el precio normal y podés cambiar de plan cuando quieras.",
};

export function welcomeOfferOf(input: {
  enabled?: boolean | null;
  plan?: string | null;
  freeDays?: number | null;
  title?: string | null;
  description?: string | null;
}): WelcomeOffer {
  const plan =
    input.plan === "pro" || input.plan === "elite" || input.plan === "basico"
      ? input.plan
      : DEFAULT_WELCOME_OFFER.plan;
  const freeDays = Math.min(
    90,
    Math.max(1, Math.round(input.freeDays ?? DEFAULT_WELCOME_OFFER.freeDays)),
  );
  return {
    enabled: input.enabled ?? DEFAULT_WELCOME_OFFER.enabled,
    plan,
    freeDays,
    title: input.title?.trim() || DEFAULT_WELCOME_OFFER.title,
    description: input.description?.trim() || DEFAULT_WELCOME_OFFER.description,
  };
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

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "setiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Fecha corta para mensajes de WhatsApp, sin depender del ICU del servidor. */
export function formatReminderDate(timestamp: number) {
  const parts = costaRicaParts(timestamp);
  const hour = String(parts.hour).padStart(2, "0");
  const minute = String(parts.minute).padStart(2, "0");
  return `${parts.day} de ${MONTH_NAMES[parts.month]} de ${parts.year} a las ${hour}:${minute}`;
}

export const EXPIRY_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
export const EXPIRY_MINUTES = [0, 15, 30, 45];

/** Duraciones disponibles al suscribirse o cambiar de plan. */
export const SUBSCRIPTION_DURATIONS = [1, 3, 6, 12] as const;
export type SubscriptionDuration = (typeof SUBSCRIPTION_DURATIONS)[number];

/** Descuento aplicado al pagar 3, 6 o 12 meses juntos (10%). */
export const SUBSCRIPTION_MULTI_MONTH_DISCOUNT = 0.1;

export function normalizeDurationMonths(value: unknown): SubscriptionDuration {
  const months = Math.round(Number(value));
  if (months === 3 || months === 6 || months === 12) return months;
  return 1;
}

/** Total a pagar: 1 mes a precio lleno; 3, 6 o 12 meses con 10% de descuento. */
export function priceForSubscriptionMonths(
  plan: SubscriptionPlan,
  months: number,
) {
  const count = normalizeDurationMonths(months);
  if (count === 1) return plan.price;
  return Math.round(plan.price * count * (1 - SUBSCRIPTION_MULTI_MONTH_DISCOUNT));
}

/** Cuánto se ahorra la cuenta al pagar varios meses juntos. */
export function savingsForSubscriptionMonths(
  plan: SubscriptionPlan,
  months: number,
) {
  const count = normalizeDurationMonths(months);
  if (count === 1) return 0;
  return plan.price * count - priceForSubscriptionMonths(plan, count);
}

export function durationLabel(months: number) {
  const count = normalizeDurationMonths(months);
  if (count === 1) return "1 mes";
  if (count === 12) return "12 meses (1 año)";
  return `${count} meses`;
}

/** Vencimiento sumando N meses exactos desde la base, con la hora elegida. */
export function expiryForSubscriptionMonths(
  baseTimestamp: number,
  months: number,
  hour: number,
  minute: number,
) {
  const count = normalizeDurationMonths(months);
  let expiry = baseTimestamp;
  for (let index = 0; index < count; index += 1) {
    expiry = nextMonthlyExpiry(expiry, hour, minute);
  }
  return expiry;
}

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
    hint: "Coordinamos el retiro del pago en tu dirección por WhatsApp.",
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
  months?: number | null;
}) {
  const plan = planOf(input.plan);
  return [
    `Hola, soy ${input.name || "una cuenta de Shop To Go"}.`,
    `Reporto el pago de mi suscripción de ${input.audience === "business" ? "negocio" : "repartidor"}.`,
    `Plan: ${plan.name} (${money(input.amount)} por ${durationLabel(input.months ?? 1)}).`,
    `Método: ${METHOD_LABEL[input.method]}.`,
    `Referencia: ${input.reference}.`,
    `Vencimiento solicitado: ${formatExpiry(input.expiryAt)}.`,
    "Adjunto el comprobante para que activen la cuenta.",
  ].join("\n");
}

/** WhatsApp fijo de Shop To Go para coordinar el retiro del efectivo. */
export const CASH_PICKUP_WHATSAPP = "+506 8492 3074";

/** Mensaje que se abre desde el WhatsApp de la persona suscriptora. */
export function cashPickupWhatsappMessage(input: {
  name: string;
  audience: SubscriptionAudience;
  plan: SubscriptionPlanId;
  amount: number;
  phone: string;
  address: string;
  expiryAt: number;
  businessName?: string | null;
  months?: number | null;
}) {
  const plan = planOf(input.plan);
  const audience = input.audience === "business" ? "negocio" : "repartidor";
  const place = input.audience === "business" ? "mi negocio" : "mi domicilio";
  const account = input.businessName?.trim() || input.name.trim();
  return [
    `Hola, soy ${account || "una cuenta de Shop To Go"}.`,
    `Quiero suscribirme con pago en efectivo como ${audience}.`,
    `Suscripción: Plan ${plan.name} (${money(input.amount)} por ${durationLabel(input.months ?? 1)}).`,
    `Mi número de WhatsApp es ${normalizeCostaRicaPhone(input.phone)}.`,
    `Quiero que pasen a retirar el pago a la dirección de ${place}: ${input.address.trim()}.`,
    `Vencimiento deseado: ${formatExpiry(input.expiryAt)}`,
  ].join("\n");
}

/**
 * Texto del recordatorio automático de pago. Se envía al WhatsApp de la
 * cuenta una semana antes del vencimiento, una sola vez por período.
 */
export function subscriptionReminderMessage(input: {
  name: string;
  audience: SubscriptionAudience;
  plan: SubscriptionPlanId;
  amount: number;
  activeUntil: number;
  link?: string | null;
}) {
  const plan = planOf(input.plan);
  const account = input.name.trim() || "una cuenta de Shop To Go";
  const role = input.audience === "business" ? "negocio" : "repartidor";
  return [
    `Hola, ${account}.`,
    `Tu suscripción de ${role} en Shop To Go vence el ${formatReminderDate(input.activeUntil)}.`,
    `Plan ${plan.name}: ${money(input.amount)} por mes.`,
    "Renová antes del vencimiento para no suspender la operación.",
    "Pagá por SINPE Móvil, efectivo o depósito desde la app.",
    input.link ?? null,
  ]
    .filter(Boolean)
    .join("\n");
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
