import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { money, ORDER_STATUS, relativeTime } from "@/lib/format";
import { whatsappHref } from "@/lib/subscriptions";
import {
  CANCELLATION_RULES,
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_META,
  SUPPORT_STATUS_META,
  supportStatusOf,
} from "@/lib/trust";
import type { SupportCategory, SupportStatus } from "@/lib/trust";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  LifeBuoy,
  Loader2,
  MessageCircle,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

const STATUS_TONE: Record<SupportStatus, string> = {
  open: "border-primary/40 bg-primary/10 text-primary",
  in_review: "border-accent/40 bg-accent/10 text-accent",
  resolved: "border-accent/40 bg-accent/10 text-accent",
};

export default function HelpPage() {
  const [params] = useSearchParams();
  const mine = useQuery(api.support.mine);
  const choices = useQuery(api.orders.myOrderChoices);
  const settings = useQuery(api.subscriptions.paymentSettings);
  const create = useMutation(api.support.create);

  const [category, setCategory] = useState<SupportCategory>("payment");
  const [orderId, setOrderId] = useState(params.get("order") ?? "");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const whatsapp = settings?.whatsappNumbers[0] ?? null;
  const whatsappLink = whatsapp
    ? whatsappHref(
        whatsapp,
        "Hola, necesito ayuda con un pedido de Shop To Go. Mi caso es:",
      )
    : null;

  const handleSubmit = async () => {
    if (message.trim().length < 10) {
      toast.error("Contanos un poco más: al menos 10 caracteres");
      return;
    }
    setSending(true);
    try {
      await create({
        category,
        message,
        orderId: orderId ? (orderId as Id<"orders">) : undefined,
      });
      toast.success("Caso abierto", {
        description:
          "La administración lo va a revisar y te responde acá con el estado actualizado.",
      });
      setMessage("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos abrir el caso",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-clip">
      <PageHeader
        eyebrow="Ayuda"
        title="Estamos para ayudarte"
        description="Pagos en efectivo, productos, direcciones, entregas y cancelaciones. Abrí un caso y la administración te responde con el estado."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section className="surface-raised rounded-3xl p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <LifeBuoy className="size-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold">Abrir un caso</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Contanos qué pasó con el pago, el producto, la dirección o la
                entrega. Si es un pedido concreto, elegilo para que veamos el
                detalle completo.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label>Tipo de problema</Label>
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as SupportCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORT_CATEGORIES.map((id) => (
                    <SelectItem key={id} value={id}>
                      {SUPPORT_CATEGORY_META[id].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                {SUPPORT_CATEGORY_META[category].hint}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Pedido relacionado (opcional)</Label>
              <Select
                value={orderId || "none"}
                onValueChange={(value) =>
                  setOrderId(value === "none" ? "" : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegí un pedido" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin pedido específico</SelectItem>
                  {(choices ?? []).map((order) => (
                    <SelectItem key={order._id} value={order._id}>
                      {order.code} · {ORDER_STATUS[order.status].label} ·{" "}
                      {money(order.total)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="help-message">Qué pasó</Label>
              <Textarea
                id="help-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={1200}
                placeholder="Ej: pagué con un billete de ₡20.000, el total era ₡12.500 y el repartidor no tenía cambio..."
                className="min-h-28 resize-none"
              />
              <p className="text-right text-[10px] text-muted-foreground">
                {message.length}/1200
              </p>
            </div>

            <Button
              className="h-11 w-full gap-2 bg-ember-gradient text-black"
              disabled={sending}
              onClick={() => void handleSubmit()}
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Enviar caso a la administración
            </Button>
          </div>
        </section>

        <div className="space-y-4">
          <section className="surface-raised rounded-3xl p-5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
              <MessageCircle className="size-3.5" /> Contacto directo
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Si el caso es urgente, escribinos por WhatsApp. Adjuntá el código
              del pedido y una foto del comprobante o del producto.
            </p>
            {whatsappLink ? (
              <Button
                asChild
                className="mt-3 w-full gap-1.5 bg-[#25d366] text-black hover:bg-[#1ebe5b]"
              >
                <a href={whatsappLink} target="_blank" rel="noreferrer">
                  <MessageCircle className="size-4" />
                  Abrir WhatsApp
                  <ExternalLink className="size-3.5" />
                </a>
              </Button>
            ) : (
              <p className="mt-3 text-[11px] text-muted-foreground">
                El número de contacto lo configura la administración.
              </p>
            )}
            <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent" />
              Los casos quedan registrados con fecha, cuenta y pedido. No se
              borran al resolverlos.
            </p>
          </section>

          <section className="surface-raised rounded-3xl p-5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
              <Clock className="size-3.5" /> Reglas de cancelación
            </p>
            <div className="mt-3 space-y-3">
              {CANCELLATION_RULES.map((rule) => (
                <div key={rule.audience}>
                  <p className="text-xs font-semibold">{rule.audience}</p>
                  <ul className="mt-1 space-y-1 text-[10px] leading-relaxed text-muted-foreground">
                    {rule.rules.map((item) => (
                      <li key={item} className="flex gap-1.5">
                        <span className="mt-1 size-1 shrink-0 rounded-full bg-accent" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section className="surface-raised mt-4 rounded-3xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold">Mis casos</h2>
          <span className="text-[11px] text-muted-foreground">
            {(mine?.tickets.length ?? 0)} casos
          </span>
        </div>
        {!mine || mine.tickets.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
            Todavía no abriste ningún caso. Cuando lo hagas, acá vas a ver la
            respuesta de la administración.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {mine.tickets.map((ticket) => {
              const status = supportStatusOf(ticket.status);
              const meta = SUPPORT_STATUS_META[status];
              return (
                <li
                  key={ticket._id}
                  className="rounded-xl border border-border/70 bg-black/20 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold">
                      {SUPPORT_CATEGORY_META[ticket.category].label}
                      {ticket.orderCode ? ` · ${ticket.orderCode}` : ""}
                    </p>
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold",
                        STATUS_TONE[status],
                      )}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {ticket.message}
                  </p>
                  {ticket.adminNote && (
                    <p className="mt-1.5 rounded-lg border border-accent/25 bg-accent/[0.06] p-2 text-[11px] leading-relaxed text-accent">
                      <CheckCircle2 className="mr-1 inline size-3.5" />
                      {ticket.adminNote}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Abierto {relativeTime(ticket.createdAt)}
                    {ticket.resolvedAt
                      ? ` · resuelto ${relativeTime(ticket.resolvedAt)}`
                      : ` · actualizado ${relativeTime(ticket.updatedAt)}`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
