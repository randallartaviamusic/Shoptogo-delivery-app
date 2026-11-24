import { PageHeader } from "@/components/AppShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  CASH_PICKUP_WHATSAPP,
  EXPIRY_HOURS,
  EXPIRY_MINUTES,
  PAYMENT_METHODS,
  REMINDER_SOUNDS,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_PLAN_IDS,
  SUBSCRIPTION_STATUS_META,
  SUSPENDED_CAPABILITIES,
  cashPickupWhatsappMessage,
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
import { displayPhone } from "@/lib/notify";
import { playReminderSound } from "@/lib/reminderSounds";
import { isValidCostaRicaPhone } from "@/lib/trust";
import { cn } from "@/lib/utils";
import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  AlarmClock,
  Check,
  CheckCircle2,
  Copy,
  Gift,
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

function PlanNote({ note }: { note: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="mt-2.5 rounded-xl border border-accent/30 bg-accent/[0.07] p-2.5"
      onClick={(e) => e.stopPropagation()}
    >
      <p
        className={
          expanded
            ? "text-[10.5px] leading-relaxed text-muted-foreground"
            : "line-clamp-2 text-[10.5px] leading-relaxed text-muted-foreground"
        }
      >
        {note}
      </p>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((v) => !v);
        }}
        className="mt-1 text-[11px] font-semibold text-accent hover:underline"
      >
        {expanded ? "Leer menos" : "Leer más"}
      </button>
    </div>
  );
}

