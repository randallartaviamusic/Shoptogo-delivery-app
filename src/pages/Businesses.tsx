import { EmptyState, PageHeader } from "@/components/AppShell";
import { DepartmentIcon } from "@/components/DepartmentIcon";
import { DishImage } from "@/components/DishImage";
import { LoopRow } from "@/components/LoopRow";
import { ModeSwitch } from "@/components/ModeSwitch";
import { Button } from "@/components/ui/button";
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
  Star,
  Store,
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

export default function BusinessesPage() {
  const { slug } = useParams();
  return slug ? <Storefront slug={slug} /> : <Directory />;
}

function Directory() {
  const directory = useQuery(api.businesses.directory);
  const [departmentSlug, setDepartmentSlug] = useState("todos");
  const [category, setCategory] = useState("todas");
  const [search, setSearch] = useState("");

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
    const counts = new Map<string, number>();
    for (const business of departmentBusinesses) {
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
  }, [departmentBusinesses, departmentSlug]);

  const filtered = useMemo(() => {
    if (searching) {
      return rows.filter((business) => normalize(business.name).includes(term));
    }
    return departmentBusinesses.filter(
      (business) => category === "todas" || business.category === category,
    );
  }, [rows, departmentBusinesses, searching, term, category]);

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

  const chooseDepartment = (slug: string) => {
    setDepartmentSlug(slug);
    setCategory("todas");
  };

  return (
    <div>
      <PageHeader
        eyebrow={<ModeSwitch mode="negocios" />}
        title="Todos los negocios"
        description="Entrá al local que quieras y comprá directo de su catálogo completo, sin deslizar."
        action={
          <div className="flex items-center gap-2 rounded-full border border-border/80 bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground">
            <Store className="size-3.5 text-accent" />
            {totalOpen} {totalOpen === 1 ? "local abierto" : "locales abiertos"}
          </div>
        }
      />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar negocios por nombre..."
          className="h-11 rounded-2xl border-border/80 bg-card/60 pl-9 pr-10"
          aria-label="Buscar negocios por nombre"
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

      {!searching && (
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
      )}

      {!searching && departmentSlug !== "todos" && categories.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setCategory("todas")}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
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
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
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
          title={searching ? "No encontramos ese negocio" : "Todavía no hay locales acá"}
          description={
            searching
              ? `Ningún local coincide con “${search.trim()}”. Probá con otro nombre.`
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
                  <BusinessCard key={business._id} business={business} />
                ))}
              </LoopRow>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

type DeliveryInfo = {
  feeFrom: number;
  fee: number | null;
  distanceKm: number | null;
  available: boolean;
};

function deliveryLabel(delivery: DeliveryInfo) {
  if (!delivery.available) return "Fuera de cobertura";
  if (delivery.fee === null) return `Envío desde ${money(delivery.feeFrom)}`;
  return `Envío ${money(delivery.fee)} · ${formatKm(delivery.distanceKm ?? 0)}`;
}

function BusinessCard({
  business,
}: {
  business: {
    name: string;
    slug: string;
    tagline: string;
    image: string;
    category: string;
    rating: number;
    reviews: number;
    isOpen: boolean;
    etaMinutes: number;
    delivery: DeliveryInfo;
    productCount: number;
    minPrice: number | null;
  };
}) {
  return (
    <Link
      to={`/negocios/${business.slug}`}
      className="surface-raised group flex w-[15rem] shrink-0 flex-col overflow-hidden rounded-2xl transition-colors hover:border-accent/35 sm:w-[17rem]"
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
        <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full border border-white/15 bg-black/55 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur">
          <Star className="size-2.5 fill-accent text-accent" />
          {business.rating.toFixed(1)}
        </span>
        <div className="absolute inset-x-3 bottom-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
            {business.category}
          </p>
          <p className="truncate font-display text-sm font-extrabold text-white">
            {business.name}
          </p>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
          {business.tagline}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-3 text-accent" />
            {business.etaMinutes} min
          </span>
          <span className="flex items-center gap-1">
            <Truck className="size-3 text-accent" />
            {deliveryLabel(business.delivery)}
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
  );
}

function Storefront({ slug }: { slug: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const data = useQuery(api.businesses.storefront, { slug });
  const cart = useQuery(api.cart.myCart);
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
        <ModeSwitch mode="negocios" suffix={business.category} />
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
            <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              {business.name}
            </h1>
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
                {business.etaMinutes} min
              </span>
              <span className="flex items-center gap-1">
                <Truck className="size-3 text-accent" />
                {deliveryLabel(delivery)}
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
                    <DishImage
                      src={product.image}
                      alt={product.name}
                      className="size-20 shrink-0 rounded-xl"
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="truncate text-sm font-semibold">{product.name}</p>
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
                          disabled={!business.isOpen || busy === product._id}
                          onClick={() => handleAdd(product._id, product.name)}
                        >
                          {busy === product._id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Plus className="size-3.5" />
                          )}
                          Agregar
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
