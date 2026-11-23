import { BrandMark, Wordmark } from "@/components/Brand";
import { DepartmentIcon } from "@/components/DepartmentIcon";
import { DishImage } from "@/components/DishImage";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useHideOnScroll } from "@/hooks/use-hide-on-scroll";
import { DEFAULT_DEPARTMENT, DEPARTMENTS } from "@/lib/departments";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bike,
  Check,
  ChefHat,
  Clock,
  Flame,
  Heart,
  MapPin,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  Utensils,
} from "lucide-react";
import { Link } from "react-router";

const HERO_DISH = {
  name: "Doble Brasa Ahumada",
  business: "Brasa Negra",
  price: 12500,
  image:
    "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80",
  tags: ["Más pedido", "Doble carne"],
  rating: 4.9,
  eta: 28,
};

const STEPS = [
  {
    title: "Elegí el rubro",
    text: `Comida, súper, ropa, tecnología y más: ${DEPARTMENTS.length} departamentos con sus propios filtros.`,
    icon: Flame,
  },
  {
    title: "Deslizá",
    text: "Un mazo infinito de productos de distintos locales. Derecha al carrito, arriba a guardados.",
    icon: Heart,
  },
  {
    title: "Recibí",
    text: "El local prepara, un repartidor lo toma y vos seguís cada paso en vivo.",
    icon: Bike,
  },
];

const ROLES = [
  {
    title: "Compradores",
    description:
      "Descubrí productos que no sabías que querías, de comida a tecnología. Un swipe y están en camino.",
    icon: ShoppingBag,
    points: [`${DEPARTMENTS.length} rubros`, "Filtros por rubro", "Seguimiento en vivo"],
    href: "/auth?role=buyer&returnTo=%2Fswipe",
    cta: "Crear mi cuenta",
  },
  {
    title: "Negocios",
    description:
      "Tu catálogo aparece en el mazo de toda la ciudad. Cargalo en minutos.",
    icon: Store,
    points: ["Catálogo propio", "Pedidos en tiempo real", "Sin comisión por venta"],
    href: "/auth?role=business&returnTo=%2Fonboarding",
    cta: "Publicar mi local",
  },
  {
    title: "Repartidores",
    description:
      "Tomá pedidos listos, entregá y mirá tus ganancias acumuladas al instante.",
    icon: Bike,
    points: ["Pedidos disponibles", "Ganancia por envío", "Historial claro"],
    href: "/auth?role=courier&returnTo=%2Fcourier",
    cta: "Sumarme a repartir",
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 26 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.55, ease: [0.22, 0.61, 0.36, 1] as const },
};

function PhoneMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[290px] min-w-0 sm:w-[320px] sm:max-w-[320px]">
      <div className="pointer-events-none absolute -inset-10 rounded-[60px] bg-[radial-gradient(circle_at_50%_30%,rgba(255,45,85,0.28),transparent_65%)] blur-2xl" />
      <motion.div
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        className="relative rounded-[42px] border border-white/12 bg-[#0b0b0c] p-2.5 shadow-[0_50px_120px_-40px_rgba(255,45,85,0.5)]"
      >
        <div className="absolute left-1/2 top-3.5 z-20 h-1.5 w-16 -translate-x-1/2 rounded-full bg-white/15" />
        <div className="relative overflow-hidden rounded-[34px] border border-white/8 bg-black">
          <div className="flex items-center justify-between px-4 pb-2 pt-7">
            <span className="font-display text-sm font-extrabold">
              Shop To <span className="text-accent">Go</span>
            </span>
            <span className="flex items-center gap-1 text-[9px] text-white/50">
              <MapPin className="size-2.5" /> Palermo
            </span>
          </div>

          <div className="relative mx-3 h-[300px] overflow-hidden rounded-[26px]">
            <DishImage
              src={HERO_DISH.image}
              alt={HERO_DISH.name}
              className="absolute inset-0 size-full"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,6,7,0.65)_0%,transparent_35%,rgba(6,6,7,0.9)_100%)]" />
            <span className="absolute right-3 top-3 rounded-full bg-accent px-2.5 py-1 font-display text-[11px] font-bold text-black">
              {money(HERO_DISH.price)}
            </span>
            <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full border border-white/15 bg-black/50 px-2 py-1 text-[9px] font-semibold backdrop-blur">
              <Star className="size-2.5 fill-accent text-accent" />
              {HERO_DISH.rating} · {HERO_DISH.business}
            </span>
            <div className="absolute left-4 top-16 -rotate-12 rounded-lg border-2 border-accent px-2 py-1 font-display text-sm font-extrabold tracking-wider text-accent">
              LO QUIERO
            </div>
            <div className="absolute inset-x-3 bottom-3">
              <div className="mb-1.5 flex gap-1">
                {HERO_DISH.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-accent"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <p className="font-display text-lg font-extrabold leading-tight text-white">
                {HERO_DISH.name}
              </p>
              <p className="mt-0.5 text-[10px] text-white/60">
                Dos medallones al carbón, cheddar añejo y mayo de carbón.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 py-4">
            <span className="flex size-9 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary">
              <svg viewBox="0 0 24 24" fill="none" className="size-4">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="flex size-8 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-accent">
              <Star className="size-4" />
            </span>
            <span className="flex size-9 items-center justify-center rounded-full bg-ember-gradient text-black">
              <Heart className="size-4" />
            </span>
            <span className="text-[9px] uppercase tracking-widest text-white/35">
              deslizá
            </span>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.5 }}
        className="absolute bottom-24 left-0 flex max-w-[calc(100%-1rem)] items-center gap-2 rounded-2xl border border-accent/30 bg-[#151110]/95 px-3 py-2 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur sm:-left-10 sm:max-w-none"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Check className="size-4" />
        </span>
        <div>
          <p className="text-[10px] font-bold text-white">¡Es un antojo!</p>
          <p className="text-[9px] text-white/50">Sumado a tu carrito</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.5 }}
        className="absolute right-0 top-24 flex max-w-[calc(100%-1rem)] items-center gap-2 rounded-2xl border border-white/12 bg-[#151110]/95 px-3 py-2 backdrop-blur sm:-right-8 sm:max-w-none"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Bike className="size-4" />
        </span>
        <div>
          <p className="text-[10px] font-bold text-white">En camino</p>
          <p className="text-[9px] text-white/50">Llega en 12 min</p>
        </div>
      </motion.div>
    </div>
  );
}

