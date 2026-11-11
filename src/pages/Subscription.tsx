import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import {
  EXPIRY_HOURS,
  EXPIRY_MINUTES,
  PAYMENT_METHODS,
  REMINDER_SOUNDS,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_PLAN_IDS,
  SUBSCRIPTION_STATUS_META,
  SUSPENDED_CAPABILITIES,
  countdownText,
  formatExpiry,
  formatExpiryDate,
  nextMonthlyExpiry,
  paymentWhatsappMessage,
  planOf,
  renewalBase,
  whatsappHref,
} from "@/lib/subscriptions";
import type { PaymentMethod, SubscriptionPlanId } from "@/lib/subscriptions";
import { money } from "@/lib/format";
import { playReminderSound } from "@/lib/reminderSounds";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  AlarmClock,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  Lock,
  MessageCircle,
  ShieldCheck,
  Volume2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router";
import { toast } from "sonner";

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "En revisión",
  approved: "Aprobado",
  rejected: "Rechazado",
};

const STATUS_PILL: Record<string, string> = {
  none: "border-border/80 bg-secondary/50 text-muted-foreground",
  active: "border-accent/40 bg-accent/10 text-accent",
  expiring: "border-accent/40 bg-accent/10 text-accent",
  grace: "border-accent/40 bg-accent/10 text-accent",
  expired: "border-primary/40 bg-primary/10 text-primary",
};

