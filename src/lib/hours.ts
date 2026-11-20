/**
 * Horario de atención de un local. `day` sigue la convención de JavaScript:
 * 0 = domingo, 1 = lunes ... 6 = sábado. Las horas son "HH:mm" en hora de
 * Costa Rica (UTC−6 todo el año).
 */
export type BusinessHour = {
  day: number;
  open: string;
  close: string;
};

export const BUSINESS_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const BUSINESS_DAY_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

/** Lunes a sábado de 9:00 a 21:00; el domingo queda cerrado. */
export const DEFAULT_BUSINESS_HOURS: BusinessHour[] = [1, 2, 3, 4, 5, 6].map(
  (day) => ({ day, open: "09:00", close: "21:00" }),
);

const COSTA_RICA_OFFSET_MS = 6 * 60 * 60 * 1000;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutos desde la medianoche de una hora "HH:mm", o null si no es válida. */
export function parseBusinessTime(value: string): number | null {
  const match = TIME_PATTERN.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Valida y ordena el horario antes de guardarlo. Un tramo por día; si el
 * cierre es anterior a la apertura se entiende que cruza la medianoche.
 */
export function normalizeBusinessHours(hours: BusinessHour[]): BusinessHour[] {
  if (hours.length > 7) {
    throw new Error("El horario admite un tramo por día");
  }

  const seen = new Set<number>();
  const normalized = hours.map((entry) => {
    if (!Number.isInteger(entry.day) || entry.day < 0 || entry.day > 6) {
      throw new Error("El día del horario no es válido");
    }
    if (seen.has(entry.day)) {
      throw new Error("Hay más de un horario para el mismo día");
    }
    seen.add(entry.day);

    const open = parseBusinessTime(entry.open);
    const close = parseBusinessTime(entry.close);
    if (open === null || close === null) {
      throw new Error("Usá horas válidas en formato HH:mm");
    }
    if (open === close) {
      throw new Error("La apertura y el cierre de cada día tienen que ser distintos");
    }

    return { day: entry.day, open: entry.open, close: entry.close };
  });

  return normalized.sort((a, b) => a.day - b.day);
}

/**
 * Estado efectivo del local según su horario semanal. Sin horario configurado
 * devuelve false: en ese caso manda el interruptor manual guardado en `isOpen`.
 */
export function isBusinessOpenAt(
  hours: BusinessHour[] | null | undefined,
  timestamp = Date.now(),
): boolean {
  if (!hours?.length) return false;

  const local = new Date(timestamp - COSTA_RICA_OFFSET_MS);
  const day = local.getUTCDay();
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();

  const today = hours.find((entry) => entry.day === day);
  if (today) {
    const open = parseBusinessTime(today.open);
    const close = parseBusinessTime(today.close);
    if (open !== null && close !== null) {
      if (open < close) {
        if (minutes >= open && minutes < close) return true;
      } else if (open > close && minutes >= open) {
        // Tramo nocturno: sigue abierto hasta la medianoche.
        return true;
      }
    }
  }

  // Tramo nocturno que empezó el día anterior y termina hoy de madrugada.
  const previous = hours.find((entry) => entry.day === (day + 6) % 7);
  if (previous) {
    const open = parseBusinessTime(previous.open);
    const close = parseBusinessTime(previous.close);
    if (open !== null && close !== null && open > close && minutes < close) {
      return true;
    }
  }

  return false;
}
