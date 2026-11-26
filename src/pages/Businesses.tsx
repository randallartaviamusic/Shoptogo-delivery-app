import { EmptyState, PageHeader } from "@/components/AppShell";
import { DepartmentIcon } from "@/components/DepartmentIcon";
import { DishImage } from "@/components/DishImage";
import { EliteAura } from "@/components/EliteAura";
import { ProductMedia } from "@/components/ProductMedia";
import { ProductOptionsDialog } from "@/components/ProductOptionsDialog";
import { PromoBadge } from "@/components/PromoBadge";
import { promoDiscount } from "@/lib/promo";
import type { PromoKind } from "@/lib/promo";
import {
  EliteVerifiedSeal,
  FlashCountdown,
  FlashSaleBadge,
} from "@/components/EliteBusiness";
import { LoopRow } from "@/components/LoopRow";
import { StoriesTray } from "@/components/BusinessStories";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { DEPARTMENTS, getDepartment } from "@/lib/departments";
import { formatKm } from "@/lib/delivery";
import { money } from "@/lib/format";
import type { ProductOptionChoice } from "@/lib/productOptions";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Crown,
  LayoutGrid,
  Loader2,
  MapPin,
  Zap,
  Plus,
  Rows3,
  Search,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Star,
  Store,
  TicketPercent,
  Truck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Baraja una lista con semilla: el mismo seed y la misma entrada dan el mismo orden. */
function shuffled<T>(list: T[], seed: number): T[] {
  const arr = [...list];
  let state = seed | 0;
  const rand = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Mensaje real de un ConvexError, o el respaldo si el servidor lo censura. */
function favoriteErrorMessage(error: unknown, fallback: string) {
  const data = (error as { data?: unknown } | null)?.data;
  if (typeof data === "string" && data.trim()) return data;
  if (error instanceof Error) {
    const clean = error.message
      .replace(/^.*Uncaught ConvexError:\s*/i, "")
      .trim();
    if (clean && !/Called by client/i.test(clean)) return clean;
  }
  return fallback;
}

type EliteSpotlightFlash = {
  title: string;
  detail: string;
  mediaUrl?: string | null;
  mediaKind?: "image" | "video" | null;
  endsAt: number;
};

type EliteSpotlightBusiness = {
  slug: string;
  image: string;
  name: string;
  tagline: string;
  eliteVerified: boolean;
  flash: EliteSpotlightFlash | null;
};

const ELITE_SPOTLIGHT_INTERVAL_MS = 5000;
const ELITE_SPOTLIGHT_PAUSE_AFTER_MANUAL_MS = 15000;

/** Carrusel de portadas Élite: scroll horizontal y rotación aleatoria automática. */
function EliteSpotlightCarousel({
  businesses,
}: {
  businesses: EliteSpotlightBusiness[];
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef(0);
  const pausedUntilRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const signature = businesses.map((business) => business.slug).join("|");

  useEffect(() => {
    activeRef.current = 0;
    setActiveIndex(0);
    trackRef.current?.scrollTo({ left: 0 });
  }, [signature]);

  const scrollToBusiness = (index: number, behavior: ScrollBehavior) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: index * track.clientWidth, behavior });
  };

  const markManualUse = () => {
    pausedUntilRef.current = Date.now() + ELITE_SPOTLIGHT_PAUSE_AFTER_MANUAL_MS;
  };

  const updateIndexFromScroll = () => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    const index = Math.min(
      businesses.length - 1,
      Math.max(0, Math.round(track.scrollLeft / track.clientWidth)),
    );
    if (index !== activeRef.current) {
      activeRef.current = index;
      setActiveIndex(index);
    }
  };

  useEffect(() => {
    if (businesses.length < 2) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      if (Date.now() < pausedUntilRef.current) return;
      let next = activeRef.current;
      while (next === activeRef.current) {
        next = Math.floor(Math.random() * businesses.length);
      }
      activeRef.current = next;
      setActiveIndex(next);
      scrollToBusiness(next, "auto");
    }, ELITE_SPOTLIGHT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [businesses.length]);

  if (businesses.length === 0) return null;

  return (
    <div
      ref={trackRef}
      role="region"
      aria-roledescription="carrusel"
      aria-label="Portadas de locales Élite"
      onScroll={updateIndexFromScroll}
      onPointerDown={markManualUse}
      onTouchStart={markManualUse}
      onWheel={markManualUse}
      className="mb-4 flex snap-x snap-mandatory overflow-x-auto no-scrollbar"
    >
      {businesses.map((business, index) => {
        const isActive = index === activeIndex;
        return (
          <article
            key={business.slug}
            aria-hidden={!isActive}
            className={cn(
              "w-full shrink-0 snap-center transition-opacity duration-500",
              isActive ? "opacity-100" : "opacity-0",
            )}
          >
            <Link
              to={`/negocios/${business.slug}`}
              tabIndex={isActive ? 0 : -1}
              className="relative block overflow-hidden rounded-3xl border border-amber-300/60"
            >
              <DishImage
                src={business.image}
                alt={business.name}
                className="h-44 w-full sm:h-52"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,6,7,0.15)_0%,rgba(6,6,7,0.92)_100%)]" />
              <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-5">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200">
                    <Crown className="size-3.5" />
                    Local Élite
                    {business.eliteVerified && <EliteVerifiedSeal />}
                  </p>
                  <p className="mt-1 truncate font-display text-xl font-extrabold text-white sm:text-2xl">
                    {business.name}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-white/70">
                    {business.tagline}
                  </p>
                  {business.flash && (
                    <div className="mt-2">
                      <FlashSaleBadge flash={business.flash} />
                    </div>
                  )}
                </div>
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-300 px-3 py-1.5 text-[11px] font-extrabold text-black">
                  Ver local
                  <ArrowRight className="size-3.5" />
                </span>
              </div>
            </Link>
          </article>
        );
      })}
    </div>
  );
}

