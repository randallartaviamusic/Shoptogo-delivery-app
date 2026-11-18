/**
 * Pedidos programados. Un pedido se puede dejar para más tarde dentro de una
 * ventana corta: el local necesita tiempo para prepararlo y la app no guarda
 * pedidos para dentro de un mes.
 */

export const SCHEDULE_RULES = {
  /** Mínimo de anticipación para que el local alcance a prepararlo. */
  minMinutesAhead: 30,
  /** Máximo de días hacia adelante. */
  maxDaysAhead: 7,
  /** Un pedido programado no se puede marcar listo antes de este margen. */
  readyMinutesBefore: 45,
} as const;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Motivo por el que la hora elegida no sirve, o null si es válida. */
export function scheduleBlocker(
  scheduledFor: number,
  now = Date.now(),
): string | null {
  if (!Number.isFinite(scheduledFor)) return "Elegí una hora válida";
  if (scheduledFor <= now + SCHEDULE_RULES.minMinutesAhead * 60_000) {
    return `Elegí una hora con al menos ${SCHEDULE_RULES.minMinutesAhead} minutos de anticipación`;
  }
  if (scheduledFor > now + SCHEDULE_RULES.maxDaysAhead * DAY_MS) {
    return `Los pedidos se pueden programar hasta ${SCHEDULE_RULES.maxDaysAhead} días antes`;
  }
  return null;
}

/**
 * Un pedido programado todavía no se puede preparar: avisa cuánto falta. El
 * margen evita que el local lo deje listo una hora antes y se enfríe.
 */
export function scheduleNotReadyYet(
  scheduledFor: number | null | undefined,
  now = Date.now(),
) {
  if (!scheduledFor) return false;
  return now < scheduledFor - SCHEDULE_RULES.readyMinutesBefore * 60_000;
}

/** Fecha de Costa Rica (UTC−6) en milisegundos desde un valor de datetime-local. */
export function costaRicaLocalToTimestamp(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const timestamp = Date.parse(`${value.trim()}:00-06:00`);
  return Number.isFinite(timestamp) ? timestamp : null;
}
