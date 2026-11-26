import { useCallback, useEffect, useState } from "react";

export const TEXT_SIZE_STORAGE_KEY = "stg-text-scale";
export const TITLE_SIZE_STORAGE_KEY = "stg-title-scale";

export type TextScaleId = "small" | "normal" | "large" | "xl" | "xxl";

export const TEXT_SCALE_OPTIONS: {
  id: TextScaleId;
  label: string;
  hint: string;
  scale: number;
}[] = [
  { id: "small", label: "Pequeña", hint: "Predeterminada", scale: 0.9 },
  { id: "normal", label: "Normal", hint: "Tamaño original", scale: 1 },
  { id: "large", label: "Grande", hint: "Más legible", scale: 1.125 },
  { id: "xl", label: "Muy grande", hint: "Letras grandes", scale: 1.25 },
  { id: "xxl", label: "Enorme", hint: "Máxima lectura", scale: 1.375 },
];

export const TITLE_SCALE_OPTIONS: {
  id: TextScaleId;
  label: string;
  hint: string;
  scale: number;
}[] = [
  { id: "small", label: "Chicos", hint: "Títulos compactos", scale: 0.8 },
  { id: "normal", label: "Normal", hint: "Tamaño original", scale: 1 },
  { id: "large", label: "Grandes", hint: "Más peso visual", scale: 1.15 },
  { id: "xl", label: "Muy grandes", hint: "Bien marcados", scale: 1.3 },
  { id: "xxl", label: "Enormes", hint: "Máximo impacto", scale: 1.5 },
];

export const DEFAULT_TEXT_SCALE: TextScaleId = "small";
export const DEFAULT_TITLE_SCALE: TextScaleId = "normal";

const SCALE_BY_ID: Record<TextScaleId, number> = {
  small: 0.9,
  normal: 1,
  large: 1.125,
  xl: 1.25,
  xxl: 1.375,
};

const TITLE_SCALE_BY_ID: Record<TextScaleId, number> = {
  small: 0.8,
  normal: 1,
  large: 1.15,
  xl: 1.3,
  xxl: 1.5,
};

function isTextScaleId(value: unknown): value is TextScaleId {
  return (
    value === "small" ||
    value === "normal" ||
    value === "large" ||
    value === "xl" ||
    value === "xxl"
  );
}

function readScaleId(key: string, fallback: TextScaleId): TextScaleId {
  try {
    const raw = window.localStorage.getItem(key);
    if (isTextScaleId(raw)) return raw;
  } catch {
    // Sin almacenamiento: tamaño predeterminado.
  }
  return fallback;
}

export function getTextScaleId(): TextScaleId {
  return readScaleId(TEXT_SIZE_STORAGE_KEY, DEFAULT_TEXT_SCALE);
}

export function getTitleScaleId(): TextScaleId {
  return readScaleId(TITLE_SIZE_STORAGE_KEY, DEFAULT_TITLE_SCALE);
}

export function getTextScale(): number {
  return SCALE_BY_ID[getTextScaleId()] ?? 1;
}

/**
 * Aplica el tamaño del texto general a toda la plataforma cambiando el
 * font-size raíz (los estilos usan rem, así que todo escala junto) y marcando
 * el nivel en <html> para que el CSS pueda reforzar el ajuste al ancho.
 */
export function applyTextScale(id: TextScaleId) {
  if (typeof document === "undefined") return;
  const scale = SCALE_BY_ID[id] ?? 1;
  const root = document.documentElement;
  root.style.fontSize = `${16 * scale}px`;
  root.dataset.textScale = id;
  root.style.setProperty("--stg-font-scale", String(scale));
}

/**
 * Aplica el tamaño de los títulos por separado: el CSS multiplica las medidas
 * de los encabezados por esta variable, sin tocar el texto general.
 */
export function applyTitleScale(id: TextScaleId) {
  if (typeof document === "undefined") return;
  const scale = TITLE_SCALE_BY_ID[id] ?? 1;
  const root = document.documentElement;
  root.style.setProperty("--stg-title-scale", String(scale));
  root.dataset.titleScale = id;
}

export function applyTextPreferences() {
  applyTextScale(getTextScaleId());
  applyTitleScale(getTitleScaleId());
}

export function setTextScaleId(id: TextScaleId) {
  try {
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, id);
  } catch {
    // Sin almacenamiento igual se aplica en esta sesión.
  }
  applyTextScale(id);
}

export function setTitleScaleId(id: TextScaleId) {
  try {
    window.localStorage.setItem(TITLE_SIZE_STORAGE_KEY, id);
  } catch {
    // Sin almacenamiento igual se aplica en esta sesión.
  }
  applyTitleScale(id);
}

export function useTextScale() {
  const [scaleId, setScaleId] = useState<TextScaleId>(() => {
    if (typeof window === "undefined") return DEFAULT_TEXT_SCALE;
    return getTextScaleId();
  });
  const [titleScaleId, setTitleScaleState] = useState<TextScaleId>(() => {
    if (typeof window === "undefined") return DEFAULT_TITLE_SCALE;
    return getTitleScaleId();
  });

  useEffect(() => {
    applyTextScale(scaleId);
  }, [scaleId]);

  useEffect(() => {
    applyTitleScale(titleScaleId);
  }, [titleScaleId]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === TEXT_SIZE_STORAGE_KEY && isTextScaleId(event.newValue)) {
        setScaleId(event.newValue);
      }
      if (
        event.key === TITLE_SIZE_STORAGE_KEY &&
        isTextScaleId(event.newValue)
      ) {
        setTitleScaleState(event.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const select = useCallback((id: TextScaleId) => {
    setScaleId(id);
    setTextScaleId(id);
  }, []);

  const selectTitle = useCallback((id: TextScaleId) => {
    setTitleScaleState(id);
    setTitleScaleId(id);
  }, []);

  return { scaleId, titleScaleId, select, selectTitle };
}
