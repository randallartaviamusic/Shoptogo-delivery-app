import { EmptyState } from "@/components/AppShell";
import { CashClosing } from "@/components/CashClosing";
import { CashIssueNote } from "@/components/CashIssueNote";
import {
  CourierLocationReporter,
  CourierPresenceReporter,
  DeliveryTrackingMap,
} from "@/components/DeliveryTracking";
import { SubscriptionReminder } from "@/components/SubscriptionReminder";
import { VerificationBanner } from "@/components/VerificationBanner";
import { DishImage } from "@/components/DishImage";
import { StatusPill, type OrderView } from "@/pages/Orders";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CashIssueKind } from "@/convex/schema";
import { useAuth } from "@/hooks/use-auth";
import { CASH_ISSUE_LABELS } from "@/lib/cash";
import { clockTime, money, relativeTime, ROLE_HOME } from "@/lib/format";
import { ASSIGNMENT_RULES, formatKm } from "@/lib/delivery";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Camera,
  Bike,
  CheckCircle2,
  History,
  KeyRound,
  Layers,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  PackageCheck,
  Store,
  Timer,
  Wallet,
} from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { toast } from "sonner";

const TABS = [
  { key: "available", label: "Disponibles", to: "/courier" },
  { key: "active", label: "En curso", to: "/courier?tab=active" },
  { key: "history", label: "Historial", to: "/courier?tab=history" },
  { key: "cash", label: "Caja", to: "/courier?tab=cash" },
];

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "chili" | "ember";
}) {
  return (
    <div className="surface-raised rounded-2xl p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-display text-xl font-extrabold",
          accent === "ember" ? "text-accent" : accent === "chili" ? "text-primary" : "",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function CourierPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "available";

  const board = useQuery(api.orders.courierBoard);
  const accept = useMutation(api.orders.courierAccept);
  const updateStatus = useMutation(api.orders.courierUpdateStatus);
  const generateProofUploadUrl = useMutation(api.orders.generateDeliveryProofUploadUrl);
  const renounce = useMutation(api.orders.courierRenounceRemaining);
  const reportIssue = useMutation(api.orders.reportCashIssue);
  const [busy, setBusy] = useState<string | null>(null);
  // Pedido con varias entregas que el repartidor está por aceptar.
  const [confirming, setConfirming] = useState<OrderView | null>(null);
  // Pedido del que quiere bajarse después de la primera entrega.
  const [renouncing, setRenouncing] = useState<OrderView | null>(null);
  // Custodia del pedido: código del local y PIN del comprador.
  const [pickupOrder, setPickupOrder] = useState<OrderView | null>(null);
  const [pickupCode, setPickupCode] = useState("");
  const [deliveryOrder, setDeliveryOrder] = useState<OrderView | null>(null);
  const [deliveryPin, setDeliveryPin] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [cashNote, setCashNote] = useState("");
  const [deliveryPhoto, setDeliveryPhoto] = useState<File | null>(null);
  const [issueTarget, setIssueTarget] = useState<OrderView | null>(null);
  const [issueKind, setIssueKind] = useState<CashIssueKind>("claim");
  const [issueAmount, setIssueAmount] = useState("");
  const [issueNote, setIssueNote] = useState("");
  const [savingIssue, setSavingIssue] = useState(false);
  const pingPresence = useMutation(api.orders.updateCourierPresence);
  const [now, setNow] = useState(Date.now());
  const [locating, setLocating] = useState(false);

  // Ofertas push: cada una tiene un token propio, el mismo del enlace que llega
  // por WhatsApp. Aceptar desde acá o desde el mensaje es el mismo camino.
  const offers = useQuery(api.orders.myOffers);
  const acceptOfferAction = useMutation(api.orders.acceptOffer);
  const declineOfferAction = useMutation(api.orders.declineOffer);
  const offerToken = params.get("offer");
  const warnedMissingOffer = useRef(false);

  useEffect(() => {
    if (!offerToken || offers === undefined || warnedMissingOffer.current) return;
    if (offers.some((offer) => offer.token === offerToken)) return;
    warnedMissingOffer.current = true;
    toast.error("Esa oferta ya no está disponible", {
      description:
        "La puede haber tomado otro repartidor o haber vencido. Mirá las entregas disponibles.",
    });
  }, [offerToken, offers]);

  const handleAcceptOffer = async (token: string) => {
    setBusy(token);
    try {
      await acceptOfferAction({ token });
      toast.success("Entrega aceptada", {
        description: "Ya podés retirarla en el local y ver la dirección de entrega.",
      });
      if (offerToken === token) {
        params.delete("offer");
        setParams(params, { replace: true });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos aceptar la oferta",
      );
    } finally {
      setBusy(null);
    }
  };

  const handleDeclineOffer = async (token: string) => {
    try {
      await declineOfferAction({ token });
      if (offerToken === token) {
        params.delete("offer");
        setParams(params, { replace: true });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos descartar la oferta",
      );
    }
  };

  // Mantiene vivos los temporizadores de espera sin esperar a la próxima consulta.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (user && user.role !== "courier") {
    return (
      <Navigate
        to={user.role ? (ROLE_HOME[user.role] ?? "/swipe") : "/onboarding"}
        replace
      />
    );
  }

  if (board === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  const available = (board?.available ?? []) as unknown as OrderView[];
  const active = (board?.active ?? []) as unknown as OrderView[];
  const history = (board?.history ?? []) as unknown as OrderView[];
  const stats = board?.stats;
  const canAccept = board?.canAccept ?? true;
  const activeCount = board?.activeCount ?? active.length;
  const maxActive = board?.maxActive ?? ASSIGNMENT_RULES.maxActiveTrips;
  const locationFresh = board?.locationFresh ?? false;
  const busyOrder = (board?.busyOrder ?? null) as unknown as OrderView | null;

  const requestLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Este dispositivo no permite compartir la ubicación.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void pingPresence({
          location: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
        })
          .then(() => {
            toast.success("Ubicación actualizada", {
              description:
                "Los pedidos se ordenan por cercanía y ya podés tomar los que estén a menos de 6 km.",
            });
          })
          .catch((error) => {
            toast.error(
              error instanceof Error
                ? error.message
                : "No pudimos guardar tu ubicación",
            );
          })
          .finally(() => setLocating(false));
      },
      () => {
        setLocating(false);
        toast.error(
          "Permití el acceso a la ubicación para tomar pedidos cercanos.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  };

  const handleAccept = async (order: OrderView) => {
    setBusy(order._id);
    try {
      const result = await accept({ orderId: order._id as Id<"orders"> });
      toast.success(
        result.grouped ? "Entrega sumada a tu ruta" : "Pedido tomado",
        {
          description: result.grouped
            ? `Ahora tenés 2 entregas activas. Sumaste ${order.businessName}; el desvío es corto y no atrasa tu entrega actual.`
            : takesSeveralDeliveries(order)
              ? `Son ${order.remainingDeliveries + 1} entregas de esta compra: retirá cada una cuando el local la marque lista. Total en envíos ${money(order.groupEarnings)}.`
              : order.tripStops > 1
                ? `Retirá en ${order.tripStops} tiendas y entregá todo junto. Ganás ${money(order.tripEarnings)}.`
                : `Retirá en ${order.businessName}. Ganás ${money(order.deliveryFee)}.`,
        },
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos asignarte el pedido");
    } finally {
      setBusy(null);
    }
  };

  // Compra partida en varias entregas que el cliente quiere que haga el mismo
  // repartidor: se avisa antes de aceptar y se puede renunciar después.
  const takesSeveralDeliveries = (order: OrderView) =>
    order.sameCourier && order.remainingDeliveries > 0;

  const handleRenounce = async (order: OrderView) => {
    setBusy(order._id);
    try {
      const result = await renounce({ orderId: order._id as Id<"orders"> });
      toast.success("Liberaste las entregas restantes", {
        description:
          result.released === 0
            ? "No quedaban entregas pendientes en esta compra."
            : `${result.released} ${
                result.released === 1 ? "entrega quedó" : "entregas quedaron"
              } disponibles para otro repartidor.`,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos liberar las entregas",
      );
    } finally {
      setBusy(null);
      setRenouncing(null);
    }
  };

  const handleAdvance = async (
    order: OrderView,
    status: "picked_up" | "delivered",
    extra?: {
      pickupCode?: string;
      pin?: string;
      cashAmount?: number;
      cashNote?: string;
      proofStorageId?: Id<"_storage">;
    },
  ) => {
    setBusy(order._id);
    try {
      const result = await updateStatus({
        orderId: order._id as Id<"orders">,
        status,
        ...extra,
      });
      toast.success(
        status === "picked_up" ? "Pedido recogido" : "¡Pedido entregado!",
        {
          description:
            status === "picked_up"
              ? "Ahora andá a la dirección de entrega."
              : `Sumaste ${money(order.tripEarnings)} a tus ganancias. ${
                  result.cashDifference === 0
                    ? "Efectivo confirmado por el total."
                    : "Quedó registrada la diferencia de efectivo."
                }`,
        },
      );
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos actualizar");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const openPickup = (order: OrderView) => {
    setPickupOrder(order);
    setPickupCode("");
  };

  const openDelivery = (order: OrderView) => {
    setDeliveryOrder(order);
    setDeliveryPin("");
    setCashAmount(String(order.tripTotal));
    setCashNote("");
    setDeliveryPhoto(null);
  };

  const deliveryDifference = deliveryOrder
    ? Math.round(Number(cashAmount) || 0) - deliveryOrder.tripTotal
    : 0;

  const openIssue = (order: OrderView) => {
    setIssueTarget(order);
    setIssueKind("claim");
    setIssueAmount(String(Math.max(0, order.cashDifference ?? 0)));
    setIssueNote("");
  };

  const handleReportIssue = async () => {
    if (!issueTarget) return;
    setSavingIssue(true);
    try {
      await reportIssue({
        orderId: issueTarget._id as Id<"orders">,
        kind: issueKind,
        amount: Number(issueAmount) || undefined,
        note: issueNote,
      });
      toast.success("Problema registrado", {
        description: "El local también lo ve, con fecha, usuario y monto.",
      });
      setIssueTarget(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos registrar el problema",
      );
    } finally {
      setSavingIssue(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
            <span className="inline-block size-1.5 rounded-full bg-accent" />
            Modo repartidor
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Hola, {user?.name?.split(" ")[0] ?? "repartidor"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Tomá pedidos listos para retirar y cobrá por cada entrega.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-accent/30 bg-accent/[0.07] px-3.5 py-2 text-xs font-semibold text-accent">
          <Wallet className="size-4" />
          {money(stats?.earningsToday ?? 0)} hoy
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Ganancia hoy",
            value: money(stats?.earningsToday ?? 0),
            accent: true,
          },
          {
            label: "Entregas hoy",
            value: String(stats?.deliveriesToday ?? 0),
          },
          { label: "Disponibles", value: String(stats?.available ?? 0) },
          { label: "Ganancia total", value: money(stats?.earningsTotal ?? 0) },
        ].map((stat) => (
          <div key={stat.label} className="surface-raised rounded-2xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {stat.label}
            </p>
            <p
              className={cn(
                "mt-2 font-display text-xl font-extrabold",
                stat.accent && "text-accent",
              )}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <CourierLocationReporter
        orderIds={active.map((order) => order._id)}
      />
      <CourierPresenceReporter />

      <SubscriptionReminder />
      <VerificationBanner />

      {busyOrder && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-accent/[0.07] px-4 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Bike className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {activeCount > 1
                ? `Tenés ${activeCount} entregas en curso`
                : "Tenés una entrega en curso"}
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {busyOrder.code} · {busyOrder.businessName}.{" "}
              {activeCount >= maxActive
                ? "Completá una para liberar espacio."
                : "Podés sumar otra solo si está cerca y no atrasa tu ruta."}
            </p>
          </div>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="gap-1.5 border-accent/40 text-accent"
          >
            <Link to="/courier?tab=active">
              Ver entrega
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      )}

      {offers && offers.length > 0 && (
        <div className="mb-5 space-y-2">
          {offers.map((offer) => {
            const secondsLeft = Math.max(
              0,
              Math.floor((offer.expiresAt - now) / 1000),
            );
            const focused = offerToken === offer.token;
            return (
              <div
                key={offer.token}
                className={cn(
                  "rounded-2xl border p-4 transition-colors",
                  focused
                    ? "border-accent/70 bg-accent/[0.12]"
                    : "border-accent/30 bg-accent/[0.06]",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                      <Timer className="size-3.5" /> Oferta para vos
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {offer.businessName} · {offer.code}
                    </p>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {offer.items}{" "}
                      {offer.items === 1 ? "producto" : "productos"} ·{" "}
                      {money(offer.payout)} de ganancia
                      {offer.distanceKm
                        ? ` · ${formatKm(offer.distanceKm)} de recorrido`
                        : ""}{" "}
                      · quedan {Math.floor(secondsLeft / 60)}:
                      {String(secondsLeft % 60).padStart(2, "0")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-[11px] text-muted-foreground"
                      onClick={() => void handleDeclineOffer(offer.token)}
                    >
                      Ahora no
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 bg-ember-gradient text-[11px] text-black"
                      disabled={busy === offer.token || !canAccept}
                      onClick={() => void handleAcceptOffer(offer.token)}
                    >
                      {busy === offer.token ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-3.5" />
                      )}
                      Aceptar
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-full border border-border/80 p-1 no-scrollbar sm:w-fit">
        {TABS.map((item) => (
          <Link
            key={item.key}
            to={item.to}
            className={cn(
              "flex-1 whitespace-nowrap rounded-full px-4 py-1.5 text-center text-xs font-semibold transition-colors sm:flex-none",
              tab === item.key
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {item.key === "available" && available.length > 0 && (
              <span className="ml-1.5 rounded-full bg-black/20 px-1.5 text-[10px]">
                {available.length}
              </span>
            )}
          </Link>
        ))}
      </div>

      {tab === "available" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          {!locationFresh && (
            <div className="rounded-2xl border border-primary/30 bg-primary/[0.07] p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                <LocateFixed className="size-4" /> Activá tu ubicación para tomar pedidos
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Usamos tu ubicación solo para mostrarte qué pedidos están cerca y
                comprobar que el local quede a menos de {ASSIGNMENT_RULES.maxPickupKm}{" "}
                km. Se actualiza mientras tengas la app abierta.
              </p>
              <Button
                size="sm"
                className="mt-2 gap-1.5 bg-ember-gradient text-black"
                disabled={locating}
                onClick={requestLocation}
              >
                {locating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <LocateFixed className="size-3.5" />
                )}
                Compartir mi ubicación
              </Button>
            </div>
          )}

          {locationFresh && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-accent/30 bg-accent/[0.06] px-4 py-2.5">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                <span className="font-semibold text-accent">Ubicación activa</span>{" "}
                · los pedidos se ordenan por cercanía
                {board?.courierLocationAt
                  ? ` · actualizada ${relativeTime(board.courierLocationAt)}`
                  : ""}
                .
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-[11px] text-accent"
                disabled={locating}
                onClick={requestLocation}
              >
                {locating ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <LocateFixed className="size-3" />
                )}
                Actualizar
              </Button>
            </div>
          )}

          {activeCount === 1 && (
            <p className="rounded-2xl border border-border/70 bg-secondary/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              Tenés una entrega en curso. Los pedidos habilitados se pueden sumar
              a tu ruta solo si el desvío es corto y no te atrasa: el botón te
              muestra cuántos minutos agrega.
            </p>
          )}
          {activeCount >= maxActive && available.length > 0 && (
            <p className="rounded-2xl border border-border/70 bg-secondary/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              Tenés el máximo de {maxActive} entregas activas. Terminá una para
              poder tomar otra.
            </p>
          )}

          {available.length === 0 ? (
            <EmptyState
              icon={Bike}
              title="No hay pedidos listos ahora"
              description="Cuando un local marque un pedido como listo, va a aparecer acá para que lo tomes y te avisamos en pantalla. Se actualiza solo."
              action={
                <Button asChild variant="outline" className="gap-2 border-border/80">
                  <Link to="/courier?tab=active">Ver mis entregas</Link>
                </Button>
              }
            />
          ) : (
            available.map((order) => {
              const waitStart = order.waitStartedAt ?? order.readyAt;
              const secondsLeft =
                waitStart !== null
                  ? Math.max(
                      0,
                      Math.floor(
                        (waitStart +
                          ASSIGNMENT_RULES.readyWindowMinutes * 60_000 -
                          now) /
                          1000,
                      ),
                    )
                  : null;
              const waitingMinutes =
                waitStart !== null
                  ? Math.max(0, Math.floor((now - waitStart) / 60_000))
                  : null;
              const waitOver = secondsLeft === 0 || order.assignmentUrgent;
              const waitLabel =
                secondsLeft !== null && secondsLeft > 0
                  ? `${Math.floor(secondsLeft / 60)}:${String(
                      secondsLeft % 60,
                    ).padStart(2, "0")}`
                  : null;
              const acceptDisabled =
                !canAccept || order.acceptAllowed === false;
              return (
              <div key={order._id} className="surface-raised rounded-3xl p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <DishImage
                    src={order.businessImage}
                    alt={order.businessName}
                    className="size-12 rounded-xl"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-display text-sm font-bold">
                      {order.businessName}
                      <span className="text-[10px] font-normal text-muted-foreground">
                        {order.code}
                      </span>
                      {order.batchCount && order.batchCount > 1 && (
                        <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                          Entrega {order.batchIndex} de {order.batchCount}
                        </span>
                      )}
                    </p>
                    <div className="mt-0.5">
                      <StatusPill status={order.status} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {relativeTime(order.createdAt)} ·{" "}
                      {order.items.reduce((acc, item) => acc + item.quantity, 0)}{" "}
                      productos
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                      {order.recommended && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 font-semibold text-accent">
                          <LocateFixed className="size-3" /> Cerca de vos
                        </span>
                      )}
                      {order.pickupKm != null && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-secondary/30 px-2 py-0.5 text-muted-foreground">
                          <MapPin className="size-3" />
                          {formatKm(order.pickupKm)} al local
                        </span>
                      )}
                      {order.estimatedArrivalAt != null && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-secondary/30 px-2 py-0.5 text-muted-foreground">
                          <Timer className="size-3" />
                          {order.totalEtaMinutes != null
                            ? `~${order.totalEtaMinutes} min`
                            : "ETA"}{" "}
                          · llegada {clockTime(order.estimatedArrivalAt)}
                        </span>
                      )}
                      {waitStart !== null &&
                        (waitOver ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                            <Timer className="size-3" /> Esperando{" "}
                            {waitingMinutes ?? 0} min sin repartidor
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-accent">
                            <Timer className="size-3" /> Quedan {waitLabel} para
                            asignar
                          </span>
                        ))}
                      {order.groupable && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 font-semibold text-accent">
                          <Layers className="size-3" /> Se suma a tu ruta
                          {order.groupExtraMinutes != null
                            ? ` (+${order.groupExtraMinutes} min)`
                            : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="rounded-full bg-accent px-3 py-1 font-display text-sm font-extrabold text-accent-foreground">
                    {money(order.tripEarnings)}
                  </span>
                </div>

                {order.tripStops > 1 && (
                  <div className="mt-3 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-accent">
                      <Store className="size-3.5" />
                      Entrega con {order.tripStops} tiendas
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      Retirás en{" "}
                      {order.stops.map((stop) => stop.name).join(" y ")}. El envío
                      es uno solo por entrega e incluye{" "}
                      {money(order.extraStopFee)} de recargo por la tienda
                      adicional. Cobrás todo junto al cliente y tu ganancia no
                      cambia si un local tiene promoción.
                    </p>
                  </div>
                )}

                {takesSeveralDeliveries(order) && (
                  <div className="mt-3 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-accent">
                      <AlertCircle className="size-3.5" />
                      Compra de {order.remainingDeliveries + 1} entregas
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      El cliente pidió el mismo repartidor para todas. Aceptá solo
                      si vas a hacer las {order.remainingDeliveries + 1} entregas:
                      ganás {money(order.groupEarnings)} en envíos.
                    </p>
                  </div>
                )}

                <div className="mt-4 space-y-2.5">
                  <div className="flex gap-3">
                    <span className="relative mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/10">
                      <Store className="size-2.5 text-accent" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Retirás en
                      </p>
                      <p className="truncate text-sm font-medium">
                        {order.businessName}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {order.businessAddress}
                      </p>
                    </div>
                  </div>
                  <div className="ml-2.5 h-4 w-px border-l border-dashed border-border" />
                  <div className="flex gap-3">
                    <span className="relative mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10">
                      <MapPin className="size-2.5 text-primary" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Entregás a
                      </p>
                      <p className="truncate text-sm font-medium">{order.buyerName}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {order.address}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Cobrás al cliente
                    </p>
                    <p className="font-display text-lg font-extrabold text-accent">
                      {money(order.tripTotal)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Tu envío: {money(order.tripEarnings)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Button
                      className="gap-2 bg-ember-gradient text-black"
                      disabled={busy === order._id || acceptDisabled}
                      title={order.acceptReason ?? undefined}
                      onClick={() =>
                        takesSeveralDeliveries(order)
                          ? setConfirming(order)
                          : handleAccept(order)
                      }
                    >
                      {busy === order._id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Navigation className="size-4" />
                      )}
                      {takesSeveralDeliveries(order)
                        ? `Aceptar las ${order.remainingDeliveries + 1} entregas`
                        : order.groupable
                          ? "Sumar a mi ruta"
                          : "Tomar pedido"}
                    </Button>
                    {order.acceptReason && (
                      <p className="max-w-[16rem] text-right text-[10px] leading-snug text-muted-foreground">
                        {order.acceptReason}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              );
            })
          )}
        </motion.div>
      )}

      {tab === "active" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          {active.length === 0 ? (
            <EmptyState
              icon={Navigation}
              title="No tenés entregas en curso"
              description="Tomá un pedido de la pestaña Disponibles y aparecerá acá con los datos de retiro y entrega."
              action={
                <Button asChild className="gap-2 bg-ember-gradient text-black">
                  <Link to="/courier">
                    Ver disponibles
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              }
            />
          ) : (
            active.map((order) => (
              <div key={order._id} className="surface-raised rounded-3xl p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-display text-base font-bold">
                      {order.code} · {order.businessName}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {order.items.reduce((acc, item) => acc + item.quantity, 0)}{" "}
                      productos en esta tienda · {money(order.tripTotal)} a cobrar
                      {order.tripStops > 1 ? ` · ${order.tripStops} tiendas` : ""}
                      {order.batchCount && order.batchCount > 1
                        ? ` · Entrega ${order.batchIndex} de ${order.batchCount}`
                        : ""}
                    </p>
                  </div>
                  <StatusPill status={order.status} />
                </div>

                {order.estimatedArrivalAt !== null &&
                  order.status !== "delivered" && (
                    <div
                      className={cn(
                        "mt-3 rounded-xl border px-3 py-2 text-[11px] leading-relaxed",
                        order.delayed
                          ? "border-primary/40 bg-primary/[0.07] text-primary"
                          : "border-accent/30 bg-accent/[0.06] text-accent",
                      )}
                    >
                      <p className="flex items-center gap-1.5 font-semibold">
                        <Timer className="size-3.5" />
                        {order.delayed
                          ? `Demora estimada +${order.lateMinutes} min`
                          : `Llegada estimada ${clockTime(order.estimatedArrivalAt)}`}
                      </p>
                      <p
                        className={
                          order.delayed ? "" : "text-muted-foreground"
                        }
                      >
                        {order.status === "ready"
                          ? "Retirá el pedido y salí al cliente."
                          : "Si te demorás, avisale al comprador por teléfono."}
                      </p>
                    </div>
                  )}

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/70 bg-black/20 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-accent">
                      Retiro
                    </p>
                    <p className="mt-1 text-sm font-medium">{order.businessName}</p>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        {order.businessAddress}
                      </p>
                      {order.businessPhone && (
                        <a
                          className="mt-1 inline-flex text-[11px] font-semibold text-accent hover:underline"
                          href={`tel:${order.businessPhone.replace(/[^+\d]/g, "")}`}
                        >
                          Llamar al local · {order.businessPhone}
                        </a>
                      )}
                      {order.pickupInstructions && (
                        <p className="mt-1 rounded-lg border border-accent/20 bg-accent/[0.05] p-2 text-[10px] leading-relaxed text-muted-foreground">
                          <strong className="text-foreground">Retiro:</strong> {order.pickupInstructions}
                        </p>
                      )}
                      {order.packagingInstructions && (
                        <p className="mt-1 rounded-lg border border-border/70 bg-black/20 p-2 text-[10px] leading-relaxed text-muted-foreground">
                          <strong className="text-foreground">Empaque:</strong> {order.packagingInstructions}
                        </p>
                      )}
                    </div>
                  <div className="rounded-xl border border-border/70 bg-black/20 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-primary">
                      Entrega
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {order.buyerName}
                      {order.buyerPhone ? ` · ${order.buyerPhone}` : ""}
                    </p>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {order.address}
                    </p>
                  </div>
                </div>

                {order.notes && (
                  <p className="mt-3 rounded-xl bg-secondary/50 p-2.5 text-xs italic text-muted-foreground">
                    "{order.notes}"
                  </p>
                )}

                {order.courierAcceptedAt !== null && (
                  <div className="mt-4">
                    <DeliveryTrackingMap
                      status={order.status}
                      businessLocation={order.businessLocation}
                      deliveryLocation={order.deliveryLocation}
                      courierLocation={order.courierLocation}
                      courierLocationAt={order.courierLocationAt}
                      courierAcceptedAt={order.courierAcceptedAt}
                      pickedUpAt={order.pickedUpAt}
                      deliveredAt={order.deliveredAt}
                      estimatedArrivalAt={order.estimatedArrivalAt}
                      promisedArrivalAt={order.promisedArrivalAt}
                      lateMinutes={order.lateMinutes}
                    />
                  </div>
                )}

                <div className="mt-3 rounded-xl border border-border/70 p-3">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                    <Wallet className="size-3.5" /> Efectivo de esta entrega
                  </p>
                  <div className="mt-2 space-y-1 text-[11px]">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Total a cobrar al comprador</span>
                      <span>{money(order.tripTotal)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Para los locales (productos)</span>
                      <span>{money(order.tripTotal - order.tripEarnings)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-accent">
                      <span>Tu envío</span>
                      <span>{money(order.tripEarnings)}</span>
                    </div>
                  </div>
                  {order.cashCollected === null ? (
                    <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                      Al cerrar la entrega te pedimos el PIN del comprador y cuánto
                      efectivo cobraste. El registro no depende del código.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-1 text-[11px] leading-relaxed">
                      <p className="text-accent">
                        Confirmaste {money(order.cashCollected)} cobrados ·{" "}
                        {relativeTime(order.cashCollectedAt ?? order.createdAt)}
                      </p>
                      {(order.cashDifference ?? 0) !== 0 && (
                        <p className="text-primary">
                          Diferencia registrada: {money(order.cashDifference ?? 0)}
                        </p>
                      )}
                      {order.cashPending > 0 && (
                        <p className="text-muted-foreground">
                          Todavía tenés {money(order.cashPending)} de los locales:
                          confirmá la entrega del efectivo con cada uno.
                        </p>
                      )}
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-7 px-2 text-[11px] text-muted-foreground hover:text-primary"
                    onClick={() => openIssue(order)}
                  >
                    Reportar problema de efectivo
                  </Button>
                </div>

                {order.cashIssue && (
                  <CashIssueNote issue={order.cashIssue} className="mt-2" />
                )}

                {order.remainingDeliveries > 0 && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/[0.07] px-3 py-2.5">
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Te faltan {order.remainingDeliveries}{" "}
                      {order.remainingDeliveries === 1 ? "entrega" : "entregas"} de
                      esta compra.
                      {order.sameCourier ? " El cliente pidió el mismo repartidor." : ""}
                    </p>
                    {order.reservedDeliveries > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground hover:text-primary"
                        disabled={busy === order._id}
                        onClick={() => setRenouncing(order)}
                      >
                        Renunciar a las próximas
                      </Button>
                    )}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                  <p className="text-[11px] text-muted-foreground">
                    Recogido {order.pickedUpAt ? clockTime(order.pickedUpAt) : "—"}
                  </p>
                  {order.status === "ready" ? (
                    <Button
                      className="gap-2 bg-ember-gradient text-black"
                      disabled={busy === order._id}
                      onClick={() => openPickup(order)}
                    >
                      <PackageCheck className="size-4" />
                      Código y retirar
                    </Button>
                  ) : (
                    <Button
                      className="gap-2 bg-ember-gradient text-black"
                      disabled={busy === order._id}
                      onClick={() => openDelivery(order)}
                    >
                      <CheckCircle2 className="size-4" />
                      Entregar y cobrar
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </motion.div>
      )}

      {tab === "history" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          {history.length === 0 ? (
            <EmptyState
              icon={History}
              title="Todavía no entregaste pedidos"
              description="Cada entrega terminada queda acá con lo que ganaste por el envío."
            />
          ) : (
            <div className="surface-raised overflow-hidden rounded-3xl">
              {history.map((order, index) => (
                <div
                  key={order._id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3.5",
                    index > 0 && "border-t border-border/60",
                  )}
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <CheckCircle2 className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {order.businessName} → {order.buyerName}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {order.code} ·{" "}
                      {order.deliveredAt
                        ? `${clockTime(order.deliveredAt)} hs`
                        : relativeTime(order.createdAt)}
                      {order.cashCollected !== null &&
                        ` · cobraste ${money(order.cashCollected)}`}
                      {(order.cashDifference ?? 0) !== 0 &&
                        ` · diferencia ${money(order.cashDifference ?? 0)}`}
                      {order.status === "delivered" &&
                        (order.cashPending > 0
                          ? ` · falta entregar ${money(order.cashPending)} a los locales`
                          : " · efectivo confirmado por los locales")}
                    </p>
                  </div>
                  <p className="font-display text-sm font-bold text-accent">
                    +{money(order.tripEarnings)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {tab === "cash" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <CashClosing />
        </motion.div>
      )}

      <Dialog
        open={pickupOrder !== null}
        onOpenChange={(open) => !open && setPickupOrder(null)}
      >
        <DialogContent className="border-border/80 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Código de retiro</DialogTitle>
            <DialogDescription>
              Pedíselo al local cuando te entreguen el pedido. Confirma que te
              llevás la entrega correcta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl border border-border/70 bg-black/20 p-3 text-[11px] leading-relaxed">
              <p className="font-semibold">
                {pickupOrder?.businessName} · {pickupOrder?.code}
              </p>
              <p className="mt-1 text-muted-foreground">
                Cobrás {money(pickupOrder?.tripTotal ?? 0)} al comprador. Tu envío:{" "}
                {money(pickupOrder?.tripEarnings ?? 0)}.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pickup-code">Código que te da el local</Label>
              <Input
                id="pickup-code"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={pickupCode}
                onChange={(event) => setPickupCode(event.target.value)}
                placeholder="0000"
                className="text-center font-display text-xl tracking-[0.4em]"
              />
            </div>
            <Button
              className="h-11 w-full gap-2 bg-ember-gradient text-black"
              disabled={busy === pickupOrder?._id}
              onClick={async () => {
                const order = pickupOrder;
                if (!order) return;
                const ok = await handleAdvance(order, "picked_up", { pickupCode });
                if (ok) setPickupOrder(null);
              }}
            >
              {busy === pickupOrder?._id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              Confirmar retiro
            </Button>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              El código confirma la custodia del pedido, no el dinero: el efectivo
              se registra al entregar.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deliveryOrder !== null}
        onOpenChange={(open) => !open && setDeliveryOrder(null)}
      >
        <DialogContent className="border-border/80 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Entregar y cobrar</DialogTitle>
            <DialogDescription>
              Pedile el PIN al comprador y confirmá el efectivo antes de cerrar la
              entrega del pedido {deliveryOrder?.code}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1 rounded-xl border border-border/70 bg-black/20 p-3 text-[11px]">
              <div className="flex justify-between text-muted-foreground">
                <span>Total a cobrar</span>
                <span>{money(deliveryOrder?.tripTotal ?? 0)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Para los locales (productos)</span>
                <span>
                  {money(
                    (deliveryOrder?.tripTotal ?? 0) -
                      (deliveryOrder?.tripEarnings ?? 0),
                  )}
                </span>
              </div>
              <div className="flex justify-between font-semibold text-accent">
                <span>Tu envío</span>
                <span>{money(deliveryOrder?.tripEarnings ?? 0)}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delivery-pin">PIN que te da el comprador</Label>
              <Input
                id="delivery-pin"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={deliveryPin}
                onChange={(event) => setDeliveryPin(event.target.value)}
                placeholder="0000"
                className="text-center font-display text-xl tracking-[0.4em]"
              />
            </div>
            <div className="space-y-1.5 rounded-xl border border-border/70 bg-black/20 p-3">
              <Label htmlFor="delivery-photo" className="flex items-center gap-1.5">
                <Camera className="size-3.5 text-accent" /> Foto de respaldo (opcional)
              </Label>
              <Input
                id="delivery-photo"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (file && file.size > 8 * 1024 * 1024) {
                    toast.error("La foto no puede pesar más de 8 MB");
                    event.target.value = "";
                    setDeliveryPhoto(null);
                    return;
                  }
                  setDeliveryPhoto(file);
                }}
                className="h-9 text-xs file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-[10px]"
              />
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                El PIN del comprador y tu confirmación de entrega son obligatorios. La foto ayuda a resolver reclamos, pero no sustituye la doble confirmación.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cash-amount">Efectivo que cobraste</Label>
              <Input
                id="cash-amount"
                type="number"
                min={0}
                value={cashAmount}
                onChange={(event) => setCashAmount(event.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                Viene con el total exacto. Si cobraste otra cosa, corregilo.
              </p>
            </div>
            {deliveryDifference !== 0 && (
              <>
                <p className="rounded-xl border border-primary/30 bg-primary/[0.07] p-2.5 text-[11px] leading-relaxed text-primary">
                  Diferencia: {money(deliveryDifference)}{" "}
                  {deliveryDifference < 0 ? "menos" : "más"} del total. Queda
                  asentado como problema de efectivo.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="cash-note">Qué pasó</Label>
                  <Textarea
                    id="cash-note"
                    value={cashNote}
                    onChange={(event) => setCashNote(event.target.value)}
                    placeholder="Ej: el cliente solo tenía parte del total."
                    className="min-h-16 resize-none"
                  />
                </div>
              </>
            )}
            <Button
              className="h-11 w-full gap-2 bg-ember-gradient text-black"
              disabled={busy === deliveryOrder?._id}
              onClick={async () => {
                const order = deliveryOrder;
                if (!order) return;
                let proofStorageId: Id<"_storage"> | undefined;
                if (deliveryPhoto) {
                  try {
                    const uploadUrl = await generateProofUploadUrl();
                    const response = await fetch(uploadUrl, {
                      method: "POST",
                      headers: { "Content-Type": deliveryPhoto.type },
                      body: deliveryPhoto,
                    });
                    if (!response.ok) throw new Error("No pudimos subir la foto");
                    const payload = (await response.json()) as { storageId: string };
                    proofStorageId = payload.storageId as Id<"_storage">;
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "No pudimos subir la foto");
                    return;
                  }
                }
                const ok = await handleAdvance(order, "delivered", {
                  pin: deliveryPin,
                  cashAmount: Math.round(Number(cashAmount) || 0),
                  cashNote,
                  proofStorageId,
                });
                if (ok) setDeliveryOrder(null);
              }}
            >
              {busy === deliveryOrder?._id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Cerrar entrega y registrar efectivo
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={issueTarget !== null}
        onOpenChange={(open) => !open && setIssueTarget(null)}
      >
        <DialogContent className="border-border/80 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              Reportar problema de efectivo
            </DialogTitle>
            <DialogDescription>
              Pedido {issueTarget?.code}. Queda con fecha, usuario y monto, y el
              local también lo ve.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Tipo de problema</Label>
              <Select
                value={issueKind}
                onValueChange={(value) => setIssueKind(value as CashIssueKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CASH_ISSUE_LABELS).map(([kind, meta]) => (
                    <SelectItem key={kind} value={kind}>
                      {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                {CASH_ISSUE_LABELS[issueKind].hint}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="issue-amount">Monto (opcional)</Label>
              <Input
                id="issue-amount"
                type="number"
                min={0}
                value={issueAmount}
                onChange={(event) => setIssueAmount(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="issue-note">Qué pasó</Label>
              <Textarea
                id="issue-note"
                required
                value={issueNote}
                onChange={(event) => setIssueNote(event.target.value)}
                placeholder="Contá el detalle para poder resolverlo."
                className="min-h-20 resize-none"
              />
            </div>
            <Button
              className="h-11 w-full gap-2 bg-ember-gradient text-black"
              disabled={savingIssue}
              onClick={() => void handleReportIssue()}
            >
              {savingIssue ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wallet className="size-4" />
              )}
              Registrar problema
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <AlertDialogContent className="border-border/80 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              Esta compra tiene varias entregas
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-sm leading-relaxed">
              <span className="block">
                {confirming?.businessName} pidió que el mismo repartidor haga las{" "}
                {(confirming?.remainingDeliveries ?? 0) + 1} entregas de este
                pedido. Cada una se retira cuando el local la marca lista.
              </span>
              <span className="block font-semibold text-foreground">
                Ganás {money(confirming?.groupEarnings ?? 0)} en envíos si las
                hacés todas.
              </span>
              <span className="block">
                Aceptá solo si estás de acuerdo. Si después de la primera entrega
                cambiás de opinión, podés liberar las siguientes para otro
                repartidor.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ahora no</AlertDialogCancel>
            <AlertDialogAction
              className="bg-ember-gradient text-black"
              onClick={() => {
                const order = confirming;
                setConfirming(null);
                if (order) void handleAccept(order);
              }}
            >
              Acepto todas las entregas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={renouncing !== null}
        onOpenChange={(open) => {
          if (!open) setRenouncing(null);
        }}
      >
        <AlertDialogContent className="border-border/80 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              ¿Renunciar a las entregas restantes?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              Vas a terminar la entrega que tenés en curso, pero las{" "}
              {renouncing?.remainingDeliveries ?? 0}{" "}
              {(renouncing?.remainingDeliveries ?? 0) === 1
                ? "entrega que falta"
                : "entregas que faltan"}{" "}
              de este pedido quedan disponibles para otro repartidor. No vas a
              cobrar esos envíos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir con las entregas</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-primary-foreground"
              onClick={() => {
                const order = renouncing;
                if (order) void handleRenounce(order);
              }}
            >
              Renunciar a las próximas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
