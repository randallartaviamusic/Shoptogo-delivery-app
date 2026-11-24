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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  SUBSCRIPTION_DURATIONS,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_PLAN_IDS,
  SUBSCRIPTION_STATUS_META,
  durationLabel,
  formatExpiry,
  planOf,
  priceForSubscriptionMonths,
} from "@/lib/subscriptions";
import type { SubscriptionPlanId, SubscriptionStatus } from "@/lib/subscriptions";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  Check,
  CheckCircle2,
  Gift,
  Loader2,
  Save,
  Search,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type AdminAccount = {
  ownerId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: "business" | "courier";
  businessName: string | null;
  plan: string | null;
  price: number | null;
  activeUntil: number | null;
  status: SubscriptionStatus;
  hasAccess: boolean;
  pending: boolean;
  lastMonths: number | null;
  lastPrice: number | null;
};

const STATUS_PILL: Record<SubscriptionStatus, string> = {
  none: "border-border/80 bg-secondary/50 text-muted-foreground",
  active: "border-accent/40 bg-accent/10 text-accent",
  expiring: "border-accent/40 bg-accent/10 text-accent",
  grace: "border-accent/40 bg-accent/10 text-accent",
  expired: "border-primary/40 bg-primary/10 text-primary",
};

function AccountRow({
  account,
  busy,
  onGrant,
  onDeactivate,
}: {
  account: AdminAccount;
  busy: boolean;
  onGrant: (ownerId: string, plan: SubscriptionPlanId, months: number) => void;
  onDeactivate: (ownerId: string) => void;
}) {
  const [plan, setPlan] = useState<SubscriptionPlanId>(
    (account.plan as SubscriptionPlanId | null) ?? "basico",
  );
  const [duration, setDuration] = useState<number>(1);
  const meta = SUBSCRIPTION_STATUS_META[account.status];

  return (
    <li className="rounded-xl border border-border/70 bg-black/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">
            {account.businessName ?? account.name ?? account.email ?? "Cuenta"}
            <span className="ml-2 text-[10px] font-normal text-muted-foreground">
              {account.role === "business" ? "Negocio" : "Repartidor"}
            </span>
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {[account.name, account.email, account.phone]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {account.plan ? `Plan ${planOf(account.plan).name}` : "Sin plan"} ·{" "}
            {account.activeUntil
              ? `vence ${formatExpiry(account.activeUntil)}`
              : "sin vencimiento"}
          </p>
          {account.lastMonths != null && account.lastPrice != null && (
            <p className="mt-0.5 text-[11px] font-semibold text-accent">
              Suscribió {durationLabel(account.lastMonths)} por {money(account.lastPrice)}
              {account.lastMonths > 1 ? " (con 10% de descuento)" : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {account.pending && (
            <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
              Pago en revisión
            </span>
          )}
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              STATUS_PILL[account.status],
            )}
          >
            {meta.label}
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Select
          value={plan}
          onValueChange={(value) => setPlan(value as SubscriptionPlanId)}
        >
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUBSCRIPTION_PLAN_IDS.map((id) => (
              <SelectItem key={id} value={id}>
                {SUBSCRIPTION_PLANS[id].name} · {money(SUBSCRIPTION_PLANS[id].price)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(duration)}
          onValueChange={(value) => setDuration(Number(value))}
        >
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUBSCRIPTION_DURATIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {durationLabel(option)}
                {option > 1 ? " · -10%" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {account.hasAccess && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 border-primary/40 text-xs text-primary hover:bg-primary/10"
            disabled={busy}
            onClick={() => onDeactivate(account.ownerId)}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <X className="size-3.5" />
            )}
            Desactivar plan
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 border-accent/40 text-xs text-accent"
          disabled={busy}
          onClick={() => onGrant(account.ownerId, plan, duration)}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          Activar {durationLabel(duration)} · {money(priceForSubscriptionMonths(SUBSCRIPTION_PLANS[plan], duration))}
        </Button>
      </div>
    </li>
  );
}

/** Verificación de pagos y activación manual desde el perfil administrador. */
export function SubscriptionAdmin() {
  const [search, setSearch] = useState("");
  const overview = useQuery(api.subscriptions.adminOverview, { search });
  const saveSettings = useMutation(api.subscriptions.adminSaveSettings);
  const review = useMutation(api.subscriptions.adminReviewPayment);
  const grant = useMutation(api.subscriptions.adminGrant);
  const deactivate = useMutation(api.subscriptions.adminDeactivate);

  const [settingsForm, setSettingsForm] = useState({
    sinpePhone: "",
    iban: "",
    whatsappNumbers: "",
    graceDays: "3",
    welcomeOfferEnabled: true,
    welcomeOfferPlan: "basico" as SubscriptionPlanId,
    welcomeOfferDays: "30",
    welcomeOfferTitle: "",
    welcomeOfferDescription: "",
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyPayment, setBusyPayment] = useState<string | null>(null);
  const [busyAccount, setBusyAccount] = useState<string | null>(null);

  useEffect(() => {
    if (!overview || loaded) return;
    setLoaded(true);
    setSettingsForm({
      sinpePhone: overview.settings.sinpePhone,
      iban: overview.settings.iban,
      whatsappNumbers: overview.settings.whatsappNumbers.join("\n"),
      graceDays: String(overview.settings.graceDays),
      welcomeOfferEnabled: overview.settings.welcomeOffer.enabled,
      welcomeOfferPlan: overview.settings.welcomeOffer.plan,
      welcomeOfferDays: String(overview.settings.welcomeOffer.freeDays),
      welcomeOfferTitle: overview.settings.welcomeOffer.title,
      welcomeOfferDescription: overview.settings.welcomeOffer.description,
    });
  }, [overview, loaded]);

  if (overview === undefined) {
    return (
      <section className="surface-raised mt-5 rounded-3xl p-5">
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await saveSettings({
        sinpePhone: settingsForm.sinpePhone,
        iban: settingsForm.iban,
        whatsappNumbers: settingsForm.whatsappNumbers
          .split("\n")
          .map((number) => number.trim())
          .filter(Boolean),
        graceDays: Number(settingsForm.graceDays) || 0,
        welcomeOfferEnabled: settingsForm.welcomeOfferEnabled,
        welcomeOfferPlan: settingsForm.welcomeOfferPlan,
        welcomeOfferDays: Number(settingsForm.welcomeOfferDays) || 30,
        welcomeOfferTitle: settingsForm.welcomeOfferTitle,
        welcomeOfferDescription: settingsForm.welcomeOfferDescription,
      });
      toast.success("Datos de cobro y oferta actualizados");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos guardar los datos",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReview = async (paymentId: string, approve: boolean) => {
    setBusyPayment(paymentId);
    try {
      const result = await review({
        paymentId: paymentId as Id<"subscriptionPayments">,
        approve,
        note: notes[paymentId] || undefined,
      });
      toast.success(
        approve ? "Suscripción activada" : "Pago rechazado",
        {
          description: approve
            ? result.activeUntil
              ? `Vence ${formatExpiry(result.activeUntil)}.`
              : "La cuenta quedó activa."
            : "La cuenta sigue como estaba y el suscriptor ve la nota.",
        },
      );
      setNotes((current) => ({ ...current, [paymentId]: "" }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos revisar el pago",
      );
    } finally {
      setBusyPayment(null);
    }
  };

  const handleGrant = async (ownerId: string, plan: SubscriptionPlanId, months: number) => {
    setBusyAccount(ownerId);
    try {
      const result = await grant({
        ownerId: ownerId as Id<"users">,
        plan,
        months,
      });
      toast.success("Suscripción activada", {
        description: `${durationLabel(result.months ?? months)} · vence ${formatExpiry(result.activeUntil)}.`,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos activar la cuenta",
      );
    } finally {
      setBusyAccount(null);
    }
  };

  const handleDeactivate = async (ownerId: string) => {
    setBusyAccount(ownerId);
    try {
      await deactivate({
        ownerId: ownerId as Id<"users">,
        note: notes[`deactivate-${ownerId}`] || "Plan desactivado por el administrador (pago no verificado)",
      });
      toast.success("Plan desactivado", {
        description: "La cuenta quedó sin acceso de inmediato.",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos desactivar la cuenta",
      );
    } finally {
      setBusyAccount(null);
    }
  };

  return (
    <section className="surface-raised mt-5 rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
            <ShieldCheck className="size-3.5" /> Perfil administrador
          </p>
          <h2 className="font-display text-lg font-bold">Suscripciones</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Las cuentas pueden pagar 1, 3, 6 o 12 meses juntos: de 3 meses en adelante llevan 10% de descuento y el vencimiento se calcula solo. Los pagos manuales y en efectivo se activan solos al instante. Revisá los comprobantes con sus meses y montos, desactivá el plan si el pago no aparece (hasta 3 días) y editá los datos de cobro. Las tarifas son fijas: nunca un porcentaje de los pedidos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 font-semibold text-accent">
            {overview.totals.pending} por verificar
          </span>
          <span className="rounded-full border border-border/80 bg-secondary/40 px-2.5 py-1 text-muted-foreground">
            {overview.totals.accounts} cuentas
          </span>
          <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-semibold text-primary">
            {overview.totals.suspended} suspendidas
          </span>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-border/70 bg-black/20 p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
          <Wallet className="size-3.5" /> Datos de cobro
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="admin-sinpe">SINPE Móvil</Label>
            <Input
              id="admin-sinpe"
              value={settingsForm.sinpePhone}
              onChange={(event) =>
                setSettingsForm({ ...settingsForm, sinpePhone: event.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-iban">Cuenta IBAN</Label>
            <Input
              id="admin-iban"
              value={settingsForm.iban}
              onChange={(event) =>
                setSettingsForm({ ...settingsForm, iban: event.target.value })
              }
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="admin-whatsapp">
              WhatsApp para comprobantes (uno por línea)
            </Label>
            <Textarea
              id="admin-whatsapp"
              value={settingsForm.whatsappNumbers}
              onChange={(event) =>
                setSettingsForm({
                  ...settingsForm,
                  whatsappNumbers: event.target.value,
                })
              }
              placeholder={"+506 8492 3074\n+506 8888 8888"}
              className="min-h-16 resize-none font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Hasta 5 números. El botón de WhatsApp de cada suscriptor los usa en
              orden.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-grace">Días de gracia</Label>
            <Input
              id="admin-grace"
              type="number"
              min={0}
              max={15}
              value={settingsForm.graceDays}
              onChange={(event) =>
                setSettingsForm({ ...settingsForm, graceDays: event.target.value })
              }
            />
            <p className="text-[10px] text-muted-foreground">
              Después del vencimiento la cuenta sigue operando estos días antes de
              suspenderse.
            </p>
          </div>
        </div>
        <Button
          className="mt-3 gap-2 bg-ember-gradient text-black"
          disabled={saving}
          onClick={() => void handleSaveSettings()}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Guardar datos de cobro y oferta
        </Button>
      </div>

      <div className="mt-5 rounded-2xl border border-accent/30 bg-accent/[0.05] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
              <Gift className="size-3.5" /> Oferta de bienvenida
            </p>
            <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-muted-foreground">
              Primer plan gratis para cuentas nuevas de negocio y repartidor. Se activa sola una vez por cuenta: al reclamarla quedan activos al instante sin comprobante. Apagala cuando quieras o cambiala por otra (plan, días y texto).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-muted-foreground">
              {settingsForm.welcomeOfferEnabled ? "Activa" : "Pausada"}
            </span>
            <Switch
              checked={settingsForm.welcomeOfferEnabled}
              onCheckedChange={(value) =>
                setSettingsForm({ ...settingsForm, welcomeOfferEnabled: value })
              }
              aria-label="Activar o pausar la oferta de bienvenida"
            />
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="admin-offer-plan">Plan regalado</Label>
            <Select
              value={settingsForm.welcomeOfferPlan}
              onValueChange={(value) =>
                setSettingsForm({
                  ...settingsForm,
                  welcomeOfferPlan: value as SubscriptionPlanId,
                })
              }
            >
              <SelectTrigger id="admin-offer-plan" className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBSCRIPTION_PLAN_IDS.map((id) => (
                  <SelectItem key={id} value={id}>
                    {SUBSCRIPTION_PLANS[id].name} · {money(SUBSCRIPTION_PLANS[id].price)}/mes
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-offer-days">Días gratis</Label>
            <Input
              id="admin-offer-days"
              type="number"
              min={1}
              max={90}
              value={settingsForm.welcomeOfferDays}
              onChange={(event) =>
                setSettingsForm({ ...settingsForm, welcomeOfferDays: event.target.value })
              }
            />
            <p className="text-[10px] text-muted-foreground">
              De 1 a 90 días. Lo normal es 30 días (un mes).
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="admin-offer-title">Título de la oferta</Label>
            <Input
              id="admin-offer-title"
              value={settingsForm.welcomeOfferTitle}
              onChange={(event) =>
                setSettingsForm({ ...settingsForm, welcomeOfferTitle: event.target.value })
              }
              placeholder="Estrená Shop To Go sin pagar el primer mes"
              maxLength={90}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="admin-offer-description">Descripción de la oferta</Label>
            <Textarea
              id="admin-offer-description"
              value={settingsForm.welcomeOfferDescription}
              onChange={(event) =>
                setSettingsForm({
                  ...settingsForm,
                  welcomeOfferDescription: event.target.value,
                })
              }
              placeholder="Contá qué incluye y qué pasa al vencimiento"
              maxLength={600}
              className="min-h-20 resize-none text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Este texto lo ven los negocios y repartidores nuevos en su suscripción.
            </p>
          </div>
        </div>
        <Button
          className="mt-3 gap-2 bg-ember-gradient text-black"
          disabled={saving}
          onClick={() => void handleSaveSettings()}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Guardar oferta
        </Button>
      </div>

      <div className="mt-5">
                  <h3 className="font-display text-base font-bold">Pagos por verificar</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Los pagos manuales y en efectivo nuevos se activan solos al instante con su comprobante. Revisá acá los SINPE automáticos pendientes y los reportes anteriores; si un pago activado no aparece, desactivá el plan desde Cuentas (tenés hasta 3 días).
          </p>
        {overview.pending.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
            No hay pagos pendientes.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {overview.pending.map((payment) => (
              <li
                key={payment._id}
                className="rounded-xl border border-accent/30 bg-accent/[0.05] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">
                      {payment.businessName ?? payment.name}
                      <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                        {payment.role === "business" ? "Negocio" : "Repartidor"}
                      </span>
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {[payment.name, payment.email, payment.phone]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Plan {planOf(payment.plan).name} · {durationLabel(payment.months ?? 1)} · {money(payment.price)} ·{" "}
                      {payment.method.toUpperCase()} · ref. {payment.reference}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Vence {formatExpiry(payment.expiryAt)} · reportado{" "}
                      {new Intl.DateTimeFormat("es-CR", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "America/Costa_Rica",
                      }).format(payment.reportedAt)}
                    </p>
                    {payment.note && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Nota: {payment.note}
                      </p>
                    )}
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
                          className="h-24 w-auto object-cover"
                        />
                      </a>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input
                    value={notes[payment._id] ?? ""}
                    onChange={(event) =>
                      setNotes((current) => ({
                        ...current,
                        [payment._id]: event.target.value,
                      }))
                    }
                    placeholder="Nota de revisión (opcional)"
                    className="h-8 max-w-xs text-xs"
                  />
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
                    disabled={busyPayment === payment._id}
                    onClick={() => void handleReview(payment._id, true)}
                  >
                    {busyPayment === payment._id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-3.5" />
                    )}
                    Aprobar y activar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                    disabled={busyPayment === payment._id}
                    onClick={() => void handleReview(payment._id, false)}
                  >
                    <X className="size-3.5" />
                    Rechazar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base font-bold">Cuentas</h3>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, correo o local"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
        {overview.accounts.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
            No hay cuentas que coincidan con la búsqueda.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {overview.accounts.slice(0, 40).map((account) => (
              <AccountRow
                key={account.ownerId}
                account={account as AdminAccount}
                busy={busyAccount === account.ownerId}
                onGrant={(ownerId, plan, months) => void handleGrant(ownerId, plan, months)}
                onDeactivate={(ownerId) => void handleDeactivate(ownerId)}
              />
            ))}
          </ul>
        )}
      </div>

      {overview.recent.length > 0 && (
        <div className="mt-5">
          <h3 className="font-display text-base font-bold">Últimas revisiones</h3>
          <ul className="mt-2 space-y-1.5">
            {overview.recent.map((payment) => (
              <li
                key={payment._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-2.5 py-2 text-[11px]"
              >
                <span className="min-w-0 flex-1 truncate">
                  {payment.businessName ?? payment.name} ·{" "}
                  {planOf(payment.plan).name} · {durationLabel(payment.months ?? 1)} · {money(payment.price)}
                  {payment.receiptUrl && (
                    <a
                      href={payment.receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 font-semibold text-accent hover:underline"
                    >
                      Ver comprobante
                    </a>
                  )}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                    payment.status === "approved"
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-primary/40 bg-primary/10 text-primary",
                  )}
                >
                  {payment.status === "approved" ? "Aprobado" : "Rechazado"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
