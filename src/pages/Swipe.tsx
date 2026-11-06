import {
  DeckActions,
  SwipeCard,
  type Dish,
  type SwipeCardHandle,
  type SwipeDirection,
} from "@/components/SwipeCard";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Flame,
  Heart,
  Loader2,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Star,
  Utensils,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

const TIPS = [
  {
    icon: Heart,
    title: "Derecha = lo quiero",
    text: "Sumás el producto al carrito sin salir del mazo.",
  },
  {
    icon: Star,
    title: "Arriba = súper antojo",
    text: "Lo guardás en Guardados para después.",
  },
  {
    icon: RotateCcw,
    title: "Deshacé sin culpa",
    text: "Volvé la última carta si te arrepentiste.",
  },
];

export default function SwipePage() {
  const [category, setCategory] = useState("Todo");
  const [decided, setDecided] = useState<Set<string>>(new Set());
  const topCard = useRef<SwipeCardHandle>(null);
  const deck = useQuery(api.catalog.deck, { category });
  const cart = useQuery(api.cart.myCart);
  const stats = useQuery(api.catalog.myStats);
  const swipe = useMutation(api.catalog.swipe);
  const undo = useMutation(api.catalog.undo);
  const resetDeck = useMutation(api.catalog.resetDeck);

  const cards = useMemo(
    () => ((deck?.cards ?? []) as unknown as Dish[]).filter((c) => !decided.has(c._id)),
    [deck?.cards, decided],
  );

  const handleDecide = (id: string, direction: SwipeDirection) => {
    const dish = cards.find((c) => c._id === id);
    setDecided((prev) => new Set(prev).add(id));
    swipe({ productId: id as Id<"products">, direction })
      .then(() => {
        if (direction === "like") {
          toast.success("¡Es un antojo!", {
            description: `${dish?.name ?? "Producto"} ya está en tu carrito.`,
          });
        }
        if (direction === "save") {
          toast("Súper antojo guardado", {
            description: `${dish?.name ?? "Producto"} te espera en Guardados.`,
          });
        }
      })
      .catch((error: Error) => {
        setDecided((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        toast.error(error.message || "No pudimos registrar tu swipe");
      });
  };

  const handleUndo = async () => {
    try {
      const result = await undo();
      setDecided(new Set());
      if (result.reverted) {
        toast(`Volvió ${result.reverted}`, { description: "Deshicimos tu último swipe." });
      } else {
        toast("No hay nada para deshacer todavía");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos deshacer");
    }
  };

  const handleReset = async () => {
    try {
      const result = await resetDeck();
      setDecided(new Set());
      toast.success("Mazo recargado", {
        description:
          result.restored > 0
            ? `${result.restored} antojos volvieron a aparecer.`
            : "Todo lo que te gustó ya está en tu carrito.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos recargar");
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "Backspace") {
        event.preventDefault();
        void handleUndo();
        return;
      }
      const map: Record<string, SwipeDirection> = {
        ArrowRight: "like",
        ArrowLeft: "pass",
        ArrowUp: "save",
      };
      const direction = map[event.key];
      if (!direction) return;
      event.preventDefault();
      void topCard.current?.decide(direction);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const categories = ["Todo", ...(deck?.categories ?? [])];
  const visible = cards.slice(0, 3);
  const isLoading = deck === undefined;

  return (
    <div>
      <PageHeader
        eyebrow="Modo antojo"
        title="¿Qué se te antoja hoy?"
        description="Deslizá a la derecha para pedir, a la izquierda para pasar. Arriba si querés guardarlo para después."
        action={
          <div className="flex items-center gap-2 rounded-full border border-border/80 px-3 py-1.5 text-xs text-muted-foreground">
            <Flame className="size-4 text-primary" />
            <span className="font-semibold text-foreground">{cards.length}</span>
            antojos por descubrir
          </div>
        }
      />

      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:px-0">
        {categories.map((item) => (
          <button
            key={item}
            onClick={() => {
              setCategory(item);
              setDecided(new Set());
            }}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
              category === item
                ? "border-transparent bg-accent text-accent-foreground"
                : "border-border/80 bg-secondary/40 text-muted-foreground hover:border-accent/30 hover:text-foreground",
            )}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-12">
        <div className="mx-auto w-full max-w-[420px]">
          <div className="relative h-[calc(100svh-380px)] min-h-[380px] max-h-[560px]">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-[30px] border border-border/70 bg-card">
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            )}

            {!isLoading &&
              visible.map((dish, index) => (
                <motion.div
                  key={dish._id}
                  className="absolute inset-0"
                  style={{ zIndex: 10 - index }}
                  initial={false}
                  animate={{
                    scale: 1 - index * 0.045,
                    y: index * 12,
                    opacity: 1 - index * 0.12,
                  }}
                  transition={{ type: "spring", stiffness: 320, damping: 30 }}
                >
                  <SwipeCard
                    ref={index === 0 ? topCard : undefined}
                    dish={dish}
                    isTop={index === 0}
                    onDecide={handleDecide}
                  />
                </motion.div>
              ))}

            {!isLoading && visible.length === 0 && (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="surface-raised absolute inset-0 flex flex-col items-center justify-center rounded-[30px] px-6 text-center"
                >
                  <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                    {deck?.total === 0 ? (
                      <Utensils className="size-7" />
                    ) : (
                      <Sparkles className="size-7" />
                    )}
                  </div>
                  <h3 className="mt-5 font-display text-xl font-bold">
                    {deck?.total === 0
                      ? "La cocina está vacía"
                      : "Viste todos los antojos"}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {deck?.total === 0
                      ? "Todavía no hay negocios cargados. Volvé en un rato."
                      : "Recargá el mazo para volver a ver lo que pasaste."}
                  </p>
                  <Button
                    className="mt-6 gap-2 bg-ember-gradient text-black"
                    onClick={handleReset}
                  >
                    <RotateCcw className="size-4" />
                    Recargar mazo
                  </Button>
                  <Link
                    to="/orders"
                    className="mt-4 text-xs font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Ver mis pedidos
                  </Link>
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          <DeckActions
            disabled={visible.length === 0}
            canUndo={(stats?.likes ?? 0) + (stats?.passes ?? 0) + (stats?.saved ?? 0) > 0}
            onUndo={handleUndo}
            onPass={() => void topCard.current?.decide("pass")}
            onSave={() => void topCard.current?.decide("save")}
            onLike={() => void topCard.current?.decide("like")}
          />

          <p className="mt-3 text-center text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/60">
            Arrastrá la carta o usá ← → ↑
          </p>

          <Link
            to="/cart"
            className="surface-raised mt-4 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 transition-colors hover:border-accent/30"
          >
            <span className="flex items-center gap-2.5 text-sm">
              <span className="relative flex size-9 items-center justify-center rounded-xl bg-accent/12 text-accent">
                <ShoppingBag className="size-4" />
              </span>
              <span>
                <span className="block font-semibold">
                  {cart?.count ? `${cart.count} en el carrito` : "Tu carrito está vacío"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {cart?.count ? money(cart.total) : "Deslizá a la derecha para agregar"}
                </span>
              </span>
            </span>
            <ArrowRight className="size-4 text-muted-foreground" />
          </Link>
        </div>

        <aside className="hidden space-y-4 lg:block">
          <div className="surface-raised rounded-3xl p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
              Tu sesión
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                { label: "Antojos", value: stats?.likes ?? 0 },
                { label: "Guardados", value: stats?.saved ?? 0 },
                { label: "Descartados", value: stats?.passes ?? 0 },
                { label: "Pedidos", value: stats?.orders ?? 0 },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-border/70 bg-black/25 px-4 py-3"
                >
                  <p className="font-display text-2xl font-bold">{item.value}</p>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {TIPS.map((tip) => (
              <div
                key={tip.title}
                className="flex gap-3 rounded-2xl border border-border/60 bg-card/40 p-4"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <tip.icon className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{tip.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {tip.text}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <Link
            to="/favorites"
            className="flex items-center justify-between rounded-2xl border border-accent/25 bg-accent/[0.06] p-4 transition-colors hover:bg-accent/10"
          >
            <div>
              <p className="text-sm font-semibold text-accent">Súper antojos</p>
              <p className="text-xs text-muted-foreground">
                {stats?.saved
                  ? `${stats.saved} guardados para después`
                  : "Todavía no guardaste ninguno"}
              </p>
            </div>
            <ArrowRight className="size-4 text-accent" />
          </Link>
        </aside>
      </div>
    </div>
  );
}
