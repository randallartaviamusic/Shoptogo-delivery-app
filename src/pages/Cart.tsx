import { EmptyState, PageHeader } from "@/components/AppShell";
import { DishImage } from "@/components/DishImage";
import { LocationField } from "@/components/LocationField";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { formatKm } from "@/lib/delivery";
import { money } from "@/lib/format";
import { optionSummary } from "@/lib/productOptions";
import { formatSinpeNumber, normalizeSinpeNumber, sinpeWhatsappHref } from "@/lib/sinpe";
import { FULFILLMENT_OPTIONS, type FulfillmentMethod } from "@/lib/fulfillment";
import { costaRicaLocalToTimestamp, SCHEDULE_RULES } from "@/lib/scheduling";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Banknote,
  Bike,
  BookmarkPlus,
  CalendarClock,
  Check,
  Copy,
  ImagePlus,
  Loader2,
  Minus,
  MessageCircle,
  PackageCheck,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Star,
  Store,
  Tag,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

export default function CartPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [couponDraft, setCouponDraft] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [fulfillment, setFulfillment] = useState<FulfillmentMethod>("delivery");
  const cart = useQuery(api.cart.myCart, {
    couponCode: couponCode || undefined,
    fulfillmentMethod: fulfillment,
  });
  const setQuantity = useMutation(api.cart.setQuantity);
  const removeItem = useMutation(api.cart.remove);
  const clearCart = useMutation(api.cart.clear);
  const checkout = useMutation(api.cart.checkout);
  const saveLocation = useMutation(api.profiles.saveLocation);
  const addressBook = useQuery(api.profiles.savedAddresses);
  const removeSavedAddress = useMutation(api.profiles.removeSavedAddress);

  const [address, setAddress] = useState(user?.address ?? "");
  const [dropoff, setDropoff] = useState<{ lat: number; lng: number } | null>(
    user?.location ?? null,
  );
  const [notes, setNotes] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [placing, setPlacing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "sinpe">("cash");
  // Para compras de más de 3 productos: mismo repartidor en todas las entregas.
  const [sameCourier, setSameCourier] = useState(true);
  const [saveLabel, setSaveLabel] = useState("Casa");
  const [saveAddressBusy, setSaveAddressBusy] = useState(false);
  // Pago por SINPE en 3 pasos y en orden: 1) pagar, 2) comprobante +
  // WhatsApp, 3) confirmar. Sin los dos primeros no se habilita el tercero.
  // Todo el avance se guarda en el teléfono: al volver de WhatsApp (aunque el
  // sistema recargue la página) el pago, las capturas y los envíos siguen
  // marcados, y el mensaje siempre lleva el enlace de cada comprobante.
  const SINPE_CART_KEY = "stg:sinpe-cart-v1";
  const readSinpeCartSaved = (): {
    storeKey: string;
    paid: boolean;
    sent: Record<string, boolean>;
    receipts: Array<{ storageId: string; url: string; name: string }>;
  } | null => {
    try {
      const raw = window.localStorage.getItem(SINPE_CART_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        storeKey?: unknown;
        paid?: unknown;
        sent?: unknown;
        receipts?: unknown;
      };
      if (!parsed || typeof parsed !== "object") return null;
      const receipts = Array.isArray(parsed.receipts)
        ? (parsed.receipts as Array<{ storageId?: unknown; url?: unknown; name?: unknown }>)
            .filter((item) => typeof item?.storageId === "string" && typeof item?.url === "string")
            .map((item) => ({
              storageId: item.storageId as string,
              url: item.url as string,
              name: typeof item.name === "string" ? item.name : "comprobante",
            }))
        : [];
      return {
        storeKey: typeof parsed.storeKey === "string" ? parsed.storeKey : "",
        paid: parsed.paid === true,
        sent:
          parsed.sent && typeof parsed.sent === "object"
            ? (parsed.sent as Record<string, boolean>)
            : {},
        receipts,
      };
    } catch {
      return null;
    }
  };
  const [sinpePaid, setSinpePaid] = useState(() => readSinpeCartSaved()?.paid ?? false);
  const [sinpeFiles, setSinpeFiles] = useState<
    Array<{
      file?: File;
      preview: string;
      name: string;
      uploading: boolean;
      storageId?: string;
      url?: string;
    }>
  >(() =>
    (readSinpeCartSaved()?.receipts ?? []).map((item) => ({
      preview: item.url,
      name: item.name,
      uploading: false,
      storageId: item.storageId,
      url: item.url,
    })),
  );
  const [sinpeWhatsappOpened, setSinpeWhatsappOpened] = useState<Record<string, boolean>>(
    () => readSinpeCartSaved()?.sent ?? {},
  );
  const sinpeFileRef = useRef<HTMLInputElement>(null);
  const generateReceiptUploadUrl = useMutation(api.orders.generatePaymentReceiptUploadUrl);
  const resolveReceiptUrl = useMutation(api.orders.resolveReceiptUrl);

  const groups = cart?.groups ?? [];
  const count = cart?.count ?? 0;
  const deliveries = cart?.deliveryBatches ?? 0;
  const trips = cart?.trips ?? [];
  const splitInDeliveries = deliveries > 1;
  const multiStore = trips.some((trip) => trip.stops.length > 1);
  const hasClosed = groups.some((group) => !group.isOpen);
  const allCovered = groups.every((group) => group.deliveryAvailable);
  // Todos los locales del carrito tienen SINPE y WhatsApp para cobrar directo.
  const sinpeReady = groups.length > 0 && groups.every((group) => group.sinpeReady);
  // Cómo recibe el comprador su pedido. Sin domicilio no hay punto en el
  // mapa ni zona de reparto: el comprador pasa por cada local.
  const needsDelivery = fulfillment === "delivery";
  const needsSchedule = fulfillment === "reservation";
  const wantsSchedule = scheduleEnabled || needsSchedule;
  const canConfirm = needsDelivery
    ? Boolean(dropoff) && address.trim().length >= 6 && allCovered
    : true;
  const scheduledFor = wantsSchedule
    ? costaRicaLocalToTimestamp(scheduledLocal)
    : null;
  const scheduleError = wantsSchedule && !scheduledFor
    ? needsSchedule
      ? "Elegí la fecha y hora exacta de tu reserva"
      : "Elegí una fecha y hora de entrega"
    : wantsSchedule && scheduledFor
      ? scheduledFor <= Date.now() + SCHEDULE_RULES.minMinutesAhead * 60_000
        ? `Programá con al menos ${SCHEDULE_RULES.minMinutesAhead} minutos de anticipación`
        : scheduledFor > Date.now() + SCHEDULE_RULES.maxDaysAhead * 86_400_000
          ? `Podés programar hasta ${SCHEDULE_RULES.maxDaysAhead} días antes`
          : null
      : null;
  const minScheduledLocal = new Date(
    Date.now() + SCHEDULE_RULES.minMinutesAhead * 60_000 - 6 * 60 * 60 * 1000,
  ).toISOString().slice(0, 16);
  const maxScheduledLocal = new Date(
    Date.now() + SCHEDULE_RULES.maxDaysAhead * 86_400_000 - 6 * 60 * 60 * 1000,
  ).toISOString().slice(0, 16);

  // Clave del intento de compra. Se mantiene si la solicitud falla (reintentar
  // no duplica el pedido) y se renueva cuando cambia el carrito.
  const requestKey = useRef<string | null>(null);
  const cartFingerprint = useMemo(
    () =>
      groups
        .flatMap((group) =>
          group.items.map((item) => `${item.cartItemId}:${item.quantity}`),
        )
        .sort()
        .join("|"),
    [groups],
  );
  useEffect(() => {
    requestKey.current = null;
  }, [cartFingerprint]);

  // Si el usuario ya tenía un punto guardado (o lo eligió en otra pestaña),
  // lo usamos apenas llega la ficha.
  useEffect(() => {
    if (!dropoff && user?.location) setDropoff(user.location);
  }, [dropoff, user?.location]);

  useEffect(() => {
    if (!address && user?.address) setAddress(user.address);
  }, [address, user?.address]);

  const handleDropoffChange = (point: { lat: number; lng: number }) => {
    setDropoff(point);
  };

  const saveCurrentAddress = async () => {
    if (!dropoff || address.trim().length < 6) {
      toast.error("Completá una dirección y fijá el punto exacto en el mapa");
      return;
    }
    setSaveAddressBusy(true);
    try {
      await saveLocation({
        lat: dropoff.lat,
        lng: dropoff.lng,
        address,
        label: saveLabel,
      });
      toast.success("Dirección guardada", { description: saveLabel });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardar la dirección");
    } finally {
      setSaveAddressBusy(false);
    }
  };

  const selectSavedAddress = (id: string) => {
    const saved = addressBook?.addresses.find((item) => item.id === id);
    if (!saved) return;
    setAddress(saved.address);
    setDropoff(saved.location);
  };

  // Tiendas actuales del carrito: si cambian por completo, el avance SINPE
  // guardado ya no aplica y se descarta.
  const sinpeStoreKey = useMemo(
    () => groups.map((group) => String(group.businessId)).sort().join("|"),
    [groups],
  );
  useEffect(() => {
    if (groups.length === 0) return;
    const saved = readSinpeCartSaved();
    if (saved && saved.storeKey !== sinpeStoreKey) {
      setSinpePaid(false);
      setSinpeFiles([]);
      setSinpeWhatsappOpened({});
      try {
        window.localStorage.removeItem(SINPE_CART_KEY);
      } catch {
        // Sin almacenamiento el avance se pierde al recargar, sin frenar nada.
      }
      return;
    }
    // Si cambia el carrito, los WhatsApp de tiendas que ya no están se limpian.
    const ids = new Set(groups.map((group) => String(group.businessId)));
    setSinpeWhatsappOpened((prev) => {
      const next: Record<string, boolean> = {};
      for (const id of Object.keys(prev)) if (ids.has(id)) next[id] = true;
      return next;
    });
  }, [groups, sinpeStoreKey]);

  // Guarda el avance SINPE en el teléfono en cada cambio: pago marcado,
  // capturas ya subidas (con su enlace) y WhatsApps enviados por tienda.
  useEffect(() => {
    if (groups.length === 0) return;
    try {
      window.localStorage.setItem(
        SINPE_CART_KEY,
        JSON.stringify({
          storeKey: sinpeStoreKey,
          paid: sinpePaid,
          sent: sinpeWhatsappOpened,
          receipts: sinpeFiles
            .filter((item) => item.storageId && item.url)
            .map((item) => ({ storageId: item.storageId, url: item.url, name: item.name })),
        }),
      );
    } catch {
      // Sin almacenamiento el avance se pierde al recargar, sin frenar nada.
    }
  }, [groups.length, sinpeStoreKey, sinpePaid, sinpeWhatsappOpened, sinpeFiles]);

  const copySinpeNumber = async (raw: string | null, businessName: string, amount: number) => {
    const normalized = normalizeSinpeNumber(raw);
    if (!normalized) {
      toast.error(`${businessName} todavía no tiene un SINPE válido`);
      return;
    }
    try {
      await navigator.clipboard.writeText(normalized);
    } catch {
      // Sin portapapeles igual se muestra el número para copiarlo a mano.
    }
    toast.success("Número SINPE listo", {
      description: `Transferí ${money(amount)} a ${businessName} (${formatSinpeNumber(normalized)}) desde tu banco y marcá el paso 1.`,
    });
  };

  const sinpeReceiptLinks = sinpeFiles.map((item) => item.url).filter((url): url is string => typeof url === "string" && url.length > 0);
  const sinpeUploading = sinpeFiles.some((item) => item.uploading);

  const sinpeCartMessage = (businessName: string, amount: number) => {
    const buyer = user?.name?.trim() || "un cliente de Shop To Go";
    return [
      `Hola, soy ${buyer}.`,
      `Hice el pago por SINPE de ${businessName} por ${money(amount)} (mi carrito de Shop To Go, productos más el envío de la tienda).`,
      ...sinpeReceiptLinks.map((url) => `Captura del comprobante: ${url}`),
      sinpeReceiptLinks.length === 0
        ? "Adjunto la captura del comprobante en este chat."
        : sinpeReceiptLinks.length < sinpeFiles.length
          ? "Adjunto el resto de las capturas en este chat."
          : null,
      "Por favor confirmame la recepción del pago.",
    ].filter(Boolean).join("\n");
  };

  const openSinpeWhatsapp = (businessId: string, whatsapp: string | null, businessName: string, amount: number) => {
    const href = sinpeWhatsappHref(whatsapp, sinpeCartMessage(businessName, amount));
    if (!href) {
      toast.error(`${businessName} todavía no tiene un WhatsApp válido`);
      return;
    }
    const opened = window.open(href, "_blank", "noopener,noreferrer");
    if (!opened) window.location.href = href;
    setSinpeWhatsappOpened((prev) => ({ ...prev, [businessId]: true }));
    toast.success("Abriendo WhatsApp", {
      description: `Se abre tu WhatsApp con el mensaje para ${businessName}. Adjuntá la captura en el chat.`,
    });
  };

  // Sube una captura y le resuelve su enlace público para incluirlo en el
  // mensaje de WhatsApp. Si falla, la imagen queda local y se reintenta al
  // confirmar el pedido.
  const uploadSinpeEntry = async (preview: string, file: File) => {
    try {
      const uploadUrl = await generateReceiptUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("No pudimos subir la captura");
      const payload = (await response.json()) as { storageId: string };
      const resolved = await resolveReceiptUrl({
        storageId: payload.storageId as Id<"_storage">,
      });
      setSinpeFiles((prev) =>
        prev.map((item) =>
          item.preview === preview
            ? { ...item, file: undefined, uploading: false, storageId: payload.storageId, url: resolved.url }
            : item,
        ),
      );
    } catch (error) {
      setSinpeFiles((prev) =>
        prev.map((item) =>
          item.preview === preview ? { ...item, uploading: false } : item,
        ),
      );
      toast.error(error instanceof Error ? error.message : "No pudimos subir la captura", {
        description: "Quedó guardada en este paso y se reintenta al confirmar.",
      });
    }
  };

  const handleSinpeFiles = (files: FileList | null) => {
    if (!files) return;
    const loggedIn = Boolean(user && !user.isAnonymous);
    if (!loggedIn) {
      toast.info("Creá tu cuenta para guardar el comprobante", {
        description: "Sin cuenta las capturas se pierden al salir de la app. Entrá y volvé a subirlas: desde entonces quedan guardadas con su enlace.",
      });
    }
    const room = Math.max(0, 6 - sinpeFiles.length);
    const next: Array<{ file?: File; preview: string; name: string; uploading: boolean }> = [];
    for (const file of Array.from(files).slice(0, room)) {
      if (!file.type.startsWith("image/")) {
        toast.error("Subí imágenes de la captura (JPG, PNG o WebP)");
        continue;
      }
      if (file.size > 8 * 1024 * 1024) {
        toast.error(`"${file.name}" pesa más de 8 MB`);
        continue;
      }
      next.push({
        file: loggedIn ? file : undefined,
        preview: URL.createObjectURL(file),
        name: file.name,
        uploading: loggedIn,
      });
    }
    if (next.length > 0) {
      setSinpeFiles((prev) => [...prev, ...next].slice(0, 6));
      if (loggedIn) {
        toast.success(next.length === 1 ? "Subiendo captura" : `Subiendo ${next.length} capturas`, {
          description: "Cuando termine, el mensaje de WhatsApp ya lleva su enlace.",
        });
        for (const entry of next) {
          if (entry.file) void uploadSinpeEntry(entry.preview, entry.file);
        }
      } else {
        toast.success(next.length === 1 ? "Captura lista" : `${next.length} capturas listas`, {
          description: "Creá tu cuenta para que queden guardadas con su enlace.",
        });
      }
    }
    if (sinpeFileRef.current) sinpeFileRef.current.value = "";
  };

  const removeSinpeFile = (index: number) => {
    setSinpeFiles((prev) => {
      const target = prev[index];
      if (target && target.preview.startsWith("blob:")) URL.revokeObjectURL(target.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const sinpeStep1Done = paymentMethod === "sinpe" ? sinpePaid : true;
  const sinpeWhatsappDone =
    paymentMethod !== "sinpe" || groups.length === 0
      ? true
      : groups.every((group) => sinpeWhatsappOpened[group.businessId]);
  const sinpeStep2Done = paymentMethod === "sinpe" ? sinpeFiles.length > 0 && !sinpeUploading && sinpeWhatsappDone : true;
  const sinpeBlockedReason =
    paymentMethod !== "sinpe"
      ? null
      : !sinpePaid
        ? "Primero completá el paso 1: pagá por SINPE y marcalo como hecho."
        : sinpeFiles.length === 0
          ? "Subí al menos una captura del pago para habilitar el paso 3."
          : sinpeUploading
            ? "Esperá a que termine de subirse la captura: el mensaje lleva su enlace."
            : !sinpeWhatsappDone
              ? "Enviá el comprobante por WhatsApp a cada tienda para habilitar el paso 3."
              : null;

  // Volvemos acá después de crear la cuenta o iniciar sesión: llevamos la vista
  // directo al bloque para confirmar el pedido.
  const summaryRef = useRef<HTMLElement>(null);
  const confirmRequested = searchParams.get("confirm") === "1";
  const welcomed = useRef(false);
  useEffect(() => {
    if (!confirmRequested || welcomed.current || count === 0) return;
    welcomed.current = true;
    toast.success("Tu cuenta está lista", {
      description: "Ya podés confirmar tu pedido.",
    });
    summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [confirmRequested, count]);

  const handleCheckout = async () => {
    // Confirmar el pedido siempre pide cuenta: si no hay sesión, a registrarse.
    if (!user || user.isAnonymous) {
      if (paymentMethod === "sinpe" && sinpeFiles.length > 0) {
        toast("Creá tu cuenta antes de subir el comprobante", {
          description: "Sin cuenta las capturas se pierden al salir. Entrá y volvé a subirlas: desde entonces quedan guardadas con su enlace.",
        });
      } else {
        toast("Creá tu cuenta para confirmar el pedido", {
          description: "Entrás con tu correo y contraseña y volvés directo acá.",
        });
      }
      navigate("/auth?role=buyer&returnTo=%2Fcart");
      return;
    }

    if (needsDelivery && !dropoff) {
      toast.error("Marcá en el mapa el punto donde querés recibir el pedido");
      return;
    }
    if (paymentMethod === "sinpe" && !sinpeReady) {
      toast.error("Una tienda del carrito todavía no configuró su SINPE", {
        description: "Elegí efectivo o quitá sus productos para continuar.",
      });
      return;
    }
    if (paymentMethod === "sinpe" && !sinpePaid) {
      toast.error("Completá el paso 1", {
        description: "Pagá por SINPE desde tu banco y marcalo como hecho antes de confirmar.",
      });
      return;
    }
    if (paymentMethod === "sinpe" && sinpeFiles.length === 0) {
      toast.error("Falta la captura del pago", {
        description: "Subí al menos una captura del comprobante (paso 2) antes de confirmar.",
      });
      return;
    }
    if (paymentMethod === "sinpe" && !groups.every((group) => sinpeWhatsappOpened[group.businessId])) {
      toast.error("Falta enviar por WhatsApp", {
        description: "Enviá el comprobante por WhatsApp a cada tienda (paso 2) antes de confirmar.",
      });
      return;
    }

    // Si alguna captura quedó sin subir (cuenta recién creada o fallo de red),
    // se sube acá para que el mensaje y el pedido siempre lleven el enlace.
    if (paymentMethod === "sinpe") {
      for (const item of sinpeFiles) {
        if (item.url || !item.file) continue;
        try {
          const uploadUrl = await generateReceiptUploadUrl({});
          const response = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": item.file.type },
            body: item.file,
          });
          if (!response.ok) throw new Error("No pudimos subir la captura");
          const payload = (await response.json()) as { storageId: string };
          const resolved = await resolveReceiptUrl({
            storageId: payload.storageId as Id<"_storage">,
          });
          const preview = item.preview;
          setSinpeFiles((prev) =>
            prev.map((entry) =>
              entry.preview === preview
                ? { ...entry, file: undefined, uploading: false, storageId: payload.storageId, url: resolved.url }
                : entry,
            ),
          );
          item.storageId = payload.storageId;
          item.url = resolved.url;
          item.file = undefined;
          item.uploading = false;
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "No pudimos subir la captura", {
            description: "Revisá tu conexión e intentalo de nuevo.",
          });
          return;
        }
      }
    }

    setPlacing(true);
    try {
      requestKey.current ??=
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `ce-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await checkout({
        address: needsDelivery ? address : address || "Retiro en el local",
        location: dropoff ?? undefined,
        fulfillmentMethod: fulfillment,
        notes,
        sameCourier: needsDelivery && splitInDeliveries ? sameCourier : undefined,
        requestKey: requestKey.current,
        couponCode: cart?.couponTotal ? couponCode : undefined,
        scheduledFor: wantsSchedule ? (scheduledFor ?? undefined) : undefined,
        paymentMethod,
        sinpeReceiptStorageIds:
          paymentMethod === "sinpe"
            ? sinpeFiles
                .map((item) => item.storageId)
                .filter((id): id is string => typeof id === "string")
                .map((id) => id as Id<"_storage">)
            : undefined,
        sinpeWhatsappSentBusinessIds:
          paymentMethod === "sinpe"
            ? groups
                .filter((group) => sinpeWhatsappOpened[group.businessId])
                .map((group) => String(group.businessId))
            : undefined,
      });
      // La compra quedó registrada: el próximo intento es un pedido nuevo.
      requestKey.current = null;
      if (result.replayed) {
        toast.success("Tu pedido ya estaba confirmado", {
          description: `No se cobra dos veces. Total ${money(result.total)}.`,
        });
      } else {
        toast.success(
          result.created === 1
            ? "Pedido confirmado"
            : `${result.created} entregas confirmadas`,
          {
            description:
              paymentMethod === "sinpe"
                ? `Total ${money(result.total)}. En Pedidos adjuntá la captura por tienda, enviala por WhatsApp y confirmá para avisar al local.`
                : needsDelivery
                  ? `Total ${money(result.total)}. Seguí cada entrega en Pedidos.`
                  : `Total ${money(result.total)}. Te avisamos cuando esté listo para vos en Pedidos.`,
          },
        );
      }
      setNotes("");
      setSinpePaid(false);
      setSinpeFiles([]);
      setSinpeWhatsappOpened({});
      try {
        window.localStorage.removeItem(SINPE_CART_KEY);
      } catch {
        // Sin almacenamiento no hay nada que limpiar.
      }
      navigate("/orders");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos cerrar el pedido");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-clip">
      <PageHeader
        eyebrow="Checkout"
        title="Tu carrito"
        description="Los antojos que elegiste, agrupados por negocio. El envío se cobra una sola vez por entrega."
        action={
          count > 0 ? (
            <Button
              variant="ghost"
              className="gap-2 text-muted-foreground hover:text-destructive"
              onClick={async () => {
                await clearCart();
                toast("Carrito vaciado");
              }}
            >
              <Trash2 className="size-4" />
              Vaciar
            </Button>
          ) : null
        }
      />

      {count === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Todavía no hay antojos"
          description="Volvé al mazo y deslizá a la derecha los productos que quieras pedir."
          action={
            <Button asChild className="gap-2 bg-ember-gradient text-black">
              <Link to="/swipe">
                Descubrir antojos
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid w-full max-w-full min-w-0 gap-6 overflow-x-clip lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="w-full max-w-full min-w-0 space-y-4">
            {groups.map((group) => (
              <motion.section
                key={group.businessId}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="surface-raised w-full max-w-full min-w-0 overflow-hidden rounded-3xl"
              >
                <header className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5">
                  <DishImage
                    src={group.businessImage}
                    alt={group.businessName}
                    className="size-11 rounded-xl"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-bold">
                      {group.businessName}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 break-words text-[11px] text-muted-foreground">
                      <Star className="size-3 shrink-0 fill-accent text-accent" />
                      {group.rating.toFixed(1)}
                      <span>·</span>
                      {group.etaMinutes + (group.deliveryMinutes ?? 0)} min
                      <span>·</span>
                      {!needsDelivery
                        ? fulfillment === "dine_in"
                          ? "Sin envío · se sirve en el local"
                          : fulfillment === "reservation"
                            ? "Sin envío · con reserva de fecha y hora"
                            : "Sin envío · retirás en el local"
                        : group.deliveryFee === null
                          ? group.deliveryAvailable
                            ? "Envío al elegir tu punto"
                            : "Fuera de cobertura"
                          : group.promo
                            ? `${group.promo.label} · ${formatKm(group.distanceKm ?? 0)}`
                            : `Envío ${money(group.deliveryFee)} · ${formatKm(group.distanceKm ?? 0)}`}
                    </p>
                  </div>
                  {!group.isOpen && (
                    <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                      Cerrado
                    </span>
                  )}
                </header>

                <ul className="divide-y divide-border/50">
                  {group.items.map((item) => (
                    <li key={item.cartItemId} className="flex w-full max-w-full min-w-0 gap-3 overflow-hidden px-4 py-3.5">
                      <DishImage
                        src={item.image}
                        alt={item.name}
                        className="size-16 shrink-0 rounded-xl"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex w-full max-w-full min-w-0 items-start justify-between gap-2">
                          <p className="flex min-w-0 flex-1 flex-wrap items-center gap-2 break-words text-sm font-semibold leading-tight">
                            {item.name}
                            {!item.isAvailable && (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">Agotado</span>
                            )}
                          </p>
                          <button
                            aria-label={`Quitar ${item.name}`}
                            onClick={() =>
                              removeItem({ cartItemId: item.cartItemId })
                            }
                            className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                        {item.options.length > 0 && (
                          <p className="mt-0.5 break-words text-[11px] leading-relaxed text-muted-foreground">
                            {optionSummary(item.options)}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {money(item.price)} c/u
                        </p>
                        <div className="mt-2 flex w-full max-w-full min-w-0 flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1 rounded-full border border-border/80 p-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Restar uno"
                              className="size-7 rounded-full text-muted-foreground"
                              onClick={() =>
                                setQuantity({
                                  cartItemId: item.cartItemId,
                                  quantity: item.quantity - 1,
                                })
                              }
                            >
                              <Minus className="size-3.5" />
                            </Button>
                            <span className="w-5 text-center text-sm font-semibold">
                              {item.quantity}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Sumar uno"
                              className="size-7 rounded-full text-muted-foreground"
                              onClick={() =>
                                setQuantity({
                                  cartItemId: item.cartItemId,
                                  quantity: item.quantity + 1,
                                })
                              }
                            >
                              <Plus className="size-3.5" />
                            </Button>
                          </div>
                          <p className="shrink-0 whitespace-nowrap font-display text-sm font-bold">
                            {money(item.price * item.quantity)}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="flex w-full max-w-full flex-wrap items-center justify-between gap-2 bg-black/25 px-4 py-2.5 text-xs text-muted-foreground">
                  <span>
                    Subtotal del local
                    {group.deliveryDiscount > 0 && (
                      <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                        El local cubre {money(group.deliveryDiscount)} de envío
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 whitespace-nowrap font-semibold text-foreground">
                    {money(group.subtotal)}
                  </span>
                </div>
              </motion.section>
            ))}

            <Link
              to="/swipe"
              className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border/80 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
            >
              <Plus className="size-4" />
              Seguir descubriendo
            </Link>
          </div>

          <motion.aside
            ref={summaryRef}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="surface-raised w-full max-w-full min-w-0 overflow-x-clip rounded-3xl p-5 lg:sticky lg:top-8"
          >
            <h2 className="font-display text-lg font-bold">Confirmar pedido</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {needsDelivery
                ? "Un pedido por negocio. Cada entrega lleva hasta 3 productos y los repartidores la toman apenas el local la marca lista."
                : "Un pedido por negocio, sin envío. El local lo prepara y te avisa cuando esté listo para vos."}
            </p>

            <div className="mt-5 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Cómo lo querés recibir
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {FULFILLMENT_OPTIONS.map((option) => {
                  const Icon =
                    option.value === "delivery"
                      ? Bike
                      : option.value === "pickup"
                        ? ShoppingBag
                        : option.value === "dine_in"
                          ? UtensilsCrossed
                          : CalendarClock;
                  const active = fulfillment === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setFulfillment(option.value);
                        if (option.value === "reservation" && !scheduledLocal) {
                          setScheduledLocal(
                            new Date(Date.now() + 60 * 60 * 1000 - 6 * 60 * 60 * 1000)
                              .toISOString()
                              .slice(0, 16),
                          );
                        }
                      }}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors",
                        active
                          ? "border-accent/50 bg-accent/10"
                          : "border-border/70 hover:border-accent/30",
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-xs font-semibold">
                        <Icon className="size-3.5 text-accent" /> {option.label}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                        {option.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-border/70 bg-black/20 p-3">
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <Tag className="size-4 text-accent" /> Cupón del local
                </label>
                <div className="mt-2 flex w-full max-w-full min-w-0 gap-2">
                  <Input
                    value={couponDraft}
                    onChange={(event) => setCouponDraft(event.target.value.toUpperCase())}
                    maxLength={16}
                    placeholder="Ej.: ANTOJO10"
                    aria-label="Código de cupón del local"
                    className="h-9 min-w-0 flex-1 text-xs uppercase"
                  />
                  {couponCode ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9"
                      onClick={() => {
                        setCouponCode("");
                        setCouponDraft("");
                      }}
                    >
                      Quitar
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 border-accent/35 text-accent"
                      disabled={!couponDraft.trim()}
                      onClick={() => setCouponCode(couponDraft.trim().toUpperCase())}
                    >
                      Aplicar
                    </Button>
                  )}
                </div>
                {cart?.couponMessage && couponCode && (
                  <p className="mt-2 text-[10px] text-primary">{cart.couponMessage}</p>
                )}
                {cart?.couponTotal ? (
                  <p className="mt-2 text-[10px] font-semibold text-accent">
                    Cupón aplicado · ahorrás {money(cart.couponTotal)} en los productos del local.
                  </p>
                ) : (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    El código se valida contra los cupones activos de cada local.
                  </p>
                )}
              </div>

              {needsSchedule ? (
                <div className="rounded-2xl border border-accent/40 bg-accent/[0.06] p-3">
                  <label className="flex items-center gap-2 text-xs font-semibold">
                    <CalendarClock className="size-4 text-accent" />
                    Fecha y hora exacta de tu reserva
                  </label>
                  <div className="mt-2 space-y-1.5">
                    <Input
                      type="datetime-local"
                      value={scheduledLocal}
                      min={minScheduledLocal}
                      max={maxScheduledLocal}
                      onChange={(event) => setScheduledLocal(event.target.value)}
                      aria-label="Fecha y hora exacta de la reserva"
                      className="h-9 text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      El local confirma tu reserva para esa fecha y hora.
                    </p>
                    {scheduleError && (
                      <p className="text-[10px] text-primary">{scheduleError}</p>
                    )}
                  </div>
                </div>
              ) : needsDelivery ? (
                <div className="rounded-2xl border border-border/70 bg-black/20 p-3">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
                    <input
                      type="checkbox"
                      checked={scheduleEnabled}
                      onChange={(event) => {
                        setScheduleEnabled(event.target.checked);
                        if (event.target.checked && !scheduledLocal) {
                          setScheduledLocal(
                            new Date(Date.now() + 60 * 60 * 1000 - 6 * 60 * 60 * 1000)
                              .toISOString()
                              .slice(0, 16),
                          );
                        }
                      }}
                      className="size-4 accent-[var(--accent)]"
                    />
                    Programar para más tarde
                  </label>
                  {scheduleEnabled && (
                    <div className="mt-2 space-y-1.5">
                      <Input
                        type="datetime-local"
                        value={scheduledLocal}
                        min={minScheduledLocal}
                        max={maxScheduledLocal}
                        onChange={(event) => setScheduledLocal(event.target.value)}
                        aria-label="Fecha y hora del pedido programado"
                        className="h-9 text-xs"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Hasta {SCHEDULE_RULES.maxDaysAhead} días antes. El local lo prepara cerca de la hora elegida.
                      </p>
                      {scheduleError && (
                        <p className="text-[10px] text-primary">{scheduleError}</p>
                      )}
                    </div>
                  )}
                </div>
              ) : null}

              {needsDelivery ? (
              <>
              {(addressBook?.addresses.length ?? 0) > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Usar una dirección guardada</label>
                  <Select onValueChange={selectSavedAddress}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Seleccioná Casa, Trabajo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {addressBook?.addresses.map((saved) => (
                        <SelectItem key={saved.id} value={saved.id}>
                          {saved.label} · {saved.address}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <LocationField
                value={dropoff}
                address={address}
                onChange={handleDropoffChange}
                onAddressChange={setAddress}
                label="Punto de entrega"
                mapHeight="h-44"
                hint={
                  dropoff
                    ? `El envío se calcula desde cada local hasta este punto (máx. 12 km).`
                    : "Activá el permiso de ubicación o marcá tu punto en el mapa: sin eso no podemos calcular el envío."
                }
              />
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-black/20 p-2.5">
                <Input
                  value={saveLabel}
                  onChange={(event) => setSaveLabel(event.target.value)}
                  maxLength={40}
                  placeholder="Etiqueta: Casa, Trabajo"
                  aria-label="Etiqueta de la dirección guardada"
                  className="h-8 min-w-32 flex-1 text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 border-border/80 text-[11px]"
                  disabled={!dropoff || saveAddressBusy}
                  onClick={() => void saveCurrentAddress()}
                >
                  {saveAddressBusy ? <Loader2 className="size-3.5 animate-spin" /> : <BookmarkPlus className="size-3.5" />}
                  Guardar dirección
                </Button>
              </div>
              {(addressBook?.addresses.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {addressBook?.addresses.map((saved) => (
                    <button
                      key={saved.id}
                      type="button"
                      onClick={() => void removeSavedAddress({ id: saved.id })}
                      className="rounded-full border border-border/70 px-2 py-1 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-primary"
                      title={`Quitar dirección ${saved.label}`}
                    >
                      Quitar {saved.label} ×
                    </button>
                  ))}
                </div>
              )}
              </>
              ) : (
                <div className="rounded-2xl border border-border/70 bg-black/20 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold">
                    <Store className="size-4 text-accent" />
                    {fulfillment === "dine_in"
                      ? "Te lo servimos en el local"
                      : fulfillment === "reservation"
                        ? "Tu lugar queda reservado"
                        : "Pasás a retirarlo por el local"}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {fulfillment === "dine_in"
                      ? "Presentá el código de tu pedido al llegar. Sin envío ni punto de entrega."
                      : fulfillment === "reservation"
                        ? "Presentá el código de tu pedido en la fecha y hora elegida. Sin envío ni punto de entrega."
                        : "Te avisamos cuando esté listo para retirar. Sin envío ni punto de entrega."}
                  </p>
                </div>
              )}
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Notas para el local o el repartidor (timbre, sin cebolla...)"
                className="min-h-20 resize-none"
              />
            </div>

            <div className="mt-5 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Forma de pago
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={paymentMethod === "cash"}
                  onClick={() => setPaymentMethod("cash")}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors",
                    paymentMethod === "cash"
                      ? "border-accent/50 bg-accent/10"
                      : "border-border/70 hover:border-accent/30",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold">
                    <Banknote className="size-3.5 text-accent" /> Efectivo al entregar
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                    Le pagás el total al repartidor cuando recibís el pedido.
                  </span>
                </button>
                <button
                  type="button"
                  aria-pressed={paymentMethod === "sinpe"}
                  disabled={!sinpeReady}
                  onClick={() => setPaymentMethod("sinpe")}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    paymentMethod === "sinpe"
                      ? "border-accent/50 bg-accent/10"
                      : "border-border/70 hover:border-accent/30",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold">
                    <Smartphone className="size-3.5 text-accent" /> SINPE Móvil
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                    Transferís a cada tienda sus productos más el envío.
                  </span>
                </button>
              </div>

              {!sinpeReady && (() => {
                const pending = groups
                  .filter((group) => !group.sinpeReady)
                  .map((group) => group.businessName);
                return (
                  <p className="rounded-xl border border-primary/25 bg-primary/[0.06] p-2.5 text-[10px] leading-relaxed text-primary">
                    {pending.join(", ")}{" "}
                    {pending.length === 1
                      ? "todavía no configuró SINPE y WhatsApp para cobrar."
                      : "todavía no configuraron SINPE y WhatsApp para cobrar."}{" "}
                    Podés pagar en efectivo o quitar sus productos.
                  </p>
                );
              })()}

              {paymentMethod === "sinpe" && (
                <div className="w-full max-w-full min-w-0 space-y-2.5 overflow-x-clip rounded-xl border border-accent/30 bg-accent/[0.05] p-3">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                    <Smartphone className="size-3.5" /> Pago por SINPE en 3 pasos y en orden
                  </p>
                  <p className="text-[10px] leading-relaxed text-muted-foreground">
                    Sin completar el paso 1 y el 2 no se habilita el paso 3. La tienda recibe el pedido cuando lo confirmás en el paso 3 y luego en Pedidos.
                    {needsDelivery ? "" : " Sin envío: transferís sólo tus productos."}
                  </p>
                  <ul className="space-y-1.5">
                    {groups.map((group) => (
                      <li
                        key={group.businessId}
                        className="w-full max-w-full min-w-0 overflow-hidden rounded-lg bg-black/20 px-2.5 py-2 text-[10px]"
                      >
                        <div className="flex w-full max-w-full min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                          <span className="min-w-0 flex-1 break-words font-semibold">
                            {group.businessName}
                          </span>
                          <span className="shrink-0 whitespace-nowrap font-display text-sm font-bold text-accent">
                            {money(group.paymentAmount)}
                          </span>
                        </div>
                        <div className="mt-1.5 flex w-full max-w-full min-w-0 flex-wrap items-center gap-1.5">
                          <span className="min-w-0 flex-1 break-words text-muted-foreground">
                            SINPE {group.sinpePhone ? formatSinpeNumber(group.sinpePhone) : "—"} · WhatsApp{" "}
                            {group.whatsappPhone ? formatSinpeNumber(group.whatsappPhone) : "—"}
                          </span>
                          <button
                            type="button"
                            onClick={() => void copySinpeNumber(group.sinpePhone, group.businessName, group.paymentAmount)}
                            className="flex shrink-0 items-center gap-1 rounded-full border border-accent/40 px-2 py-1 text-[10px] font-semibold text-accent transition-colors hover:bg-accent/10"
                          >
                            <Copy className="size-3" /> Copiar SINPE
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <Button
                    type="button"
                    aria-pressed={sinpePaid}
                    onClick={() => setSinpePaid((v) => !v)}
                    className={cn(
                      "h-10 w-full gap-2",
                      sinpePaid ? "bg-accent text-accent-foreground hover:opacity-95" : "bg-ember-gradient text-black hover:opacity-95",
                    )}
                  >
                    {sinpePaid ? <Check className="size-4" /> : <Smartphone className="size-4" />}
                    1 · Realizar pago por SINPE{sinpePaid ? " · hecho" : ""}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setSinpePaid((v) => !v)}
                    aria-pressed={sinpePaid}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-semibold transition-colors",
                      sinpePaid
                        ? "border-accent/50 bg-accent/10 text-accent"
                        : "border-border/70 text-muted-foreground hover:border-accent/30",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded-md border",
                        sinpePaid ? "border-accent bg-accent text-black" : "border-border/70",
                      )}
                    >
                      {sinpePaid && <Check className="size-3" />}
                    </span>
                    Ya hice las transferencias desde mi banco
                  </button>
                  {!sinpePaid && (
                    <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
                      Transferí a cada tienda su monto exacto y marcá el paso 1 para habilitar el paso 2.
                    </p>
                  )}

                  <button
                    type="button"
                    disabled={!sinpePaid}
                    onClick={() => sinpeFileRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-accent/40 bg-black/20 py-3 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ImagePlus className="size-4" />
                    2 · Subir comprobante del pago por SINPE
                  </button>
                  <input
                    ref={sinpeFileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => handleSinpeFiles(event.target.files)}
                  />
                  {sinpeFiles.length > 0 && (
                    <div className="flex w-full max-w-full min-w-0 flex-wrap gap-2 overflow-x-clip">
                      {sinpeFiles.map((item, index) => (
                        <div key={`${item.storageId ?? item.preview}-${index}`} className="relative shrink-0">
                          <img
                            src={item.url ?? item.preview}
                            alt={`Captura ${index + 1} del pago SINPE`}
                            className="size-16 rounded-lg border border-border/60 object-cover"
                          />
                          {item.uploading && (
                            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                              <Loader2 className="size-4 animate-spin text-white" />
                            </span>
                          )}
                          <button
                            type="button"
                            aria-label={`Quitar captura ${index + 1}`}
                            onClick={() => removeSinpeFile(index)}
                            className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {groups.map((group) => {
                      const sent = Boolean(sinpeWhatsappOpened[group.businessId]);
                      return (
                        <Button
                          key={group.businessId}
                          type="button"
                          disabled={!sinpePaid || sinpeFiles.length === 0 || sinpeUploading}
                          onClick={() => openSinpeWhatsapp(group.businessId, group.whatsappPhone, group.businessName, group.paymentAmount)}
                          className={cn(
                            "h-10 w-full gap-2",
                            sent ? "bg-accent text-accent-foreground hover:opacity-95" : "bg-[#25d366] text-black hover:bg-[#1ebe5b]",
                          )}
                        >
                          {sent ? <Check className="size-4" /> : <MessageCircle className="size-4" />}
                          2 · Enviar comprobante por WhatsApp · {group.businessName}{sent ? " · enviado" : ""}
                        </Button>
                      );
                    })}
                  </div>
                  <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
                    {sinpeUploading
                      ? "Subiendo captura... esperá a que termine para que el mensaje de WhatsApp lleve su enlace."
                      : sinpeFiles.length === 0
                        ? "Subí al menos una captura para habilitar los envíos por WhatsApp."
                        : !sinpeWhatsappDone
                          ? "Enviá el comprobante por WhatsApp a cada tienda para habilitar el paso 3."
                          : "Comprobante listo y enviado. Ya podés usar el paso 3 para confirmar."}
                    {" "}La captura y los envíos viajan con tu pedido: en Pedidos ya aparecen adjuntos por tienda.
                  </p>
                </div>
              )}
            </div>

            {(splitInDeliveries || multiStore) && needsDelivery && (
              <div className="mt-5 rounded-2xl border border-border/70 bg-black/20 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
                  <PackageCheck className="size-3.5" />
                  {deliveries} {deliveries === 1 ? "entrega" : "entregas"} · hasta 3
                  productos cada una
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  Cada entrega paga un solo envío.
                  {multiStore
                    ? " Si retira en varias tiendas, ese envío suma un recargo por la tienda adicional y cada local cubre la parte que le corresponde si tiene promoción activa."
                    : " Los locales preparan en orden y podés seguir cada entrega por separado."}
                </p>

                <ul className="mt-3 space-y-1.5">
                  {trips.map((trip) => (
                    <li
                      key={trip.index}
                      className="flex w-full max-w-full min-w-0 items-start justify-between gap-2 overflow-hidden rounded-xl border border-border/60 bg-black/20 px-2.5 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold">
                          Entrega {trip.index} · {trip.stops.length}{" "}
                          {trip.stops.length === 1 ? "tienda" : "tiendas"}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {trip.stops.map((stop) => stop.businessName).join(" + ")}
                        </p>
                        {trip.stops.length > 1 && (
                          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                            {trip.stops
                              .map(
                                (stop) =>
                                  `${stop.businessName} ${money(stop.fee)}`,
                              )
                              .join(" · ")}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] font-semibold">
                          {money(trip.clientFee)}
                        </p>
                        {trip.stopFee > 0 && (
                          <p className="text-[10px] text-accent">
                            recargo {money(trip.stopFee)}
                          </p>
                        )}
                        {trip.discount > 0 && (
                          <p className="text-[10px] text-accent">
                            local cubre {money(trip.discount)}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                {splitInDeliveries && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {[
                      {
                        value: true,
                        label: "El mismo repartidor",
                        hint: "Hace todas las entregas de esta compra",
                      },
                      {
                        value: false,
                        label: "Repartidores de turno",
                        hint: "Las toma quien esté disponible",
                      },
                    ].map((option) => (
                      <button
                        key={String(option.value)}
                        type="button"
                        onClick={() => setSameCourier(option.value)}
                        className={cn(
                          "rounded-xl border px-3 py-2 text-left transition-colors",
                          sameCourier === option.value
                            ? "border-accent/50 bg-accent/10"
                            : "border-border/70 hover:border-accent/30",
                        )}
                      >
                        <span className="block text-xs font-semibold">
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                          {option.hint}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 space-y-2 border-t border-border/60 pt-4 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{money(cart?.subtotal ?? 0)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{needsDelivery ? `Envíos (${deliveries || groups.length})` : "Envío"}</span>
                <span className="flex items-center gap-2">
                  {(cart?.deliverySaved ?? 0) > 0 && (
                    <span className="text-[11px] text-accent">
                      promo −{money(cart?.deliverySaved ?? 0)}
                    </span>
                  )}
                  {money(cart?.deliveryTotal ?? 0)}
                </span>
              </div>
              {(cart?.couponTotal ?? 0) > 0 && (
                <div className="flex justify-between text-accent">
                  <span>Cupón del local</span>
                  <span>−{money(cart?.couponTotal ?? 0)}</span>
                </div>
              )}
              <div className="flex items-end justify-between pt-2">
                <span className="font-semibold">
                  {paymentMethod === "sinpe"
                    ? "Total a transferir por SINPE"
                    : "Efectivo exacto a entregar"}
                </span>
                <span className="font-display text-2xl font-extrabold">
                  {money(cart?.total ?? 0)}
                </span>
              </div>
              <p className="text-right text-[10px] leading-relaxed text-muted-foreground">
                {paymentMethod === "sinpe"
                  ? "Es la suma de lo que le transferís a cada tienda: tus productos más la parte del envío de esa tienda, después de descuentos."
                  : "Total de productos y envíos tras descuentos. El repartidor registrará este monto al entregar; si no coincide, la diferencia queda anotada."}
              </p>
            </div>

            {groups.some((group) => group.items.some((item) => !item.isAvailable)) && (
              <p className="mt-3 rounded-xl border border-primary/30 bg-primary/10 p-2.5 text-[11px] leading-relaxed text-primary">
                Hay productos agotados en tu carrito. Quitalos para poder continuar.
              </p>
            )}

            {hasClosed && (
              <p className="mt-3 rounded-xl border border-primary/30 bg-primary/10 p-2.5 text-[11px] leading-relaxed text-primary">
                Hay un negocio cerrado en tu carrito. Quitá sus productos para
                poder continuar.
              </p>
            )}

            {!allCovered && (
              <p className="mt-3 rounded-xl border border-primary/30 bg-primary/10 p-2.5 text-[11px] leading-relaxed text-primary">
                Hay un local que no reparte hasta tu punto. Probá marcar otro punto
                más cercano o quitá sus productos.
              </p>
            )}

            <Button
              className="mt-5 w-full gap-2 bg-ember-gradient text-black hover:opacity-95"
              disabled={placing || !canConfirm || Boolean(scheduleError) || hasClosed || (paymentMethod === "sinpe" && !sinpeReady) || Boolean(sinpeBlockedReason) || groups.some((group) => group.items.some((item) => !item.isAvailable))}
              onClick={handleCheckout}
            >
              {placing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Confirmando...
                </>
              ) : (
                <>
                  {paymentMethod === "sinpe"
                    ? "3 · Confirmar pedido"
                    : "Confirmar pedido"}
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <Store className="size-3.5" />
              {groups.length} {groups.length === 1 ? "negocio" : "negocios"} ·{" "}
              {needsDelivery ? (
                <>
                  {deliveries || groups.length}{" "}
                  {deliveries === 1 ? "entrega" : "entregas"} ·{" "}
                </>
              ) : (
                <>{fulfillment === "reservation" ? "reserva" : fulfillment === "dine_in" ? "consumo en local" : "retiro"} · </>
              )}
              {paymentMethod === "sinpe" ? "Pago por SINPE" : needsDelivery ? "Pago en la entrega" : "Pago en el local"}
            </p>


          </motion.aside>
        </div>
      )}
    </div>
  );
}
