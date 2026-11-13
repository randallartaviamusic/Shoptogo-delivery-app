import type { OrderStatus } from "../convex/schema";

// Costa Rica: colones con separador de miles con punto (₡12.500).
const amount = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

export function money(value: number) {
  const rounded = Math.round(Number.isFinite(value) ? value : 0);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}₡${amount.format(Math.abs(rounded))}`;
}

export const ORDER_STATUS: Record<
  OrderStatus,
  {
    label: string;
    customerLabel: string;
    tone: "ember" | "chili" | "muted" | "green";
    hint: string;
  }
> = {
  pending: {
    label: "Nuevo",
    customerLabel: "Esperando confirmación",
    tone: "ember",
    hint: "El local todavía no confirmó el pedido.",
  },
  accepted: {
    label: "Confirmado",
    customerLabel: "Confirmado",
    tone: "ember",
    hint: "El local aceptó el pedido y arranca la cocina.",
  },
  preparing: {
    label: "En cocina",
    customerLabel: "En cocina",
    tone: "chili",
    hint: "Están preparando tu pedido ahora mismo.",
  },
  ready: {
    label: "Listo",
    customerLabel: "Listo para retirar",
    tone: "green",
    hint: "Esperando que un repartidor lo tome.",
  },
  picked_up: {
    label: "En camino",
    customerLabel: "En camino",
    tone: "green",
    hint: "Tu repartidor ya lo tiene y está yendo.",
  },
  delivered: {
    label: "Entregado",
    customerLabel: "Entregado",
    tone: "muted",
    hint: "¡Que lo disfrutes!",
  },
  cancelled: {
    label: "Cancelado",
    customerLabel: "Cancelado",
    tone: "muted",
    hint: "Este pedido no llegó a prepararse.",
  },
};

export const ACTIVE_STATUSES: OrderStatus[] = [
  "pending",
  "accepted",
  "preparing",
  "ready",
  "picked_up",
];

export function relativeTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}

export function clockTime(timestamp: number) {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

export function initials(name?: string | null) {
  if (!name) return "W";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export const ROLE_LABEL: Record<string, string> = {
  buyer: "Comprador",
  business: "Negocio",
  courier: "Repartidor",
};

export const ROLE_HOME: Record<string, string> = {
  buyer: "/swipe",
  business: "/business",
  courier: "/courier",
};