export default function BusinessesPage() {
  const { slug } = useParams();
  return slug ? <Storefront slug={slug} /> : <Directory />;
}

function Directory() {
  const directory = useQuery(api.businesses.directory);
  const toggleFavorite = useMutation(api.businesses.toggleFavorite);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [departmentSlug, setDepartmentSlug] = useState("todos");
  const [category, setCategory] = useState("todas");
  const [search, setSearch] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [maxDistance, setMaxDistance] = useState("");
  const [maxMinutes, setMaxMinutes] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const showStories =
    user?.role === "buyer" && user?.isAnonymous !== true;
  const storiesFeed = useQuery(
    api.stories.feed,
    showStories ? {} : "skip",
  );

  const rows = directory ?? [];
  const term = normalize(search.trim());
  const searching = term.length > 0;

  // Orden aleatorio por visita: cada vez que se entra a Negocios las
  // categorías y las cards salen barajadas. La semilla se fija al montar la
  // sección, así el orden se mantiene estable mientras se filtra o se busca
  // y nada salta de lugar en pantalla.
  const visitSeed = useMemo(() => Math.floor(Math.random() * 1_000_000_000), []);
  const shuffledRows = useMemo(
    () => shuffled(rows, visitSeed),
    [rows, visitSeed],
  );

  const departmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const business of rows) {
      counts.set(business.department, (counts.get(business.department) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  const departmentBusinesses = useMemo(
    () =>
      departmentSlug === "todos"
        ? shuffledRows
        : shuffledRows.filter((business) => business.department === departmentSlug),
    [shuffledRows, departmentSlug],
  );

  const categories = useMemo(() => {
    const categoryBusinesses =
      departmentSlug === "todos" ? rows : departmentBusinesses;
    const counts = new Map<string, number>();
    for (const business of categoryBusinesses) {
      counts.set(business.category, (counts.get(business.category) ?? 0) + 1);
    }
    const order =
      departmentSlug === "todos"
        ? []
        : getDepartment(departmentSlug).subcategories;
    return Array.from(counts.entries()).sort((a, b) => {
      const first = order.indexOf(a[0]);
      const second = order.indexOf(b[0]);
      if (first === -1 && second === -1) return a[0].localeCompare(b[0]);
      if (first === -1) return 1;
      if (second === -1) return -1;
      return first - second;
    });
  }, [rows, departmentBusinesses, departmentSlug]);

  const filtered = useMemo(() => {
    const candidates = departmentBusinesses;
    return candidates.filter((business) => {
      if (
        searching &&
        !normalize(business.name).includes(term) &&
        !business.productSearch.some(
          (product) =>
            normalize(product.name).includes(term) ||
            normalize(product.category).includes(term),
        )
      ) {
        return false;
      }
      if (
        maxPrice &&
        !business.productSearch.some((product) => {
          const matchesSearch =
            !searching ||
            normalize(business.name).includes(term) ||
            normalize(product.name).includes(term) ||
            normalize(product.category).includes(term);
          return matchesSearch && product.price <= Number(maxPrice);
        })
      ) return false;
      if (category !== "todas" && business.category !== category) {
        return false;
      }
      if (openOnly && !business.isOpen) return false;
      if (maxPrice && (business.minPrice === null || business.minPrice > Number(maxPrice))) return false;
      if (maxDistance && (business.delivery.distanceKm === null || business.delivery.distanceKm > Number(maxDistance))) return false;
      if (maxMinutes && business.etaMinutes + (business.delivery.minutes ?? 0) > Number(maxMinutes)) return false;
      return true;
    });
  }, [rows, departmentBusinesses, searching, term, category, openOnly, maxPrice, maxDistance, maxMinutes]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const business of filtered) {
      const key = searching || departmentSlug === "todos" ? business.department : business.category;
      const list = map.get(key) ?? [];
      list.push(business);
      map.set(key, list);
    }

    const departmentOrder = DEPARTMENTS.map((item) => item.slug);
    const categoryOrder = categories.map(([name]) => name);
    const isDepartmentGroup = departmentSlug === "todos" || searching;
    const ordered = Array.from(map.entries())
      .map(([key, businesses]) => {
        const info = getDepartment(key);
        const order = isDepartmentGroup
          ? departmentOrder.indexOf(key)
          : categoryOrder.indexOf(key);
        return {
          key,
          title: isDepartmentGroup ? info.label : key,
          icon: info.icon,
          businesses,
          order: order === -1 ? Number.MAX_SAFE_INTEGER : order,
        };
      })
      .sort((a, b) => a.order - b.order);
    // Las cards ya vienen barajadas por visita; acá se barajan también las
    // categorías para que cada entrada muestre un orden distinto.
    return shuffled(ordered, (visitSeed ^ 0x9e3779b9) | 0);
  }, [filtered, departmentSlug, searching, categories, visitSeed]);

  // Portadas Élite: todos los locales Élite abiertos comparten el mismo
  // lugar del directorio. El carrusel permite moverlas con scroll y también
  // rota solo entre portadas Élite, de forma aleatoria, cada cinco segundos.
  const eliteSpotlights = useMemo(() => {
    if (searching || departmentSlug !== "todos") return [];
    return shuffledRows.filter((business) => business.elite && business.isOpen);
  }, [shuffledRows, searching, departmentSlug]);
  const totalOpen = rows.filter((business) => business.isOpen).length;
  const activeFilterCount =
    (openOnly ? 1 : 0) +
    (maxPrice.trim() ? 1 : 0) +
    (maxDistance.trim() ? 1 : 0) +
    (maxMinutes.trim() ? 1 : 0);

  const clearFilters = () => {
    setOpenOnly(false);
    setMaxPrice("");
    setMaxDistance("");
    setMaxMinutes("");
  };

  const chooseDepartment = (slug: string) => {
    setDepartmentSlug(slug);
    setCategory("todas");
  };

  const handleToggleFavorite = (businessId: Id<"businesses">) => {
    // Sin sesión la mutación no puede guardar nada: se pide entrar en vez de
    // mostrar un error del servidor.
    if (!user || user.isAnonymous) {
      toast("Iniciá sesión para guardar locales", {
        description: "Con tu cuenta tus locales favoritos quedan guardados.",
      });
      navigate(`/auth?role=buyer&returnTo=${encodeURIComponent("/negocios")}`);
      return;
    }
    void toggleFavorite({ businessId })
      .then((result) =>
        toast.success(
          result.favorite ? "Local guardado" : "Local quitado de favoritos",
        ),
      )
      .catch((error) =>
        toast.error(favoriteErrorMessage(error, "No pudimos guardar el local")),
      );
  };

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-clip">
      {showStories && storiesFeed && storiesFeed.length > 0 && (
        <StoriesTray groups={storiesFeed} />
      )}

      <PageHeader
        title="Todos los negocios"
        description="Entrá al local que quieras y comprá directo de su catálogo completo, sin deslizar."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-border/80 bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground">
              <Store className="size-3.5 text-accent" />
              {totalOpen} {totalOpen === 1 ? "local abierto" : "locales abiertos"}
            </div>
            <Button
              variant="outline"
              onClick={() => setFiltersOpen(true)}
              className="glass-sheen gap-2 border-border/80"
            >
              <SlidersHorizontal className="size-4 text-accent" />
              Filtros
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-foreground">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </div>
        }
      />

      {eliteSpotlights.length > 0 && (
        <EliteSpotlightCarousel
          key={eliteSpotlights.map((business) => business.slug).join("|")}
          businesses={eliteSpotlights}
        />
      )}

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por negocio o producto..."
          className="h-11 rounded-2xl border-border/80 bg-card/60 pl-9 pr-10"
          aria-label="Buscar negocios o productos"
        />
        {search.length > 0 && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Limpiar búsqueda"
            className="absolute right-3 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-2 no-scrollbar sm:mx-0 sm:px-0">
        <button
            onClick={() => chooseDepartment("todos")}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors",
              departmentSlug === "todos"
                ? "border-transparent bg-accent text-accent-foreground"
                : "border-border/80 bg-secondary/40 text-muted-foreground hover:border-accent/30 hover:text-foreground",
            )}
          >
            <Store className="size-4" />
            Todos
            <span className="text-[10px] font-medium opacity-70">{rows.length}</span>
          </button>
          {DEPARTMENTS.map((item) => {
            const active = item.slug === departmentSlug;
            const count = departmentCounts.get(item.slug) ?? 0;
            return (
              <button
                key={item.slug}
                onClick={() => chooseDepartment(item.slug)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors",
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

      {departmentSlug !== "todos" && categories.length > 0 && (
        <div className="-mx-4 mb-5 flex items-center gap-2 overflow-x-auto px-4 pb-2 no-scrollbar sm:mx-0 sm:px-0">
          <button
            onClick={() => setCategory("todas")}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              category === "todas"
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border/80 text-muted-foreground hover:border-accent/40 hover:text-foreground",
            )}
          >
            Todas las subcategorías
          </button>
          {categories.map(([name, count]) => (
            <button
              key={name}
              onClick={() => setCategory(name)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                category === name
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border/80 text-muted-foreground hover:border-accent/40 hover:text-foreground",
              )}
            >
              {name}
              <span className="ml-1.5 text-[10px] opacity-60">{count}</span>
            </button>
          ))}
        </div>
      )}

      {directory === undefined ? (
        <div className="flex h-52 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Store}
          title={searching ? "No encontramos resultados" : "Todavía no hay locales acá"}
          description={
            searching
              ? `Ningún negocio o producto coincide con “${search.trim()}”. Probá con otro término o quitá filtros.`
              : "Cuando un local de esta categoría se publique, va a aparecer en esta lista."
          }
          action={
            searching ? (
              <Button variant="outline" className="border-border/80" onClick={() => setSearch("")}>
                Ver todos los negocios
              </Button>
            ) : (
              <Button asChild className="gap-2 bg-ember-gradient text-black">
                <Link to="/swipe">
                  Ir al modo antojo
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.key}>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <DepartmentIcon name={group.icon} className="size-3.5" />
                </span>
                <h2 className="font-display text-base font-bold">{group.title}</h2>
                <span className="text-[11px] text-muted-foreground">
                  {group.businesses.length}{" "}
                  {group.businesses.length === 1 ? "local" : "locales"}
                </span>
              </div>
              <LoopRow className="-mx-4 px-4 pb-2 no-scrollbar sm:mx-0 sm:px-0">
                {group.businesses.map((business) => (
                  <BusinessCard
                    key={business._id}
                    business={business}
                    searchTerm={searching ? term : ""}
                    onToggleFavorite={handleToggleFavorite}
                  />
                ))}
              </LoopRow>
            </section>
          ))}
        </div>
      )}

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto border-border/80 bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Filtros de negocios</DialogTitle>
            <DialogDescription>
              Elegí qué locales querés ver. Los cambios se aplican al instante
              en toda la lista.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-1">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Disponibilidad
              </p>
              <button
                type="button"
                onClick={() => setOpenOnly((value) => !value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  openOnly
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border/80 text-muted-foreground hover:border-accent/40 hover:text-foreground",
                )}
              >
                Abiertos ahora
              </button>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Límites
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1.5 text-[11px] text-muted-foreground">
                  Precio máx. (₡)
                  <Input
                    type="number"
                    min="0"
                    value={maxPrice}
                    onChange={(event) => setMaxPrice(event.target.value)}
                    placeholder="Sin límite"
                    className="h-9 text-xs"
                  />
                </label>
                <label className="space-y-1.5 text-[11px] text-muted-foreground">
                  Distancia máx. (km)
                  <Input
                    type="number"
                    min="0"
                    value={maxDistance}
                    onChange={(event) => setMaxDistance(event.target.value)}
                    placeholder="Sin límite"
                    className="h-9 text-xs"
                  />
                </label>
                <label className="space-y-1.5 text-[11px] text-muted-foreground">
                  ETA máx. (min)
                  <Input
                    type="number"
                    min="0"
                    value={maxMinutes}
                    onChange={(event) => setMaxMinutes(event.target.value)}
                    placeholder="Sin límite"
                    className="h-9 text-xs"
                  />
                </label>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                Precio usa el producto más económico de cada local; distancia y
                ETA se calculan cuando guardaste un punto de entrega.
              </p>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-4">
            <Button
              variant="ghost"
              onClick={clearFilters}
              disabled={activeFilterCount === 0}
              className="text-muted-foreground"
            >
              Limpiar todo
            </Button>
            <Button
              className="gap-2 bg-ember-gradient text-black"
              onClick={() => setFiltersOpen(false)}
            >
              Ver {filtered.length} {filtered.length === 1 ? "local" : "locales"}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type DeliveryInfo = {
  feeFrom: number;
  fee: number | null;
  distanceKm: number | null;
  minutes: number | null;
  available: boolean;
};

