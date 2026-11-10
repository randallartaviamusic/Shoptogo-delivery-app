import { cn } from "@/lib/utils";
import {
  Children,
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

/**
 * Fila con scroll horizontal infinito hacia ambos lados.
 *
 * Renderiza varias copias idénticas del contenido y mantiene siempre la
 * posición dentro de la copia del medio: cada vez que el desplazamiento cruza
 * un borde se corrige exactamente un ancho de juego, así el usuario puede
 * seguir deslizando sin fin y sin ver nunca el final de la fila.
 */
export function LoopRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const setWidth = useRef(0);
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: 0 });
  const items = Children.toArray(children);
  const [copies, setCopies] = useState(3);

  // Mide el ancho de un juego completo de tarjetas y decide cuántas copias
  // hacen falta para cubrir la pantalla dejando siempre un juego a cada lado.
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const measure = () => {
      const first = el.children[0] as HTMLElement | undefined;
      const second = el.children[1] as HTMLElement | undefined;
      if (!first || !second) return;

      const step = second.offsetLeft - first.offsetLeft;
      if (step <= 0) return;

      const set = step * items.length;
      if (set <= 0) return;
      setWidth.current = set;

      const needed = Math.max(3, 3 + Math.ceil(el.clientWidth / set));
      setCopies((prev) => (prev === needed ? prev : needed));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [items.length, copies]);

  // Coloca la fila en la copia del medio y la devuelve ahí al cruzar un borde.
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const normalize = () => {
      const set = setWidth.current;
      if (set <= 0) return;

      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      // Ignora el rebote elástico de iOS: solo corrige dentro del rango real.
      if (el.scrollLeft < 0 || el.scrollLeft > max) return;

      const offset = ((el.scrollLeft % set) + set) % set;
      const target = Math.min(set + offset, max);
      const shift = target - el.scrollLeft;
      if (Math.abs(shift) <= 1) return;
      el.scrollLeft = target;
      // Mantiene el arrastre alineado después del salto de bucle.
      if (drag.current.active) drag.current.startScroll += shift;
    };

    normalize();
    el.addEventListener("scroll", normalize, { passive: true });
    return () => el.removeEventListener("scroll", normalize);
  }, [copies, items.length]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const el = trackRef.current;
    if (!el) return;
    drag.current = {
      active: true,
      startX: event.clientX,
      startScroll: el.scrollLeft,
      moved: 0,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    const state = drag.current;
    if (!el || !state.active) return;

    const delta = event.clientX - state.startX;
    state.moved = Math.max(state.moved, Math.abs(delta));
    if (state.moved <= 4) return;
    el.scrollLeft = state.startScroll - delta;
  };

  const endDrag = () => {
    const state = drag.current;
    if (!state.active) return;
    state.active = false;
    if (state.moved > 4) {
      // Deja que el click posterior al arrastre se descarte y luego limpia.
      window.setTimeout(() => {
        state.moved = 0;
      }, 0);
    }
  };

  const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (drag.current.moved > 4) {
      event.preventDefault();
      event.stopPropagation();
    }
    drag.current.moved = 0;
  };

  if (items.length === 0) return null;

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={handleClickCapture}
      onDragStart={(event) => event.preventDefault()}
      className={cn(
        "relative flex cursor-grab gap-3 overflow-x-auto select-none active:cursor-grabbing",
        className,
      )}
    >
      {Array.from({ length: copies }, (_, copy) =>
        items.map((item, index) => (
          <Fragment key={`${copy}-${index}`}>{item}</Fragment>
        )),
      )}
    </div>
  );
}
