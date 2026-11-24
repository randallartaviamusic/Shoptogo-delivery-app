import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import { money } from "@/lib/format";
import {
  DEFAULT_WELCOME_OFFER,
  SUBSCRIPTION_PLAN_IDS,
  SUBSCRIPTION_PLANS,
  planOf,
  type SubscriptionAudience,
  type SubscriptionPlanId,
} from "@/lib/subscriptions";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import {
  ArrowRight,
  BadgeCheck,
  BellOff,
  Bike,
  Camera,
  Check,
  Crown,
  Gift,
  PackageCheck,
  Rocket,
  Sparkles,
  Store,
  TrendingUp,
  X,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

const STORAGE_KEY: Record<SubscriptionAudience, string> = {
  business: "stg-welcome-business",
  courier: "stg-welcome-courier",
};

type AudienceCopy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  what: string[];
  steps: { icon: typeof Store; title: string; text: string }[];
  closing: string;
};

const COPY: Record<SubscriptionAudience, AudienceCopy> = {
  business: {
    eyebrow: "Cuenta de negocio",
    title: "Tu local, vendiendo las 24 horas",
    subtitle:
      "Shop To Go pone tu catálogo frente a cientos de compradores que descubren qué comer, comprar y antojar deslizando un mazo. Sin comisiones por pedido: tarifa fija, visible y sin sorpresas.",
    what: [
      "Tus productos aparecen en el mazo de swipe con foto, precio y promo de envío.",
      "Recibís cada pedido en vivo: aceptás, preparás y marcás listo.",
      "Un repartidor retira y entrega; vos cobrás el 100% de tus productos.",
    ],
    steps: [
      {
        icon: Camera,
        title: "1 · Publicá tu catálogo",
        text: "Subí fotos, precios y promos. En minutos tu local ya vende.",
      },
      {
        icon: PackageCheck,
        title: "2 · Recibí y prepará",
        text: "Cada pedido suena en tu panel: aceptalo, cocinalo o alistalo y marcalo listo.",
      },
      {
        icon: TrendingUp,
        title: "3 · Vendé sin parar",
        text: "El repartidor retira y entrega. Historias, destacados y ofertas flash multiplican tus ventas.",
      },
    ],
    closing:
      "Mientras dormís, tu vitrina sigue abierta. El plan que elijas solo suma visibilidad y herramientas: nunca te quitamos un porcentaje de lo que vendés.",
  },
  courier: {
    eyebrow: "Cuenta de repartidor",
    title: "Tus entregas, tus ganancias",
    subtitle:
      "Shop To Go te manda ofertas de entrega cerca de vos. Aceptás las que querás, retirás con código, entregás con PIN y cobrás por cada envío. Sin jefes ni horarios fijos: vos decidís cuándo salir a ganar.",
    what: [
      "Ofertas de entrega cercanas con la ganancia clara antes de aceptar.",
      "Retiro con código del local y entrega con PIN del comprador: todo queda registrado.",
      "Seguimiento en vivo, historial y control de efectivo desde tu panel.",
    ],
    steps: [
      {
        icon: Rocket,
        title: "1 · Activá tu disponibilidad",
        text: "Marcate disponible y empezá a recibir ofertas de tu zona.",
      },
      {
        icon: Bike,
        title: "2 · Aceptá y retirá",
        text: "Elegí la entrega, retirá en el local con el código y seguí la ruta.",
      },
      {
        icon: BadgeCheck,
        title: "3 · Entregá y cobrá",
        text: "Confirmá con el PIN, cobrá el envío y mirá tus ganancias del día.",
      },
    ],
    closing:
      "Cada entrega suma. El plan que elijas solo suma prioridad, radar de zona caliente y herramientas de caja: el 100% de tus envíos es tuyo.",
  },
};

const PLAN_ACCENT: Record<SubscriptionPlanId, string> = {
  basico: "border-border/70",
  pro: "border-accent/60 ring-1 ring-accent/40",
  elite: "border-amber-300/60 ring-1 ring-amber-300/40",
};