function deliveryLabel(delivery: DeliveryInfo, promo?: PromoKind | null) {
  if (!delivery.available) return "Fuera de cobertura";
  if (delivery.fee === null) return `Envío desde ${money(delivery.feeFrom)}`;
  const distance = formatKm(delivery.distanceKm ?? 0);
  if (!promo) return `Envío ${money(delivery.fee)} · ${distance}`;
  if (promo === "free_delivery") return `Envío gratis · ${distance}`;
  return `Envío al 50% · ${money(delivery.fee - promoDiscount(delivery.fee, promo))} · ${distance}`;
}

function BusinessCard({
  business,
  searchTerm,
  onToggleFavorite,
}: {
  business: {
    _id: Id<"businesses">;
    name: string;
    slug: string;
    tagline: string;
    image: string;
    category: string;
    rating: number;
    reviews: number;
    productSearch: Array<{ name: string; category: string; price: number }>;
    isOpen: boolean;
    elite: boolean;
    etaMinutes: number;
    delivery: DeliveryInfo;
    promo: PromoKind | null;
    productCount: number;
    minPrice: number | null;
    isFavorite: boolean;
    eliteVerified: boolean;
    flash: { title: string; detail: string; mediaUrl?: string | null; mediaKind?: "image" | "video" | null; endsAt: number } | null;
  };
  searchTerm: string;
  onToggleFavorite: (businessId: Id<"businesses">) => void;
}) {
  return (
    <article
      className={cn(
        "group relative w-[15rem] shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-card transition-colors hover:border-accent/35",
        business.elite && "border-amber-300/70",
      )}
    >
      {business.elite && <EliteAura />}
      <Link
        to={`/negocios/${business.slug}`}
        className="flex h-full flex-col"
      >
      <div className="relative h-28 w-full overflow-hidden">
        <DishImage
          src={business.image}
          alt={business.name}
          className="size-full"
          imgClassName="transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,6,7,0.1)_0%,rgba(6,6,7,0.85)_100%)]" />
        <span
          className={cn(
            "absolute left-3 top-3 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider",
            business.isOpen
              ? "bg-accent text-accent-foreground"
              : "bg-black/70 text-white/70",
          )}
        >
          {business.isOpen ? "Abierto" : "Cerrado"}
        </span>
        <span className="absolute right-12 top-3 flex items-center gap-1 rounded-full border border-white/15 bg-black/55 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur">
          <Star className="size-2.5 fill-accent text-accent" />
          {business.rating.toFixed(1)}
        </span>
        <div className="absolute inset-x-3 bottom-2.5">
          <p className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
            {business.elite && (
              <span
                role="img"
                aria-label="Negocio Élite"
                title="Negocio Élite"
                className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-amber-300 text-black"
              >
                <Crown className="size-2.5" />
              </span>
            )}
            <span className="truncate">{business.category}</span>
          </p>
          <p className="truncate text-shadow-dark font-display text-sm font-extrabold text-white">
            {business.name}
          </p>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
          {business.tagline}
        </p>
        {business.flash && (
          <div className="mt-2">
            <FlashSaleBadge flash={business.flash} className="max-w-full" />
          </div>
        )}
        {searchTerm && (() => {
          const matches = business.productSearch
            .filter((product) => normalize(product.name).includes(searchTerm) || normalize(product.category).includes(searchTerm))
            .slice(0, 3);
          return matches.length > 0 ? (
            <p className="mt-1 line-clamp-1 text-[10px] text-accent">
              Encontramos: {matches.map((product) => product.name).join(", ")}
            </p>
          ) : null;
        })()}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-3 text-accent" />
            {business.etaMinutes + (business.delivery.minutes ?? 0)} min aprox.
          </span>
          <span className="flex items-center gap-1">
            <Truck className="size-3 text-accent" />
            {deliveryLabel(business.delivery, business.promo)}
          </span>
          <span className="flex items-center gap-1">
            <ShoppingBag className="size-3 text-accent" />
            {business.productCount}{" "}
            {business.productCount === 1 ? "producto" : "productos"}
          </span>
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-2.5">
          <p className="text-[11px] text-muted-foreground">
            {business.minPrice !== null ? (
              <>
                Desde <span className="font-semibold text-foreground">{money(business.minPrice)}</span>
              </>
            ) : (
              "Sin productos publicados"
            )}
          </p>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-accent">
            Ver catálogo
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
      </Link>
      <button
        type="button"
        aria-label={business.isFavorite ? `Quitar ${business.name} de favoritos` : `Guardar ${business.name} en favoritos`}
        aria-pressed={business.isFavorite}
        onClick={() => onToggleFavorite(business._id)}
        className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full border border-white/15 bg-black/65 text-accent backdrop-blur transition-colors hover:border-accent/50"
      >
        <Star className={cn("size-3.5", business.isFavorite && "fill-current")} />
      </button>
    </article>
  );
}

