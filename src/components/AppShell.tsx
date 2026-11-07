import { BrandMark, Wordmark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { money, ROLE_HOME, ROLE_LABEL, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bike,
  Bookmark,
  ChevronRight,
  ClipboardList,
  Flame,
  History,
  LayoutDashboard,
  Loader2,
  LogOut,
  Navigation,
  Package,
  ReceiptText,
  ShoppingBag,
  Store,
  UserRound,
} from "lucide-react";
import {
  useEffect,
  useRef,
  type ComponentType,
  type ReactNode,
} from "react";
import { Link, Navigate, useLocation, useNavigate, useOutlet } from "react-router";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const BUYER_NAV: NavItem[] = [
  { to: "/swipe", label: "Antojo", icon: Flame },
  { to: "/orders", label: "Pedidos", icon: ReceiptText },
  { to: "/favorites", label: "Guardados", icon: Bookmark },
  { to: "/profile", label: "Perfil", icon: UserRound },
];

const BUSINESS_NAV: NavItem[] = [
  { to: "/business", label: "Panel", icon: LayoutDashboard },
  { to: "/business?tab=orders", label: "Pedidos", icon: ClipboardList },
  { to: "/business?tab=menu", label: "Productos", icon: Package },
  { to: "/profile", label: "Perfil", icon: UserRound },
];

const COURIER_NAV: NavItem[] = [
  { to: "/courier", label: "Disponibles", icon: Bike },
  { to: "/courier?tab=active", label: "En curso", icon: Navigation },
  { to: "/courier?tab=history", label: "Historial", icon: History },
  { to: "/profile", label: "Perfil", icon: UserRound },
];

const BUYER_ROUTES = ["/swipe", "/cart", "/orders", "/favorites"];

function navFor(role: string) {
  if (role === "business") return BUSINESS_NAV;
  if (role === "courier") return COURIER_NAV;
  return BUYER_NAV;
}

export function AppShell() {
  const { user, isLoading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const outlet = useOutlet();
  const cart = useQuery(api.cart.myCart);
  const ensureCatalog = useMutation(api.seed.ensure);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    ensureCatalog().catch(() => {
      /* the demo catalog already exists or the network hiccuped */
    });
  }, [ensureCatalog]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </main>
    );
  }

  // Ya no hay modo invitado: sin cuenta registrada no se entra a la app.
  if (!user || user.isAnonymous) {
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Navigate to={`/auth?returnTo=${encodeURIComponent(returnTo)}`} replace />
    );
  }

  const role = user.role ?? null;
  if (!role) return <Navigate to="/onboarding" replace />;

  const home = ROLE_HOME[role] ?? "/swipe";
  const isBuyerRoute = BUYER_ROUTES.includes(location.pathname);
  if (role !== "buyer" && isBuyerRoute) {
    return <Navigate to={home} replace />;
  }
  if (role === "buyer" && ["/business", "/courier"].includes(location.pathname)) {
    return <Navigate to="/swipe" replace />;
  }

  const nav = navFor(role);
  const current = `${location.pathname}${location.search}`;
  const cartCount = cart?.count ?? 0;
  const cartTotal = cart?.total ?? 0;

  const handleSignOut = async () => {
    await signOut();
    navigate("/swipe");
  };

  return (
    <div className="min-h-screen lg:pl-[272px]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[272px] flex-col border-r border-border/70 bg-sidebar/80 px-5 py-6 backdrop-blur-xl lg:flex">
        <Link to={home} className="px-1">
          <Wordmark />
        </Link>

        <div className="mt-8 space-y-1.5">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">
            {ROLE_LABEL[role]}
          </p>
          {nav.map((item) => {
            const active = current === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/12 text-foreground"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="sidebar-active"
                    className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <Icon
                  className={cn(
                    "size-[18px]",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </div>

        {role === "buyer" && (
          <Link
            to="/cart"
            className="surface-raised mt-6 block rounded-2xl p-4 transition-colors hover:border-accent/30"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <ShoppingBag className="size-4 text-accent" />
                Tu antojo
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </div>
            <p className="mt-3 font-display text-2xl font-bold">{money(cartTotal)}</p>
            <p className="text-xs text-muted-foreground">
              {cartCount === 0
                ? "Todavía no elegiste nada"
                : `${cartCount} ${cartCount === 1 ? "producto" : "productos"} en el carrito`}
            </p>
          </Link>
        )}

        <div className="mt-auto flex items-center gap-3 rounded-2xl border border-border/70 p-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-sm font-bold text-primary">
              {initials(user.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {user.name ?? "Sin nombre"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {ROLE_LABEL[role]}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Cerrar sesión"
              className="size-8 text-muted-foreground hover:text-primary"
              onClick={handleSignOut}
            >
              <LogOut className="size-4" />
            </Button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Link to={home} aria-label="Capricho Express">
          <BrandMark size={30} />
        </Link>
        <div className="flex items-center gap-1">
          {role === "buyer" && (
            <Link to="/cart" className="relative">
              <Button variant="ghost" size="icon" aria-label="Carrito">
                <ShoppingBag className="size-5" />
              </Button>
              {cartCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {cartCount}
                </span>
              )}
            </Link>
          )}
          {role === "business" && (
            <Link to="/business" aria-label="Mi local">
              <Button variant="ghost" size="icon">
                <Store className="size-5" />
              </Button>
            </Link>
          )}
          <Link to="/profile" aria-label="Perfil">
            <div className="ml-1 flex size-9 items-center justify-center rounded-xl bg-primary/15 text-xs font-bold text-primary">
              {initials(user.name)}
            </div>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-32 pt-6 sm:px-6 lg:px-10 lg:pb-14 lg:pt-10">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${location.pathname}${location.search}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {outlet as ReactNode}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 px-2 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-between">
          {nav.map((item) => {
            const active = current === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="relative flex flex-1 flex-col items-center gap-1 py-3 text-[10px] font-semibold uppercase tracking-wider"
              >
                <Icon
                  className={cn(
                    "size-5 transition-colors",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span
                  className={cn(
                    "transition-colors",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </span>
                {active && (
                  <motion.span
                    layoutId="mobile-active"
                    className="absolute -top-px h-[2px] w-10 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** Small shared header used inside the app pages. */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
            <span className="inline-block size-1.5 rounded-full bg-accent" />
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface-raised flex flex-col items-center rounded-3xl px-6 py-14 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-6" />
      </div>
      <h3 className="mt-4 font-display text-lg font-bold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export { BrandMark };
