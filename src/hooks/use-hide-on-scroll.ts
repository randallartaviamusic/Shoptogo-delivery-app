import { useEffect, useState } from "react";

/**
 * Devuelve `true` cuando la persona baja y `false` cuando sube (o vuelve arriba
 * de todo). Sirve para esconder la barra superior al hacer scroll.
 */
export function useHideOnScroll({ threshold = 10, topOffset = 72 } = {}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const y = Math.max(window.scrollY, 0);
        const delta = y - last;
        if (y <= topOffset) {
          setHidden(false);
        } else if (delta > threshold) {
          setHidden(true);
        } else if (delta < -threshold) {
          setHidden(false);
        }
        last = y;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [threshold, topOffset]);

  return hidden;
}
