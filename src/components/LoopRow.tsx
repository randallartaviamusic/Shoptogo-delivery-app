import { cn } from "@/lib/utils";
import {
  Children,
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Fila con scroll horizontal infinito hacia ambos lados.
 *
 * Repite el contenido varias veces y recentra la posición cada vez que el
 * usuario se acerca a un borde, así se puede seguir deslizando sin fin.
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
  const items = Children.toArray(children);
  const [copies, setCopies] = useState(3);
  const [resizeTick, setResizeTick] = useState(0);

  useLayoutEffect(() => {
    const onResize = () => setResizeTick((tick) => tick + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el || items.length === 0) return;

    const first = el.children[0] as HTMLElement | undefined;
    const nextSet = el.children[items.length] as HTMLElement | undefined;
    if (!first || !nextSet) return;

    const step = nextSet.offsetLeft - first.offsetLeft;
    if (step <= 0) return;
    const set = step * items.length;

    // Copias suficientes para que siempre quede contenido hacia ambos lados.
    const needed = Math.max(3, 2 * Math.ceil(el.clientWidth / set) + 1);
    if (needed !== copies) {
      setCopies(needed);
      return;
    }

    setWidth.current = set;
    el.scrollLeft = set * Math.floor(copies / 2);
  }, [copies, items.length, resizeTick]);

  const handleScroll = () => {
    const el = trackRef.current;
    const set = setWidth.current;
    if (!el || set <= 0) return;

    const middle = set * Math.floor(copies / 2);
    if (el.scrollLeft < middle - set / 2) {
      el.scrollLeft += set;
    } else if (el.scrollLeft > middle + set / 2) {
      el.scrollLeft -= set;
    }
  };

  if (items.length === 0) return null;

  return (
    <div
      ref={trackRef}
      onScroll={handleScroll}
      className={cn("relative flex gap-3 overflow-x-auto", className)}
    >
      {Array.from({ length: copies }, (_, copy) =>
        items.map((item, index) => (
          <Fragment key={`${copy}-${index}`}>{item}</Fragment>
        )),
      )}
    </div>
  );
}
