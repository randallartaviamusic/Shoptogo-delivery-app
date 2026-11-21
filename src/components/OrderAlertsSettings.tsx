import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { playOrderChime } from "@/lib/orderChime";
import {
  currentPushState,
  disableOrderPush,
  enableOrderPush,
  type PushState,
} from "@/lib/push";
import { formatSinpeNumber } from "@/lib/sinpe";
import { cn } from "@/lib/utils";
import { useConvex, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import {
  BellOff,
  BellRing,
  Check,
  Loader2,
  MessageCircle,
  Play,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";

type Audience = "business" | "courier" | "buyer";

const COPY: Record<
  Audience,
  { title: string; description: string; success: string; whatsapp: string }
> = {
  business: {
    title: "Avisos de pedidos",
    description:
      "Cuando un comprador confirma un pedido, este teléfono suena y muestra la notificación aunque Shop To Go esté cerrada.",
    success:
      "Este teléfono va a sonar cuando un comprador confirme un pedido.",
    whatsapp: "",
  },
  courier: {
    title: "Avisos de entregas",
    description:
      "Cuando hay un pedido listo que podés aceptar, este teléfono suena y muestra la notificación aunque Shop To Go esté cerrada.",
    success:
      "Este teléfono va a sonar cuando haya una entrega disponible para vos.",
    whatsapp:
      "Las ofertas de entrega también se envían a tu WhatsApp si tu perfil tiene número.",
  },
  buyer: {
    title: "Avisos de tus pedidos",
    description:
      "Enterate cuando el repartidor está en la puerta, aunque Shop To Go esté cerrada.",
    success: "Este teléfono va a sonar cuando tu pedido llegue a la puerta.",
    whatsapp:
      "Si activaste los avisos por WhatsApp en tu perfil, también te avisamos por ahí.",
  },
};

/**
 * Panel para activar los avisos del teléfono. Lo usan el negocio, el
 * repartidor y el comprador: el permiso y la suscripción push se piden desde
 * acá, y el texto cambia según quién lo esté viendo.
 */
export function OrderAlertsSettings({
  audience,
  whatsappPhone,
  className,
}: {
  audience: Audience;
  whatsappPhone?: string;
  className?: string;
}) {
  const convex = useConvex();
  const channels = useQuery(api.notifications.channelStatus, {});
  const [state, setState] = useState<PushState | "loading">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    currentPushState()
      .then((next) => {
        if (alive) setState(next);
      })
      .catch(() => {
        if (alive) setState("idle");
      });
    return () => {
      alive = false;
    };
  }, []);

  const copy = COPY[audience];

  const activate = async () => {
    setBusy(true);
    try {
      const next = await enableOrderPush(convex);
      setState(next);
      if (next === "subscribed") {
        toast.success("Avisos activados", { description: copy.success });
      } else if (next === "denied") {
        toast.error("El navegador bloqueó las notificaciones", {
          description:
            "Habilitá los avisos para este sitio desde los ajustes del navegador.",
        });
      } else if (next === "ios-install") {
        toast("Primero instalá la app", {
          description:
            "En iPhone: Safari → Compartir → Añadir a pantalla de inicio, abrila desde ahí y activá los avisos.",
        });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos activar los avisos",
      );
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    setBusy(true);
    try {
      const next = await disableOrderPush(convex);
      setState(next);
      toast("Avisos desactivados en este teléfono");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No pudimos desactivar los avisos",
      );
    } finally {
      setBusy(false);
    }
  };

  const phone = formatSinpeNumber(whatsappPhone);
  const subscribed = state === "subscribed";
  const whatsappPending = Boolean(channels && !channels.whatsappReady);

  if (subscribed) {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-accent/25 bg-accent/[0.05] px-3.5 py-2.5",
          className,
        )}
      >
        <p className="flex items-center gap-2 text-[11px] font-medium text-accent">
          <BellRing className="size-3.5" /> Avisos activos en este teléfono
        </p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => playOrderChime({ force: true })}
          >
            <Play className="size-3" /> Probar sonido
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] text-muted-foreground"
            onClick={deactivate}
            disabled={busy}
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : null}
            Desactivar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-2xl border border-border/70 bg-black/20 p-3",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <BellOff className="size-4" />
          </span>
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
              <Smartphone className="size-3.5" /> {copy.title}
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              {copy.description}
            </p>
          </div>
        </div>
        {state === "loading" ? (
          <Loader2 className="mt-1 size-4 animate-spin text-muted-foreground" />
        ) : (
          <span className="rounded-full border border-border/80 bg-secondary/50 px-2 py-1 text-[10px] font-semibold text-muted-foreground">
            Inactivos
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={activate}
          disabled={busy || state === "unsupported" || state === "ios-install"}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <BellRing className="size-3.5" />
          )}
          Activar avisos en este teléfono
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => playOrderChime({ force: true })}
        >
          <Play className="size-3.5" />
          Probar sonido
        </Button>
      </div>

      {state === "unsupported" && (
        <p className="text-[10px] leading-relaxed text-amber-300">
          Este navegador no permite notificaciones. En Android usá Chrome; en
          iPhone usá Safari (iOS 16.4 o superior) y agregá Shop To Go a la
          pantalla de inicio.
        </p>
      )}
      {state === "ios-install" && (
        <p className="text-[10px] leading-relaxed text-amber-300">
          En iPhone, abrí Shop To Go en Safari y tocá Compartir → Añadir a
          pantalla de inicio. Abrila desde ese ícono y volvé a activar los
          avisos.
        </p>
      )}
      {state === "denied" && (
        <p className="text-[10px] leading-relaxed text-amber-300">
          Las notificaciones están bloqueadas para este sitio. Habilitalas en
          los ajustes del navegador o del teléfono y recargá la página.
        </p>
      )}

      <p className="flex items-start gap-1.5 border-t border-border/60 pt-2.5 text-[10px] leading-relaxed text-muted-foreground">
        <MessageCircle className="mt-0.5 size-3.5 shrink-0 text-accent" />
        {audience === "business" ? (
          phone ? (
            <span>
              Cada pedido nuevo también se manda solo al WhatsApp{" "}
              <strong className="text-foreground">{phone}</strong>
              {whatsappPending
                ? " (el envío automático se activa cuando la plataforma conecte el servicio de mensajes)."
                : "."}
            </span>
          ) : (
            <span>
              Agregá el WhatsApp para comprobantes para recibir el pedido
              también como mensaje.
            </span>
          )
        ) : (
          <span>
            {copy.whatsapp}
            {whatsappPending
              ? " Se activa cuando la plataforma conecte el servicio de mensajes."
              : ""}
          </span>
        )}
      </p>
    </div>
  );
}
