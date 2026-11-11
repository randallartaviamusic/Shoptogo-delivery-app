import { EmptyState } from "@/components/AppShell";
import { CourierLocationReporter, DeliveryTrackingMap } from "@/components/DeliveryTracking";
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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { clockTime, money, relativeTime, ROLE_HOME } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Bike,
  CheckCircle2,
  History,
  Loader2,
  MapPin,
  Navigation,
  PackageCheck,
  Store,
  Wallet,
} from "lucide-react";
import { Suspense, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { toast } from "sonner";

const TABS = [
  { key: "available", label: "Disponibles", to: "/courier" },
  { key: "active", label: "En curso", to: "/courier?tab=active" },
  { key: "history", label: "Historial", to: "/courier?tab=history" },
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
  const [params] = useSearchParams();
  const tab = params.get("tab") ?? "available";

  const board = useQuery(api.orders.courierBoard);
  const accept = useMutation(api.orders.courierAccept);
  const updateStatus = useMutation(api.orders.courierUpdateStatus);
  const renounce = useMutation(api.orders.courierRenounceRemaining);
  const [busy, setBusy] = useState<string | null>(null);
  // Pedido con varias entregas que el repartidor está por aceptar.
  const [confirming, setConfirming] = useState<OrderView | null>(null);
  // Pedido del que quiere bajarse después de la primera entrega.
  const [renouncing, setRenouncing] = useState<OrderView | null>(null);

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
  const busyOrder = (board?.busyOrder ?? null) as unknown as OrderView | null;

  const handleAccept = async (order: OrderView) => {
    setBusy(order._id);
    try {
      await accept({ orderId: order._id as Id<"orders"> });
      toast.success("Pedido tomado", {
        description: takesSeveralDeliveries(order)
          ? `Son ${order.remainingDeliveries + 1} entregas de esta compra: retirá cada una cuando el local la marque lista. Total en envíos ${money(order.groupEarnings)}.`
          : `Retirá en ${order.businessName}. Ganás ${money(order.deliveryFee)}.`,
      });
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

  const handleAdvance = async (order: OrderView, status: "picked_up" | "delivered") => {
    setBusy(order._id);
    try {
      await updateStatus({ orderId: order._id as Id<"orders">, status });
      toast.success(
        status === "picked_up" ? "Pedido recogido" : "¡Pedido entregado!",
        {
          description:
            status === "picked_up"
              ? "Ahora andá a la dirección de entrega."
              : `Sumaste ${money(order.deliveryFee)} a tus ganancias.`,
        },
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos actualizar");
    } finally {
      setBusy(null);
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

      {busyOrder && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-accent/[0.07] px-4 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Bike className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Tenés una entrega en curso</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {busyOrder.code} · {busyOrder.businessName}. Cuando la termines vas a
              poder tomar otro pedido.
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
          {!canAccept && available.length > 0 && (
            <p className="rounded-2xl border border-border/70 bg-secondary/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              Mientras tengas una entrega en curso no podés tomar otra: los
              pedidos quedan visibles, pero se habilitan cuando marques tu
              entrega como entregada.
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
            available.map((order) => (
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
                  </div>
                  <span className="rounded-full bg-accent px-3 py-1 font-display text-sm font-extrabold text-accent-foreground">
                    {money(order.deliveryFee)}
                  </span>
                </div>

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
                      Cobrás
                    </p>
                    <p className="font-display text-lg font-extrabold text-accent">
                      {money(order.deliveryFee)}
                    </p>
                  </div>
                  <Button
                    className="gap-2 bg-ember-gradient text-black"
                    disabled={busy === order._id || !canAccept}
                    title={
                      canAccept
                        ? undefined
                        : "Terminá la entrega que tenés en curso"
                    }
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
                      : "Tomar pedido"}
                  </Button>
                </div>
              </div>
            ))
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
                      productos · {money(order.total)} a cobrar
                      {order.batchCount && order.batchCount > 1
                        ? ` · Entrega ${order.batchIndex} de ${order.batchCount}`
                        : ""}
                    </p>
                  </div>
                  <StatusPill status={order.status} />
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/70 bg-black/20 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-accent">
                      Retiro
                    </p>
                    <p className="mt-1 text-sm font-medium">{order.businessName}</p>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {order.businessAddress}
                    </p>
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
                    />
                  </div>
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
                      onClick={() => handleAdvance(order, "picked_up")}
                    >
                      <PackageCheck className="size-4" />
                      Marcar recogido
                    </Button>
                  ) : (
                    <Button
                      className="gap-2 bg-ember-gradient text-black"
                      disabled={busy === order._id}
                      onClick={() => handleAdvance(order, "delivered")}
                    >
                      <CheckCircle2 className="size-4" />
                      Marcar entregado
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
                    </p>
                  </div>
                  <p className="font-display text-sm font-bold text-accent">
                    +{money(order.deliveryFee)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

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