export default function Landing() {
  const headerHidden = useHideOnScroll();
  return (
    <div className="min-h-screen w-full max-w-full min-w-0 overflow-x-clip">
      <header
        className={cn(
          "sticky top-0 z-50 header-atmosphere backdrop-blur-xl transition-transform duration-300 ease-out",
          headerHidden ? "-translate-y-full" : "translate-y-0",
        )}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link to="/bienvenida" aria-label="Shop To Go">
            <span className="sm:hidden">
              <BrandMark size={32} />
            </span>
            <span className="hidden sm:block">
              <Wordmark markSize={34} />
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#como-funciona" className="transition-colors hover:text-foreground">
              Cómo funciona
            </a>
            <a href="#roles" className="transition-colors hover:text-foreground">
              Para tu rol
            </a>
            <a href="#rubros" className="transition-colors hover:text-foreground">
              Rubros
            </a>
            <a href="#catalogo" className="transition-colors hover:text-foreground">
              Catálogo
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link to="/auth?mode=signin&returnTo=%2Fswipe">Entrar</Link>
            </Button>
            <Button asChild className="gap-2 bg-ember-gradient text-black">
              <Link to="/swipe">
                Abrir la app
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative">
        <div className="pointer-events-none absolute inset-0 grid-lines opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_72%)]" />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:pb-24 lg:pt-20">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent"
            >
              <Sparkles className="size-3.5" />
              Delivery con swipe
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.08 }}
              className="mt-5 font-display text-[42px] font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-[68px]"
            >
              Deslizá.
              <br />
              <span className="text-gradient-whim">Antojate.</span>
              <br />
              Repetí.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.16 }}
              className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg"
            >
              Shop To Go mezcla el marketplace con el gesto más adictivo
              del mundo. Productos al azar de los mejores locales de tu ciudad
              —comida, ropa, tecnología, farmacia y más—: a la derecha si te
              gusta, a la izquierda si no. Creá tu cuenta con correo y
              contraseña y empezá a deslizar.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.24 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <Button asChild size="lg" className="h-12 gap-2 bg-ember-gradient px-6 text-black">
                <Link to="/auth?role=buyer&returnTo=%2Fswipe">
                  Crear mi cuenta
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 gap-2 border-border/80 px-6"
              >
                <a href="#como-funciona">
                  <Utensils className="size-4 text-accent" />
                  Ver cómo funciona
                </a>
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.34 }}
              className="mt-10 flex flex-wrap gap-x-8 gap-y-4"
            >
              {[
                { value: "30+", label: "locales aliados" },
                { value: "100+", label: "productos en el mazo" },
                { value: String(DEPARTMENTS.length), label: "rubros para explorar" },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="font-display text-2xl font-extrabold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="relative"
          >
            <PhoneMockup />
          </motion.div>
        </div>
      </section>

      <div className="relative overflow-hidden border-y border-border/50 bg-black/25 py-4">
        <div className="mx-auto flex w-full max-w-6xl gap-2 overflow-x-auto px-4 no-scrollbar sm:px-6">
          {DEPARTMENTS.map((department) => (
            <span
              key={department.slug}
              className={cn(
                "glass-sheen flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium",
                department.slug === DEFAULT_DEPARTMENT
                  ? "border-accent/35 bg-accent/[0.08] text-accent"
                  : "border-border/70 bg-card/50 text-muted-foreground",
              )}
            >
              <DepartmentIcon name={department.icon} className="size-3.5" />
              {department.label}
            </span>
          ))}
        </div>
      </div>

      <section id="como-funciona" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <motion.div {...fadeUp} className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
            Cómo funciona
          </p>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Tres gestos y tu pedido está en la puerta
          </h2>
        </motion.div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <motion.div
              key={step.title}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: index * 0.08 }}
              className="surface-raised group relative overflow-hidden rounded-3xl p-6"
            >
              <span className="absolute right-5 top-4 font-display text-5xl font-extrabold text-white/[0.05]">
                0{index + 1}
              </span>
              <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                <step.icon className="size-5" />
              </div>
              <h3 className="mt-5 font-display text-xl font-bold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.text}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="rubros" className="relative border-y border-border/50 bg-black/20">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <motion.div
            {...fadeUp}
            className="flex flex-wrap items-end justify-between gap-6"
          >
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
                Un mazo, {DEPARTMENTS.length} rubros
              </p>
              <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                De la hamburguesa al sillón, todo se desliza
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              Cada departamento tiene filtros propios: talle, marca, familia
              olfativa, pasillo del súper y mucho más. Comida viene primero.
            </p>
          </motion.div>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DEPARTMENTS.map((department, index) => (
              <motion.div
                key={department.slug}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: Math.min(index, 5) * 0.05 }}
              >
                <Link
                  to="/swipe"
                  className={cn(
                    "glass-sheen group flex h-full items-start gap-3 rounded-2xl border p-4 transition-colors",
                    department.slug === DEFAULT_DEPARTMENT
                      ? "border-accent/30 bg-accent/[0.06] hover:bg-accent/10"
                      : "border-border/70 bg-card/50 hover:border-accent/30",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl",
                      department.slug === DEFAULT_DEPARTMENT
                        ? "bg-accent/15 text-accent"
                        : "bg-secondary text-foreground",
                    )}
                  >
                    <DepartmentIcon name={department.icon} className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {department.label}
                      {department.slug === DEFAULT_DEPARTMENT && (
                        <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
                          Por defecto
                        </span>
                      )}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {department.blurb}
                    </p>
                    <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      {department.subcategories.length} subrubros ·{" "}
                      {department.filters.length} filtros
                    </p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="roles" className="relative">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <motion.div {...fadeUp} className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
              Un solo lugar, tres roles
            </p>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              Shop To Go funciona para todos los que hacen posible el antojo
            </h2>
          </motion.div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {ROLES.map((role, index) => (
              <motion.div
                key={role.title}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: index * 0.08 }}
                className={cn(
                  "flex flex-col rounded-3xl border p-6",
                  index === 1
                    ? "border-accent/30 bg-accent/[0.05]"
                    : "border-border/70 bg-card/60",
                )}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={cn(
                      "flex size-11 items-center justify-center rounded-2xl",
                      index === 1
                        ? "bg-accent/15 text-accent"
                        : "bg-secondary text-foreground",
                    )}
                  >
                    <role.icon className="size-5" />
                  </div>
                  {index === 1 && (
                    <span className="rounded-full border border-accent/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
                      Para locales
                    </span>
                  )}
                </div>
                <h3 className="mt-5 font-display text-xl font-bold">{role.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {role.description}
                </p>
                <ul className="mt-4 space-y-1.5">
                  {role.points.map((point) => (
                    <li key={point} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Check className="size-3.5 text-accent" />
                      {point}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  variant="outline"
                  className="mt-6 w-full gap-2 border-border/80 hover:border-accent/40 hover:text-accent"
                >
                  <Link to={role.href}>
                    {role.cta}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="catalogo" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <motion.div {...fadeUp}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
              El catálogo de hoy
            </p>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              Cada sesión es un mazo distinto
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
              No hay dos mazos iguales. Mezclamos rubros, precios y barrios
              para que descubras ese producto que nunca buscarías en una lista.
              Los negocios cargan su catálogo y la ciudad desliza.
            </p>
            <div className="mt-6 space-y-3">
              {[
                { icon: ChefHat, text: "Los locales cargan su catálogo y quedan visibles al instante." },
                { icon: Clock, text: "Pedidos en tiempo real: aceptado, en cocina, listo, en camino." },
                { icon: Bike, text: "Repartidores independientes toman cada envío cuando está listo." },
              ].map((item) => (
                <div key={item.text} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-accent">
                    <item.icon className="size-4" />
                  </span>
                  <p className="text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div {...fadeUp} className="grid grid-cols-2 gap-3">
            {[
              {
                image:
                  "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=700&q=80",
                name: "Omakase 16 piezas",
                business: "Kōri Sushi",
                price: 28900,
              },
              {
                image:
                  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=700&q=80",
                name: "Air Runner 90",
                business: "Cordones · Zapatos",
                price: 189000,
              },
              {
                image:
                  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=80",
                name: "Auriculares Studio Pro",
                business: "Voltio · Electrónicos",
                price: 249000,
              },
              {
                image:
                  "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=700&q=80",
                name: "Ámbar Noir 100 ml",
                business: "Fragua · Perfumes",
                price: 98000,
              },
            ].map((dish, index) => (
              <div
                key={dish.name}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border border-border/70",
                  index % 2 === 1 && "translate-y-4",
                )}
              >
                <DishImage
                  src={dish.image}
                  alt={dish.name}
                  className="aspect-[4/5] w-full transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(6,6,7,0.92)_100%)]" />
                <div className="absolute inset-x-3 bottom-3">
                  <p className="text-[10px] uppercase tracking-wider text-accent">
                    {dish.business}
                  </p>
                  <p className="font-display text-sm font-bold text-white">{dish.name}</p>
                  <p className="text-[11px] text-white/60">{money(dish.price)}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <motion.div
          {...fadeUp}
          className="relative overflow-hidden rounded-[32px] border border-accent/20 bg-[radial-gradient(ellipse_at_top_left,rgba(255,45,85,0.2),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(255,201,60,0.16),transparent_55%)] px-6 py-12 text-center sm:px-12"
        >
          <div className="pointer-events-none absolute inset-0 noise opacity-[0.06]" />
          <div className="flex justify-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-ember-gradient text-black">
              <Flame className="size-7" />
            </span>
          </div>
          <h2 className="mx-auto mt-6 max-w-2xl font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Tu próximo antojo está a un swipe de distancia
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
            Creá tu cuenta y deslizá gratis. Si querés vender o repartir, elegí ese
            rol y activá un plan mensual fijo de ₡5.000, ₡10.000 o ₡20.000. Sin
            comisión por pedido: el 100% de tus ventas es tuyo.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="h-12 gap-2 bg-ember-gradient px-7 text-black">
              <Link to="/auth?role=buyer&returnTo=%2Fswipe">
                Crear mi cuenta
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 gap-2 border-border/80 px-7"
            >
              <Link to="/auth?role=business&returnTo=%2Fonboarding">
                <Store className="size-4 text-accent" />
                Soy un negocio
              </Link>
            </Button>
          </div>
        </motion.div>
      </section>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <Wordmark markSize={28} />
          <p className="text-xs text-muted-foreground">
            Shop To Go · el marketplace que se desliza. Del antojo al sillón.
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link to="/auth" className="hover:text-foreground">
              Entrar
            </Link>
            <a href="#roles" className="hover:text-foreground">
              Negocios
            </a>
            <a href="#roles" className="hover:text-foreground">
              Repartidores
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
