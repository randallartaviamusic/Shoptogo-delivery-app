import { cn } from "@/lib/utils";
import {
  Children,
  Fragment,
  useCallback,
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
 *
 * El arrastre no mueve el scroll directamente: acumula un objetivo y un bucle
 * de animación interpola hacia él, con inercia al soltar, para que el
 * desplazamiento se sienta continuo incluso si el puntero llega a saltos.
 */

const FOLLOW = 0.38; // qué tan rápido alcanza el objetivo cada frame
const FRICTION = 0.93; // cuánto conserva la inercia al soltar
const MIN_SPEED = 0.08; // px/ms por debajo de los cuales se detiene
const MAX_SPEED = 2.2; // px/ms tope para no salir disparado

const mod = (value: number, size: number) => ((value % size) + size) % size;

export function LoopRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const setWidth = useRef(0);
  const drag = useRef({
    active: false,
    pointerId: -1,
    lastX: 0,
    lastTime: 0,
    velocity: 0,
    moved: 0,
  });
  const target = useRef(0);
  const raf = useRef(0);
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

      const targetScroll = Math.min(set + mod(el.scrollLeft, set), max);
      const shift = targetScroll - el.scrollLeft;
      if (Math.abs(shift) <= 1) return;
      el.scrollLeft = targetScroll;
      // Mantiene el objetivo del arrastre alineado después del salto de bucle.
      target.current += shift;
    };

    normalize();
    target.current = el.scrollLeft;
    el.addEventListener("scroll", normalize, { passive: true });
    return () => el.removeEventListener("scroll", normalize);
  }, [copies, items.length]);

  const stopAnimation = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
  }, []);

  const runFrame = useCallback(() => {
    raf.current = 0;
    const el = trackRef.current;
    if (!el) return;

    const state = drag.current;

    // Inercia: sigue desplazándose solo los milisegundos siguientes al soltar.
    if (!state.active && Math.abs(state.velocity) > MIN_SPEED) {
      target.current += state.velocity * 16.7;
      state.velocity *= FRICTION;
      if (Math.abs(state.velocity) <= MIN_SPEED) state.velocity = 0;
    }

    const distance = target.current - el.scrollLeft;
    if (Math.abs(distance) < 0.4) {
      if (Math.abs(distance) > 0) el.scrollLeft = target.current;
    } else {
      el.scrollLeft += distance * FOLLOW;
    }

    // Mantiene el scroll dentro de la copia del medio sin cortar el gesto.
    const set = setWidth.current;
    if (set > 0) {
      const max = el.scrollWidth - el.clientWidth;
      const wrapped = Math.min(set + mod(el.scrollLeft, set), max);
      const shift = wrapped - el.scrollLeft;
      if (Math.abs(shift) > 1) {
        el.scrollLeft = wrapped;
        target.current += shift;
      }
    }

    const settled =
      !state.active &&
      state.velocity === 0 &&
      Math.abs(target.current - el.scrollLeft) < 0.4;
    if (!settled) raf.current = requestAnimationFrame(runFrame);
  }, []);

  const startAnimation = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  useLayoutEffect(() => stopAnimation, [stopAnimation]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const el = trackRef.current;
    if (!el) return;

    el.setPointerCapture(event.pointerId);
    drag.current = {
      active: true,
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocity: 0,
      moved: 0,
    };
    target.current = el.scrollLeft;
    startAnimation();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    const state = drag.current;
    if (!el || !state.active || event.pointerId !== state.pointerId) return;

    const delta = event.clientX - state.lastX;
    const elapsed = Math.max(event.timeStamp - state.lastTime, 8);
    state.moved = Math.max(state.moved, Math.abs(delta));
    state.lastX = event.clientX;
    state.lastTime = event.timeStamp;
    // Arrastrar hacia la izquierda hace avanzar la fila (scrollLeft sube).
    state.velocity = Math.max(
      -MAX_SPEED,
      Math.min(MAX_SPEED, -delta / elapsed),
    );
    target.current -= delta;
    startAnimation();
  };

  const endDrag = (event?: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state.active) return;
    if (
      event &&
      state.pointerId !== -1 &&
      event.pointerId !== state.pointerId
    ) {
      return;
    }

    const el = trackRef.current;
    if (el && el.hasPointerCapture(state.pointerId)) {
      el.releasePointerCapture(state.pointerId);
    }

    state.active = false;
    state.pointerId = -1;
    // Un gesto lento no debe lanzar la fila: solo conserva inercia si venía rápido.
    if (Math.abs(state.velocity) < MIN_SPEED) state.velocity = 0;
    if (state.moved > 4) {
      // Deja que el click posterior al arrastre se descarte y luego limpia.
      window.setTimeout(() => {
        state.moved = 0;
      }, 0);
    }
    startAnimation();
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
      onPointerCancel={endDrag}
      onClickCapture={handleClickCapture}
      onDragStart={(event) => event.preventDefault()}
      className={cn(
        "relative flex cursor-grab gap-3 overflow-x-auto overscroll-x-contain select-none active:cursor-grabbing",
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
