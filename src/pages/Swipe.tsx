import { PageHeader } from "@/components/AppShell";
import { ProductOptionsDialog } from "@/components/ProductOptionsDialog";
import { DepartmentIcon } from "@/components/DepartmentIcon";
import { ShareProductButton } from "@/components/ShareButtons";
import {
  DeckActions,
  SwipeCard,
  type Dish,
  type SwipeCardHandle,
  type SwipeDirection,
} from "@/components/SwipeCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import {
  DEFAULT_DEPARTMENT,
  DEPARTMENTS,
  getDepartment,
  type CatalogFilter,
} from "@/lib/departments";
import { money } from "@/lib/format";
import type { ProductOptionChoice } from "@/lib/productOptions";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Flame,
  Heart,
  Loader2,
  RotateCcw,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Star,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

const TIPS = [
  {
    icon: Heart,
    title: "Derecha = me lo llevo",
    text: "Sumás el producto al carrito sin salir del mazo.",
  },
  {
    icon: Star,
    title: "Arriba = guardar",
    text: "Lo dejás en Guardados para decidir después.",
  },
  {
    icon: RotateCcw,
    title: "Deshacé sin culpa",
    text: "Volvé al último producto si te arrepentiste.",
  },
];

export default function SwipePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  // "Todo" es la etiqueta predeterminada: mezcla todos los rubros en un solo mazo.
  const [departmentSlug, setDepartmentSlug] = useState("todos");
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Una semilla nueva por visita: el servidor baraja el mazo distinto cada vez.
  const [deckSeed, setDeckSeed] = useState(() =>
    Math.random().toString(36).slice(2),
  );
  // Tarjetas deslizadas en esta sesión, en orden. Guardamos la tarjeta entera
  // porque el servidor deja de devolverla y así podemos traerla de vuelta.
  const [history, setHistory] = useState<Dish[]>([]);
  // Tarjetas que volvieron con la flecha de anterior, al frente del mazo.
  const [reinserted, setReinserted] = useState<Dish[]>([]);
  const topCard = useRef<SwipeCardHandle>(null);
  const [pendingLike, setPendingLike] = useState<Dish | null>(null);
  const [optionBusy, setOptionBusy] = useState(false);

  // Filtros combinados para "Todo": une por clave los filtros de cada rubro.
  const todosFilters = useMemo(() => {
    const byKey = new Map<string, CatalogFilter>();
    for (const item of DEPARTMENTS) {
      for (const facet of item.filters) {
        const existing = byKey.get(facet.key);
        if (!existing) {
          byKey.set(facet.key, { ...facet, options: [...facet.options] });
        } else {
          for (const option of facet.options) {
            if (!existing.options.includes(option)) existing.options.push(option);
          }
        }
      }
    }
    return [...byKey.values()];
  }, []);
  const department =
    departmentSlug === "todos"
      ? {
          slug: "todos",
          label: "Todo",
          short: "Todo",
          headline: "Todo el antojo junto",
          blurb:
            "Platos de todos los rubros mezclados. Deslizá sin límites.",
          filters: todosFilters,
        }
      : getDepartment(departmentSlug);
  const deck = useQuery(api.catalog.deck, {
    department: departmentSlug,
    filters,
    seed: deckSeed,
  });
  const cart = useQuery(api.cart.myCart, {});
  const stats = useQuery(api.catalog.myStats);
  const swipe = useMutation(api.catalog.swipe);
  const resetDeck = useMutation(api.catalog.resetDeck);

  const cards = useMemo(() => {
    const available = (deck?.cards ?? []) as unknown as Dish[];
    const hidden = new Set(history.map((item) => item._id));
    const back = new Set(reinserted.map((item) => item._id));
    return [
      ...reinserted,
      ...available.filter(
        (card) => !hidden.has(card._id) && !back.has(card._id),
      ),
    ];
  }, [deck?.cards, history, reinserted]);

  const departmentCounts = useMemo(
    () =>
      new Map(
        (deck?.departments ?? []).map((entry) => [entry.slug, entry.count]),
      ),
    [deck?.departments],
  );
  const allCount = useMemo(
    () => Array.from(departmentCounts.values()).reduce((a, b) => a + b, 0),
    [departmentCounts],
  );

  const selectedCount = Object.values(filters).reduce(
    (total, values) => total + values.length,
    0,
  );

  const countFor = (facet: string, value: string) =>
    deck?.facetCounts.find(
      (entry) => entry.facet === facet && entry.value === value,
    )?.count ?? 0;

  const toggleFilter = (facet: string, value: string) => {
    setFilters((prev) => {
      const current = prev[facet] ?? [];
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      const copy = { ...prev };
      if (next.length === 0) delete copy[facet];
      else copy[facet] = next;
      return copy;
    });
  };

  const clearFacet = (facet: string) => {
    setFilters((prev) => {
      const copy = { ...prev };
      delete copy[facet];
      return copy;
    });
  };

  const clearFilters = () => setFilters({});

  const chooseDepartment = (slug: string) => {
    if (slug === departmentSlug) return;
    setDepartmentSlug(slug);
    setFilters({});
    setHistory([]);
    setReinserted([]);
    setDeckSeed(Math.random().toString(36).slice(2));
  };

  // Mirar el mazo no pide cuenta; deslizar (o guardar, o recargar) sí.
  const askForAccount = () => {
    toast("Creá tu cuenta para deslizar", {
      description: "Con tu cuenta guardamos tus antojos, tus guardados y tu carrito.",
    });
    navigate("/auth?role=buyer&returnTo=%2Fswipe");
  };

  const handleDecide = (id: string, direction: SwipeDirection) => {
    // Mientras se eligen las opciones, el mazo queda en pausa.
    if (pendingLike) return;
    if (!user) {
      askForAccount();
      return;
    }
    const dish = cards.find((card) => card._id === id);
    if (dish) setHistory((prev) => [...prev, dish]);
    setReinserted((prev) => prev.filter((item) => item._id !== id));

    // Si el producto tiene sabor, acompañamientos o ingredientes, la tarjeta
    // sale del mazo y primero se elige la variante. El swipe se registra al
    // confirmar el diálogo.
    if (
      direction === "like" &&
      dish &&
      (dish.optionGroups ?? []).some((group) => group.options.length > 0)
    ) {
      setPendingLike(dish);
      return;
    }

    swipe({ productId: id as Id<"products">, direction })
      .then(() => {
        if (direction === "like") {
          toast.success("¡Es un antojo!", {
            description: `${dish?.name ?? "Producto"} ya está en tu carrito.`,
          });
        }
        if (direction === "save") {
          toast("Guardado para después", {
            description: `${dish?.name ?? "Producto"} te espera en Guardados.`,
          });
        }
      })
      .catch((error: Error) => {
        setHistory((prev) => prev.filter((item) => item._id !== id));
        toast.error(error.message || "No pudimos registrar tu swipe");
      });
  };

  const cancelPendingLike = () => {
    const dish = pendingLike;
    if (!dish) return;
    setHistory((prev) => prev.filter((item) => item._id !== dish._id));
    setReinserted((prev) => [
      dish,
      ...prev.filter((item) => item._id !== dish._id),
    ]);
    setPendingLike(null);
  };

  const confirmPendingLike = async (choices: ProductOptionChoice[]) => {
    const dish = pendingLike;
    if (!dish) return;
    setOptionBusy(true);
    try {
      await swipe({
        productId: dish._id as Id<"products">,
        direction: "like",
        options: choices,
      });
      toast.success("¡Es un antojo!", {
        description: `${dish.name} ya está en tu carrito.`,
      });
      setPendingLike(null);
    } catch (error) {
      // Si falla, devolvemos la tarjeta al frente para no perder el producto.
      setHistory((prev) => prev.filter((item) => item._id !== dish._id));
      setReinserted((prev) => [
        dish,
        ...prev.filter((item) => item._id !== dish._id),
      ]);
      setPendingLike(null);
      toast.error(
        error instanceof Error
          ? error.message
          : "No pudimos registrar tu swipe",
      );
    } finally {
      setOptionBusy(false);
    }
  };

  // Volver atrás es solo visual: la tarjeta anterior reaparece en el mazo con
  // el swipe ya registrado (carrito y guardados quedan como están).
  const handleUndo = () => {
    const previous = history[history.length - 1];
    if (!previous) {
      toast("No hay nada para volver atrás todavía");
      return;
    }
    setHistory((prev) => prev.slice(0, -1));
    setReinserted((prev) => [
      previous,
      ...prev.filter((item) => item._id !== previous._id),
    ]);
    toast(`Volvió ${previous.name}`, {
      description: "Tu swipe sigue registrado; podés decidir de nuevo.",
    });
  };

  const handleReset = async () => {
    if (!user) {
      askForAccount();
      return;
    }
    try {
      const result = await resetDeck();
      setHistory([]);
      setReinserted([]);
      setDeckSeed(Math.random().toString(36).slice(2));
      toast.success("Mazo recargado", {
        description:
          result.restored > 0
            ? `${result.restored} productos volvieron a aparecer.`
            : "Todo lo que elegiste ya está en tu carrito.",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos recargar",
      );
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // El diálogo de opciones tiene el foco: no deslizamos la tarjeta de atrás.
      if (pendingLike) return;
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
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
    // Se reengancha cuando cambia la persona o el historial: volver atrás
    // necesita saber cuál fue la última tarjeta.
  }, [user, history, pendingLike]);

  const visible = cards.slice(0, 3);
  const isLoading = deck === undefined;
  const noResults = visible.length === 0;
  const emptyDepartment =
    deck?.total === 0 &&
    departmentSlug !== DEFAULT_DEPARTMENT &&
    departmentSlug !== "todos";
  const emptyAll = deck?.total === 0 && departmentSlug === "todos";

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-clip">
      {!user && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/25 bg-accent/[0.06] px-4 py-3">
          <p className="text-xs leading-relaxed text-accent">
            Estás mirando el mazo sin cuenta. Para deslizar, guardar y pedir,
            creá tu cuenta o iniciá sesión.
          </p>
          <div className="flex gap-2">
            <Button asChild size="sm" className="bg-ember-gradient text-black">
              <Link to="/auth?role=buyer&returnTo=%2Fswipe">Crear cuenta</Link>
            </Button>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="border-accent/30 text-accent hover:bg-accent/10"
            >
              <Link to="/auth?role=buyer&mode=signin&returnTo=%2Fswipe">
                Iniciar sesión
              </Link>
            </Button>
          </div>
        </div>
      )}

      <div className="-mt-5">
        <PageHeader
          title={department.headline}
          description={department.blurb}
          action={
            <Button
              variant="outline"
              onClick={() => setFiltersOpen(true)}
              className="glass-sheen gap-2 border-border/80"
            >
              <SlidersHorizontal className="size-4 text-accent" />
              Filtros
              {selectedCount > 0 && (
                <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-foreground">
                  {selectedCount}
                </span>
              )}
            </Button>
          }
        />
      </div>

      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-2 no-scrollbar sm:mx-0 sm:px-0">
        <button
          onClick={() => chooseDepartment("todos")}
          className={cn(
            "glass-sheen flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors",
            departmentSlug === "todos"
              ? "border-transparent bg-accent text-accent-foreground"
              : "border-border/80 bg-secondary/40 text-muted-foreground hover:border-accent/30 hover:text-foreground",
          )}
        >
          <Sparkles className="size-4" />
          Todo
          {allCount > 0 && (
            <span
              className={cn(
                "text-[10px] font-medium",
                departmentSlug === "todos"
                  ? "text-accent-foreground/70"
                  : "text-muted-foreground/60",
              )}
            >
              {allCount}
            </span>
          )}
        </button>
        {DEPARTMENTS.map((item) => {
          const active = item.slug === departmentSlug;
          const count = departmentCounts.get(item.slug) ?? 0;
          return (
            <button
              key={item.slug}
              onClick={() => chooseDepartment(item.slug)}
              className={cn(
                "glass-sheen flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors",
                active
                  ? "border-transparent bg-accent text-accent-foreground"
                  : "border-border/80 bg-secondary/40 text-muted-foreground hover:border-accent/30 hover:text-foreground",
              )}
            >
              <DepartmentIcon name={item.icon} className="size-4" />
              {item.short}
              {count > 0 && (
                <span
                  className={cn(
                    "text-[10px] font-medium",
                    active ? "text-accent-foreground/70" : "text-muted-foreground/60",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedCount > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {Object.entries(filters).flatMap(([facetKey, values]) =>
            values.map((value) => (
              <button
                key={`${facetKey}:${value}`}
                onClick={() => toggleFilter(facetKey, value)}
                className="glass-sheen flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/[0.08] px-2.5 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/15"
              >
                {value}
                <X className="size-3" />
              </button>
            )),
          )}
          <button
            onClick={clearFilters}
            className="text-[11px] font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Limpiar todo
          </button>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-12">
        <div className="mx-auto w-full max-w-[420px]">
          <div className="relative aspect-[4/3] w-full">
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

            {!isLoading && noResults && (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="surface-raised absolute inset-0 flex flex-col items-center justify-center overflow-y-auto rounded-[30px] px-5 py-4 text-center"
                >
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                    {selectedCount > 0 ? (
                      <SlidersHorizontal className="size-6" />
                    ) : emptyDepartment ? (
                      <UtensilsCrossed className="size-6" />
                    ) : (
                      <Sparkles className="size-6" />
                    )}
                  </div>
                  <h3 className="mt-3 font-display text-lg font-bold">
                    {selectedCount > 0
                      ? "Nada con esos filtros"
                      : emptyDepartment
                        ? "Este rubro está vacío"
                        : emptyAll
                          ? "Todavía no hay productos"
                          : "Viste todos los productos"}
                  </h3>
                  <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-muted-foreground">
                    {selectedCount > 0
                      ? "Probá quitar alguno de los filtros para ver más opciones."
                      : emptyDepartment
                        ? "Todavía no hay locales en este rubro. Mientras tanto, mirá lo que hay en Comida."
                        : emptyAll
                          ? "Cuando los locales publiquen, sus platos van a aparecer acá."
                          : "Recargá el mazo para volver a ver lo que pasaste."}
                  </p>
                  <Button
                    size="sm"
                    className="mt-4 gap-2 bg-ember-gradient text-black"
                    onClick={() => {
                      if (selectedCount > 0) clearFilters();
                      else if (emptyDepartment)
                        chooseDepartment(DEFAULT_DEPARTMENT);
                      else void handleReset();
                    }}
                  >
                    {selectedCount > 0 ? (
                      <>
                        <X className="size-4" />
                        Limpiar filtros
                      </>
                    ) : emptyDepartment ? (
                      <>
                        <UtensilsCrossed className="size-4" />
                        Ir a Comida
                      </>
                    ) : (
                      <>
                        <RotateCcw className="size-4" />
                        Recargar mazo
                      </>
                    )}
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
            canUndo={history.length > 0}
            onUndo={handleUndo}
            onPass={() => void topCard.current?.decide("pass")}
            onSave={() => void topCard.current?.decide("save")}
            onLike={() => void topCard.current?.decide("like")}
            shareSlot={
              visible.length > 0 ? (
                <span className="flex size-12 items-center justify-center">
                  <ShareProductButton
                    dish={visible[0]}
                    className="size-12 border border-accent/40 bg-accent/10 text-accent hover:scale-105 hover:bg-accent/20 hover:text-accent"
                    iconClassName="size-5"
                  />
                </span>
              ) : undefined
            }
          />

          <p className="mt-3 text-center text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/60">
            Arrastrá la tarjeta o usá ← → ↑
          </p>

          <Link
            to="/cart"
            className="surface-raised mt-4 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 transition-colors hover:border-accent/30"
          >
            <span className="flex items-center gap-2.5 text-sm">
              <span className="relative flex size-9 items-center justify-center rounded-xl bg-accent/12 text-accent">
                <ShoppingCart className="size-4" />
              </span>
              <span>
                <span className="block font-semibold">
                  {cart?.count
                    ? `${cart.count} en el carrito`
                    : "Tu carrito está vacío"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {cart?.count
                    ? money(cart.total)
                    : "Deslizá a la derecha para agregar"}
                </span>
              </span>
            </span>
            <ArrowRight className="size-4 text-muted-foreground" />
          </Link>
        </div>

        <aside className="hidden space-y-4 lg:block">
          <div className="surface-raised rounded-3xl p-6">
            {user ? (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
                  Tu sesión
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {[
                    { label: "Elegidos", value: stats?.likes ?? 0 },
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
              </>
            ) : (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
                  Modo visita
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Estás mirando el mazo sin cuenta. Cuando deslices o toques un
                  botón te pedimos crearla para guardar tus antojos.
                </p>
                <Button
                  asChild
                  className="mt-4 w-full gap-2 bg-ember-gradient text-black"
                >
                  <Link to="/auth?role=buyer&returnTo=%2Fswipe">
                    Crear cuenta
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </>
            )}
          </div>

          <div className="surface-raised rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
                Explorar rubros
              </p>
              <span className="text-[11px] text-muted-foreground">
                {DEPARTMENTS.length} categorías
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => chooseDepartment("todos")}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                  departmentSlug === "todos"
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-border/70 text-muted-foreground hover:border-accent/30 hover:text-foreground",
                )}
              >
                <Sparkles className="size-3.5" />
                Todo
              </button>
              {DEPARTMENTS.map((item) => (
                <button
                  key={item.slug}
                  onClick={() => chooseDepartment(item.slug)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                    item.slug === departmentSlug
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-border/70 text-muted-foreground hover:border-accent/30 hover:text-foreground",
                  )}
                >
                  <DepartmentIcon name={item.icon} className="size-3.5" />
                  {item.short}
                </button>
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
              <p className="text-sm font-semibold text-accent">Guardados</p>
              <p className="text-xs text-muted-foreground">
                {stats?.saved
                  ? `${stats.saved} productos para después`
                  : "Todavía no guardaste ninguno"}
              </p>
            </div>
            <ArrowRight className="size-4 text-accent" />
          </Link>
        </aside>
      </div>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto border-border/80 bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">
              Filtros de {department.label.toLowerCase()}
            </DialogTitle>
            <DialogDescription>
              Combiná varias opciones. Mostramos los productos que coincidan
              con todos los filtros elegidos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {department.filters.map((facet) => {
              const selected = filters[facet.key] ?? [];
              return (
                <div key={facet.key}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {facet.label}
                    </p>
                    {selected.length > 0 && (
                      <button
                        onClick={() => clearFacet(facet.key)}
                        className="text-[10px] font-semibold text-accent hover:underline"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {facet.options.map((option) => {
                      const active = selected.includes(option);
                      const count = countFor(facet.key, option);
                      return (
                        <button
                          key={option}
                          onClick={() => toggleFilter(facet.key, option)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                            active
                              ? "border-accent bg-accent text-accent-foreground"
                              : "border-border/80 text-muted-foreground hover:border-accent/40 hover:text-foreground",
                            count === 0 && !active && "opacity-50",
                          )}
                        >
                          {option}
                          {count > 0 && (
                            <span className="ml-1.5 text-[10px] opacity-60">
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-4">
            <Button
              variant="ghost"
              onClick={clearFilters}
              disabled={selectedCount === 0}
              className="text-muted-foreground"
            >
              Limpiar todo
            </Button>
            <Button
              className="gap-2 bg-ember-gradient text-black"
              onClick={() => setFiltersOpen(false)}
            >
              Ver {cards.length} {cards.length === 1 ? "producto" : "productos"}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ProductOptionsDialog
        open={Boolean(pendingLike)}
        onOpenChange={(open) => {
          if (!open) cancelPendingLike();
        }}
        product={pendingLike}
        busy={optionBusy}
        onConfirm={(choices) => void confirmPendingLike(choices)}
      />
    </div>
  );
}