function Storefront({ slug }: { slug: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toggleFavorite = useMutation(api.businesses.toggleFavorite);
  const data = useQuery(api.businesses.storefront, { slug });
  const coupons = useQuery(api.coupons.forSlug, { slug });
  const cart = useQuery(api.cart.myCart, {});
  const addToCart = useMutation(api.cart.add);
  const [busy, setBusy] = useState<string | null>(null);
  const [optionProduct, setOptionProduct] = useState<
    NonNullable<typeof data>["products"][number] | null
  >(null);
  // Ventanas que abre el botón de una historia: card del producto u oferta.
  const [storyProduct, setStoryProduct] = useState<
    NonNullable<typeof data>["products"][number] | null
  >(null);
  const [offerOpen, setOfferOpen] = useState(false);
  const productParam = searchParams.get("producto");
  const offerParam = searchParams.get("oferta");
  // Vista del catálogo: cuadrícula de 2 columnas o lista de 1 columna grande.
  const [catalogView, setCatalogView] = useState<"grid" | "list">("grid");
  // Marca qué parámetro de historia ya se abrió: evita reabrir la ventana con
  // cada actualización en vivo y permite limpiar la URL después de que el
  // diálogo ya se montó (limpiarla en el mismo commit lo cerraba solo).
  const openedStoryParam = useRef<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const clearStoryParamsLater = () => {
      window.setTimeout(() => {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("producto");
            next.delete("oferta");
            return next;
          },
          { replace: true },
        );
      }, 250);
    };
    if (productParam) {
      const key = `producto:${productParam}`;
      if (openedStoryParam.current === key) return;
      openedStoryParam.current = key;
      const product = data.products.find((item) => item._id === productParam);
      if (!product) {
        toast.error("Ese producto ya no está disponible");
      } else if ((product.optionGroups?.length ?? 0) > 0) {
        setOptionProduct(product);
      } else {
        setStoryProduct(product);
      }
      clearStoryParamsLater();
      return;
    }
    if (offerParam) {
      const key = `oferta:${offerParam}`;
      if (openedStoryParam.current === key) return;
      openedStoryParam.current = key;
      if (data.business.flash) setOfferOpen(true);
      else toast.error("Esa oferta flash ya terminó");
      clearStoryParamsLater();
    }
  }, [data, productParam, offerParam, setSearchParams]);

  const handleProductTap = (
    product: NonNullable<typeof data>["products"][number],
  ) => {
    if ((product.optionGroups?.length ?? 0) > 0) {
      if (!user) {
        requireAccount();
        return;
      }
      setOptionProduct(product);
    } else {
      void handleAdd(product._id, product.name);
    }
  };

  const groups = useMemo(() => {
    const map = new Map<string, Array<NonNullable<typeof data>["products"][number]>>();
    for (const product of data?.products ?? []) {
      const list = map.get(product.category) ?? [];
      list.push(product);
      map.set(product.category, list);
    }
    return Array.from(map.entries());
  }, [data]);

  const requireAccount = () => {
    toast("Creá tu cuenta para comprar", {
      description: "Con tu cuenta guardamos tu carrito y tus pedidos.",
    });
    navigate(`/auth?role=buyer&returnTo=${encodeURIComponent(`/negocios/${slug}`)}`);
  };

  const handleAdd = async (
    productId: Id<"products">,
    name: string,
    options?: ProductOptionChoice[],
  ) => {
    if (!user) {
      requireAccount();
      return;
    }
    setBusy(productId);
    try {
      await addToCart({ productId, options });
      toast.success("Sumado al carrito", { description: name });
      setOptionProduct(null);
      setStoryProduct(null);
      setOfferOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos agregarlo");
    } finally {
      setBusy(null);
    }
  };

  if (data === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (data === null) {
    return (
      <EmptyState
        icon={Store}
        title="Ese negocio no existe"
        description="Puede que haya cambiado de nombre o ya no esté en la plataforma."
        action={
          <Button asChild className="gap-2 bg-ember-gradient text-black">
            <Link to="/negocios">
              Ver todos los negocios
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        }
      />
    );
  }

  const business = data.business;
  const delivery = data.delivery;
  const offerProduct = business.flash?.productId
    ? (data.products.find((item) => item._id === business.flash?.productId) ??
      null)
    : null;
  const department = getDepartment(business.department);
  const cartCount = cart?.count ?? 0;
  const cartTotal = cart?.total ?? 0;

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-clip">
      <div className="mb-4 flex w-full max-w-full min-w-0 flex-wrap items-center justify-between gap-3 overflow-x-clip text-[11px] font-semibold uppercase tracking-[0.22em]">
        <span className="text-accent">{business.category}</span>
        <Link
          to="/negocios"
          className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Todos los negocios
        </Link>
      </div>

      <div
        className={cn(
          "relative overflow-hidden rounded-3xl border",
          business.elite ? "border-amber-300/60" : "border-border/70",
        )}
      >
        <DishImage
          src={business.image}
          alt={business.name}
          className="h-44 w-full sm:h-52"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,6,7,0.15)_0%,rgba(6,6,7,0.92)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-5">
          <div className="min-w-0">
            <p
              className={cn(
                "flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em]",
                business.elite ? "text-amber-200" : "text-accent",
              )}
            >
              {business.elite && <Crown className="size-3.5" />}
              {business.elite
                ? "Local Élite"
                : `${department.label} · ${business.category}`}
              {business.eliteVerified && <EliteVerifiedSeal />}
            </p>
            <h1 className="mt-1 truncate font-display text-xl font-extrabold tracking-tight text-white text-shadow-dark sm:text-2xl">
              {business.name}
            </h1>
            <p className="mt-0.5 line-clamp-1 text-xs text-white/70">
              {business.tagline}
            </p>
            {business.flash && (
              <div className="mt-2">
                <FlashSaleBadge flash={business.flash} />
              </div>
            )}
          </div>
          <span
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-extrabold",
              business.isOpen
                ? "bg-amber-300 text-black"
                : "bg-black/70 text-white/70",
            )}
          >
            {business.isOpen ? "Abierto" : "Cerrado ahora"}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border/70 bg-card/50 px-4 py-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Star className="size-3.5 fill-accent text-accent" />
          {business.rating.toFixed(1)} ({business.reviews})
        </span>
        <span className="flex items-center gap-1">
          <Clock className="size-3.5 text-accent" />
          {business.etaMinutes + (delivery.minutes ?? 0)} min aprox.
        </span>
        <span className="flex items-center gap-1">
          <Truck className="size-3.5 text-accent" />
          {deliveryLabel(delivery, business.deliveryPromo)}
        </span>
        <span className="flex w-full min-w-0 items-center gap-1 sm:w-auto">
          <MapPin className="size-3.5 shrink-0 text-accent" />
          <span className="truncate">{business.address}</span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            aria-label={
              business.isFavorite
                ? "Quitar local de favoritos"
                : "Guardar local en favoritos"
            }
            aria-pressed={business.isFavorite}
            onClick={() => {
              if (!user || user.isAnonymous) {
                toast("Iniciá sesión para guardar locales", {
                  description:
                    "Con tu cuenta tus locales favoritos quedan guardados.",
                });
                navigate(
                  `/auth?role=buyer&returnTo=${encodeURIComponent(`/negocios/${slug}`)}`,
                );
                return;
              }
              void toggleFavorite({ businessId: business._id })
                .then((result) =>
                  toast.success(
                    result.favorite
                      ? "Local guardado"
                      : "Local quitado de favoritos",
                  ),
                )
                .catch((error) =>
                  toast.error(
                    favoriteErrorMessage(
                      error,
                      "No pudimos guardar el local",
                    ),
                  ),
                );
            }}
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border/70 text-accent transition-colors hover:border-accent/50"
          >
            <Star
              className={cn("size-4", business.isFavorite && "fill-current")}
            />
          </button>
          {cartCount > 0 && (
            <Button
              asChild
              size="sm"
              className="h-8 gap-1.5 bg-ember-gradient text-black"
            >
              <Link to="/cart">
                <ShoppingCart className="size-3.5" />
                Carrito · {money(cartTotal)}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {business.flash && (
        <section className="mt-4 rounded-2xl border border-amber-300/40 bg-amber-300/[0.07] p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200">
            <Zap className="size-3.5" /> Oferta flash
          </p>
          <p className="mt-1 font-display text-lg font-extrabold text-white">
            {business.flash.title}
          </p>
          {business.flash.detail && (
            <p className="mt-0.5 text-xs leading-relaxed text-white/70">
              {business.flash.detail}
            </p>
          )}
          <p className="mt-2 text-[11px] font-semibold text-amber-200">
            <FlashCountdown endsAt={business.flash.endsAt} />
          </p>
        </section>
      )}

      {!business.isOpen && (
        <p className="mt-4 rounded-2xl border border-primary/25 bg-primary/[0.06] px-4 py-3 text-xs text-primary">
          El local está cerrado ahora. Podés mirar el catálogo, pero no sumar
          productos hasta que abra.
        </p>
      )}

      {(coupons?.length ?? 0) > 0 && (
        <section className="mt-5 rounded-2xl border border-accent/25 bg-accent/[0.05] p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
            <TicketPercent className="size-3.5" /> Cupones de {business.name}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {coupons?.map((coupon) => (
              <li key={coupon.code} className="rounded-xl border border-accent/25 bg-black/25 px-3 py-2 text-[11px]">
                <span className="font-bold text-accent">{coupon.code}</span>
                <span className="ml-2">{coupon.label}</span>
                {coupon.minSubtotal > 0 && (
                  <span className="ml-1 text-muted-foreground">· desde {money(coupon.minSubtotal)}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-muted-foreground">Ingresá el código en el carrito para aplicar el descuento a productos de este local.</p>
        </section>
      )}

      {data.products.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={ShoppingBag}
            title="Este local todavía no publicó productos"
            description="Cuando cargue su catálogo, vas a poder comprarlo desde acá."
            action={
              <Button asChild variant="outline" className="border-border/80">
                <Link to="/negocios">Ver otros negocios</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <>
        <div className="mt-8 flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Catálogo
          </p>
          <div
            className="flex rounded-full border border-border/80 bg-secondary/40 p-1"
            role="group"
            aria-label="Vista del catálogo"
          >
            <button
              type="button"
              onClick={() => setCatalogView("grid")}
              aria-pressed={catalogView === "grid"}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors",
                catalogView === "grid"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="size-3.5" />
              Cuadrícula
            </button>
            <button
              type="button"
              onClick={() => setCatalogView("list")}
              aria-pressed={catalogView === "list"}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors",
                catalogView === "list"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Rows3 className="size-3.5" />
              Una fila
            </button>
          </div>
        </div>
        <div className="mt-4 space-y-8">
          {groups.map(([category, products]) => (
            <section key={category}>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-lg font-bold">{category}</h2>
                <span className="text-[11px] text-muted-foreground">
                  {products.length} {products.length === 1 ? "producto" : "productos"}
                </span>
              </div>
              {catalogView === "grid" ? (
              <div className="grid w-full max-w-full min-w-0 grid-cols-2 gap-3 overflow-x-clip sm:gap-4 lg:grid-cols-3">
                {products.map((product) => (
                  <article
                    key={product._id}
                    className="group w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden">
                      <ProductMedia
                        image={product.image}
                        video={product.video}
                        alt={product.name}
                        className="size-full transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(6,6,7,0.85)_100%)]" />
                      <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
                        <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-accent backdrop-blur">
                          {money(product.price)}
                        </span>
                        <PromoBadge
                          promo={product.promo}
                          withIcon={false}
                          className="px-2 py-0.5 text-[9px]"
                        />
                      </div>
                      {!product.isAvailable && (
                        <span className="absolute right-2 top-2 rounded-full border border-primary/50 bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                          Agotado
                        </span>
                      )}
                      <div className="absolute inset-x-2 bottom-2">
                        <p className="line-clamp-1 font-display text-sm font-bold text-white">
                          {product.name}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2 p-3">
                      <p className="whitespace-pre-line break-words text-[11px] leading-snug text-muted-foreground">
                        {product.description || "Sin descripción"}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Star className="size-3 fill-accent text-accent" />
                          {business.rating.toFixed(1)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {business.etaMinutes + (delivery.minutes ?? 0)} min
                        </span>
                      </div>
                      <Button
                        size="sm"
                        className="w-full gap-1.5 bg-secondary text-foreground hover:bg-accent hover:text-accent-foreground"
                        disabled={!business.isOpen || !product.isAvailable || busy === product._id}
                        onClick={() => handleProductTap(product)}
                      >
                        {busy === product._id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Plus className="size-3.5" />
                        )}
                        {!business.isOpen
                          ? "Cerrado"
                          : !product.isAvailable
                            ? "Agotado"
                            : (product.optionGroups?.length ?? 0) > 0
                              ? "Elegir"
                              : "Agregar"}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
              ) : (
              <div className="grid w-full max-w-full min-w-0 gap-3 overflow-x-clip">
                {products.map((product) => (
                  <div
                    key={product._id}
                    className="surface-raised w-full max-w-full min-w-0 gap-0 overflow-hidden rounded-2xl"
                  >
                    <div className="relative aspect-[4/3] w-full">
                      <ProductMedia
                        image={product.image}
                        video={product.video}
                        alt={product.name}
                        className="aspect-[4/3] w-full"
                      />
                      {!product.isAvailable && (
                        <span className="absolute right-2 top-2 rounded-full border border-primary/50 bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                          Agotado
                        </span>
                      )}
                      <PromoBadge promo={product.promo} className="absolute left-2 top-2" />
                    </div>
                    <div className="flex min-w-0 flex-col p-4">
                      <p className="text-base font-bold text-shadow-dark">
                        {product.name}
                      </p>
                      <p className="mt-1 whitespace-pre-line break-words text-[13px] leading-relaxed text-muted-foreground">
                        {product.description || "Sin descripción"}
                      </p>
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Star className="size-3.5 fill-accent text-accent" />
                          {business.rating.toFixed(1)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="size-3.5" />
                          {business.etaMinutes + (delivery.minutes ?? 0)} min
                        </span>
                        <span className="text-sm font-extrabold text-accent">
                          {money(product.price)}
                        </span>
                      </p>
                      <div className="mt-3">
                        <Button
                          className="w-full gap-1.5 bg-secondary text-foreground hover:bg-accent hover:text-accent-foreground"
                          disabled={!business.isOpen || !product.isAvailable || busy === product._id}
                          onClick={() => handleProductTap(product)}
                        >
                          {busy === product._id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Plus className="size-4" />
                          )}
                          {!business.isOpen
                            ? "Cerrado"
                            : !product.isAvailable
                              ? "Agotado"
                              : (product.optionGroups?.length ?? 0) > 0
                                ? "Elegir"
                                : "Agregar"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </section>
          ))}
        </div>
        </>
      )}

      <ProductOptionsDialog
        open={Boolean(optionProduct)}
        onOpenChange={(open) => {
          if (!open) {
            setOptionProduct(null);
            openedStoryParam.current = null;
          }
        }}
        product={optionProduct}
        busy={Boolean(optionProduct && busy === optionProduct._id)}
        onConfirm={(choices) => {
          if (optionProduct) {
            void handleAdd(optionProduct._id, optionProduct.name, choices);
          }
        }}
      />

      <Dialog
        open={storyProduct !== null}
        onOpenChange={(open) => {
          if (!open) {
            setStoryProduct(null);
            openedStoryParam.current = null;
          }
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto border-border/80 bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">
              {storyProduct?.name}
            </DialogTitle>
            <DialogDescription>
              Producto de la historia de {business.name}. Podés añadirlo al
              carrito desde acá.
            </DialogDescription>
          </DialogHeader>
          {storyProduct && (
            <div className="space-y-3">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border/70">
                <ProductMedia
                  image={storyProduct.image}
                  video={storyProduct.video}
                  alt={storyProduct.name}
                  className="size-full"
                />
                {!storyProduct.isAvailable && (
                  <span className="absolute right-2 top-2 rounded-full border border-primary/50 bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                    Agotado
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-display text-lg font-extrabold text-accent">
                  {money(storyProduct.price)}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {storyProduct.category}
                </span>
              </div>
              <p className="whitespace-pre-line break-words text-xs leading-relaxed text-muted-foreground">
                {storyProduct.description || "Sin descripción"}
              </p>
              <Button
                className="w-full gap-2 bg-ember-gradient text-black"
                disabled={
                  !business.isOpen ||
                  !storyProduct.isAvailable ||
                  busy === storyProduct._id
                }
                onClick={() => {
                  if ((storyProduct.optionGroups?.length ?? 0) > 0) {
                    setOptionProduct(storyProduct);
                    setStoryProduct(null);
                  } else {
                    void handleAdd(storyProduct._id, storyProduct.name);
                  }
                }}
              >
                {busy === storyProduct._id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShoppingCart className="size-4" />
                )}
                {!business.isOpen
                  ? "Cerrado por ahora"
                  : !storyProduct.isAvailable
                    ? "Agotado"
                    : (storyProduct.optionGroups?.length ?? 0) > 0
                      ? "Elegir opciones y añadir"
                      : "Añadir al carrito"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={offerOpen}
        onOpenChange={(open) => {
          setOfferOpen(open);
          if (!open) openedStoryParam.current = null;
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto border-amber-300/40 bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <Zap className="size-4 text-amber-300" />
              {business.flash?.title ?? "Oferta flash"}
            </DialogTitle>
            <DialogDescription>
              Oferta flash de {business.name}. Sumá el producto al carrito desde
              esta ventana.
            </DialogDescription>
          </DialogHeader>
          {business.flash ? (
            <div className="space-y-3">
              {business.flash.mediaUrl && (
                <div className="aspect-video overflow-hidden rounded-2xl border border-amber-300/30">
                  {business.flash.mediaKind === "video" ? (
                    <video
                      src={business.flash.mediaUrl}
                      muted
                      autoPlay
                      loop
                      playsInline
                      className="size-full object-cover"
                    />
                  ) : (
                    <img
                      src={business.flash.mediaUrl}
                      alt={`Oferta flash: ${business.flash.title}`}
                      className="size-full object-cover"
                    />
                  )}
                </div>
              )}
              {business.flash.detail && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {business.flash.detail}
                </p>
              )}
              <p className="text-[11px] font-semibold text-amber-200">
                <FlashCountdown endsAt={business.flash.endsAt} />
              </p>
              {offerProduct ? (
                <div className="space-y-3 rounded-2xl border border-border/70 bg-black/20 p-3">
                  <div className="flex gap-3">
                    <div className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-border/60">
                      <ProductMedia
                        image={offerProduct.image}
                        video={offerProduct.video}
                        alt={offerProduct.name}
                        className="size-full"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {offerProduct.name}
                      </p>
                      <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                        {offerProduct.description || "Sin descripción"}
                      </p>
                      <p className="mt-1 font-display text-base font-extrabold text-accent">
                        {money(offerProduct.price)}
                      </p>
                    </div>
                  </div>
                  <Button
                    className="w-full gap-2 bg-ember-gradient text-black"
                    disabled={
                      !business.isOpen ||
                      !offerProduct.isAvailable ||
                      busy === offerProduct._id
                    }
                    onClick={() => {
                      if ((offerProduct.optionGroups?.length ?? 0) > 0) {
                        setOptionProduct(offerProduct);
                        setOfferOpen(false);
                      } else {
                        void handleAdd(offerProduct._id, offerProduct.name);
                      }
                    }}
                  >
                    {busy === offerProduct._id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ShoppingCart className="size-4" />
                    )}
                    {!business.isOpen
                      ? "Cerrado por ahora"
                      : !offerProduct.isAvailable
                        ? "Agotado"
                        : (offerProduct.optionGroups?.length ?? 0) > 0
                          ? "Elegir opciones y añadir"
                          : "Añadir la oferta al carrito"}
                  </Button>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-amber-300/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                  Esta oferta no tiene un producto enlazado. El local puede
                  elegirlo en la pestaña Ofertas flash.
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-amber-300/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              La oferta flash ya terminó. Podés seguir viendo el catálogo del
              local.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {cartCount > 0 && (
        <div className="sticky bottom-20 z-20 mt-8 lg:bottom-4">
          <Link
            to="/cart"
            className="flex items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/[0.08] px-4 py-3 backdrop-blur-xl transition-colors hover:bg-accent/[0.14]"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-accent">
              <ShoppingCart className="size-4" />
              {cartCount} {cartCount === 1 ? "producto" : "productos"} en el carrito
            </span>
            <span className="flex items-center gap-1.5 text-sm font-bold">
              {money(cartTotal)}
              <ArrowRight className="size-4 text-accent" />
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
