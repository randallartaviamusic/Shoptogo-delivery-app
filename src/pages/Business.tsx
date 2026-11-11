import { EmptyState } from "@/components/AppShell";
import { CashIssueNote } from "@/components/CashIssueNote";
import { DeliveryTrackingMap } from "@/components/DeliveryTracking";
import { SubscriptionReminder } from "@/components/SubscriptionReminder";
import { DishImage } from "@/components/DishImage";
import { LocationField } from "@/components/LocationField";
import { PromoBadge } from "@/components/PromoBadge";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { CashIssueKind, OrderStatus } from "@/convex/schema";
import { useAuth } from "@/hooks/use-auth";
import { CASH_ISSUE_LABELS } from "@/lib/cash";
import { getDepartment } from "@/lib/departments";
import { clockTime, money, ORDER_STATUS, relativeTime, ROLE_HOME } from "@/lib/format";
import { ASSIGNMENT_RULES } from "@/lib/delivery";
import { PROMO_OPTIONS, promoLabel } from "@/lib/promo";
import type { DeliveryPromo } from "@/lib/promo";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ChefHat,
  ClipboardList,
  DollarSign,
  Loader2,
  MapPin,
  PackageCheck,
  Pencil,
  Plus,
  Settings2,
  Store,
  TicketPercent,
  Timer,
  Trash2,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { toast } from "sonner";

