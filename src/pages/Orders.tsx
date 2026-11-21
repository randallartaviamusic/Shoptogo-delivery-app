import { EmptyState, PageHeader } from "@/components/AppShell";
import { CashIssueNote } from "@/components/CashIssueNote";
import { DeliveryTrackingMap } from "@/components/DeliveryTracking";
import { DishImage } from "@/components/DishImage";
import { OrderAlertsSettings } from "@/components/OrderAlertsSettings";
import { OrderReview } from "@/components/OrderReview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { OrderStatus } from "@/convex/schema";
import type { CashIssueView } from "@/lib/cash";
import type { GeoPoint } from "@/lib/delivery";
import { ASSIGNMENT_RULES, formatKm } from "@/lib/delivery";
import { ACTIVE_STATUSES, clockTime, money, ORDER_STATUS, relativeTime } from "@/lib/format";
import {
  formatSinpeNumber,
  normalizeSinpeNumber,
  sinpePaymentMessage,
  sinpeWhatsappHref,
} from "@/lib/sinpe";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bike,
  Check,
  ChefHat,
  CircleSlash,
  ImagePlus,
  Loader2,
  MapPin,
  MessageCircle,
  PackageCheck,
  ReceiptText,
  ShoppingCart,
  Smartphone,
  Star,
  Store,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

type OrderItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
};

export type OrderView = {
  _id: string;
  code: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  deliveryDiscount?: number;
  couponCode: string | null;
  couponDiscount: number;
  scheduledFor: number | null;
  deliveryProof: { url: string; at: number; byName: string | null } | null;
  deliveryConfirmation: {
    buyerPinVerifiedAt: number;
    courierConfirmedAt: number;
    courierId: string;
  } | null;
  cancelledBy: "buyer" | "business" | "system" | null;
  total: number;
  address: string;
  distanceKm: number | null;
  notes: string | null;
  groupCode: string | null;
  batchIndex: number | null;
  batchCount: number | null;
  sameCourier: boolean;
  reservedCourierId: string | null;
  locked: boolean;
  remainingDeliveries: number;
  reservedDeliveries: number;
  groupEarnings: number;
  tripStops: number;
  extraStopFee: number;
  tripEarnings: number;
  tripTotal: number;
  // Efectivo verificable.
  businessDue: number;
  businessPending: number;
  expectedTotal: number;
  expectedEarnings: number;
  cashCollected: number | null;
  cashCollectedAt: number | null;
  cashCollectedByName: string | null;
  cashCollectedLog: Array<{ amount: number; at: number }>;
  cashHandedLog: Array<{ amount: number; at: number }>;
  cashHanded: number | null;
  cashHandedAt: number | null;
  cashHandedByName: string | null;
  cashDifference: number | null;
  cashPending: number;
  cashIssue: CashIssueView | null;
  // Pago elegido al confirmar y cobro directo por SINPE.
  paymentMethod: "cash" | "sinpe";
  paymentSinpePhone: string | null;
  paymentWhatsappPhone: string | null;
  paymentReceipt: { url: string; at: number } | null;
  paymentWhatsappSentAt: number | null;
  pickupCode: string | null;
  deliveryPin: string | null;
  stops: Array<{
    businessId: string;
    name: string;
    address: string;
    fee: number;
    itemCount: number;
  }>;
  createdAt: number;
  acceptedAt: number | null;
  courierAcceptedAt: number | null;
  readyAt: number | null;
  pickedUpAt: number | null;
  deliveredAt: number | null;
  cancelledAt: number | null;
  cancellationReason: string | null;
  // Temporizador y sugerencias de asignación.
  waitStartedAt: number | null;
  waitingMinutes: number | null;
  assignmentSecondsLeft: number | null;
  assignmentUrgent: boolean;
  canCancelUnassigned: boolean;
  pickupKm?: number | null;
  pickupMinutes?: number | null;
  deliveryMinutes?: number | null;
  totalEtaMinutes?: number | null;
  acceptAllowed?: boolean;
  acceptReason?: string | null;
  groupable?: boolean;
  groupExtraMinutes?: number | null;
  recommended?: boolean;
  // Estimación de llegada y demoras.
  promisedArrivalAt: number | null;
  estimatedArrivalAt: number | null;
  lateMinutes: number;
  delayed: boolean;
  businessId: string;
  businessName: string;
  businessImage: string;
  businessAddress: string;
  businessPhone: string | null;
  pickupInstructions: string | null;
  packagingInstructions: string | null;
  businessLocation: GeoPoint | null;
  deliveryLocation: GeoPoint | null;
  courierLocation: GeoPoint | null;
  courierLocationAt: number | null;
  etaMinutes: number;
  buyerName: string;
  buyerPhone: string | null;
  courierId: string | null;
  courierName: string | null;
  courierPhone: string | null;
  courierRating: number | null;
  courierReviews: number;
  courierVerified: boolean;
  businessRating: number | null;
  businessReviews: number | null;
  businessVerified: boolean;
};

