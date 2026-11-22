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
import { useAuth } from "@/hooks/use-auth";
import { formatKm } from "@/lib/delivery";
import { money } from "@/lib/format";
import { optionSummary } from "@/lib/productOptions";
import { formatSinpeNumber } from "@/lib/sinpe";
import { costaRicaLocalToTimestamp, SCHEDULE_RULES } from "@/lib/scheduling";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Banknote,
  BookmarkPlus,
  Loader2,
  Minus,
  MessageCircle,
  PackageCheck,
  Plus,
  ShoppingCart,
  Smartphone,
  Star,
  Store,
  Tag,
  Trash2,
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
  const cart = useQuery(api.cart.myCart, { couponCode: couponCode || undefined });
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
  const canConfirm = Boolean(dropoff) && address.trim().length >= 6 && allCovered;
  const scheduledFor = scheduleEnabled
    ? costaRicaLocalToTimestamp(scheduledLocal)
    : null;
  const scheduleError = scheduleEnabled && !scheduledFor
    ? "Elegí una fecha y hora de entrega"
    : scheduleEnabled && scheduledFor
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
      toast("Creá tu cuenta para confirmar el pedido", {
        description: "Entrás con tu correo y contraseña y volvés directo acá.",
      });
      navigate("/auth?role=buyer&returnTo=%2Fcart");
      return;
    }

    if (!dropoff) {
      toast.error("Marcá en el mapa el punto donde querés recibir el pedido");
      return;
    }
    if (paymentMethod === "sinpe" && !sinpeReady) {
      toast.error("Una tienda del carrito todavía no configuró su SINPE", {
        description: "Elegí efectivo o quitá sus productos para continuar.",
      });
      return;
    }

    setPlacing(true);
    try {
      requestKey.current ??=
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `ce-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await checkout({
        address,
        location: dropoff,
        notes,
        sameCourier: splitInDeliveries ? sameCourier : undefined,
        requestKey: requestKey.current,
        couponCode: cart?.couponTotal ? couponCode : undefined,
        scheduledFor: scheduleEnabled ? (scheduledFor ?? undefined) : undefined,
        paymentMethod,
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
                ? `Total ${money(result.total)}. En Pedidos pagá cada SINPE, enviá el comprobante por WhatsApp y confirmá el pedido para avisar a la tienda.`
                : `Total ${money(result.total)}. Seguí cada entrega en Pedidos.`,
          },
        );
      }
      setNotes("");
      navigate("/orders");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos cerrar el pedido");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div>
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
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="space-y-4">
            {groups.map((group) => (
              <motion.section
                key={group.businessId}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="surface-raised overflow-hidden rounded-3xl"
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
                    <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Star className="size-3 fill-accent text-accent" />
                      {group.rating.toFixed(1)}
                      <span>·</span>
                      {group.etaMinutes + (group.deliveryMinutes ?? 0)} min
                      <span>·</span>
                      {group.deliveryFee === null
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
                    <li key={item.cartItemId} className="flex gap-3 px-4 py-3.5">
                      <DishImage
                        src={item.image}
                        alt={item.name}
                        className="size-16 shrink-0 rounded-xl"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="flex items-center gap-2 text-sm font-semibold leading-tight">
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
                            className="text-muted-foreground transition-colors hover:text-primary"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                        {item.options.length > 0 && (
                          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                            {optionSummary(item.options)}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {money(item.price)} c/u
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-3">
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
                          <p className="font-display text-sm font-bold">
                            {money(item.price * item.quantity)}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="flex items-center justify-between bg-black/25 px-4 py-2.5 text-xs text-muted-foreground">
                  <span>
                    Subtotal del local
                    {group.deliveryDiscount > 0 && (
                      <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                        El local cubre {money(group.deliveryDiscount)} de envío
                      </span>
                    )}
                  </span>
                  <span className="font-semibold text-foreground">
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
            className="surface-raised rounded-3xl p-5 lg:sticky lg:top-8"
          >
            <h2 className="font-display text-lg font-bold">Confirmar pedido</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Un pedido por negocio. Cada entrega lleva hasta 3 productos y los
              repartidores la toman apenas el local la marca lista.
            </p>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-border/70 bg-black/20 p-3">
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <Tag className="size-4 text-accent" /> Cupón del local
                </label>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={couponDraft}
                    onChange={(event) => setCouponDraft(event.target.value.toUpperCase())}
                    maxLength={16}
                    placeholder="Ej.: ANTOJO10"
                    aria-label="Código de cupón del local"
                    className="h-9 text-xs uppercase"
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
                <div className="rounded-xl border border-accent/30 bg-accent/[0.05] p-3">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                    <Smartphone className="size-3.5" /> Transferí directo a cada tienda
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {groups.map((group) => (
                      <li
                        key={group.businessId}
                        className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 rounded-lg bg-black/20 px-2.5 py-1.5 text-[10px]"
                      >
                        <span className="max-w-full truncate font-semibold">
                          {group.businessName}
                        </span>
                        <span className="text-muted-foreground">
                          SINPE{" "}
                          {group.sinpePhone
                            ? formatSinpeNumber(group.sinpePhone)
                            : "—"}{" "}
                          · WhatsApp{" "}
                          {group.whatsappPhone
                            ? formatSinpeNumber(group.whatsappPhone)
                            : "—"}
                        </span>
                        <span className="font-display text-sm font-bold text-accent">
                          {money(group.paymentAmount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
                    <MessageCircle className="mt-0.5 size-3 shrink-0 text-accent" />
                    Al confirmar, el pedido queda en espera y en Pedidos completás 3 pasos en orden: 1) pagar por SINPE, 2) enviar el comprobante por WhatsApp a la tienda y 3) confirmar el pedido. La tienda lo recibe cuando lo confirmás.
                  </p>
                </div>
              )}
            </div>

            {(splitInDeliveries || multiStore) && (
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
                      className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-black/20 px-2.5 py-2"
                    >
                      <div className="min-w-0">
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
                <span>Envíos ({deliveries || groups.length})</span>
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
              disabled={placing || !canConfirm || Boolean(scheduleError) || hasClosed || (paymentMethod === "sinpe" && !sinpeReady) || groups.some((group) => group.items.some((item) => !item.isAvailable))}
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
                    ? "Confirmar pedido y pagar por SINPE"
                    : "Confirmar pedido"}
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <Store className="size-3.5" />
              {groups.length} {groups.length === 1 ? "negocio" : "negocios"} ·{" "}
              {deliveries || groups.length}{" "}
              {deliveries === 1 ? "entrega" : "entregas"} ·{" "}
              {paymentMethod === "sinpe" ? "Pago por SINPE" : "Pago en la entrega"}
            </p>


          </motion.aside>
        </div>
      )}
    </div>
  );
}