export default function AccountWelcomeModal({
  audience,
}: {
  audience: SubscriptionAudience;
}) {
  const navigate = useNavigate();
  const subscription = useQuery(api.subscriptions.mine);
  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY[audience]) !== "1";
    } catch {
      return true;
    }
  });

  if (!open) return null;

  const copy = COPY[audience];
  const HeroIcon = audience === "business" ? Store : Bike;
  const offer = subscription?.settings?.welcomeOffer ?? DEFAULT_WELCOME_OFFER;
  const offerPlan = planOf(offer.plan);

  const close = () => setOpen(false);
  const neverAgain = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY[audience], "1");
    } catch {
      // Sin almacenamiento: igual se cierra.
    }
    setOpen(false);
  };
  const goSubscribe = () => {
    setOpen(false);
    navigate("/suscripcion");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border/80 bg-card p-0 sm:max-w-lg">
        {/* Héroe */}
        <div className="relative overflow-hidden bg-[radial-gradient(120%_140%_at_50%_0%,rgba(249,115,22,0.28)_0%,rgba(249,115,22,0.08)_38%,transparent_70%),linear-gradient(180deg,#171310_0%,#0c0a09_100%)] px-6 pb-6 pt-7 text-center sm:px-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-16 -top-16 size-48 rounded-full bg-primary/25 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 top-10 size-48 rounded-full bg-accent/20 blur-3xl"
          />
          <p className="relative inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
            <Sparkles className="size-3" />
            {copy.eyebrow}
          </p>
          <div className="relative mx-auto mt-4 flex size-14 items-center justify-center rounded-2xl bg-ember-gradient shadow-lg">
            <HeroIcon className="size-7 text-black" />
          </div>
          <DialogHeader className="relative mt-4">
            <DialogTitle className="text-center font-display text-2xl font-extrabold leading-tight text-white sm:text-[28px]">
              {copy.title}
            </DialogTitle>
            <DialogDescription className="mx-auto mt-2 max-w-md text-center text-[13px] leading-relaxed text-white/70">
              {copy.subtitle}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-6 py-6 sm:px-8">
          {/* Qué es */}
          <ul className="space-y-2">
            {copy.what.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-[13px] leading-relaxed">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent/15">
                  <Check className="size-3 text-accent" />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          {/* Cómo funciona */}
          <div className="grid gap-2 sm:grid-cols-3">
            {copy.steps.map((step) => (
              <div
                key={step.title}
                className="rounded-2xl border border-border/70 bg-black/20 p-3"
              >
                <step.icon className="size-5 text-accent" />
                <p className="mt-2 text-xs font-bold">{step.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {step.text}
                </p>
              </div>
            ))}
          </div>

          {/* Oferta primer mes gratis */}
          {offer.enabled && (
            <div className="relative overflow-hidden rounded-2xl border border-accent/50 bg-accent/[0.08] p-4">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-accent/25 blur-2xl"
              />
              <p className="flex items-center gap-2 text-sm font-extrabold text-accent">
                <Gift className="size-4" />
                Primer mes gratis: {offerPlan.name} {offer.freeDays} días sin pagar
              </p>
              <p className="mt-1.5 text-xs font-semibold">{offer.title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                {offer.description}
              </p>
            </div>
          )}

          {/* Planes */}
          <div>
            <p className="text-center text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Planes y beneficios
            </p>
            <div className="mt-3 space-y-3">
              {SUBSCRIPTION_PLAN_IDS.map((id) => {
                const plan = SUBSCRIPTION_PLANS[id as SubscriptionPlanId];
                const popular = id === "pro";
                return (
                  <div
                    key={id}
                    className={cn(
                      "rounded-2xl border bg-black/20 p-4",
                      PLAN_ACCENT[id as SubscriptionPlanId],
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 font-display text-base font-extrabold">
                        {id === "elite" && (
                          <Crown className="size-4 text-amber-300" />
                        )}
                        {plan.name}
                        {popular && (
                          <span className="rounded-full bg-accent px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-accent-foreground">
                            El más elegido
                          </span>
                        )}
                      </p>
                      <p className="font-display text-base font-extrabold text-accent">
                        {money(plan.price)}
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          /mes
                        </span>
                      </p>
                    </div>
                    <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
                      {plan.tagline}
                    </p>
                    <ul className="mt-2.5 space-y-1.5">
                      {plan.benefits[audience].map((benefit) => (
                        <li
                          key={benefit}
                          className="flex items-start gap-2 text-[12px] leading-relaxed"
                        >
                          <Check className="mt-0.5 size-3.5 shrink-0 text-accent" />
                          <span>{benefit}</span>
                        </li>
                      ))}
                    </ul>
                    {plan.note && (
                      <p className="mt-2.5 rounded-xl border border-accent/30 bg-accent/[0.07] p-2.5 text-[10.5px] leading-relaxed text-muted-foreground">
                        {plan.note}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
              Pagá por 1, 3, 6 o 12 meses: desde 3 meses tenés 10% de descuento.
              Cambiá de plan cuando quieras; el nuevo plan corre desde el día
              del cambio. {copy.closing}
            </p>
          </div>

          {/* Botones */}
          <div className="flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row">
            <Button
              type="button"
              variant="ghost"
              className="flex-1 gap-1.5"
              onClick={close}
            >
              <X className="size-4" />
              Cerrar
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1 gap-1.5"
              onClick={neverAgain}
            >
              <BellOff className="size-4" />
              No volver a mostrar
            </Button>
            <Button
              type="button"
              className="flex-1 gap-1.5 bg-ember-gradient text-black"
              onClick={goSubscribe}
            >
              Ir a suscribirse
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
