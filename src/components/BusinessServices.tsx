import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { money } from "@/lib/format";
import { DEFAULT_EXTRA_SERVICES } from "@/lib/extraServices";
import { whatsappHref } from "@/lib/subscriptions";
import { useQuery } from "convex/react";
import {
  Bike,
  Camera,
  Gift,
  Images,
  Loader2,
  Megaphone,
  MessageCircle,
  Printer,
  Sparkles,
  Store,
} from "lucide-react";

const SERVICE_ICONS = {
  camera: Camera,
  images: Images,
  megaphone: Megaphone,
  printer: Printer,
  sparkles: Sparkles,
  store: Store,
  bike: Bike,
  gift: Gift,
} as const;

export default function BusinessServices({
  businessName,
  whatsappNumber,
}: {
  businessName: string;
  whatsappNumber: string;
}) {
  const remote = useQuery(api.extraServices.active);
  const services = remote ?? DEFAULT_EXTRA_SERVICES;

  return (
    <div className="space-y-4">
      <div className="surface-raised overflow-hidden rounded-3xl">
        <div className="relative bg-[radial-gradient(120%_140%_at_50%_0%,rgba(249,115,22,0.25)_0%,rgba(249,115,22,0.07)_38%,transparent_70%),linear-gradient(180deg,#171310_0%,#0c0a09_100%)] px-5 pb-5 pt-6 text-center sm:px-6">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
            <Sparkles className="size-3" />
            Servicios adicionales
          </p>
          <h2 className="mx-auto mt-3 max-w-md font-display text-xl font-extrabold leading-tight text-white sm:text-2xl">
            ¿No tenés tiempo? Nosotros lo hacemos por vos
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-white/70">
            Contratá un colaborador de Shop To Go para dejar tu tienda lista,
            darle publicidad o vestir tu local. Pagos únicos, sin mensualidad.
          </p>
        </div>
      </div>

      {remote === undefined ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {services.map((service) => {
            const Icon =
              SERVICE_ICONS[
                service.icon as keyof typeof SERVICE_ICONS
              ] ?? Sparkles;
            return (
              <div
                key={`${service.name}-${service.price}`}
                className="surface-raised flex flex-col rounded-3xl p-5"
              >
                <div className="flex size-11 items-center justify-center rounded-2xl bg-ember-gradient">
                  <Icon className="size-5 text-black" />
                </div>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-accent">
                  {service.headline}
                </p>
                <h3 className="mt-1 font-display text-lg font-extrabold leading-tight">
                  {service.name}
                </h3>
                <p className="mt-1 font-display text-xl font-extrabold text-accent">
                  {money(service.price)}
                  <span className="ml-1 text-[11px] font-semibold text-muted-foreground">
                    pago único
                  </span>
                </p>
                <ul className="mt-3 flex-1 space-y-1.5">
                  {service.details.map((detail) => (
                    <li
                      key={detail}
                      className="flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground"
                    >
                      <span
                        aria-hidden
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent"
                      />
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  className="mt-4 w-full gap-2 bg-ember-gradient text-black"
                >
                  <a
                    href={whatsappHref(
                      whatsappNumber,
                      `Hola Shop To Go, soy de la tienda ${businessName} y quiero contratar el servicio adicional: ${service.name} (${money(service.price)} pago único).`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="size-4" />
                    Solicitar por WhatsApp
                  </a>
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
        Al solicitar, se abre tu WhatsApp con el mensaje listo. Coordinamos el
        pago y la visita o la publicación directamente por ahí.
      </p>
    </div>
  );
}