const TABS = [
  { key: "overview", label: "Panel", to: "/business" },
  { key: "orders", label: "Pedidos", to: "/business?tab=orders" },
  { key: "menu", label: "Productos", to: "/business?tab=menu" },
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
          "mt-2 font-display text-2xl font-extrabold",
          accent === "ember" ? "text-accent" : accent === "chili" ? "text-primary" : "",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const ACTION_BUTTONS: Record<
  OrderStatus,
  { label: string; status: "accepted" | "preparing" | "ready"; icon: typeof ChefHat }[]
> = {
  pending: [{ label: "Aceptar pedido", status: "accepted", icon: ChefHat }],
  accepted: [{ label: "Empezar a cocinar", status: "preparing", icon: ChefHat }],
  preparing: [{ label: "Marcar listo", status: "ready", icon: ClipboardList }],
  ready: [],
  picked_up: [],
  delivered: [],
  cancelled: [],
};

export default function BusinessPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const tab = params.get("tab") ?? "overview";

  const mine = useQuery(api.businesses.mine);
  const board = useQuery(api.orders.businessBoard);
  const updateBusiness = useMutation(api.businesses.update);
  const updateStatus = useMutation(api.orders.businessUpdateStatus);
  const addProduct = useMutation(api.businesses.addProduct);
  const updateProduct = useMutation(api.businesses.updateProduct);
  const removeProduct = useMutation(api.businesses.removeProduct);
  const confirmCash = useMutation(api.orders.businessConfirmCash);
  const reportIssue = useMutation(api.orders.reportCashIssue);
  const resolveIssue = useMutation(api.orders.resolveCashIssue);

  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<OrderView | null>(null);
  const [now, setNow] = useState(Date.now());

  // Los temporizadores de espera y las demoras se actualizan en vivo.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  // Efectivo que el negocio confirma haber recibido del repartidor.
  const [cashTarget, setCashTarget] = useState<OrderView | null>(null);
  const [cashAmount, setCashAmount] = useState("");
  const [cashNote, setCashNote] = useState("");
  const [savingCash, setSavingCash] = useState(false);
  // Reclamo o faltante que reporta el negocio.
  const [issueTarget, setIssueTarget] = useState<OrderView | null>(null);
  const [issueKind, setIssueKind] = useState<CashIssueKind>("incomplete");
  const [issueAmount, setIssueAmount] = useState("");
  const [issueNote, setIssueNote] = useState("");
  const [savingIssue, setSavingIssue] = useState(false);
  const [productDialog, setProductDialog] = useState(false);
  const [settingsDialog, setSettingsDialog] = useState(false);
  const [editing, setEditing] = useState<Doc<"products"> | null>(null);
  const [deleting, setDeleting] = useState<Doc<"products"> | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    price: "",
    category: "Hamburguesas",
    image: "",
    attributes: {} as Record<string, string>,
  });
  const [settingsForm, setSettingsForm] = useState({
    name: "",
    tagline: "",
    address: "",
    location: null as { lat: number; lng: number } | null,
    etaMinutes: "",
    image: "",
    deliveryPromo: null as DeliveryPromo,
  });

  if (user && user.role !== "business") {
    return (
      <Navigate
        to={user.role ? (ROLE_HOME[user.role] ?? "/swipe") : "/onboarding"}
        replace
      />
    );
  }

  if (mine === undefined || board === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!mine?.business) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="surface-raised rounded-3xl p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-ember-gradient text-black">
              <Store className="size-6" />
            </div>
            <div>
              <p className="font-display text-lg font-bold">Todavía no cargaste tu local</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Entraste con {user?.email}. Completá los datos de tu negocio para
                publicar tu catálogo y recibir pedidos.
              </p>
            </div>
          </div>

          <Button asChild className="mt-5 h-11 w-full gap-2 bg-ember-gradient text-black">
            <Link to="/onboarding?role=business">
              Cargar mi local
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const business = mine.business;
  const products = mine.products;
  const departmentInfo = getDepartment(business.department);
  const productCategories = departmentInfo.subcategories;
  const stats = board?.stats;
  const orders = (board?.orders ?? []) as unknown as OrderView[];

  const handleStatus = async (
    orderId: string,
    status: "accepted" | "preparing" | "ready" | "cancelled",
    reason?: string,
  ) => {
    setBusyOrder(orderId);
    try {
      await updateStatus({
        orderId: orderId as Id<"orders">,
        status,
        reason,
      });
      toast.success(
        status === "cancelled"
          ? "Pedido cancelado"
          : status === "ready"
            ? "Pedido listo para retirar"
            : "Pedido actualizado",
        status === "cancelled"
          ? {
              description:
                "El comprador ve el motivo. El pedido y su historial no se borran.",
            }
          : undefined,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos actualizar");
    } finally {
      setBusyOrder(null);
    }
  };

  const openNewProduct = () => {
    setEditing(null);
    setProductForm({
      name: "",
      description: "",
      price: "",
      category: departmentInfo.subcategories[0] ?? business.category,
      image: "",
      attributes: {},
    });
    setProductDialog(true);
  };

  const openEditProduct = (product: Doc<"products">) => {
    setEditing(product);
    setProductForm({
      name: product.name,
      description: product.description,
      price: String(product.price),
      category: product.category,
      image: product.image,
      attributes: Object.fromEntries(
        (product.attributes ?? []).map((attribute) => [
          attribute.key,
          attribute.value,
        ]),
      ),
    });
    setProductDialog(true);
  };

  const handleProductSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingProduct(true);
    const payload = {
      name: productForm.name,
      description: productForm.description,
      price: Number(productForm.price),
      category: productForm.category,
      image: productForm.image,
      attributes: Object.entries(productForm.attributes)
        .filter(([, value]) => value.length > 0)
        .map(([key, value]) => ({ key, value })),
    };
    try {
      if (editing) {
        await updateProduct({ productId: editing._id, ...payload });
        toast.success("Producto actualizado");
      } else {
        await addProduct(payload);
        toast.success("Producto publicado en el mazo");
      }
      setProductDialog(false);
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardar el producto");
    } finally {
      setSavingProduct(false);
    }
  };

  const openSettings = () => {
    setSettingsForm({
      name: business.name,
      tagline: business.tagline,
      address: business.address,
      location: business.location ?? null,
      etaMinutes: String(business.etaMinutes),
      image: business.image,
      deliveryPromo: business.deliveryPromo ?? null,
    });
    setSettingsDialog(true);
  };

  const handleSettingsSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settingsForm.location) {
      toast.error("Marcá en el mapa la ubicación exacta de tu local");
      return;
    }
    if (settingsForm.address.trim().length < 5) {
      toast.error("Escribí la dirección del local");
      return;
    }
    try {
      await updateBusiness({
        name: settingsForm.name,
        tagline: settingsForm.tagline,
        address: settingsForm.address,
        location: settingsForm.location ?? undefined,
        etaMinutes: Number(settingsForm.etaMinutes) || 20,
        image: settingsForm.image,
        deliveryPromo: settingsForm.deliveryPromo,
      });
      toast.success("Local actualizado");
      setSettingsDialog(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardar");
    }
  };

  const openCash = (order: OrderView) => {
    setCashTarget(order);
    setCashAmount(String(order.businessDue));
    setCashNote("");
  };

  const cashDifference = cashTarget
    ? Math.round(Number(cashAmount) || 0) - cashTarget.businessDue
    : 0;

  const handleConfirmCash = async () => {
    if (!cashTarget) return;
    setSavingCash(true);
    try {
      const amount = Math.round(Number(cashAmount) || 0);
      await confirmCash({
        orderId: cashTarget._id as Id<"orders">,
        amount,
        note: cashNote.trim() || undefined,
      });
      toast.success("Efectivo confirmado", {
        description: `${money(amount)} registrados para el pedido ${cashTarget.code}.`,
      });
      setCashTarget(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos confirmar el efectivo",
      );
    } finally {
      setSavingCash(false);
    }
  };

  const openIssue = (order: OrderView) => {
    setIssueTarget(order);
    setIssueKind("incomplete");
    setIssueAmount(String(Math.max(0, order.businessPending)));
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
        description: "Queda con fecha, usuario y monto para hacer seguimiento.",
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

  const handleResolveIssue = async (order: OrderView) => {
    try {
      await resolveIssue({ orderId: order._id as Id<"orders"> });
      toast.success("Caso cerrado", {
        description: "El problema de efectivo quedó resuelto con fecha y usuario.",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos cerrar el caso",
      );
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
            <span className="inline-block size-1.5 rounded-full bg-accent" />
            Panel · {departmentInfo.label}
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {business.name}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {business.tagline} · {business.address}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2 border-border/80" onClick={openSettings}>
            <Settings2 className="size-4" />
            Editar local
          </Button>
          <div
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
              business.isOpen
                ? "border-accent/30 bg-accent/10 text-accent"
                : "border-border/80 bg-secondary/50 text-muted-foreground",
            )}
          >
            {business.isOpen ? "Abierto" : "Cerrado"}
            <Switch
              checked={business.isOpen}
              onCheckedChange={async (checked) => {
                try {
                  await updateBusiness({ isOpen: checked });
                  toast(checked ? "Local abierto" : "Local cerrado", {
                    description: checked
                      ? "Tu catálogo vuelve a aparecer en el mazo."
                      : "Tu catálogo no se mostrará hasta que lo abras.",
                  });
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "No pudimos cambiar");
                }
              }}
            />
          </div>
        </div>
      </div>

      <SubscriptionReminder />

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
          </Link>
        ))}
      </div>

      {tab === "overview" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {!business.location && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-3.5">
              <p className="text-xs leading-relaxed text-primary">
                Tu local todavía no tiene un punto en el mapa, así que no podemos
                calcular los envíos ni recibir pedidos.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="border-primary/40 text-primary"
                onClick={openSettings}
              >
                Fijar ubicación
              </Button>
            </div>
          )}

          {business.deliveryPromo && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/[0.07] p-3.5">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-accent">
                  <TicketPercent className="size-3.5" />
                  {promoLabel(business.deliveryPromo)} activo en toda la tienda
                </p>
                <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
                  Cubrís{" "}
                  {business.deliveryPromo === "free_delivery"
                    ? "el 100%"
                    : "la mitad"}{" "}
                  de la parte de envío de tu tienda en cada entrega. Hoy sumás{" "}
                  {money(stats?.promoSpendToday ?? 0)} de gasto promocional. Tus
                  productos se te pagan completos: no es una comisión de Capricho.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-accent/40 text-accent"
                onClick={openSettings}
              >
                Cambiar promoción
              </Button>
            </div>
          )}

          {(stats?.cashPending ?? 0) > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/[0.07] p-3.5">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Wallet className="size-3.5" />
                  Efectivo pendiente de confirmar
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Los repartidores tienen {money(stats?.cashPending ?? 0)} de tus
                  ventas sin confirmar. Confirmá el monto recibido en cada pedido
                  entregado para cerrar la diferencia.
                </p>
              </div>
              <Button asChild size="sm" variant="outline" className="border-primary/40 text-primary">
                <Link to="/business?tab=orders">Revisar entregas</Link>
              </Button>
            </div>
          )}

          <div className="relative overflow-hidden rounded-3xl border border-border/70">
            <DishImage
              src={business.image}
              alt={business.name}
              className="h-40 w-full sm:h-52"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,6,7,0.1)_0%,rgba(6,6,7,0.92)_100%)]" />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                  {departmentInfo.label} · {business.category}
                </p>
                <p className="mt-1 font-display text-2xl font-extrabold text-white">
                  {business.name}
                </p>
                <p className="mt-1 flex items-center gap-2 text-xs text-white/60">
                  <span className="flex items-center gap-1">
                    ⭐ {business.rating.toFixed(1)} ({business.reviews})
                  </span>
                  · {products.length} productos · ETA {business.etaMinutes} min
                </p>
              </div>
              <Button asChild size="sm" className="gap-1.5 bg-ember-gradient text-black">
                <Link to="/business?tab=menu">
                  Ver productos
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Ingresos hoy"
              value={money(stats?.revenueToday ?? 0)}
              hint={`${stats?.deliveredToday ?? 0} entregados · productos ${money(stats?.productSalesToday ?? 0)}`}
              accent="ember"
            />
            <StatCard
              label="Pedidos activos"
              value={String(stats?.active ?? 0)}
              hint={`${stats?.waiting ?? 0} esperando confirmación`}
              accent="chili"
            />
            <StatCard
              label="Productos"
              value={String(products.length)}
              hint={`${products.filter((p) => p.isAvailable).length} visibles`}
            />
            <StatCard
              label="Total histórico"
              value={String(stats?.totalOrders ?? 0)}
              hint="pedidos recibidos"
            />
          </div>

          <div className="surface-raised rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Últimos pedidos</h2>
              <Link
                to="/business?tab=orders"
                className="flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
              >
                Ver todos
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
            {orders.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
                Todavía no recibiste pedidos. Cuando alguien deslice a la derecha
                uno de tus productos, aparece acá.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {orders.slice(0, 4).map((order) => (
                  <div
                    key={order._id}
                    className="flex items-center gap-3 rounded-xl border border-border/60 bg-black/20 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        {order.code}
                        <span className="text-[10px] font-normal text-muted-foreground">
                          {relativeTime(order.createdAt)}
                        </span>
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {order.items.length} productos ·{" "}
                        {order.items.reduce((acc, item) => acc + item.quantity, 0)} unidades ·{" "}
                        {order.buyerName}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-sm font-bold">
                        {money(order.subtotal)}
                      </p>
                      <StatusPill status={order.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={openNewProduct}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-accent/30 bg-accent/[0.04] py-3.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/10"
          >
            <Plus className="size-4" />
            Publicar un producto nuevo
          </button>
        </motion.div>
      )}

      {tab === "orders" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {orders.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="Sin pedidos todavía"
              description="Los pedidos que lleguen desde el mazo aparecen acá en tiempo real, listos para aceptar y cocinar."
              action={
                <Button asChild className="gap-2 bg-ember-gradient text-black">
                  <Link to="/business?tab=menu">Revisar productos</Link>
                </Button>
              }
            />
          ) : (
            orders.map((order) => {
              const waitStart = order.waitStartedAt ?? order.readyAt;
              const waitSeconds =
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
              const waitUrgent = waitStart !== null && waitSeconds === 0;
              const canCancel =
                order.status === "ready" &&
                !order.courierId &&
                waitStart !== null &&
                now >=
                  waitStart +
                    ASSIGNMENT_RULES.cancelAfterMinutes * 60_000;
              return (
              <div key={order._id} className="surface-raised rounded-3xl p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-display text-sm font-bold">
                      {order.code}
                      <span className="text-[10px] font-normal text-muted-foreground">
                        {clockTime(order.createdAt)}
                      </span>
                      {order.batchCount && order.batchCount > 1 && (
                        <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                          Entrega {order.batchIndex} de {order.batchCount}
                        </span>
                      )}
                      {order.tripStops > 1 && (
                        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          Viaje con {order.tripStops} tiendas
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.buyerName}
                      {order.buyerPhone ? ` · ${order.buyerPhone}` : ""}
                    </p>
                  </div>
                  <StatusPill status={order.status} />
                </div>

                {order.courierAcceptedAt !== null && order.status !== "cancelled" && (
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

                <ul className="mt-3 space-y-1.5">
                  {order.items.map((item) => (
                    <li
                      key={item.productId}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-muted-foreground">
                        {item.quantity}× {item.name}
                      </span>
                      <span className="font-medium">
                        {money(item.price * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>

                {order.notes && (
                  <p className="mt-3 rounded-xl bg-secondary/50 p-2.5 text-xs italic leading-relaxed text-muted-foreground">
                    “{order.notes}”
                  </p>
                )}

                <div className="mt-3 flex items-start gap-2 rounded-xl border border-border/60 p-2.5 text-xs text-muted-foreground">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-accent" />
                  <span>{order.address}</span>
                </div>

                {order.pickupCode &&
                  (order.status === "ready" || order.status === "picked_up") && (
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5">
                      <div>
                        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                          <PackageCheck className="size-3.5" /> Código de retiro
                        </p>
                        <p className="mt-0.5 font-display text-2xl font-extrabold tracking-[0.3em]">
                          {order.pickupCode}
                        </p>
                        <p className="text-[10px] leading-relaxed text-muted-foreground">
                          Dáselo al repartidor cuando retire la entrega. Confirma
                          que se lleva el pedido correcto.
                        </p>
                      </div>
                    </div>
                  )}

                <div className="mt-3 rounded-xl border border-border/70 p-3">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                    <Wallet className="size-3.5" /> Efectivo de este pedido
                  </p>
                  <div className="mt-2 space-y-1 text-[11px]">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Productos de tu local</span>
                      <span>{money(order.subtotal)}</span>
                    </div>
                    {(order.deliveryDiscount ?? 0) > 0 && (
                      <div className="flex justify-between text-accent">
                        <span>Tu promoción de envío cubre</span>
                        <span>−{money(order.deliveryDiscount ?? 0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-border/60 pt-1 font-semibold">
                      <span>Recibís del repartidor</span>
                      <span>{money(order.businessDue)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Envío (para el repartidor)</span>
                      <span>{money(order.deliveryFee)}</span>
                    </div>
                  </div>

                  {order.cashCollected !== null && (
                    <p className="mt-2 rounded-lg bg-secondary/40 p-2 text-[10px] leading-relaxed text-muted-foreground">
                      El repartidor confirmó {money(order.cashCollected)} cobrados al
                      comprador por toda la entrega
                      {order.cashCollectedByName
                        ? ` (${order.cashCollectedByName})`
                        : ""}
                      {" · "}
                      {relativeTime(order.cashCollectedAt ?? order.createdAt)}.
                      {(order.cashDifference ?? 0) !== 0 && (
                        <span className="text-primary">
                          {" "}
                          Diferencia de {money(order.cashDifference ?? 0)} sobre lo
                          esperado.
                        </span>
                      )}
                    </p>
                  )}

                  {order.cashHanded !== null ? (
                    <div className="mt-2 space-y-1 text-[11px] leading-relaxed">
                      <p className="text-accent">
                        Confirmaste {money(order.cashHanded)} recibidos
                        {order.cashHandedByName
                          ? ` · ${order.cashHandedByName}`
                          : ""}{" · "}
                        {relativeTime(order.cashHandedAt ?? order.createdAt)}
                      </p>
                      {order.businessPending !== 0 && (
                        <p className="text-primary">
                          Diferencia pendiente: {money(order.businessPending)}
                          {order.businessPending > 0
                            ? " · todavía te falta cobrar."
                            : " · recibiste de más."}
                        </p>
                      )}
                      {order.cashHandedLog.length > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          Registros:{" "}
                          {order.cashHandedLog
                            .map(
                              (entry) =>
                                `${money(entry.amount)} (${relativeTime(entry.at)})`,
                            )
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                  ) : order.status === "delivered" ? (
                    <Button
                      size="sm"
                      className="mt-2 w-full gap-1.5 bg-ember-gradient text-black"
                      onClick={() => openCash(order)}
                    >
                      <Wallet className="size-3.5" />
                      Confirmar efectivo recibido
                    </Button>
                  ) : (
                    <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                      El efectivo se confirma cuando la entrega está completada.
                    </p>
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
                  <CashIssueNote
                    issue={order.cashIssue}
                    className="mt-2"
                    onResolve={() => void handleResolveIssue(order)}
                  />
                )}

                {order.tripStops > 1 && (
                  <p className="mt-2 rounded-xl border border-accent/30 bg-accent/[0.07] p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                    El repartidor retira esta entrega también en{" "}
                    {order.stops
                      .filter((stop) => stop.businessId !== order.businessId)
                      .map((stop) => stop.name)
                      .join(" y ")}
                    . El envío se cobra una sola vez por entrega y suma{" "}
                    {money(order.extraStopFee)} por la tienda adicional. A tu tienda
                    le corresponde {money(order.deliveryFee)} de ese envío.
                    {(order.deliveryDiscount ?? 0) > 0 && (
                      <span className="text-accent">
                        {" "}
                        Cubrís {money(order.deliveryDiscount ?? 0)} con tu
                        promoción (gasto promocional, no comisión).
                      </span>
                    )}
                  </p>
                )}

                {order.tripStops <= 1 && (order.deliveryDiscount ?? 0) > 0 && (
                  <p className="mt-2 rounded-xl border border-accent/30 bg-accent/[0.07] p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                    Tu promoción cubre {money(order.deliveryDiscount ?? 0)} del
                    envío de esta entrega. Queda como gasto promocional tuyo, no
                    como comisión: el valor de tus productos se te paga completo.
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Total del pedido
                    </p>
                    <p className="font-display text-lg font-extrabold">
                      {money(order.total)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {order.locked && (
                      <span className="rounded-full border border-border/80 bg-secondary/50 px-3 py-1.5 text-[11px] text-muted-foreground">
                        Se habilita cuando salga la entrega anterior
                      </span>
                    )}
                    {(order.status === "pending" || order.status === "accepted") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-primary"
                        disabled={busyOrder === order._id}
                        onClick={() => handleStatus(order._id, "cancelled")}
                      >
                        Rechazar
                      </Button>
                    )}
                    {ACTION_BUTTONS[order.status].map((action) => (
                      <Button
                        key={action.status}
                        size="sm"
                        className="gap-1.5 bg-ember-gradient text-black"
                        disabled={busyOrder === order._id || order.locked}
                        onClick={() => handleStatus(order._id, action.status)}
                      >
                        {busyOrder === order._id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <action.icon className="size-3.5" />
                        )}
                        {action.label}
                      </Button>
                    ))}
                    {order.status === "ready" &&
                      (order.courierId ? (
                        <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-[11px] font-semibold text-accent">
                          {order.courierName ?? "Repartidor"} va a retirar
                        </span>
                      ) : (
                        <div className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-black/20 p-3">
                          <div>
                            <p
                              className={cn(
                                "flex items-center gap-1.5 text-[11px] font-semibold",
                                waitUrgent ? "text-primary" : "text-accent",
                              )}
                            >
                              <Timer className="size-3.5" />
                              {waitUrgent
                                ? "Nadie lo tomó todavía"
                                : "Esperando repartidor"}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {waitingMinutes ?? 0} min esperando
                              {!waitUrgent && waitSeconds !== null
                                ? ` · quedan ${Math.floor(
                                    waitSeconds / 60,
                                  )}:${String(waitSeconds % 60).padStart(2, "0")}`
                                : ""}
                              {" · "}código {order.pickupCode ?? "—"}
                            </p>
                            <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                              {canCancel
                                ? `Podés cancelarlo ahora o esperar: a los ${ASSIGNMENT_RULES.autoCancelAfterMinutes} min se cancela solo. El comprador ve el motivo.`
                                : `Podés cancelarlo a los ${ASSIGNMENT_RULES.cancelAfterMinutes} min; a los ${ASSIGNMENT_RULES.autoCancelAfterMinutes} se cancela solo.`}
                            </p>
                          </div>
                          {canCancel && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 border-primary/40 text-[11px] text-primary hover:bg-primary/10"
                              disabled={busyOrder === order._id}
                              onClick={() => setCancelling(order)}
                            >
                              Cancelar sin repartidor
                            </Button>
                          )}
                        </div>
                      ))}
                    {order.status === "picked_up" && (
                      <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary">
                        {order.courierName ?? "Repartidor"} en camino
                      </span>
                    )}
                    {(order.status === "delivered" || order.status === "cancelled") && (
                      <span className="max-w-md text-[11px] text-muted-foreground">
                        {ORDER_STATUS[order.status].label}
                        {order.status === "cancelled" && order.cancellationReason
                          ? ` · ${order.cancellationReason}`
                          : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              );
            })
          )}
        </motion.div>
      )}

      {tab === "menu" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {products.length} productos ·{" "}
              {products.filter((product) => product.isAvailable).length} visibles
              en el mazo
            </p>
            <Button className="gap-2 bg-ember-gradient text-black" onClick={openNewProduct}>
              <Plus className="size-4" />
              Nuevo producto
            </Button>
          </div>

          {products.length === 0 ? (
            <EmptyState
              icon={UtensilsCrossed}
              title="Tu catálogo está vacío"
              description="Publicá tu primer producto para que empiece a aparecer en el mazo de los compradores."
              action={
                <Button className="gap-2 bg-ember-gradient text-black" onClick={openNewProduct}>
                  <Plus className="size-4" />
                  Crear producto
                </Button>
              }
            />
          ) : (
            <div className="space-y-2.5">
              {products.map((product) => (
                <div
                  key={product._id}
                  className="surface-raised flex items-center gap-3 rounded-2xl p-3"
                >
                  <div className="relative shrink-0">
                    <DishImage
                      src={product.image}
                      alt={product.name}
                      className="size-16 rounded-xl"
                    />
                    {business.deliveryPromo && (
                      <PromoBadge
                        promo={business.deliveryPromo}
                        withIcon={false}
                        className="absolute inset-x-1 bottom-1 justify-center px-1 py-0.5 text-[9px]"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{product.name}</p>
                    <p className="line-clamp-1 text-[11px] text-muted-foreground">
                      {product.description || "Sin descripción"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {product.category} · {money(product.price)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Switch
                      checked={product.isAvailable}
                      onCheckedChange={async (checked) => {
                        try {
                          await updateProduct({
                            productId: product._id,
                            isAvailable: checked,
                          });
                          toast(
                            checked ? "Producto visible" : "Producto oculto",
                            { description: product.name },
                          );
                        } catch (error) {
                          toast.error(
                            error instanceof Error ? error.message : "No pudimos actualizar",
                          );
                        }
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Editar"
                      className="size-8 text-muted-foreground"
                      onClick={() => openEditProduct(product)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Eliminar"
                      className="size-8 text-muted-foreground hover:text-primary"
                      onClick={() => setDeleting(product)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      <Dialog open={productDialog} onOpenChange={setProductDialog}>
        <DialogContent className="max-h-[88vh] overflow-y-auto border-border/80 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editing ? "Editar producto" : "Nuevo producto"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Los cambios se reflejan al instante en el mazo."
                : "Va a aparecer al azar entre los productos de tu rubro."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleProductSubmit} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="product-name">Nombre</Label>
              <Input
                id="product-name"
                required
                value={productForm.name}
                onChange={(event) =>
                  setProductForm({ ...productForm, name: event.target.value })
                }
                placeholder="Doble Brasa Ahumada"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-description">Descripción</Label>
              <Textarea
                id="product-description"
                className="min-h-20 resize-none"
                value={productForm.description}
                onChange={(event) =>
                  setProductForm({ ...productForm, description: event.target.value })
                }
                placeholder="Dos medallones al carbón, cheddar añejo..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="product-price">Precio ($)</Label>
                <Input
                  id="product-price"
                  type="number"
                  min={1}
                  required
                  value={productForm.price}
                  onChange={(event) =>
                    setProductForm({ ...productForm, price: event.target.value })
                  }
                  placeholder="12500"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select
                  value={productForm.category}
                  onValueChange={(value) =>
                    setProductForm({ ...productForm, category: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {productCategories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {departmentInfo.filters.length > 0 && (
              <div className="space-y-3 rounded-xl border border-border/70 bg-black/20 p-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Filtros del producto
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                    Cuanto mejor los completes, más fácil es que aparezca en
                    las búsquedas de {departmentInfo.label.toLowerCase()}.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {departmentInfo.filters.map((facet) => (
                    <div key={facet.key} className="space-y-1.5">
                      <Label>{facet.label}</Label>
                      <Select
                        value={productForm.attributes[facet.key] ?? "__none"}
                        onValueChange={(value) =>
                          setProductForm((prev) => {
                            const attributes = { ...prev.attributes };
                            if (value === "__none") {
                              delete attributes[facet.key];
                            } else {
                              attributes[facet.key] = value;
                            }
                            return { ...prev, attributes };
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sin especificar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">
                            Sin especificar
                          </SelectItem>
                          {facet.options.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="product-image">Imagen (URL)</Label>
              <Input
                id="product-image"
                value={productForm.image}
                onChange={(event) =>
                  setProductForm({ ...productForm, image: event.target.value })
                }
                placeholder="https://..."
              />
              <p className="text-[10px] text-muted-foreground">
                Si la dejás vacía usamos una foto acorde a la categoría.
              </p>
            </div>
            <Button
              type="submit"
              className="h-11 w-full gap-2 bg-ember-gradient text-black"
              disabled={savingProduct}
            >
              {savingProduct ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Guardando
                </>
              ) : editing ? (
                "Guardar cambios"
              ) : (
                "Publicar producto"
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cashTarget !== null}
        onOpenChange={(open) => !open && setCashTarget(null)}
      >
        <DialogContent className="border-border/80 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              Confirmar efectivo recibido
            </DialogTitle>
            <DialogDescription>
              Pedido {cashTarget?.code}: te corresponden{" "}
              {money(cashTarget?.businessDue ?? 0)} por tus productos. Queda
              registrado el monto, la fecha y quién lo confirmó.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cash-amount">Monto recibido</Label>
              <Input
                id="cash-amount"
                type="number"
                min={0}
                value={cashAmount}
                onChange={(event) => setCashAmount(event.target.value)}
              />
            </div>
            {cashDifference !== 0 && (
              <>
                <p className="rounded-xl border border-primary/30 bg-primary/[0.07] p-2.5 text-[11px] leading-relaxed text-primary">
                  Diferencia: {money(cashDifference)}{" "}
                  {cashDifference < 0 ? "menos" : "más"} de lo que te
                  corresponde. Queda asentado como problema de efectivo.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="cash-note">Qué pasó</Label>
                  <Textarea
                    id="cash-note"
                    value={cashNote}
                    onChange={(event) => setCashNote(event.target.value)}
                    placeholder="Ej: el repartidor entregó de menos y quedó pendiente ₡1.500."
                    className="min-h-16 resize-none"
                  />
                </div>
              </>
            )}
            <Button
              className="h-11 w-full gap-2 bg-ember-gradient text-black"
              disabled={savingCash}
              onClick={() => void handleConfirmCash()}
            >
              {savingCash ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wallet className="size-4" />
              )}
              Confirmar monto
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
              Pedido {issueTarget?.code}. El repartidor también lo ve y queda con
              fecha, usuario y monto.
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

      <Dialog open={settingsDialog} onOpenChange={setSettingsDialog}>
        <DialogContent className="max-h-[88vh] overflow-y-auto border-border/80 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Ajustes de la tienda</DialogTitle>
            <DialogDescription>
              Estos datos y la promoción de envío se muestran en todo tu catálogo.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSettingsSubmit} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="settings-name">Nombre</Label>
              <Input
                id="settings-name"
                required
                value={settingsForm.name}
                onChange={(event) =>
                  setSettingsForm({ ...settingsForm, name: event.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settings-tagline">Frase corta</Label>
              <Input
                id="settings-tagline"
                value={settingsForm.tagline}
                onChange={(event) =>
                  setSettingsForm({ ...settingsForm, tagline: event.target.value })
                }
              />
            </div>
            <LocationField
              value={settingsForm.location}
              address={settingsForm.address}
              onChange={(location) => setSettingsForm({ ...settingsForm, location })}
              onAddressChange={(address) =>
                setSettingsForm({ ...settingsForm, address })
              }
              label="Ubicación del local en el mapa"
              hint="El envío lo calcula Capricho Express con la distancia entre este punto y el cliente."
              mapHeight="h-44"
            />
            <div className="space-y-1.5">
              <Label htmlFor="settings-eta">Tiempo de preparación (min)</Label>
              <Input
                id="settings-eta"
                type="number"
                min={5}
                value={settingsForm.etaMinutes}
                onChange={(event) =>
                  setSettingsForm({ ...settingsForm, etaMinutes: event.target.value })
                }
              />
              <p className="text-[10px] text-muted-foreground">
                El costo de envío lo calcula Capricho Express según la distancia
                entre tu local y el punto de entrega del cliente.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settings-image">Portada (URL)</Label>
              <Input
                id="settings-image"
                value={settingsForm.image}
                onChange={(event) =>
                  setSettingsForm({ ...settingsForm, image: event.target.value })
                }
              />
            </div>

            <div className="space-y-2 rounded-2xl border border-border/70 bg-black/20 p-3">
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
                  <TicketPercent className="size-3.5" />
                  Promoción de envío
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  Es opcional y podés cambiarla cuando quieras. El envío se cobra
                  una sola vez por entrega, no por producto ni por tienda: si la
                  activás, cubrís la parte que le corresponde a tu tienda en cada
                  entrega (en compras con varias tiendas, cada local cubre la
                  suya). Es un gasto promocional tuyo, no una comisión de
                  Capricho: seguís recibiendo el 100% del valor de tus productos.
                </p>
              </div>
              <div className="space-y-2">
                {PROMO_OPTIONS.map((option) => {
                  const selected = settingsForm.deliveryPromo === option.kind;
                  return (
                    <button
                      key={String(option.kind)}
                      type="button"
                      onClick={() =>
                        setSettingsForm({
                          ...settingsForm,
                          deliveryPromo: option.kind,
                        })
                      }
                      className={cn(
                        "flex w-full items-start gap-3 rounded-xl border p-2.5 text-left transition-colors",
                        selected
                          ? "border-accent/60 bg-accent/[0.08]"
                          : "border-border/70 hover:border-accent/30",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                          selected
                            ? "bg-ember-gradient text-black"
                            : "bg-secondary text-muted-foreground",
                        )}
                      >
                        <TicketPercent className="size-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold">
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
                          {option.detail}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <Button type="submit" className="h-11 w-full gap-2 bg-ember-gradient text-black">
              <DollarSign className="size-4" />
              Guardar local
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent className="border-border/80 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              ¿Eliminar {deleting?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Desaparece del mazo y de tu catálogo. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await removeProduct({ productId: deleting._id });
                  toast("Producto eliminado");
                  setDeleting(null);
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "No pudimos eliminarlo",
                  );
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open) setCancelling(null);
        }}
      >
        <AlertDialogContent className="border-border/80 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              ¿Cancelar el pedido {cancelling?.code}?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-sm leading-relaxed">
              <span className="block">
                Pasaron {ASSIGNMENT_RULES.cancelAfterMinutes} minutos desde que
                quedó listo y ningún repartidor lo tomó. Si no lo cancelás, a los{" "}
                {ASSIGNMENT_RULES.autoCancelAfterMinutes} minutos se cancela solo.
                El comprador ve el motivo y el pedido queda registrado: no se
                borra nada de tu historial.
              </span>
              <span className="block font-semibold text-foreground">
                {cancelling?.buyerName} · {money(cancelling?.total ?? 0)}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir esperando</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                const order = cancelling;
                setCancelling(null);
                if (order) {
                  void handleStatus(
                    order._id,
                    "cancelled",
                    "Nadie tomó el pedido dentro del tiempo de espera. El local lo canceló.",
                  );
                }
              }}
            >
              Cancelar pedido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