const STEPS = [
  { key: "accepted", label: "Confirmado", icon: Check },
  { key: "preparing", label: "En cocina", icon: ChefHat },
  { key: "picked_up", label: "En camino", icon: Bike },
  { key: "delivered", label: "Entregado", icon: PackageCheck },
] as const;

const PROGRESS: Record<OrderStatus, number> = {
  pending: 6,
  accepted: 30,
  preparing: 56,
  ready: 70,
  picked_up: 84,
  delivered: 100,
  cancelled: 0,
};

const STEP_ORDER: Record<OrderStatus, number> = {
  pending: 0,
  accepted: 1,
  preparing: 2,
  ready: 2,
  picked_up: 3,
  delivered: 4,
  cancelled: 0,
};

export function StatusPill({ status }: { status: OrderStatus }) {
  const meta = ORDER_STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
        status === "delivered" || status === "cancelled"
          ? "border-border/80 bg-secondary/60 text-muted-foreground"
          : status === "pending" || status === "accepted"
            ? "border-accent/30 bg-accent/10 text-accent"
            : "border-primary/35 bg-primary/10 text-primary",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "delivered" || status === "cancelled"
            ? "bg-muted-foreground"
            : status === "pending" || status === "accepted"
              ? "bg-accent"
              : "bg-primary animate-pulse",
        )}
      />
      {ORDER_STATUS[status].customerLabel}
    </span>
  );
}

