import { useCallback, useEffect, useState } from "react";

export const TEXT_SIZE_STORAGE_KEY = "stg-text-scale";

export type TextScaleId = "small" | "normal" | "large" | "xl" | "xxl";

export const TEXT_SCALE_OPTIONS: {
  id: TextScaleId;
  label: string;
  hint: string;
  scale: number;
}[] = [
  { id: "small", label: "Pequeña", hint: "Más compacta", scale: 0.9 },
  { id: "normal", label: "Normal", hint: "Tamaño original", scale: 1 },
  { id: "large", label: "Grande", hint: "Más legible", scale: 1.125 },
  { id: "xl", label: "Muy grande", hint: "Letras grandes", scale: 1.25 },
  { id: "xxl", label: "Enorme", hint: "Máxima lectura", scale: 1.375 },
];

const SCALE_BY_ID: Record<TextScaleId, number> = {
  small: 0.9,
  normal: 1,
  large: 1.125,
  xl: 1.25,
  xxl: 1.375,
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

export function getTextScaleId(): TextScaleId {
  try {
    const raw = window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
    if (isTextScaleId(raw)) return raw;
  } catch {
    // Sin almacenamiento: tamaño normal.
  }
  return "normal";
}

export function getTextScale(): number {
  return SCALE_BY_ID[getTextScaleId()] ?? 1;
}

/**
 * Aplica el tamaño de letra a toda la plataforma cambiando el font-size
 * raíz (los estilos usan rem, así que todo escala junto) y marcando el
 * nivel en <html> para que el CSS pueda reforzar el ajuste al ancho.
 */
export function applyTextScale(id: TextScaleId) {
  if (typeof document === "undefined") return;
  const scale = SCALE_BY_ID[id] ?? 1;
  const root = document.documentElement;
  root.style.fontSize = `${16 * scale}px`;
  root.dataset.textScale = id;
  root.style.setProperty("--stg-font-scale", String(scale));
}

export function setTextScaleId(id: TextScaleId) {
  try {
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, id);
  } catch {
    // Sin almacenamiento igual se aplica en esta sesión.
  }
  applyTextScale(id);
}

export function useTextScale() {
  const [scaleId, setScaleId] = useState<TextScaleId>(() => {
    if (typeof window === "undefined") return "normal";
    return getTextScaleId();
  });

  useEffect(() => {
    applyTextScale(scaleId);
  }, [scaleId]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === TEXT_SIZE_STORAGE_KEY && isTextScaleId(event.newValue)) {
        setScaleId(event.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const select = useCallback((id: TextScaleId) => {
    setScaleId(id);
    setTextScaleId(id);
  }, []);

  return { scaleId, select };
}