export default function SubscriptionPage() {
  const { user } = useAuth();
  const data = useQuery(api.subscriptions.mine);
  const requestPayment = useMutation(api.subscriptions.requestPayment);
  const requestCashActivation = useMutation(
    api.subscriptions.requestCashActivation,
  );
  const generateReceiptUploadUrl = useMutation(
    api.subscriptions.generateSubscriptionReceiptUploadUrl,
  );
  const requestOnvoPayment = useAction(api.subscriptions.requestOnvoPayment);
  const setReminder = useMutation(api.subscriptions.setReminder);
  const cancelSubscription = useMutation(api.subscriptions.cancelSubscription);
  const claimWelcomeOffer = useMutation(api.subscriptions.claimWelcomeOffer);
  const [claiming, setClaiming] = useState(false);

  const [plan, setPlan] = useState<SubscriptionPlanId>("basico");
  const [method, setMethod] = useState<PaymentMethod>("sinpe");
  const [hour, setHour] = useState(20);
  const [minute, setMinute] = useState(0);
  const [reference, setReference] = useState("");
  const [payerIdentification, setPayerIdentification] = useState("");
  const [identificationType, setIdentificationType] = useState("0");
  const [payerPhone, setPayerPhone] = useState("");
  // Datos para que la administración retire el efectivo en la dirección.
  const [cashPhone, setCashPhone] = useState("");
  const [cashAddress, setCashAddress] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receiptStorageId, setReceiptStorageId] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [activatingCash, setActivatingCash] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement | null>(null);
  const [sound, setSound] = useState("campana");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [pendingPlan, setPendingPlan] = useState<SubscriptionPlanId | null>(null);
  const [showCancelWarning, setShowCancelWarning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
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
    setCashPhone(data.contactPhone ?? "");
    setCashAddress(data.pickupAddress ?? "");
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
  const isPlanChange = Boolean(data.plan) && data.plan !== plan;
  const expiryAt = nextMonthlyExpiry(
    isPlanChange ? now : renewalBase(data.activeUntil, now),
    hour,
    minute,
  );
  const remaining = data.activeUntil ? data.activeUntil - now : 0;
  const cashPhoneValid = isValidCostaRicaPhone(cashPhone);
  const cashAddressValid = cashAddress.trim().length >= 5;
  const cashReady = cashPhoneValid && cashAddressValid;
  const reminderPhone = displayPhone(data.contactPhone);
  const cashMessage = cashPickupWhatsappMessage({
    name: user?.name ?? "",
    audience: data.role,
    plan,
    amount: selected.price,
    phone: cashPhone,
    address: cashAddress,
    expiryAt,
    businessName: data.businessName,
  });
  const cashHref = whatsappHref(CASH_PICKUP_WHATSAPP, cashMessage);

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

  const handleReceiptFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Subí una imagen del comprobante (JPG, PNG o WebP)");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("La imagen no puede pesar más de 8 MB");
      return;
    }
    setUploadingReceipt(true);
    try {
      const uploadUrl = await generateReceiptUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("No pudimos subir el comprobante");
      const { storageId } = (await response.json()) as { storageId: string };
      setReceiptStorageId(storageId);
      setReceiptPreview(URL.createObjectURL(file));
      toast.success("Comprobante listo", {
        description: "Ya podés activar tu plan con el botón de abajo.",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos subir el comprobante",
      );
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (method === "onvo") {
        const result = await requestOnvoPayment({
          plan,
          payerIdentification,
          identificationType: Number(identificationType),
          payerPhone,
          note: note.trim() || undefined,
          expiryHour: hour,
          expiryMinute: minute,
        });
        toast.success("Intención SINPE creada", {
          description: `Transferí ${money(result.price)} al número ONVO indicado. Tu suscripción se activará al confirmarse.`,
        });
        setPayerIdentification("");
        setPayerPhone("");
      } else {
        const result = await requestPayment({
          plan,
          method,
          reference,
          note: note.trim() || undefined,
          expiryHour: hour,
          expiryMinute: minute,
          receiptStorageId: receiptStorageId as never,
        });
        toast.success("Tu nuevo plan ya está activo", {
          description: `Vence ${formatExpiry(result.expiryAt)}. Un administrador evaluará que el pago se efectúe correctamente; si hubo un error o no se realizó, el plan será desactivado en 3 días.`,
        });
        setReference("");
        setReceiptStorageId(null);
        setReceiptPreview(null);
      }
      setNote("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos registrar el pago",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCashActivate = async () => {
    setActivatingCash(true);
    try {
      const result = await requestCashActivation({
        plan,
        expiryHour: hour,
        expiryMinute: minute,
        cashPhone,
        cashAddress,
        note: note.trim() || undefined,
      });
      toast.success("Tu nuevo plan ya está activo", {
        description: `Vence ${formatExpiry(result.expiryAt)}. Un administrador evaluará que el pago en efectivo se concrete; si hubo un error o no se realizó, el plan será desactivado en 3 días.`,
      });
      window.open(cashHref, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos activar tu plan",
      );
    } finally {
      setActivatingCash(false);
    }
  };

  const subscribedPlan = data.plan;
  const hasActiveSubscription = Boolean(data.activeUntil);

  const handlePlanClick = (id: SubscriptionPlanId) => {
    if (!subscribedPlan || id === subscribedPlan) {
      setPlan(id);
      return;
    }
    setPendingPlan(id);
  };

  const confirmPlanChange = () => {
    if (pendingPlan) {
      setPlan(pendingPlan);
      toast.info(`Elegiste el plan ${planOf(pendingPlan).name}`, {
        description: `Reportá el pago de ${money(planOf(pendingPlan).price)} abajo y tu plan nuevo se activa al instante.`,
      });
    }
    setPendingPlan(null);
  };

  const confirmCancel = async () => {
    setCancelling(true);
    try {
      await cancelSubscription({});
      toast.success(`Suscripción cancelada`, {
        description: `Tu acceso quedó suspendido. Tu historial sigue guardado y podés reactivar cuando quieras.`,
      });
      setShowCancelWarning(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `No pudimos cancelar la suscripción`);
    } finally {
      setCancelling(false);
    }
  };

  const pendingPlanDetail = pendingPlan ? SUBSCRIPTION_PLANS[pendingPlan] : null;
  const currentPlanDetail = subscribedPlan ? planOf(subscribedPlan) : null;
  const welcomeOffer = data.settings.welcomeOffer;
  const welcomePlan = planOf(welcomeOffer.plan);
  const showWelcomeBanner = welcomeOffer.enabled && data.canClaimWelcome && !pending;
  const isWelcomePlanSelected = plan === welcomeOffer.plan;

  const handleClaimWelcome = async () => {
    setClaiming(true);
    try {
      const result = await claimWelcomeOffer({});
      toast.success(`Primeros ${result.freeDays} días gratis activados`, {
        description: `Plan ${planOf(result.plan).name} activo hasta ${formatExpiry(result.activeUntil)}. Después seguís con el precio normal.`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos activar la oferta");
    } finally {
      setClaiming(false);
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
    <div className="w-full max-w-full min-w-0 overflow-x-clip">
      <PageHeader
        eyebrow="Suscripción"
        title="Tu plan de Shop To Go"
        description="Tarifa fija mensual, sin comisión por venta. Elegís el plan, subís el comprobante y tu plan se activa al instante; la administración lo revisa después."
      />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-full min-w-0 space-y-4 overflow-x-clip"
      >
        {showWelcomeBanner && (
          <section className="w-full max-w-full min-w-0 overflow-x-clip rounded-3xl border border-accent/40 bg-accent/[0.08] p-5">
            <div className="flex w-full max-w-full min-w-0 flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
                  <Gift className="size-3.5" /> Oferta de bienvenida · {welcomePlan.name} gratis {welcomeOffer.freeDays} días
                </p>
                <h2 className="mt-2 font-display text-lg font-bold leading-tight">
                  {welcomeOffer.title}
                </h2>
                <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-muted-foreground">
                  {welcomeOffer.description}
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  Al vencimiento seguís con {money(welcomePlan.price)}/mes y podés cambiar de plan cuando quieras. Es una sola vez por cuenta.
                </p>
              </div>
              <Button
                type="button"
                disabled={claiming}
                onClick={() => void handleClaimWelcome()}
                className="gap-2 bg-ember-gradient text-black hover:opacity-95"
              >
                {claiming ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Gift className="size-4" />
                )}
                {claiming ? "Activando..." : `Activar mis ${welcomeOffer.freeDays} días gratis`}
              </Button>
            </div>
          </section>
        )}
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
                  {subscribedPlan ? `Plan ${planOf(subscribedPlan).name}` : "Sin plan elegido"}
                  {data.price ? ` · ${money(data.price)}/mes` : ""}
                </span>
              </div>
              <p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
                {meta.hint}
              </p>
              {hasActiveSubscription && subscribedPlan && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-border/80 text-[11px]"
                    onClick={() => document.getElementById(`planes`)?.scrollIntoView({ behavior: `smooth`, block: `start` })}
                  >
                    Cambiar de plan
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-primary/40 text-[11px] text-primary hover:bg-primary/10"
                    onClick={() => setShowCancelWarning(true)}
                  >
                    Cancelar plan
                  </Button>
                </div>
              )}
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
                <span id="planes">Planes</span>
              </p>
              <h2 className="mt-1 font-display text-lg font-bold">
                Precio fijo, beneficios claros
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Nada de porcentajes por pedido. Cambiás de plan cuando quieras y
                si es el mismo plan se suma a tu vencimiento; si cambias de plan el mes nuevo corre desde hoy.
              </p>
            </div>
            <ShieldCheck className="size-5 text-accent" />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {SUBSCRIPTION_PLAN_IDS.map((id) => {
              const option = SUBSCRIPTION_PLANS[id];
              const isSelected = plan === id;
              const isCurrent = subscribedPlan === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handlePlanClick(id)}
                  className={cn(
                    "rounded-2xl border p-4 text-left transition-colors",
                    isSelected
                      ? "border-accent/60 bg-accent/[0.08]"
                      : "border-border/70 hover:border-accent/35",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex flex-wrap items-center gap-1.5 font-display text-sm font-bold">{option.name}{isCurrent && subscribedPlan ? ` · actual` : ``}
                      {welcomeOffer.enabled && option.id === welcomeOffer.plan && (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-accent-foreground">
                          Primeros {welcomeOffer.freeDays} días gratis
                        </span>
                      )}
                    </p>
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
                  {option.note && <PlanNote note={option.note} />}
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
                  {pending.method === "onvo"
                    ? `Esperando la confirmación automática de ONVO por ${money(pending.price)}. No necesitás enviar un comprobante.`
                    : `Reportaste ${money(pending.price)} del plan ${planOf(pending.plan).name} por ${PAYMENT_METHODS.find((option) => option.id === pending.method)?.label}. Tu plan ya está activo y un administrador lo revisará; si el pago no aparece, se desactiva en 3 días.`}
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
            {pending.receiptUrl && (
              <a
                href={pending.receiptUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block overflow-hidden rounded-xl border border-border/60"
              >
                <img
                  src={pending.receiptUrl}
                  alt="Comprobante del pago"
                  className="h-28 w-auto object-cover"
                />
              </a>
            )}

            {pending.method === "onvo" ? (
              <div className="mt-4 rounded-xl border border-accent/30 bg-accent/[0.06] p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-accent">
                  <ShieldCheck className="size-3.5" /> Transferencia pendiente de confirmación
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Enviá exactamente {money(pending.price)} desde el número SINPE y la identificación registrados a:
                </p>
                <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-black/30 p-3">
                  <span className="font-display text-lg font-extrabold tracking-wide">
                    {pending.onvoDestinationPhone ?? "+506 7019-6686"}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => void copy(pending.onvoDestinationPhone ?? "+50670196686", "Número SINPE de ONVO")}>
                    <Copy className="mr-1 size-3" /> Copiar
                  </Button>
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  La cuenta se activa al recibir el webhook firmado de ONVO; no la marques como pagada por separado.
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-accent/30 bg-accent/[0.06] p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-accent">
                  <MessageCircle className="size-3.5" /> Enviá el comprobante por WhatsApp
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  El mensaje ya viene con tus datos. Adjuntá la foto o el PDF del comprobante en el chat.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {data.settings.whatsappNumbers.map((number) => (
                    <Button key={number} asChild size="sm" className="gap-1.5 bg-[#25d366] text-black hover:bg-[#1ebe5b]">
                      <a href={whatsappHref(number, whatsappMessage)} target="_blank" rel="noreferrer">
                        <MessageCircle className="size-3.5" />{number}
                      </a>
                    </Button>
                  ))}
                </div>
              </div>
            )}
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
                  Pagás por SINPE Móvil, efectivo o depósito. En efectivo
                  coordinamos el retiro en tu dirección por WhatsApp.
                </p>
              </div>
              <p className="rounded-full border border-border/70 px-3 py-1 text-[11px] text-muted-foreground">
                Plan {selected.name}
              </p>
            </div>
            {showWelcomeBanner && isWelcomePlanSelected && (
              <div className="mt-4 flex w-full max-w-full min-w-0 flex-wrap items-center justify-between gap-3 overflow-x-clip rounded-2xl border border-accent/40 bg-accent/[0.08] p-3.5">
                <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-accent">Tenés {welcomeOffer.freeDays} días gratis del {welcomePlan.name}.</span> Activá la oferta y empezá a operar hoy sin pagar ni mandar comprobante.
                </p>
                <Button
                  type="button"
                  disabled={claiming}
                  onClick={() => void handleClaimWelcome()}
                  className="gap-2 bg-ember-gradient text-black hover:opacity-95"
                >
                  {claiming ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Gift className="size-4" />
                  )}
                  {claiming ? "Activando..." : "Activar mes gratis"}
                </Button>
              </div>
            )}

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
                        {option.id === "onvo" && !data.onvoConfigured
                          ? "Automático no disponible hasta configurar el proveedor."
                          : option.hint}
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
                se suma a ese vencimiento solo si renovas el mismo plan; si cambias de plan el mes nuevo corre desde hoy.
              </p>

              {method === "onvo" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="onvo-identification-type">Tipo de identificación de la cuenta SINPE</Label>
                    <Select value={identificationType} onValueChange={setIdentificationType}>
                      <SelectTrigger id="onvo-identification-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Persona física nacional</SelectItem>
                        <SelectItem value="1">Persona física residente</SelectItem>
                        <SelectItem value="2">Entidad estatal</SelectItem>
                        <SelectItem value="3">Persona jurídica</SelectItem>
                        <SelectItem value="4">Institución autónoma</SelectItem>
                        <SelectItem value="5">Diplomático</SelectItem>
                        <SelectItem value="9">Persona extranjera</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="onvo-identification">Identificación del titular</Label>
                    <Input id="onvo-identification" value={payerIdentification} onChange={(event) => setPayerIdentification(event.target.value)} placeholder="Como aparece en el banco" autoComplete="off" />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="onvo-phone">Número SINPE de quien transfiere</Label>
                    <Input id="onvo-phone" value={payerPhone} onChange={(event) => setPayerPhone(event.target.value)} placeholder="8 dígitos, por ejemplo 8888-8888" inputMode="tel" autoComplete="tel" />
                    <p className="text-[10px] text-muted-foreground">ONVO empareja la transferencia con el monto exacto y la identificación de esta cuenta. No guardamos la cédula en el historial de pago.</p>
                  </div>
                </div>
              ) : method === "cash" ? (
                <div className="space-y-3 rounded-2xl border border-accent/30 bg-accent/[0.05] p-3.5">
                  <div>
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
                      <MessageCircle className="size-3.5" /> Retiro de efectivo
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      Dejanos tu WhatsApp y la dirección. El botón abre tu WhatsApp
                      con el mensaje listo para enviar a {CASH_PICKUP_WHATSAPP};
                      ahí coordinamos el retiro.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="cash-whatsapp">Tu número de WhatsApp</Label>
                      <Input
                        id="cash-whatsapp"
                        value={cashPhone}
                        onChange={(event) => setCashPhone(event.target.value)}
                        placeholder="8888 8888"
                        inputMode="tel"
                        autoComplete="tel"
                      />
                      {cashPhone.length > 0 && !cashPhoneValid && (
                        <p className="text-[10px] text-primary">
                          Escribí un número de Costa Rica de 8 dígitos.
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cash-address">
                        Dirección donde retiramos el pago
                      </Label>
                      <Input
                        id="cash-address"
                        value={cashAddress}
                        onChange={(event) => setCashAddress(event.target.value)}
                        placeholder="Ej: Barrio El Carmen, 200 m sur del parque"
                      />
                      {cashAddress.length > 0 && !cashAddressValid && (
                        <p className="text-[10px] text-primary">
                          Escribí la dirección completa del retiro.
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    className="h-11 w-full gap-2 bg-[#25d366] text-black hover:bg-[#1ebe5b] disabled:opacity-60"
                    disabled={!cashReady || activatingCash}
                    onClick={() => void handleCashActivate()}
                  >
                    {activatingCash ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <MessageCircle className="size-4" />
                    )}
                    {activatingCash ? "Activando tu plan..." : "Activar pago en efectivo"}
                  </Button>
                  <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
                    Tu plan se activa al instante al darle al botón y se abre WhatsApp con el mensaje completo para coordinar el retiro. Un administrador evaluará que el pago se efectúe correctamente; si hubo un error o no se realizó, el plan será desactivado en 3 días.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 rounded-2xl border border-border/70 bg-black/20 p-3.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="sub-reference">Referencia o comprobante</Label>
                    <Input id="sub-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Ej: 2026-0451 / SINPE 8492..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Imagen del comprobante</Label>
                    <input
                      ref={receiptInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        void handleReceiptFile(file);
                      }}
                    />
                    {receiptPreview ? (
                      <div className="flex items-center gap-3">
                        <img
                          src={receiptPreview}
                          alt="Comprobante de pago"
                          className="size-20 shrink-0 rounded-xl border border-border/60 object-cover"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5 border-border/80 text-[11px]"
                            disabled={uploadingReceipt}
                            onClick={() => receiptInputRef.current?.click()}
                          >
                            Cambiar imagen
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-[11px] text-muted-foreground"
                            onClick={() => {
                              setReceiptStorageId(null);
                              setReceiptPreview(null);
                            }}
                          >
                            Quitar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full gap-2 border-dashed border-border/80 text-xs"
                        disabled={uploadingReceipt}
                        onClick={() => receiptInputRef.current?.click()}
                      >
                        {uploadingReceipt ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-4" />
                        )}
                        {uploadingReceipt ? "Subiendo comprobante..." : "Subir imagen del comprobante"}
                      </Button>
                    )}
                    <p className="text-[10px] leading-relaxed text-muted-foreground">
                      Obligatoria para activar tu plan al instante. JPG, PNG o WebP hasta 8 MB.
                    </p>
                  </div>
                </div>
              )}
              {method !== "cash" && (
                <>
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
                disabled={
                  submitting ||
                  uploadingReceipt ||
                  (method === "onvo"
                    ? !data.onvoConfigured || !payerIdentification.trim() || !payerPhone.trim()
                    : reference.trim().length < 3 || !receiptStorageId)
                }
                onClick={() => void handleSubmit()}
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                {method === "onvo" ? "Crear pago SINPE automático" : "Ya pagué · reportar para verificación"}
              </Button>
              <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
                {method === "onvo"
                  ? "Se activa automáticamente sólo después de la confirmación de pago firmada por ONVO."
                  : "Tu plan se activa al instante al darle al botón. Un administrador evaluará que el pago se efectúe correctamente; si hubo un error o no se realizó, el plan será desactivado en 3 días."}
              </p>
                </>
              )}
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
                Te avisamos en la app y por WhatsApp cuando falten pocos días para
                el vencimiento. Elegí el sonido y probalo acá.
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
          <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-border/70 bg-black/20 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
            <MessageCircle className="mt-0.5 size-3.5 shrink-0 text-accent" />
            <span>
              {!reminderEnabled
                ? "El recordatorio está apagado: no se envía el WhatsApp ni suena la alarma."
                : reminderPhone
                  ? `El mismo aviso se envía automáticamente por WhatsApp a ${reminderPhone}.`
                  : "Para recibir también el aviso por WhatsApp, guardá tu número en tu perfil."}
            </span>
          </p>
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
                  {payment.receiptUrl && (
                    <a
                      href={payment.receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block overflow-hidden rounded-xl border border-border/60"
                    >
                      <img
                        src={payment.receiptUrl}
                        alt="Comprobante del pago"
                        className="h-20 w-auto object-cover"
                      />
                    </a>
                  )}
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
      <AlertDialog open={pendingPlan !== null} onOpenChange={(open) => { if (!open) setPendingPlan(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambiar de plan?</AlertDialogTitle>
            <AlertDialogDescription>Estás por cambiar de plan. Si aceptás, elegís el plan nuevo y debés reportar el pago nuevo abajo con su comprobante. El cambio se activa al instante con la fecha correcta del mes que inicia; la administración lo revisa después y lo desactiva en 3 días si el pago no aparece.</AlertDialogDescription>
          </AlertDialogHeader>
          {currentPlanDetail && pendingPlanDetail ? <div className="rounded-xl border border-border/70 bg-black/20 p-3 text-[11px]"><p>De {currentPlanDetail.name} a {pendingPlanDetail.name}</p><p>Precio nuevo: {money(pendingPlanDetail.price)} al mes.</p><p>Tu plan nuevo se activa al instante con la fecha correcta del mes que inicia.</p></div> : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPlanChange}>Aceptar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showCancelWarning} onOpenChange={setShowCancelWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar suscripción?</AlertDialogTitle>
            <AlertDialogDescription>Si aceptás, tu acceso actual se suspende de inmediato. Dejás de aparecer y de operar, pero tu historial queda guardado para reactivar cuando quieras.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-xl border p-3 text-[11px]"><p>Al cancelar se suspende todo de inmediato.</p><p>Tu historial queda guardado.</p></div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={cancelling} onClick={() => void confirmCancel()}>{cancelling ? `Cancelando...` : `Aceptar`}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
