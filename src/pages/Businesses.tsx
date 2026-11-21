import { EmptyState, PageHeader } from "@/components/AppShell";
import { DepartmentIcon } from "@/components/DepartmentIcon";
import { DishImage } from "@/components/DishImage";
import { EliteAura } from "@/components/EliteAura";
import { ProductMedia } from "@/components/ProductMedia";
import { PromoBadge } from "@/components/PromoBadge";
import { promoDiscount } from "@/lib/promo";
import type { PromoKind } from "@/lib/promo";
import { LoopRow } from "@/components/LoopRow";
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
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Loader2,
  MapPin,
  Plus,
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
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

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

  const rows = directory ?? [];
  const term = normalize(search.trim());
  const searching = term.length > 0;

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
        ? rows
        : rows.filter((business) => business.department === departmentSlug),
    [rows, departmentSlug],
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
    return Array.from(map.entries())
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
  }, [filtered, departmentSlug, searching, categories]);

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
    <div>
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
  };
  searchTerm: string;
  onToggleFavorite: (businessId: Id<"businesses">) => void;
}) {
  return (
    <article
      className={cn(
        "surface-raised group relative w-[15rem] shrink-0 overflow-hidden rounded-2xl transition-colors hover:border-accent/35 sm:w-[17rem]",
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
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
            {business.elite && (
              <span className="rounded bg-amber-300 px-1 py-0.5 text-[8px] font-extrabold tracking-wider text-black">
                Élite
              </span>
            )}
            {business.category}
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
  const toggleFavorite = useMutation(api.businesses.toggleFavorite);
  const data = useQuery(api.businesses.storefront, { slug });
  const coupons = useQuery(api.coupons.forSlug, { slug });
  const cart = useQuery(api.cart.myCart, {});
  const addToCart = useMutation(api.cart.add);
  const [busy, setBusy] = useState<string | null>(null);

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

  const handleAdd = async (productId: Id<"products">, name: string) => {
    if (!user) {
      requireAccount();
      return;
    }
    setBusy(productId);
    try {
      await addToCart({ productId });
      toast.success("Sumado al carrito", { description: name });
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
  const department = getDepartment(business.department);
  const cartCount = cart?.count ?? 0;
  const cartTotal = cart?.total ?? 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.22em]">
        <span className="text-accent">{business.category}</span>
        <Link
          to="/negocios"
          className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Todos los negocios
        </Link>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-border/70">
        <DishImage src={business.image} alt={business.name} className="h-44 w-full sm:h-56" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,6,7,0.15)_0%,rgba(6,6,7,0.92)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
              {department.label} · {business.category}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                {business.name}
              </h1>
              <button
                type="button"
                aria-label={business.isFavorite ? "Quitar local de favoritos" : "Guardar local en favoritos"}
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
                className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/50 text-accent"
              >
                <Star className={cn("size-4", business.isFavorite && "fill-current")} />
              </button>
            </div>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-white/70">
              {business.tagline}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/65">
              <span className="flex items-center gap-1">
                <Star className="size-3 fill-accent text-accent" />
                {business.rating.toFixed(1)} ({business.reviews})
              </span>
              <span className="flex items-center gap-1">
                <Clock className="size-3 text-accent" />
                {business.etaMinutes + (delivery.minutes ?? 0)} min aprox.
              </span>
              <span className="flex items-center gap-1">
                <Truck className="size-3 text-accent" />
                {deliveryLabel(delivery, business.deliveryPromo)}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="size-3 text-accent" />
                {business.address}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
                business.isOpen ? "bg-accent text-accent-foreground" : "bg-black/70 text-white/70",
              )}
            >
              {business.isOpen ? "Abierto" : "Cerrado ahora"}
            </span>
            {cartCount > 0 && (
              <Button asChild size="sm" className="gap-1.5 bg-ember-gradient text-black">
                <Link to="/cart">
                  <ShoppingCart className="size-3.5" />
                  Carrito · {money(cartTotal)}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

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
        <div className="mt-8 space-y-8">
          {groups.map(([category, products]) => (
            <section key={category}>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-lg font-bold">{category}</h2>
                <span className="text-[11px] text-muted-foreground">
                  {products.length} {products.length === 1 ? "producto" : "productos"}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {products.map((product) => (
                  <div
                    key={product._id}
                    className="surface-raised flex gap-3 rounded-2xl p-3"
                  >
                    <div className="relative shrink-0">
                      <ProductMedia
                        image={product.image}
                        video={product.video}
                        alt={product.name}
                        className="size-20 rounded-xl"
                      />
                      <PromoBadge
                        promo={product.promo}
                        withIcon={false}
                        className="absolute inset-x-1 bottom-1 justify-center px-1 py-0.5 text-[9px]"
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <span className="truncate text-shadow-dark">
                          {product.name}
                        </span>
                        {!product.isAvailable && (
                          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                            Agotado
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                        {product.description || "Sin descripción"}
                      </p>
                      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                        <span className="font-display text-sm font-bold">
                          {money(product.price)}
                        </span>
                        <Button
                          size="sm"
                          className="h-8 gap-1 bg-ember-gradient px-2.5 text-[11px] text-black"
                          disabled={!business.isOpen || !product.isAvailable || busy === product._id}
                          onClick={() => handleAdd(product._id, product.name)}
                        >
                          {busy === product._id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Plus className="size-3.5" />
                          )}
                          {product.isAvailable ? "Agregar" : "Agotado"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

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