export default function SubscriptionPage() {
  const { user } = useAuth();
  const data = useQuery(api.subscriptions.mine);
  const requestPayment = useMutation(api.subscriptions.requestPayment);
  const setReminder = useMutation(api.subscriptions.setReminder);

  const [plan, setPlan] = useState<SubscriptionPlanId>("basico");
  const [method, setMethod] = useState<PaymentMethod>("sinpe");
  const [hour, setHour] = useState(20);
  const [minute, setMinute] = useState(0);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sound, setSound] = useState("campana");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [now, setNow] = useState(Date.now());
  const initialized = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    setPlan(data.plan ?? "basico");
    if (data.activeUntil) {
      const parts = new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/Costa_Rica",
      }).formatToParts(data.activeUntil);
      const value = (type: string) =>
        Number(parts.find((part) => part.type === type)?.value ?? 0);
      setHour(value("hour") % 24);
      setMinute(value("minute"));
    }
    setSound(data.reminderSound ?? "campana");
    setReminderEnabled(data.reminderEnabled ?? true);
  }, [data]);

  if (user && user.role !== "business" && user.role !== "courier") {
    return <Navigate to="/profile" replace />;
  }

  if (data === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (data === null) return <Navigate to="/profile" replace />;

  const pending = data.pendingPayment;
  const meta = SUBSCRIPTION_STATUS_META[data.status];
  const selected = SUBSCRIPTION_PLANS[plan];
  const expiryAt = nextMonthlyExpiry(
    renewalBase(data.activeUntil, now),
    hour,
    minute,
  );
  const remaining = data.activeUntil ? data.activeUntil - now : 0;

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("No pudimos copiar. Anotalo a mano.");
    }
  };

  const saveReminder = async (nextSound: string, enabled: boolean) => {
    setSound(nextSound);
    setReminderEnabled(enabled);
    try {
      await setReminder({ sound: nextSound, enabled });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos guardar el recordatorio",
      );
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const result = await requestPayment({
        plan,
        method,
        reference,
        note: note.trim() || undefined,
        expiryHour: hour,
        expiryMinute: minute,
      });
      toast.success("Pago reportado", {
        description: `Vence ${formatExpiry(result.expiryAt)}. Mandá el comprobante por WhatsApp para que lo verifiquen.`,
      });
      setReference("");
      setNote("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos registrar el pago",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const whatsappMessage = pending
    ? paymentWhatsappMessage({
        name: user?.name ?? "",
        audience: data.role,
        plan: pending.plan,
        amount: pending.price,
        method: pending.method,
        reference: pending.reference,
        expiryAt: pending.expiryAt,
      })
    : "";

  return (
    <div>
      <PageHeader
        eyebrow="Suscripción"
        title="Tu plan de Capricho Express"
        description="Tarifa fija mensual, sin comisión por venta. Elegís el plan, reportás el pago y la administración lo verifica."
      />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <section className="surface-raised rounded-3xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Estado de tu suscripción
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider",
                    STATUS_PILL[data.status],
                  )}
                >
                  {meta.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {data.plan ? `Plan ${planOf(data.plan).name}` : "Sin plan elegido"}
                  {data.price ? ` · ${money(data.price)}/mes` : ""}
                </span>
              </div>
              <p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
                {meta.hint}
              </p>
            </div>
            {data.activeUntil ? (
              <div className="rounded-2xl border border-border/70 bg-black/20 px-4 py-3 text-right">
                <p className="flex items-center justify-end gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                  <AlarmClock className="size-3.5" /> Cuenta regresiva
                </p>
                <p className="mt-1 font-display text-2xl font-extrabold tabular-nums">
                  {countdownText(remaining)}
                </p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                  Vence {formatExpiry(data.activeUntil)}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-border/70 bg-black/20 px-4 py-3 text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Sin vencimiento activo
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Activá un plan para operar.
                </p>
              </div>
            )}
          </div>

          {!data.hasAccess && (
            <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/[0.07] p-3.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <Lock className="size-3.5" /> Qué queda suspendido
              </p>
              <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                {SUSPENDED_CAPABILITIES[data.role].map((item) => (
                  <li key={item} className="flex gap-1.5">
                    <span className="mt-1 size-1 shrink-0 rounded-full bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                Al reactivar, todo tu historial y tu información siguen intactos.
              </p>
            </div>
          )}
        </section>

        <section className="surface-raised rounded-3xl p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Planes
              </p>
              <h2 className="mt-1 font-display text-lg font-bold">
                Precio fijo, beneficios claros
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Nada de porcentajes por pedido. Cambiás de plan cuando quieras y
                aplica desde la próxima renovación.
              </p>
            </div>
            <ShieldCheck className="size-5 text-accent" />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {SUBSCRIPTION_PLAN_IDS.map((id) => {
              const option = SUBSCRIPTION_PLANS[id];
              const isSelected = plan === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPlan(id)}
                  className={cn(
                    "rounded-2xl border p-4 text-left transition-colors",
                    isSelected
                      ? "border-accent/60 bg-accent/[0.08]"
                      : "border-border/70 hover:border-accent/35",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-sm font-bold">{option.name}</p>
                    {isSelected ? (
                      <CheckCircle2 className="size-4 text-accent" />
                    ) : (
                      <span className="size-4 rounded-full border border-border" />
                    )}
                  </div>
                  <p className="mt-1.5 font-display text-2xl font-extrabold">
                    {money(option.price)}
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {" "}
                      /mes
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">{option.tagline}</p>
                  <ul className="mt-3 space-y-1.5">
                    {option.benefits[data.role].map((benefit) => (
                      <li key={benefit} className="flex gap-1.5 text-[11px] leading-relaxed">
                        <Check className="mt-0.5 size-3 shrink-0 text-accent" />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        </section>

        {pending ? (
          <section className="surface-raised rounded-3xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                  Pago en revisión
                </p>
                <h2 className="mt-1 font-display text-lg font-bold">
                  Estamos verificando tu comprobante
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Reportaste {money(pending.price)} del plan{" "}
                  {planOf(pending.plan).name} por{" "}
                  {PAYMENT_METHODS.find((option) => option.id === pending.method)?.label}.
                  Un administrador lo revisará y activará tu cuenta.
                </p>
              </div>
              <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[11px] font-semibold text-accent">
                {PAYMENT_STATUS_LABEL[pending.status]}
              </span>
            </div>

            <dl className="mt-4 grid gap-3 text-[11px] sm:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-black/20 p-3">
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Referencia
                </dt>
                <dd className="mt-1 font-semibold">{pending.reference}</dd>
              </div>
              <div className="rounded-xl border border-border/70 bg-black/20 p-3">
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Vencimiento solicitado
                </dt>
                <dd className="mt-1 font-semibold">{formatExpiry(pending.expiryAt)}</dd>
              </div>
            </dl>

            <div className="mt-4 rounded-xl border border-accent/30 bg-accent/[0.06] p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-accent">
                <MessageCircle className="size-3.5" /> Enviá el comprobante por WhatsApp
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                El mensaje ya viene con tus datos. Adjuntá la foto o el PDF del
                comprobante en el chat.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.settings.whatsappNumbers.map((number) => (
                  <Button
                    key={number}
                    asChild
                    size="sm"
                    className="gap-1.5 bg-[#25d366] text-black hover:bg-[#1ebe5b]"
                  >
                    <a
                      href={whatsappHref(number, whatsappMessage)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle className="size-3.5" />
                      {number}
                    </a>
                  </Button>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <section className="surface-raised rounded-3xl p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Pago manual
                </p>
                <h2 className="mt-1 font-display text-lg font-bold">
                  {money(selected.price)} al mes
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pagás por SINPE Móvil, efectivo o depósito y después reportás la
                  referencia.
                </p>
              </div>
              <p className="rounded-full border border-border/70 px-3 py-1 text-[11px] text-muted-foreground">
                Plan {selected.name}
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-black/20 p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                  SINPE Móvil
                </p>
                <p className="mt-1 font-display text-lg font-extrabold tracking-wide">
                  {data.settings.sinpePhone}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-7 gap-1.5 px-2 text-[11px] text-muted-foreground"
                  onClick={() => void copy(data.settings.sinpePhone, "SINPE Móvil")}
                >
                  <Copy className="size-3" /> Copiar número
                </Button>
              </div>
              <div className="rounded-2xl border border-border/70 bg-black/20 p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                  Cuenta IBAN
                </p>
                <p className="mt-1 break-all font-mono text-xs font-semibold">
                  {data.settings.iban}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-7 gap-1.5 px-2 text-[11px] text-muted-foreground"
                  onClick={() => void copy(data.settings.iban, "IBAN")}
                >
                  <Copy className="size-3" /> Copiar IBAN
                </Button>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <Label>Método de pago</Label>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
                  {PAYMENT_METHODS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setMethod(option.id)}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left transition-colors",
                        method === option.id
                          ? "border-accent/60 bg-accent/[0.08]"
                          : "border-border/70 hover:border-accent/30",
                      )}
                    >
                      <span className="block text-xs font-semibold">{option.label}</span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                        {option.hint}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_90px_90px]">
                <div className="space-y-1.5">
                  <Label>Fecha de vencimiento</Label>
                  <div className="flex h-10 items-center gap-2 rounded-md border border-border/80 bg-background/40 px-3 text-sm">
                    <Lock className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{formatExpiryDate(expiryAt)}</span>
                  </div>
                  <p className="text-[10px] leading-relaxed text-muted-foreground">
                    La fecha la fija la plataforma (renovación mensual). Vos elegís la
                    hora.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Hora</Label>
                  <Select
                    value={String(hour)}
                    onValueChange={(value) => setHour(Number(value))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {EXPIRY_HOURS.map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {String(value).padStart(2, "0")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Minutos</Label>
                  <Select
                    value={String(minute)}
                    onValueChange={(value) => setMinute(Number(value))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPIRY_MINUTES.map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {String(value).padStart(2, "0")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="rounded-xl border border-border/70 bg-black/20 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                Vence exactamente el{" "}
                <span className="font-semibold text-foreground">
                  {formatExpiry(expiryAt)}
                </span>{" "}
                (hora de Costa Rica). Si todavía tenés tiempo activo, la renovación se
                suma a partir de ese vencimiento.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="sub-reference">Referencia o comprobante</Label>
                <Input
                  id="sub-reference"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Ej: 2026-0451 / SINPE 8492..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sub-note">Nota (opcional)</Label>
                <Textarea
                  id="sub-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Ej: pagué con el SINPE de mi mamá, a nombre de..."
                  className="min-h-16 resize-none"
                />
              </div>

              <Button
                className="h-11 w-full gap-2 bg-ember-gradient text-black"
                disabled={submitting || reference.trim().length < 3}
                onClick={() => void handleSubmit()}
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                Ya pagué · reportar para verificación
              </Button>
              <p className="text-center text-[10px] text-muted-foreground">
                No se activa sola: un administrador verifica el pago y después ves el
                estado actualizado.
              </p>
            </div>
          </section>
        )}

        <section className="surface-raised rounded-3xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Recordatorio
              </p>
              <h2 className="mt-1 font-display text-lg font-bold">
                Cuenta regresiva con alarma
              </h2>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                Te avisamos cuando falten pocos días para el vencimiento. Elegí el
                sonido y probalo acá.
              </p>
            </div>
            <Switch
              checked={reminderEnabled}
              onCheckedChange={(checked) => void saveReminder(sound, checked)}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="w-48 space-y-1.5">
              <Label>Sonido del recordatorio</Label>
              <Select
                value={sound}
                onValueChange={(value) => void saveReminder(value, reminderEnabled)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REMINDER_SOUNDS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              className="gap-2 border-border/80"
              onClick={() => void playReminderSound(sound)}
            >
              <Volume2 className="size-4" />
              Probar sonido
            </Button>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            Si el navegador bloquea el audio automático, tocá "Probar sonido" para
            habilitarlo; la cuenta regresiva siempre está visible.
          </p>
        </section>

        <section className="surface-raised rounded-3xl p-5">
          <h2 className="font-display text-lg font-bold">Historial de pagos</h2>
          {data.payments.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
              Todavía no reportaste pagos.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {data.payments.map((payment) => (
                <li
                  key={payment._id}
                  className="rounded-xl border border-border/70 bg-black/20 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold">
                      {planOf(payment.plan).name} · {money(payment.price)}
                    </p>
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold",
                        payment.status === "approved"
                          ? "border-accent/40 bg-accent/10 text-accent"
                          : payment.status === "rejected"
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border/80 bg-secondary/40 text-muted-foreground",
                      )}
                    >
                      {PAYMENT_STATUS_LABEL[payment.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {PAYMENT_METHODS.find((option) => option.id === payment.method)?.label}{" "}
                    · ref. {payment.reference} · reportado{" "}
                    {new Intl.DateTimeFormat("es-CR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "America/Costa_Rica",
                    }).format(payment.reportedAt)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Vencimiento solicitado: {formatExpiry(payment.expiryAt)}
                  </p>
                  {payment.reviewNote && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Nota del administrador: {payment.reviewNote}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </motion.div>
    </div>
  );
}