export function OrderProgress({ status }: { status: OrderStatus }) {
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-black/25 px-3 py-2.5 text-xs text-muted-foreground">
        <CircleSlash className="size-4" />
        Pedido cancelado
      </div>
    );
  }
  const current = STEP_ORDER[status];
  return (
    <div className="rounded-xl border border-border/70 bg-black/25 px-3 py-3">
      <div className="relative h-1.5 overflow-hidden rounded-full bg-white/8">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-ember-gradient"
          initial={{ width: 0 }}
          animate={{ width: `${PROGRESS[status]}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <div className="mt-2.5 flex justify-between">
        {STEPS.map((step, index) => {
          const done = current >= index + 1;
          return (
            <span
              key={step.key}
              className={cn(
                "flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide",
                done ? "text-foreground" : "text-muted-foreground/60",
              )}
            >
              <step.icon className="size-3" />
              <span className="hidden sm:inline">{step.label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function canShareFile(file: File | null) {
  if (
    !file ||
    typeof navigator === "undefined" ||
    typeof navigator.canShare !== "function"
  ) {
    return false;
  }
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Pago directo a la tienda: monto exacto (productos + envío de esa tienda),
 * número de SINPE, captura del comprobante y envío por WhatsApp desde el
 * teléfono del comprador. El local ve la captura y la fecha en su panel.
 */
function SinpePaymentPanel({ order }: { order: OrderView }) {
  const generateUploadUrl = useMutation(
    api.orders.generatePaymentReceiptUploadUrl,
  );
  const attachReceipt = useMutation(api.orders.attachPaymentReceipt);
  const markSent = useMutation(api.orders.markPaymentWhatsappSent);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  // La imagen queda en memoria para poder compartirla adjunta desde el teléfono.
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  // Al abrir otro pedido no se arrastra la captura del anterior.
  useEffect(() => {
    setPreview(null);
    setReceiptFile(null);
  }, [order._id]);

  const sinpe = normalizeSinpeNumber(order.paymentSinpePhone);
  const whatsapp = normalizeSinpeNumber(order.paymentWhatsappPhone);
  const receiptUrl = order.paymentReceipt?.url ?? preview;
  const message = sinpePaymentMessage({
    businessName: order.businessName,
    orderCode: order.code,
    amount: order.total,
    buyerName: order.buyerName,
    buyerPhone: order.buyerPhone,
    receiptUrl,
  });
  const href = sinpeWhatsappHref(whatsapp, message);
  const canShareImage = canShareFile(receiptFile);

  const handleShareImage = async () => {
    if (!receiptFile) return;
    try {
      await navigator.share({ files: [receiptFile], text: message });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast.error(
          error instanceof Error
            ? error.message
            : "No pudimos compartir la captura",
        );
      }
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Subí una imagen de la captura (JPG, PNG o WebP)");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("La captura no puede pesar más de 8 MB");
      return;
    }
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("No pudimos subir la captura");
      const payload = (await response.json()) as { storageId: string };
      const saved = await attachReceipt({
        orderId: order._id as Id<"orders">,
        storageId: payload.storageId as Id<"_storage">,
      });
      setPreview(saved.url);
      setReceiptFile(file);
      toast.success("Captura guardada", {
        description: "Ya quedó adjunta al pedido. Ahora enviála por WhatsApp.",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos guardar la captura",
      );
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSend = async () => {
    if (!href) {
      toast.error("La tienda todavía no tiene un número de WhatsApp válido");
      return;
    }
    setSending(true);
    // Se abre dentro del gesto del toque para que el navegador no lo bloquee.
    const opened = window.open(href, "_blank", "noopener,noreferrer");
    if (!opened) window.location.href = href;
    try {
      await markSent({ orderId: order._id as Id<"orders"> });
      toast.success("Abriendo WhatsApp", {
        description: "El mensaje sale desde tu WhatsApp al número de la tienda.",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos abrir WhatsApp",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-accent/35 bg-accent/[0.06] p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
        <Smartphone className="size-3.5" /> Pago por SINPE Móvil
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">
            Transferí a {order.businessName}:
          </p>
          <p className="font-display text-xl font-extrabold text-accent">
            {money(order.total)}
          </p>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Productos más el envío de esta tienda, después de descuentos.
          </p>
        </div>
        <div className="rounded-xl border border-accent/30 bg-black/20 px-3 py-2 text-right">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            SINPE Móvil
          </p>
          <p className="font-display text-base font-bold tracking-wide">
            {sinpe ? formatSinpeNumber(sinpe) : "Sin número"}
          </p>
        </div>
      </div>

      {receiptUrl ? (
        <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-border/70 bg-black/20 p-2.5">
          <a href={receiptUrl} target="_blank" rel="noreferrer" className="shrink-0">
            <img
              src={receiptUrl}
              alt="Captura del pago SINPE"
              className="size-14 rounded-lg border border-border/60 object-cover"
            />
          </a>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-accent">
              Captura adjunta al pedido
            </p>
            <p className="text-[10px] text-muted-foreground">
              {order.paymentReceipt
                ? `Subida ${relativeTime(order.paymentReceipt.at)}`
                : "Lista para enviar"}
              {order.paymentWhatsappSentAt
                ? ` · WhatsApp abierto ${relativeTime(order.paymentWhatsappSentAt)}`
                : ""}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-1 border-border/80 px-2 text-[10px]"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <ImagePlus className="size-3" />
            )}
            Cambiar
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-accent/40 bg-black/20 py-3 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ImagePlus className="size-4" />
          )}
          {uploading ? "Subiendo captura..." : "Subir captura del pago por SINPE"}
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
      />

      <details className="mt-2.5 rounded-lg border border-border/60 bg-black/20 px-2.5 py-2">
        <summary className="cursor-pointer text-[10px] font-semibold text-muted-foreground">
          Mensaje que se envía a la tienda
        </summary>
        <pre className="mt-1.5 whitespace-pre-wrap font-sans text-[10px] leading-relaxed text-muted-foreground">
          {message}
        </pre>
      </details>

      <Button
        type="button"
        className="mt-2.5 h-10 w-full gap-2 bg-[#25d366] text-black hover:bg-[#1ebe5b]"
        disabled={!receiptUrl || !whatsapp || sending}
        onClick={() => void handleSend()}
      >
        {sending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <MessageCircle className="size-4" />
        )}
        Enviar comprobante por WhatsApp
      </Button>
      {canShareImage && (
        <Button
          type="button"
          variant="outline"
          className="mt-2 h-9 w-full gap-2 border-border/80 text-[11px]"
          onClick={() => void handleShareImage()}
        >
          <ImagePlus className="size-3.5" /> Compartir captura con la imagen adjunta
        </Button>
      )}
      <p className="mt-1.5 text-center text-[9px] leading-relaxed text-muted-foreground">
        {whatsapp
          ? `Se abre tu WhatsApp con el mensaje escrito para ${formatSinpeNumber(whatsapp)} de ${order.businessName}.`
          : "La tienda todavía no tiene un WhatsApp configurado para comprobantes."}
        {receiptUrl
          ? " La captura queda adjunta al pedido y su enlace va en el mensaje."
          : " Subí primero la captura para habilitar el envío."}
      </p>
    </div>
  );
}

function OrderDetailDialog({
  order,
  open,
  onOpenChange,
  onCancel,
}: {
  order: OrderView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel?: () => void;
}) {
  const navigate = useNavigate();
  const repeatOrder = useMutation(api.cart.repeatOrder);
  const [repeating, setRepeating] = useState(false);
  if (!order) return null;

  const handleRepeat = async () => {
    setRepeating(true);
    try {
      const result = await repeatOrder({ orderId: order._id as Id<"orders"> });
      if (result.added.length === 0) {
        toast.error("No quedan productos disponibles para repetir", {
          description: result.skipped.length ? `No disponibles: ${result.skipped.join(", ")}` : undefined,
        });
        return;
      }
      toast.success("Pedido agregado al carrito", {
        description: result.skipped.length
          ? `Agregados ${result.added.length}; agotados o cerrados: ${result.skipped.join(", ")}`
          : `${result.added.length} productos disponibles agregados. Revisá el precio y el envío actuales.`,
      });
      onOpenChange(false);
      navigate("/cart");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos repetir el pedido");
    } finally {
      setRepeating(false);
    }
  };
  const timeline = [
    { label: "Pedido creado", value: order.createdAt },
    { label: "Aceptado por el local", value: order.acceptedAt },
    { label: "Listo para retirar", value: order.readyAt },
    { label: "Retirado por el repartidor", value: order.pickedUpAt },
    { label: "Entregado", value: order.deliveredAt },
  ].filter((step) => step.value !== null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-border/80 bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            Pedido {order.code}
          </DialogTitle>
          <DialogDescription>
            {order.businessName} · {relativeTime(order.createdAt)}
            {order.batchCount && order.batchCount > 1 && (
              <>
                {" "}
                · Entrega {order.batchIndex} de {order.batchCount}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <StatusPill status={order.status} />
          <OrderProgress status={order.status} />

          {order.status === "cancelled" && order.cancellationReason && (
            <div className="rounded-xl border border-border/70 bg-secondary/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
              <p>{order.cancellationReason}</p>
              <Link
                to={`/ayuda?order=${order._id}`}
                className="mt-1 inline-flex items-center gap-1 font-semibold text-accent hover:underline"
              >
                Abrir un caso en Ayuda
              </Link>
            </div>
          )}

          {order.status === "ready" && !order.courierId && (
            <p className="rounded-xl border border-accent/25 bg-accent/[0.06] p-3 text-[11px] leading-relaxed text-muted-foreground">
              El local ya tiene tu pedido listo y estamos buscando un
              repartidor cerca. Lleva {order.waitingMinutes ?? 0} min esperando:
              si nadie lo toma en {ASSIGNMENT_RULES.autoCancelAfterMinutes}{" "}
              minutos, se cancela automáticamente y no se cobra nada.
            </p>
          )}

          {order.scheduledFor && order.status !== "delivered" && order.status !== "cancelled" && (
            <p className="rounded-xl border border-accent/25 bg-accent/[0.06] p-3 text-[11px] leading-relaxed text-accent">
              Pedido programado para {new Intl.DateTimeFormat("es-CR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Costa_Rica" }).format(order.scheduledFor)}.
            </p>
          )}

          {order.deliveryPin &&
            (order.status === "ready" || order.status === "picked_up") && (
              <div className="rounded-xl border border-accent/40 bg-accent/[0.08] p-3 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                  PIN de entrega
                </p>
                <p className="mt-1 font-display text-3xl font-extrabold tracking-[0.35em]">
                  {order.deliveryPin}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Dalo al repartidor solo cuando tengas el pedido en la mano. Él lo
                  ingresa para cerrar la entrega;{" "}
                  {order.paymentMethod === "sinpe"
                    ? "el pago va por SINPE a la tienda."
                    : "el efectivo se registra aparte."}
                </p>
              </div>
            )}

          {order.tripStops > 1 && (
            <div className="rounded-xl border border-accent/30 bg-accent/[0.07] p-2.5 text-[11px] leading-relaxed text-muted-foreground">
              <p className="font-semibold text-accent">
                Entrega compartida con {order.tripStops} tiendas
              </p>
              <p className="mt-1">
                El repartidor retira en{" "}
                {order.stops.map((stop) => stop.name).join(" y ")}. El envío se
                cobra una sola vez por entrega: suma {money(order.extraStopFee)}{" "}
                por la tienda adicional y esta entrega te cuesta{" "}
                {money(order.deliveryFee)}. Las tiendas con promoción cubren la
                parte que les corresponde sin cambiar lo que pagás.
              </p>
            </div>
          )}

          {order.batchCount && order.batchCount > 1 && (
            <p className="rounded-xl border border-border/70 bg-black/20 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
              Parte {order.batchIndex} de {order.batchCount} de una compra grande:
              cada entrega lleva hasta 3 productos y paga su propio envío.{" "}
              {order.sameCourier
                ? "Pediste que el mismo repartidor haga todas las entregas."
                : "Las entregas las van tomando los repartidores de turno."}
            </p>
          )}

          {order.courierAcceptedAt !== null && order.status !== "cancelled" && (
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
          )}

          <ul className="space-y-2">
            {order.items.map((item) => (
              <li key={item.productId} className="flex items-center gap-3">
                <DishImage
                  src={item.image}
                  alt={item.name}
                  className="size-11 rounded-lg"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} × {money(item.price)}
                  </p>
                </div>
                <p className="text-sm font-semibold">
                  {money(item.price * item.quantity)}
                </p>
              </li>
            ))}
          </ul>

          <div className="space-y-1.5 rounded-xl border border-border/70 p-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{money(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>
                Envío
                {order.tripStops > 1 && (
                  <span className="text-[10px]"> (parte de esta tienda)</span>
                )}
              </span>
              <span>{money(order.deliveryFee)}</span>
            </div>
            {(order.deliveryDiscount ?? 0) > 0 && (
              <div className="flex justify-between text-accent">
                <span>Promo de envío (la cubre el local)</span>
                <span>−{money(order.deliveryDiscount ?? 0)}</span>
              </div>
            )}
            {(order.couponDiscount ?? 0) > 0 && (
              <div className="flex justify-between text-accent">
                <span>Cupón del local{order.couponCode ? ` · ${order.couponCode}` : ""}</span>
                <span>−{money(order.couponDiscount ?? 0)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border/60 pt-1.5 font-bold">
              <span>
                {order.tripStops > 1 ? "Total de esta tienda" : "Total"}
              </span>
              <span>{money(order.total)}</span>
            </div>
          </div>

          {order.paymentMethod === "sinpe" && order.status !== "cancelled" && (
            <SinpePaymentPanel order={order} />
          )}

          {order.paymentMethod !== "sinpe" && (
          <div className="rounded-xl border border-border/70 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
              <Wallet className="size-3.5" /> Efectivo del pedido
            </p>
            <div className="mt-2 space-y-1 text-[11px]">
              <div className="flex justify-between text-muted-foreground">
                <span>Productos (para el local)</span>
                <span>{money(order.businessDue)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>
                  Envío (para el repartidor
                  {order.tripStops > 1 ? ", parte de esta tienda" : ""})
                </span>
                <span>{money(order.deliveryFee)}</span>
              </div>
              <div className="flex justify-between border-t border-border/60 pt-1 font-semibold">
                <span>
                  {order.tripStops > 1
                    ? `Total a cobrar (entrega de ${order.tripStops} tiendas)`
                    : "Total a cobrar al comprador"}
                </span>
                <span>{money(order.tripTotal)}</span>
              </div>
            </div>

            <div className="mt-2 space-y-1 border-t border-border/60 pt-2 text-[11px] leading-relaxed">
              {order.status === "cancelled" ? (
                <p className="text-muted-foreground">
                  Pedido cancelado: no se cobra efectivo. Si ya se había cobrado,
                  el reembolso queda registrado como problema de efectivo.
                </p>
              ) : order.cashCollected === null ? (
                <p className="text-muted-foreground">
                  El repartidor confirma el efectivo recibido al entregar. Se cobra
                  una sola vez por entrega.
                </p>
              ) : (
                <>
                  <div className="flex justify-between text-accent">
                    <span>Efectivo recibido por el repartidor</span>
                    <span>{money(order.cashCollected)}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Confirmado por {order.cashCollectedByName ?? "el repartidor"}{" "}
                    · {relativeTime(order.cashCollectedAt ?? order.createdAt)}
                  </p>
                  {(order.cashDifference ?? 0) !== 0 && (
                    <p className="text-primary">
                      Diferencia: {money(order.cashDifference ?? 0)} sobre un total
                      de {money(order.tripTotal)}.
                    </p>
                  )}
                  {order.cashHanded !== null && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Entregado al local</span>
                      <span>{money(order.cashHanded)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          )}

          {order.cashIssue && <CashIssueNote issue={order.cashIssue} />}

          {order.status === "delivered" && (
            <div className="rounded-xl border border-accent/30 bg-accent/[0.06] p-3 text-[11px]">
              <p className="font-semibold text-accent">Entrega confirmada por ambas partes</p>
              <p className="mt-1 text-muted-foreground">
                PIN del comprador y cierre del repartidor · {order.deliveryConfirmation ? clockTime(order.deliveryConfirmation.courierConfirmedAt) : clockTime(order.deliveredAt ?? order.createdAt)}
              </p>
              {order.deliveryProof && (
                <a
                  href={order.deliveryProof.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 font-semibold text-accent hover:underline"
                >
                  <PackageCheck className="size-3.5" /> Ver foto de entrega
                </a>
              )}
            </div>
          )}

          {order.status === "delivered" && (
            <OrderReview
              orderId={order._id}
              businessName={order.businessName}
              courierName={order.courierName}
            />
          )}

          <div className="space-y-2 text-sm">
            <p className="flex items-start gap-2 text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />
              <span>
                {order.address}
                {order.distanceKm !== null && (
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · {formatKm(order.distanceKm)} en moto
                  </span>
                )}
              </span>
            </p>
            {order.notes && (
              <p className="rounded-xl bg-secondary/50 p-2.5 text-xs leading-relaxed text-muted-foreground">
                “{order.notes}”
              </p>
            )}
            {order.courierName && (
              <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <Bike className="size-4 text-accent" />
                {order.courierName}
                {order.courierPhone ? ` · ${order.courierPhone}` : ""}
                {order.courierVerified && (
                  <span className="rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent">
                    Verificado
                  </span>
                )}
                {order.courierRating !== null && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-accent">
                    <Star className="size-3 fill-current" />
                    {order.courierRating.toFixed(1)} ({order.courierReviews})
                  </span>
                )}
              </p>
            )}
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Historial
            </p>
            <ul className="space-y-2">
              {timeline.map((step) => (
                <li
                  key={step.label}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-muted-foreground">{step.label}</span>
                  <span className="font-medium">{clockTime(step.value!)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {!ACTIVE_STATUSES.includes(order.status) && (
              <Button
                className="gap-2 bg-ember-gradient text-black"
                disabled={repeating}
                onClick={() => void handleRepeat()}
              >
                {repeating ? <Loader2 className="size-4 animate-spin" /> : <ShoppingCart className="size-4" />}
                Repetir pedido
              </Button>
            )}
            <Button asChild variant="outline" className="gap-2 border-border/80">
              <Link to={`/comprobante/${order._id}`}>
                <ReceiptText className="size-4" /> Comprobante digital
              </Link>
            </Button>
            <Button asChild variant="ghost" className="gap-2 text-muted-foreground">
              <Link to={`/ayuda?order=${order._id}`}>Ayuda con este pedido</Link>
            </Button>
          </div>

          {order.status === "pending" && onCancel && (
            <Button
              variant="outline"
              className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/10"
              onClick={onCancel}
            >
              <X className="size-4" />
              Cancelar pedido
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function OrdersPage() {
  const orders = useQuery(api.orders.myOrders);
  const cancelOrder = useMutation(api.orders.cancel);
  const repeatOrder = useMutation(api.cart.repeatOrder);
  const navigate = useNavigate();
  const [quickRepeating, setQuickRepeating] = useState(false);
  const [tab, setTab] = useState<"active" | "history">("active");
  const [selected, setSelected] = useState<OrderView | null>(null);

  if (orders === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  const typed = orders as unknown as OrderView[];
  const active = typed.filter((order) => ACTIVE_STATUSES.includes(order.status));
  const history = typed.filter((order) => !ACTIVE_STATUSES.includes(order.status));
  const list = tab === "active" ? active : history;
  const recentDelivered = history.find((order) => order.status === "delivered");

  const handleQuickRepeat = async () => {
    if (!recentDelivered) return;
    setQuickRepeating(true);
    try {
      const result = await repeatOrder({
        orderId: recentDelivered._id as Id<"orders">,
      });
      if (result.added.length === 0) {
        toast.error("No quedan productos disponibles para repetir", {
          description: result.skipped.length
            ? `No disponibles: ${result.skipped.join(", ")}`
            : undefined,
        });
        return;
      }
      toast.success("Tu antojo volvió al carrito", {
        description: result.skipped.length
          ? `Agregados ${result.added.length}; omitidos ${result.skipped.length}. Revisá precios y envío actuales.`
          : `${result.added.length} productos listos. Revisá precios y envío actuales.`,
      });
      navigate("/cart");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos repetir el pedido");
    } finally {
      setQuickRepeating(false);
    }
  };

  const handleCancel = async (order: OrderView) => {
    try {
      await cancelOrder({ orderId: order._id as Id<"orders"> });
      setSelected(null);
      toast("Pedido cancelado", { description: `El pedido ${order.code} fue cancelado.` });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos cancelar");
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Tus pedidos"
        title="Seguí tu antojo en vivo"
        description="Cada pedido se actualiza cuando el local y el repartidor avanzan."
        action={
          <div className="flex rounded-full border border-border/80 p-1">
            {[
              { key: "active" as const, label: `Activos ${active.length}` },
              { key: "history" as const, label: "Historial" },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  tab === item.key
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        }
      />

      <OrderAlertsSettings audience="buyer" className="mb-5" />

      {tab === "history" && recentDelivered && (
        <section className="surface-raised mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-accent/20 p-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
              Tu último favorito
            </p>
            <p className="mt-1 truncate font-display text-sm font-bold">
              {recentDelivered.businessName} · {recentDelivered.items.map((item) => item.name).slice(0, 2).join(", ")}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Pedido {recentDelivered.code} · revisá el precio y el envío actuales antes de confirmar.
            </p>
          </div>
          <Button
            className="shrink-0 gap-2 bg-ember-gradient text-black"
            disabled={quickRepeating}
            onClick={() => void handleQuickRepeat()}
          >
            {quickRepeating ? <Loader2 className="size-4 animate-spin" /> : <ShoppingCart className="size-4" />}
            Pedir de nuevo
          </Button>
        </section>
      )}

      {list.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={tab === "active" ? "No hay pedidos en curso" : "Todavía no hay historial"}
          description={
            tab === "active"
              ? "Cuando confirmes un antojo, acá vas a ver cada paso hasta la puerta de tu casa."
              : "Tus pedidos entregados y cancelados van a aparecer acá."
          }
          action={
            <Button asChild className="gap-2 bg-ember-gradient text-black">
              <Link to="/swipe">Ir al mazo</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <AnimatePresence initial={false}>
            {list.map((order) => (
              <motion.button
                key={order._id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                onClick={() => setSelected(order)}
                className="surface-raised block w-full rounded-3xl p-4 text-left transition-colors hover:border-accent/25"
              >
                <div className="flex items-center gap-3">
                  <DishImage
                    src={order.businessImage}
                    alt={order.businessName}
                    className="size-11 rounded-xl"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-display text-sm font-bold">
                        {order.businessName}
                      </p>
                      <span className="text-[10px] text-muted-foreground">
                        {order.code}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {relativeTime(order.createdAt)} ·{" "}
                      {order.items.reduce((acc, item) => acc + item.quantity, 0)}{" "}
                      productos
                      {order.batchCount && order.batchCount > 1 && (
                        <>
                          {" "}
                          · Entrega {order.batchIndex} de {order.batchCount}
                        </>
                      )}
                      {order.tripStops > 1 && <> · {order.tripStops} tiendas</>}
                      {order.paymentMethod === "sinpe" && (
                        <>
                          {" "}
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold",
                              order.paymentReceipt
                                ? "border-accent/40 bg-accent/10 text-accent"
                                : "border-primary/40 bg-primary/10 text-primary",
                            )}
                          >
                            <Smartphone className="size-2.5" />
                            {order.paymentReceipt
                              ? "SINPE · comprobante subido"
                              : "SINPE · falta captura"}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <StatusPill status={order.status} />
                </div>

                <div className="mt-3 flex items-center gap-1.5">
                  {order.items.slice(0, 4).map((item) => (
                    <DishImage
                      key={item.productId}
                      src={item.image}
                      alt={item.name}
                      className="size-10 rounded-lg"
                    />
                  ))}
                  {order.items.length > 4 && (
                    <span className="flex size-10 items-center justify-center rounded-lg border border-border/70 text-xs text-muted-foreground">
                      +{order.items.length - 4}
                    </span>
                  )}
                  <div className="ml-auto text-right">
                    <p className="font-display text-base font-bold">
                      {money(order.total)}
                    </p>
                    <p
                      className={cn(
                        "text-[10px]",
                        order.delayed && order.estimatedArrivalAt
                          ? "font-semibold text-primary"
                          : "text-muted-foreground",
                      )}
                    >
                      {order.delayed && order.estimatedArrivalAt
                        ? `Demora +${order.lateMinutes} min`
                        : order.estimatedArrivalAt &&
                            (order.status === "picked_up" ||
                              order.status === "ready")
                          ? `Llegada ~${clockTime(order.estimatedArrivalAt)}`
                          : `ETA ${order.etaMinutes} min`}
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <OrderProgress status={order.status} />
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5 truncate">
                    <MapPin className="size-3.5 shrink-0" />
                    <span className="truncate">{order.address}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Store className="size-3.5" />
                    Ver detalle
                  </span>
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      )}

      <OrderDetailDialog
        order={typed.find((order) => order._id === selected?._id) ?? selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        onCancel={selected ? () => handleCancel(selected) : undefined}
      />
    </div>
  );
}
