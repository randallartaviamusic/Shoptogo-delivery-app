import { EmptyState } from "@/components/AppShell";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { OrderStatus } from "@/convex/schema";
import { useAuth } from "@/hooks/use-auth";
import { useAuthActions } from "@/hooks/use-auth";
import { getDepartment } from "@/lib/departments";
import { clockTime, money, ORDER_STATUS, relativeTime, ROLE_HOME } from "@/lib/format";
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
  Pencil,
  Plus,
  Settings2,
  Store,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { Mail, Loader2 as VerifyLoader } from "lucide-react";
import { useState } from "react";
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
  const { signIn } = useAuthActions();
  const [params] = useSearchParams();
  const tab = params.get("tab") ?? "overview";

  const mine = useQuery(api.businesses.mine);
  const board = useQuery(api.orders.businessBoard);
  const updateBusiness = useMutation(api.businesses.update);
  const updateStatus = useMutation(api.orders.businessUpdateStatus);
  const addProduct = useMutation(api.businesses.addProduct);
  const updateProduct = useMutation(api.businesses.updateProduct);
  const removeProduct = useMutation(api.businesses.removeProduct);

  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [verifiedLocal, setVerifiedLocal] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifySending, setVerifySending] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

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
    deliveryFee: "",
    etaMinutes: "",
    image: "",
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
    if (verifiedLocal) {
      return (
        <div className="mx-auto max-w-xl">
          <div className="surface-raised rounded-3xl p-5 sm:p-6">
            <div className="mb-5 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-ember-gradient text-black">
                  <Store className="size-6" />
                </div>
                <div>
                  <p className="font-display text-lg font-bold">Completá tu local</p>
                  <p className="text-sm text-muted-foreground">
                    Ya verificaste tu cuenta. Ahora cargá los datos de tu negocio para publicar el catálogo.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="verify-name">Nombre del local</Label>
                <Input
                  id="verify-name"
                  value={verifyEmail}
                  readOnly
                  className="bg-card/70 cursor-not-allowed"
                />
              </div>

              <p className="text-[11px] text-muted-foreground">
                El resto de los datos lo podés completar desde el panel.
              </p>
            </div>

            <Button asChild className="gap-2 bg-ember-gradient text-black" disabled>
              <Link to="/business">
                Seguir al panel
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-xl">
        <div className="surface-raised rounded-3xl p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-ember-gradient text-black">
                <Store className="size-6" />
              </div>
              <div>
                <p className="font-display text-lg font-bold">Tu cuenta está asociada a: {user?.email}</p>
                <p className="text-sm text-muted-foreground">
                  Para gestinar tu local, primero verificá este email con tu contraseña para iniciar sesión como negocio.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="verify-email">Tu email</Label>
              <Input
                id="verify-email"
                type="email"
                value={verifyEmail}
                onChange={(e) => setVerifyEmail(e.target.value)}
                placeholder="vos@email.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="verify-password">Tu contraseña</Label>
              <Input
                id="verify-password"
                type="password"
                value={verifyEmail}
                readOnly
                className="bg-card/70 cursor-not-allowed"
              />
            </div>

            {(verifyError || (verifyEmail.length > 0 && /\.|@|\s/.test(verifyEmail)) && !verifySending) && (
              <p className="rounded-xl border border-primary/30 bg-primary/10 p-2.5 text-xs text-primary">
                {verifyError ?? "Revisá el email y la contraseña"}
              </p>
            )}
          </div>

          <Button
            className="gap-2 bg-ember-gradient text-black"
            disabled={verifySending || verifyEmail.length === 0}
            onClick={async () => {
              setVerifySending(true);
              try {
                await signIn("email-otp", { email: verifyEmail });
                setVerifiedLocal(true);
              } catch (err) {
                setVerifyError(
                  err instanceof Error ? err.message : "No pudimos verificar tu cuenta",
                );
              } finally {
                setVerifySending(false);
              }
            }}
          >
            {verifySending ? (
              <>
                <VerifyLoader className="size-4 animate-spin" />
                Enviando código
              </>
            ) : (
              <>
                <Mail className="size-4" />
                Verificar mi correo
              </>
            )}
          </Button>

          <p className="mt-4 text-[11px] text-muted-foreground">
            ¿No tenés cuenta? Creá una nueva en /auth seleccionando “Negocio”.
          </p>
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
  ) => {
    setBusyOrder(orderId);
    try {
      await updateStatus({ orderId: orderId as Id<"orders">, status });
      toast.success(
        status === "cancelled"
          ? "Pedido cancelado"
          : status === "ready"
            ? "Pedido listo para retirar"
            : "Pedido actualizado",
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
      deliveryFee: String(business.deliveryFee),
      etaMinutes: String(business.etaMinutes),
      image: business.image,
    });
    setSettingsDialog(true);
  };

  const handleSettingsSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await updateBusiness({
        name: settingsForm.name,
        tagline: settingsForm.tagline,
        address: settingsForm.address,
        deliveryFee: Number(settingsForm.deliveryFee) || 0,
        etaMinutes: Number(settingsForm.etaMinutes) || 20,
        image: settingsForm.image,
      });
      toast.success("Local actualizado");
      setSettingsDialog(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardar");
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
              hint={`${stats?.deliveredToday ?? 0} entregados`}
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
            orders.map((order) => (
              <div key={order._id} className="surface-raised rounded-3xl p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-display text-sm font-bold">
                      {order.code}
                      <span className="text-[10px] font-normal text-muted-foreground">
                        {clockTime(order.createdAt)}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.buyerName}
                      {order.buyerPhone ? ` · ${order.buyerPhone}` : ""}
                    </p>
                  </div>
                  <StatusPill status={order.status} />
                </div>

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

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Total del pedido
                    </p>
                    <p className="font-display text-lg font-extrabold">
                      {money(order.total)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
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
                        disabled={busyOrder === order._id}
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
                    {order.status === "ready" && (
                      <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-[11px] font-semibold text-accent">
                        Esperando repartidor
                      </span>
                    )}
                    {order.status === "picked_up" && (
                      <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary">
                        {order.courierName ?? "Repartidor"} en camino
                      </span>
                    )}
                    {(order.status === "delivered" || order.status === "cancelled") && (
                      <span className="text-[11px] text-muted-foreground">
                        {ORDER_STATUS[order.status].label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
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
                  <DishImage
                    src={product.image}
                    alt={product.name}
                    className="size-16 shrink-0 rounded-xl"
                  />
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

      <Dialog open={settingsDialog} onOpenChange={setSettingsDialog}>
        <DialogContent className="max-h-[88vh] overflow-y-auto border-border/80 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Editar local</DialogTitle>
            <DialogDescription>
              Estos datos se muestran en cada producto que aparece en el mazo.
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
            <div className="space-y-1.5">
              <Label htmlFor="settings-address">Dirección</Label>
              <Input
                id="settings-address"
                value={settingsForm.address}
                onChange={(event) =>
                  setSettingsForm({ ...settingsForm, address: event.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="settings-fee">Envío ($)</Label>
                <Input
                  id="settings-fee"
                  type="number"
                  min={0}
                  value={settingsForm.deliveryFee}
                  onChange={(event) =>
                    setSettingsForm({ ...settingsForm, deliveryFee: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settings-eta">ETA (min)</Label>
                <Input
                  id="settings-eta"
                  type="number"
                  min={5}
                  value={settingsForm.etaMinutes}
                  onChange={(event) =>
                    setSettingsForm({ ...settingsForm, etaMinutes: event.target.value })
                  }
                />
              </div>
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
    </div>
  );
}
