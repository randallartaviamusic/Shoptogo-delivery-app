import AccountWelcomeModal from "@/components/AccountWelcomeModal";
import BusinessServices from "@/components/BusinessServices";
import { EmptyState } from "@/components/AppShell";
import { CashIssueNote } from "@/components/CashIssueNote";
import { StarPicker } from "@/components/StarPicker";
import { CoverUpload } from "@/components/CoverUpload";
import { DeliveryTrackingMap } from "@/components/DeliveryTracking";
import { SubscriptionReminder } from "@/components/SubscriptionReminder";
import { VerificationBanner } from "@/components/VerificationBanner";
import { DishImage } from "@/components/DishImage";
import { LocationField } from "@/components/LocationField";
import { ProductImageUpload } from "@/components/ProductImageUpload";
import { ProductOptionsEditor } from "@/components/ProductOptionsEditor";
import { ProductInventoryFields } from "@/components/ProductInventoryFields";
import { ProductMedia } from "@/components/ProductMedia";
import { ProductVideoUpload } from "@/components/ProductVideoUpload";
import { SwipeCard, type Dish } from "@/components/SwipeCard";
import { StoryUpload } from "@/components/StoryUpload";
import { PromoBadge } from "@/components/PromoBadge";
import { OrderAlertsSettings } from "@/components/OrderAlertsSettings";
import { TextSizeControl } from "@/components/TextSizeControl";
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
import {
  optionSummary,
  type ProductOptionGroup,
} from "@/lib/productOptions";
import type { CashIssueKind, OrderStatus } from "@/convex/schema";
import { useAuth } from "@/hooks/use-auth";
import { CASH_ISSUE_LABELS } from "@/lib/cash";
import { getDepartment, normalizeSubcategory } from "@/lib/departments";
import {
  BUSINESS_DAY_LABELS,
  BUSINESS_DAY_ORDER,
  DEFAULT_BUSINESS_HOURS,
  isBusinessOpenAt,
  parseBusinessTime,
  type BusinessHour,
} from "@/lib/hours";
import { clockTime, money, ORDER_STATUS, relativeTime, ROLE_HOME } from "@/lib/format";
import { ASSIGNMENT_RULES } from "@/lib/delivery";
import { formatSinpeNumber, normalizeSinpeNumber } from "@/lib/sinpe";
import { DEFAULT_WHATSAPP_NUMBERS } from "@/lib/subscriptions";
import { FlashCountdown } from "@/components/EliteBusiness";
import { fulfillmentLabel, productFulfillmentMethods, type FulfillmentMethod } from "@/lib/fulfillment";
import { PROMO_OPTIONS, promoLabel } from "@/lib/promo";
import type { DeliveryPromo } from "@/lib/promo";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Bike,
  ChefHat,
  ClipboardList,
  Clock,
  Copy,
  Crown,
  Eye,
  GripVertical,
  Heart,
  ImageUp,
  Loader2,
  MapPin,
  MessageCircle,
  PackageCheck,
  Pencil,
  Plus,
  ReceiptText,
  Settings2,
  Star,
  Store,
  TicketPercent,
  Timer,
  Trash2,
  Users,
  PackagePlus,
  User,
  Sparkles,
  UtensilsCrossed,
  Wallet,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

const TABS = [
  { key: "overview", label: "Panel", to: "/business" },
  { key: "orders", label: "Pedidos", to: "/business?tab=orders" },
  { key: "couriers", label: "Repartidores", to: "/business?tab=couriers" },
  { key: "menu", label: "Productos", to: "/business?tab=menu" },
  { key: "stories", label: "Historias", to: "/business?tab=stories" },
  { key: "servicios", label: "Servicios", to: "/business?tab=servicios" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Períodos del selector de "Últimos pedidos" en el panel del negocio. */
const RECENT_ORDER_RANGES = [
  { label: "Último día", ms: DAY_MS },
  { label: "Últimos 3 días", ms: 3 * DAY_MS },
  { label: "Últimos 7 días", ms: 7 * DAY_MS },
  { label: "Últimos 15 días", ms: 15 * DAY_MS },
  { label: "Últimos 30 días", ms: 30 * DAY_MS },
  { label: "Últimos 3 meses", ms: 90 * DAY_MS },
  { label: "Últimos 6 meses", ms: 180 * DAY_MS },
  { label: "Último año", ms: 365 * DAY_MS },
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
    <div className="surface-raised w-full max-w-full min-w-0 overflow-hidden rounded-2xl p-4">
      <p className="break-words text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 break-words font-display text-2xl font-extrabold",
          accent === "ember" ? "text-accent" : accent === "chili" ? "text-primary" : "",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 break-words text-[11px] text-muted-foreground">{hint}</p>}
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
  // La pestaña predeterminada del perfil es la de la portada y el nombre de la
  // tienda. Cuando el negocio no ha tocado esa sección, se abre directo ahí.
  const navigate = useNavigate();
  const tab = params.get("tab") ?? "portada";

  const mine = useQuery(api.businesses.mine);
  const board = useQuery(api.orders.businessBoard);
  const subscription = useQuery(api.subscriptions.mine);
  const updateBusiness = useMutation(api.businesses.update);
  const updateStatus = useMutation(api.orders.businessUpdateStatus);
  const addProduct = useMutation(api.businesses.addProduct);
  const updateProduct = useMutation(api.businesses.updateProduct);
  const duplicateProduct = useMutation(api.businesses.duplicateProduct);
  const reorderProducts = useMutation(api.businesses.reorderProducts);
  const removeProduct = useMutation(api.businesses.removeProduct);
  const coupons = useQuery(api.coupons.mine);
  const createCoupon = useMutation(api.coupons.create);
  const setFlashSale = useMutation(api.businesses.setFlashSale);
  const [flashForm, setFlashForm] = useState({
    title: "",
    detail: "",
    duration: "4",
  });
  const [flashBusy, setFlashBusy] = useState(false);
  const setCouponActive = useMutation(api.coupons.setActive);
  const removeCoupon = useMutation(api.coupons.remove);
  const confirmCash = useMutation(api.orders.businessConfirmCash);
  const reportIssue = useMutation(api.orders.reportCashIssue);
  const resolveIssue = useMutation(api.orders.resolveCashIssue);
  const couriersDirectory = useQuery(api.couriers.forBusiness);
  const pendingCourierReviews = useQuery(
    api.reviews.pendingBusinessCourierReviews,
  );
  const toggleFavoriteCourier = useMutation(api.couriers.toggleFavorite);
  const submitCourierReview = useMutation(
    api.reviews.submitBusinessCourierReview,
  );

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
  // Repartidores favoritos y reseñas del local a la entrega.
  const [favoriteBusy, setFavoriteBusy] = useState<string | null>(null);
  const [reviewCourier, setReviewCourier] = useState<{
    orderId: string;
    code: string;
    courierName: string;
  } | null>(null);
  const [courierRating, setCourierRating] = useState(0);
  const [courierComment, setCourierComment] = useState("");
  const [savingCourierReview, setSavingCourierReview] = useState(false);
  const [productDialog, setProductDialog] = useState(false);
  const [settingsDialog, setSettingsDialog] = useState(false);
  const [couponForm, setCouponForm] = useState({
    code: "",
    kind: "percent" as "percent" | "amount",
    value: "10",
    minSubtotal: "0",
    expiresInDays: "",
    maxRedemptions: "",
  });
  const [couponBusy, setCouponBusy] = useState(false);
  const [editing, setEditing] = useState<Doc<"products"> | null>(null);
  const availability = useQuery(
    api.businesses.productAvailability,
    editing ? { productId: editing._id } : "skip",
  );
  const [deleting, setDeleting] = useState<Doc<"products"> | null>(null);
  const [previewing, setPreviewing] = useState<Doc<"products"> | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [duplicatingProductId, setDuplicatingProductId] =
    useState<Id<"products"> | null>(null);
  // Orden local mientras se arrastra; se conserva hasta que Convex confirma.
  const [dragOrder, setDragOrder] = useState<Doc<"products">[] | null>(null);
  const [recentRange, setRecentRange] = useState(7 * DAY_MS);
  const [draggingProductId, setDraggingProductId] =
    useState<Id<"products"> | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const productRowRefs = useRef(new Map<Id<"products">, HTMLDivElement>());
  const productDragRef = useRef<{
    pointerId: number;
    productId: Id<"products">;
    order: Doc<"products">[];
  } | null>(null);
  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    price: "",
    category: "Comida rápida",
    image: "",
    video: "",
    attributes: {} as Record<string, string>,
    optionGroups: [] as ProductOptionGroup[],
    stockEnabled: false,
    stock: "",
    reservable: false,
    fulfillmentMethods: ["delivery", "pickup", "dine_in"] as FulfillmentMethod[],
    blockedSlots: [] as Array<{ start: number; end: number; note?: string }>,
  });
  const [productVideoStorageId, setProductVideoStorageId] =
    useState<Id<"_storage"> | null>(null);
  const [removeProductVideo, setRemoveProductVideo] = useState(false);
  const [productImageStorageId, setProductImageStorageId] =
    useState<Id<"_storage"> | null>(null);
  const [productImagePreview, setProductImagePreview] = useState("");
  const [settingsForm, setSettingsForm] = useState({
    name: "",
    tagline: "",
    address: "",
    location: null as { lat: number; lng: number } | null,
    etaMinutes: "",
    image: "",
    deliveryPromo: null as DeliveryPromo,
    sinpePhone: "",
    whatsappPhone: "",
    pickupInstructions: "",
    packagingInstructions: "",
    hoursEnabled: false,
    hours: DEFAULT_BUSINESS_HOURS.map((entry) => ({ ...entry })),
  });
  const [coverStorageId, setCoverStorageId] = useState<Id<"_storage"> | null>(
    null,
  );

  // Suelta el orden optimista cuando el servidor ya devolvió el mismo orden.
  useEffect(() => {
    if (!dragOrder || draggingProductId || savingOrder) return;
    const serverProducts = mine?.products;
    if (!serverProducts) return;
    const matches =
      dragOrder.length === serverProducts.length &&
      dragOrder.every(
        (product, index) => product._id === serverProducts[index]?._id,
      );
    if (matches) setDragOrder(null);
  }, [dragOrder, draggingProductId, mine, savingOrder]);

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
  const orderedProducts = dragOrder ?? products;
  const autoSchedule = Boolean(business.hours?.length);
  const isOpenNow = autoSchedule
    ? isBusinessOpenAt(business.hours, now)
    : business.isOpen;
  const departmentInfo = getDepartment(business.department);
  const productCategories = departmentInfo.subcategories;
  // Los productos viejos pueden tener una categoría que ya no está en la
  // lista (por ejemplo, "Hamburguesas"): la mostramos para no perderla al editar.
  const categoryOptions =
    productForm.category && !productCategories.includes(productForm.category)
      ? [productForm.category, ...productCategories]
      : productCategories;
  const stats = board?.stats;
  const orders = (board?.orders ?? []) as unknown as OrderView[];
  const recentOrders = orders.filter(
    (order) => order.createdAt >= now - recentRange,
  );
  // La subida de video se habilita sola cuando el plan Élite está vigente.
  const eliteVideoEnabled =
    subscription?.plan === "elite" && subscription?.hasAccess === true;
  const proStoriesEnabled =
    subscription?.hasAccess === true &&
    (subscription?.plan === "pro" || subscription?.plan === "elite");

  const handleStatus = async (
    orderId: string,
    status: "accepted" | "preparing" | "ready" | "delivered" | "cancelled",
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

  const handleToggleFavoriteCourier = async (courierId: string) => {
    if (favoriteBusy) return;
    setFavoriteBusy(courierId);
    try {
      const result = await toggleFavoriteCourier({
        courierId: courierId as Id<"users">,
      });
      toast.success(
        result.favorite
          ? "Repartidor agregado a favoritos"
          : "Repartidor quitado de favoritos",
        {
          description: result.favorite
            ? "Cuando haya pedidos de tu local, va a tener prioridad si está disponible."
            : "Las próximas entregas se ofrecerán a todos por igual.",
        },
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No pudimos guardar tu favorito",
      );
    } finally {
      setFavoriteBusy(null);
    }
  };

  const openCourierReview = (row: {
    orderId: string;
    code: string;
    courierName: string;
  }) => {
    setReviewCourier({
      orderId: row.orderId,
      code: row.code,
      courierName: row.courierName,
    });
    setCourierRating(0);
    setCourierComment("");
  };

  const handleCourierReview = async () => {
    if (!reviewCourier) return;
    if (!courierRating) {
      toast.error("Elegí una calificación para el repartidor");
      return;
    }
    setSavingCourierReview(true);
    try {
      await submitCourierReview({
        orderId: reviewCourier.orderId as Id<"orders">,
        rating: courierRating,
        comment: courierComment.trim() || undefined,
      });
      toast.success("Reseña enviada", {
        description:
          "La calificación se suma al promedio del repartidor en la plataforma.",
      });
      setReviewCourier(null);
      setCourierRating(0);
      setCourierComment("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No pudimos guardar la reseña",
      );
    } finally {
      setSavingCourierReview(false);
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
      video: "",
      attributes: {},
      optionGroups: [],
      stockEnabled: false,
      stock: "",
      reservable: false,
      fulfillmentMethods: ["delivery", "pickup", "dine_in"] as FulfillmentMethod[],
      blockedSlots: [],
    });
    setProductVideoStorageId(null);
    setRemoveProductVideo(false);
    setProductImageStorageId(null);
    setProductImagePreview("");
    setProductDialog(true);
  };

  const openEditProduct = (product: Doc<"products">) => {
    setEditing(product);
    setProductForm({
      name: product.name,
      description: product.description,
      price: String(product.price),
      category: normalizeSubcategory(product.category),
      image: product.image,
      video: product.video ?? "",
      attributes: Object.fromEntries(
        (product.attributes ?? []).map((attribute) => [
          attribute.key,
          attribute.value,
        ]),
      ),
      optionGroups: (product.optionGroups ?? []).map((group) => ({
        ...group,
        options: group.options.map((option) => ({ ...option })),
      })),
      stockEnabled: product.stockEnabled ?? false,
      stock: product.stockEnabled ? String(product.stock ?? 0) : "",
      reservable: product.reservable ?? false,
      fulfillmentMethods: productFulfillmentMethods(product),
      blockedSlots: (product.blockedSlots ?? []).map((s) => ({ ...s })),
    });
    setProductVideoStorageId(null);
    setRemoveProductVideo(false);
    setProductImageStorageId(null);
    setProductImagePreview(product.image);
    setProductDialog(true);
  };

  const handleDuplicateProduct = async (product: Doc<"products">) => {
    if (duplicatingProductId) return;
    setDuplicatingProductId(product._id);
    try {
      const copy = await duplicateProduct({ productId: product._id });
      if (!copy) throw new Error("No pudimos duplicar el producto");
      openEditProduct(copy);
      toast.success("Producto duplicado", {
        description: "La copia quedó lista para editar y guardar.",
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No pudimos duplicar el producto",
      );
    } finally {
      setDuplicatingProductId(null);
    }
  };

  const startProductDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    product: Doc<"products">,
  ) => {
    if (savingOrder || draggingProductId) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    const order = dragOrder ?? products;
    productDragRef.current = {
      pointerId: event.pointerId,
      productId: product._id,
      order,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingProductId(product._id);
    setDragOrder(order);
  };

  const moveProductDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = productDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dragged = drag.order.find((product) => product._id === drag.productId);
    if (!dragged) return;
    const others = drag.order.filter(
      (product) => product._id !== drag.productId,
    );
    // Coloca el producto justo antes del primero cuya mitad ya pasó el dedo.
    let insertAt = others.length;
    for (let index = 0; index < others.length; index += 1) {
      const rect = productRowRefs.current
        .get(others[index]._id)
        ?.getBoundingClientRect();
      if (rect && event.clientY < rect.top + rect.height / 2) {
        insertAt = index;
        break;
      }
    }
    const next = [...others];
    next.splice(insertAt, 0, dragged);
    if (next.every((product, index) => product._id === drag.order[index]?._id)) {
      return;
    }
    drag.order = next;
    setDragOrder(next);
  };

  const endProductDrag = async (
    event: React.PointerEvent<HTMLButtonElement>,
    commit: boolean,
  ) => {
    const drag = productDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    productDragRef.current = null;
    setDraggingProductId(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const next = drag.order;
    const changed = next.some(
      (product, index) => product._id !== products[index]?._id,
    );
    if (!commit || !changed) {
      setDragOrder(null);
      return;
    }
    setSavingOrder(true);
    try {
      await reorderProducts({ productIds: next.map((product) => product._id) });
      toast.success("Orden actualizado", {
        description: "Guardamos cómo querés mostrar tus productos.",
      });
    } catch (error) {
      setDragOrder(null);
      toast.error(
        error instanceof Error ? error.message : "No pudimos guardar el orden",
      );
    } finally {
      setSavingOrder(false);
    }
  };

  const handleProductSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const incompleteGroup = productForm.optionGroups.find(
      (group) =>
        !group.name.trim() ||
        group.options.some((option) => !option.name.trim()),
    );
    if (incompleteGroup) {
      toast.error(
        "Completá el nombre del grupo y de cada opción, o quitá las opciones vacías",
      );
      return;
    }
    const groupNames = productForm.optionGroups.map((group) =>
      group.name.trim().toLowerCase(),
    );
    if (new Set(groupNames).size !== groupNames.length) {
      toast.error("Cada grupo de opciones necesita un nombre distinto");
      return;
    }
    if (productForm.stockEnabled) {
      const qty = Number(productForm.stock);
      if (!Number.isFinite(qty) || qty < 0 || Math.floor(qty) !== qty) {
        toast.error("El stock tiene que ser un número entero de 0 en adelante");
        setSavingProduct(false);
        return;
      }
    }
    setSavingProduct(true);
    const payload = {
      name: productForm.name,
      description: productForm.description,
      price: Number(productForm.price),
      category: productForm.category,
      image: productForm.image,
      stockEnabled: productForm.stockEnabled,
      stock: productForm.stockEnabled ? Math.max(0, Math.floor(Number(productForm.stock) || 0)) : undefined,
      reservable: productForm.fulfillmentMethods.includes("reservation"),
      fulfillmentMethods: productForm.fulfillmentMethods,
      blockedSlots: productForm.blockedSlots,
      attributes: Object.entries(productForm.attributes)
        .filter(([, value]) => value.length > 0)
        .map(([key, value]) => ({ key, value })),
      optionGroups: productForm.optionGroups,
    };
    const videoPayload = productVideoStorageId
      ? { videoStorageId: productVideoStorageId }
      : {};
    const imagePayload = productImageStorageId
      ? { imageStorageId: productImageStorageId }
      : {};
    try {
      if (editing) {
        await updateProduct({
          productId: editing._id,
          ...payload,
          ...imagePayload,
          ...videoPayload,
          removeVideo: removeProductVideo || undefined,
        });
        toast.success("Producto actualizado");
      } else {
        await addProduct({ ...payload, ...imagePayload, ...videoPayload });
        toast.success("Producto publicado en el mazo");
      }
      setProductDialog(false);
      setEditing(null);
      setProductImageStorageId(null);
      setProductImagePreview("");
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
      sinpePhone: formatSinpeNumber(business.sinpePhone) ?? "",
      whatsappPhone: formatSinpeNumber(business.whatsappPhone) ?? "",
      pickupInstructions: business.pickupInstructions ?? "",
      packagingInstructions: business.packagingInstructions ?? "",
      hoursEnabled: Boolean(business.hours?.length),
      hours: business.hours?.length
        ? business.hours.map((entry) => ({ ...entry }))
        : DEFAULT_BUSINESS_HOURS.map((entry) => ({ ...entry })),
    });
    setCoverStorageId(null);
    setFlashForm({
      title: business.flashTitle ?? "",
      detail: business.flashDetail ?? "",
      duration: "4",
    });
    setSettingsDialog(true);
  };

  const flashActive =
    Boolean(business.flashTitle?.trim()) &&
    (business.flashEndsAt ?? 0) > now;

  const handleFlashSave = async () => {
    setFlashBusy(true);
    try {
      const result = await setFlashSale({
        title: flashForm.title,
        detail: flashForm.detail,
        durationHours: Number(flashForm.duration) || 4,
      });
      toast.success("Oferta flash publicada", {
        description:
          result.endsAt !== null
            ? `Se muestra con cuenta regresiva hasta ${clockTime(result.endsAt)}.`
            : "Se muestra con cuenta regresiva en tu perfil.",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos publicar la oferta",
      );
    } finally {
      setFlashBusy(false);
    }
  };

  const handleFlashClear = async () => {
    setFlashBusy(true);
    try {
      await setFlashSale({ clear: true });
      toast.success("Oferta flash terminada");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos terminar la oferta",
      );
    } finally {
      setFlashBusy(false);
    }
  };

  const handleCreateCoupon = async () => {
    setCouponBusy(true);
    try {
      await createCoupon({
        code: couponForm.code,
        kind: couponForm.kind,
        value: Number(couponForm.value),
        minSubtotal: Number(couponForm.minSubtotal) || 0,
        expiresInDays: couponForm.expiresInDays
          ? Number(couponForm.expiresInDays)
          : undefined,
        maxRedemptions: couponForm.maxRedemptions
          ? Number(couponForm.maxRedemptions)
          : undefined,
      });
      toast.success("Cupón creado", {
        description: "El descuento se aplica a tus productos y lo cubre tu local.",
      });
      setCouponForm({ ...couponForm, code: "" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos crear el cupón");
    } finally {
      setCouponBusy(false);
    }
  };

  const updateSettingsHour = (
    day: number,
    patch: Partial<Pick<BusinessHour, "open" | "close">>,
  ) => {
    setSettingsForm((current) => ({
      ...current,
      hours: current.hours.map((entry) =>
        entry.day === day ? { ...entry, ...patch } : entry,
      ),
    }));
  };

  const toggleSettingsDay = (day: number, enabled: boolean) => {
    setSettingsForm((current) => ({
      ...current,
      hours: enabled
        ? [
            ...current.hours.filter((entry) => entry.day !== day),
            { day, open: "09:00", close: "21:00" },
          ].sort((a, b) => a.day - b.day)
        : current.hours.filter((entry) => entry.day !== day),
    }));
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
    const sinpePhone = normalizeSinpeNumber(settingsForm.sinpePhone);
    if (!sinpePhone) {
      toast.error("El número de SINPE Móvil es obligatorio: escribí 8 dígitos");
      return;
    }
    const whatsappPhone = normalizeSinpeNumber(settingsForm.whatsappPhone);
    if (!whatsappPhone) {
      toast.error("El número de WhatsApp es obligatorio: escribí 8 dígitos");
      return;
    }
    if (settingsForm.hoursEnabled) {
      if (settingsForm.hours.length === 0) {
        toast.error("Elegí al menos un día de atención");
        return;
      }
      const invalid = settingsForm.hours.find((entry) => {
        const open = parseBusinessTime(entry.open);
        const close = parseBusinessTime(entry.close);
        return open === null || close === null || open === close;
      });
      if (invalid) {
        toast.error(
          `Revisá el horario del ${BUSINESS_DAY_LABELS[invalid.day].toLowerCase()}`,
        );
        return;
      }
    }
    try {
      await updateBusiness({
        name: settingsForm.name,
        tagline: settingsForm.tagline,
        address: settingsForm.address,
        location: settingsForm.location ?? undefined,
        etaMinutes: Number(settingsForm.etaMinutes) || 20,
        image: settingsForm.image,
        coverStorageId: coverStorageId ?? undefined,
        deliveryPromo: settingsForm.deliveryPromo,
        sinpePhone,
        whatsappPhone,
        pickupInstructions: settingsForm.pickupInstructions,
        packagingInstructions: settingsForm.packagingInstructions,
        hours: settingsForm.hoursEnabled ? settingsForm.hours : null,
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
    <div className="w-full max-w-full min-w-0 overflow-x-clip">
      <div className="mb-6 flex w-full max-w-full min-w-0 flex-col gap-4 overflow-x-clip sm:flex-row sm:items-end sm:justify-between">
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
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-2 border-border/80" onClick={openSettings}>
            <Settings2 className="size-4" />
            Editar local
          </Button>
          <div className="flex flex-col items-end gap-1">
            <div
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
                isOpenNow
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-border/80 bg-secondary/50 text-muted-foreground",
              )}
            >
              {isOpenNow ? "Abierto" : "Cerrado"}
              <Switch
                checked={isOpenNow}
                disabled={autoSchedule}
                aria-label={
                  autoSchedule
                    ? "Estado automático según el horario de atención"
                    : "Abrir o cerrar el local"
                }
                title={
                  autoSchedule
                    ? "Se abre y cierra solo según tu horario de atención"
                    : undefined
                }
                onCheckedChange={async (checked) => {
                  if (autoSchedule) return;
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
            <p className="text-[10px] text-muted-foreground">
              {autoSchedule ? "Automático según horario" : "Control manual"}
            </p>
          </div>
        </div>
      </div>

      <SubscriptionReminder />
      <VerificationBanner />

      {tab === "orders" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <OrderAlertsSettings
            audience="business"
            whatsappPhone={business.whatsappPhone}
          />

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
                      {(order.fulfillment ?? "delivery") !== "delivery" && (
                        <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                          {fulfillmentLabel(order.fulfillment)}
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
                  {order.items.map((item, index) => (
                    <li
                      key={`${item.productId}-${index}`}
                      className="flex items-start justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0 text-muted-foreground">
                        <span className="block">
                          {item.quantity}× {item.name}
                        </span>
                        {(item.options?.length ?? 0) > 0 && (
                          <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground/80">
                            {optionSummary(item.options)}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-medium">
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

                {order.fulfillment === "reservation" && order.scheduledFor && (
                  <p className="mt-3 rounded-xl border border-accent/30 bg-accent/[0.06] p-2.5 text-[11px] font-semibold leading-relaxed text-accent">
                    Reserva para {new Intl.DateTimeFormat("es-CR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Costa_Rica" }).format(order.scheduledFor)}.
                  </p>
                )}

                {order.pickupCode &&
                  (order.fulfillment ?? "delivery") === "delivery" &&
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

                {order.paymentMethod === "sinpe" ? (
                  <div className="mt-3 rounded-xl border border-accent/30 bg-accent/[0.05] p-3">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                      <Wallet className="size-3.5" /> Pago por SINPE Móvil
                    </p>
                    <div className="mt-2 space-y-1 text-[11px]">
                      <div className="flex justify-between font-semibold">
                        <span>Monto del pedido para tu tienda</span>
                        <span>{money(order.total)}</span>
                      </div>
                      <p className="text-[10px] leading-relaxed text-muted-foreground">
                        Incluye{" "}
                        {money(order.subtotal - (order.couponDiscount ?? 0))} de tus
                        productos y{" "}
                        {money(
                          Math.max(
                            0,
                            order.deliveryFee - (order.deliveryDiscount ?? 0),
                          ),
                        )}{" "}
                        del envío de esta tienda.{" "}
                        {(order.fulfillment ?? "delivery") === "delivery"
                          ? "El repartidor no cobra efectivo."
                          : "El comprador paga directo, sin repartidor."}
                      </p>
                    </div>
                    {order.paymentReceipt ? (
                      <div className="mt-2 space-y-1">
                        <a
                          href={order.paymentReceipt.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent hover:underline"
                        >
                          <ReceiptText className="size-3.5" /> Ver captura del comprobante
                        </a>
                        <p className="text-[10px] leading-relaxed text-muted-foreground">
                          Subido {relativeTime(order.paymentReceipt.at)}
                          {order.paymentWhatsappSentAt
                            ? ` · enviado por WhatsApp ${relativeTime(order.paymentWhatsappSentAt)}`
                            : " · todavía no lo envió por WhatsApp"}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                        El comprador todavía no subió la captura del SINPE. Cuando
                        lo haga vas a poder verla acá; el pedido se acepta cuando él
                        lo confirme desde su cuenta.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-border/70 p-3">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                      <Wallet className="size-3.5" />
                      Efectivo de este pedido
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      El repartidor recibe en efectivo cuando entrega el pedido. Si
                      lo cobró por más o por menos, podés ajustar la diferencia acá.
                    </p>
                  </div>
                )}
              </div>
              );
            })
          )}
        </motion.div>
      )}

      {tab === "portada" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <section className="w-full overflow-hidden rounded-2xl border border-border/70 bg-black/20 sm:rounded-3xl">
            <div className="relative h-52 w-full overflow-hidden bg-secondary sm:h-72">
              {business.image ? (
                <img
                  src={business.image}
                  alt={`Portada de ${business.name}`}
                  className="size-full object-cover"
                />
              ) : (
                <div className="size-full bg-ember-gradient opacity-60" />
              )}
            </div>
            <div className="p-4 sm:p-5">
              <p className="break-words text-[10px] font-semibold uppercase leading-relaxed tracking-[0.18em] text-accent">
                {departmentInfo.label} · {business.category}
              </p>
              <h2 className="mt-1 break-words font-display text-lg font-extrabold leading-tight sm:text-2xl">
                {business.name}
              </h2>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-relaxed text-muted-foreground">
                <span>⭐ {business.rating.toFixed(1)} ({business.reviews})</span>
                <span>{products.length} productos</span>
                <span>ETA {business.etaMinutes} min</span>
              </p>
              <Button
                asChild
                size="sm"
                className="mt-3 w-fit gap-1.5 bg-ember-gradient text-black"
              >
                <Link to="/business?tab=menu">
                  Ver productos
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </section>

          <Button
            variant="outline"
            className="w-fit gap-2 border-border/80"
            onClick={openSettings}
          >
            <ImageUp className="size-4" />
            Cambiar portada
          </Button>

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

          {(!business.sinpePhone || !business.whatsappPhone) && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-3.5">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Wallet className="size-3.5" /> Falta tu cobro por SINPE Móvil
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Agregá el número de SINPE y el WhatsApp de la tienda en los
                  ajustes. Son obligatorios para que los compradores que no pagan
                  en efectivo puedan transferirte y mandarte el comprobante.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-primary/40 text-primary"
                onClick={openSettings}
              >
                Completar cobro
              </Button>
            </div>
          )}

          <TextSizeControl contextLabel="Se aplica en toda la plataforma y se guarda en este teléfono, también para tu cuenta de negocio." />



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
                  productos se te pagan completos: no es una comisión de Shop To Go.
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

          <div className="grid w-full max-w-full min-w-0 grid-cols-2 gap-3 overflow-x-clip lg:grid-cols-4">
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

          <section className="surface-raised rounded-3xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                  Cierre diario · Costa Rica
                </p>
                <h2 className="mt-1 font-display text-lg font-bold">Ventas y caja de hoy</h2>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  El efectivo esperado corresponde a productos entregados, menos las
                  promociones de envío y los cupones financiados por el local.
                </p>
              </div>
              <Button asChild size="sm" variant="outline" className="border-border/80">
                <Link to="/business?tab=orders">Ver pedidos del día</Link>
              </Button>
            </div>
            <div className="mt-4 grid w-full max-w-full min-w-0 grid-cols-2 gap-2 overflow-x-clip sm:grid-cols-3 lg:grid-cols-4">
              <StatCard label="Pedidos creados" value={String(stats?.ordersToday ?? 0)} hint={`${stats?.deliveredToday ?? 0} entregados`} />
              <StatCard label="Ventas de productos" value={money(stats?.productSalesToday ?? 0)} hint="pedidos entregados" />
              <StatCard label="Promos de envío" value={money(stats?.promoSpendToday ?? 0)} hint={`${board?.dailyReport.promoOrders.length ?? 0} pedidos con promo`} />
              <StatCard label="Cupones del local" value={money(stats?.couponSpendToday ?? 0)} hint={`${board?.dailyReport.couponOrders.length ?? 0} pedidos con cupón`} />
              <StatCard label="Efectivo esperado" value={money(stats?.cashDueToday ?? 0)} hint="a recibir por productos" accent="ember" />
              <StatCard label="Efectivo recibido" value={money(stats?.cashReceivedToday ?? 0)} hint={stats?.cashPendingToday ? `pendiente ${money(stats.cashPendingToday)}` : "cuentas al día"} />
              <StatCard label="Cancelados" value={String(stats?.cancelledToday ?? 0)} hint="hoy" accent="chili" />
              <StatCard label="Diferencias de caja" value={String(stats?.cashDifferenceCountToday ?? 0)} hint={`total ${money(stats?.cashDifferenceAmountToday ?? 0)}`} accent={stats?.cashDifferenceCountToday ? "chili" : undefined} />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-black/20 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Cancelaciones ({board?.dailyReport.cancelled.length ?? 0})</p>
                {(board?.dailyReport.cancelled.length ?? 0) === 0 ? (
                  <p className="mt-2 text-[10px] text-muted-foreground">Sin cancelaciones hoy.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {board?.dailyReport.cancelled.map((order) => (
                      <li key={order.code} className="text-[10px] leading-relaxed">
                        <span className="font-semibold">{order.code} · {order.buyerName} · {money(order.total)}</span>
                        <p className="text-muted-foreground">{order.reason}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-2xl border border-border/70 bg-black/20 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Descuentos promocionales ({board?.dailyReport.promoOrders.length ?? 0})</p>
                {(board?.dailyReport.promoOrders.length ?? 0) === 0 ? (
                  <p className="mt-2 text-[10px] text-muted-foreground">Sin descuentos de envío hoy.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {board?.dailyReport.promoOrders.map((order) => (
                      <li key={order.code} className="flex justify-between gap-2 text-[10px]">
                        <span>{order.code}</span>
                        <span className="font-semibold">−{money(order.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-2xl border border-border/70 bg-black/20 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Cupones aplicados ({board?.dailyReport.couponOrders.length ?? 0})</p>
                {(board?.dailyReport.couponOrders.length ?? 0) === 0 ? (
                  <p className="mt-2 text-[10px] text-muted-foreground">Sin cupones usados hoy.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {board?.dailyReport.couponOrders.map((order) => (
                      <li key={order.code} className="flex justify-between gap-2 text-[10px]">
                        <span>{order.code} · {order.couponCode}</span>
                        <span className="font-semibold">−{money(order.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-2xl border border-border/70 bg-black/20 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Diferencias de caja ({board?.dailyReport.cashDifferences.length ?? 0})</p>
                {(board?.dailyReport.cashDifferences.length ?? 0) === 0 ? (
                  <p className="mt-2 text-[10px] text-muted-foreground">Sin diferencias registradas hoy.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {board?.dailyReport.cashDifferences.map((order) => (
                      <li key={order.code} className="text-[10px]">
                        <span className="font-semibold">{order.code} · {order.buyerName}</span>
                        <p className="text-muted-foreground">Debía {money(order.due)} · recibió {money(order.received)} · diferencia {money(order.difference)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <section className="surface-raised rounded-3xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold">Últimos pedidos</h2>
              <div className="flex items-center gap-2">
                <Select
                  value={String(recentRange)}
                  onValueChange={(value) => setRecentRange(Number(value))}
                >
                  <SelectTrigger
                    aria-label="Filtrar últimos pedidos por período"
                    className="h-8 w-40 text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECENT_ORDER_RANGES.map((range) => (
                      <SelectItem key={range.ms} value={String(range.ms)}>
                        {range.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Link
                  to="/business?tab=orders"
                  className="flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                >
                  Ver todos
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>
            {orders.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
                Todavía no recibiste pedidos. Cuando alguien deslice a la derecha
                uno de tus productos, aparece acá.
              </p>
            ) : recentOrders.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
                Sin pedidos en este período. Elegí un período más amplio en el selector.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-xs">
                  <thead>
                    <tr className="border-b border-border/70">
                      <th className="pigment px-3 py-2 text-left font-semibold uppercase tracking-wider">Código</th>
                      <th className="pigment px-3 py-2 text-left font-semibold uppercase tracking-wider">Comprador</th>
                      <th className="pigment px-3 py-2 text-left font-semibold uppercase tracking-wider">Dirección</th>
                      <th className="pigment px-3 py-2 text-right font-semibold uppercase tracking-wider">Total</th>
                      <th className="pigment px-3 py-2 text-left font-semibold uppercase tracking-wider">Estado</th>
                      <th className="pigment px-3 py-2 text-right font-semibold uppercase tracking-wider">ETA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr key={order._id} className="border-b border-border/40">
                        <td className="pigment px-3 py-2 font-bold tracking-wide">{order.code}</td>
                        <td className="pigment px-3 py-2">{order.buyerName}</td>
                        <td className="pigment px-3 py-2 truncate max-w-[160px] sm:max-w-[200px] lg:max-w-[240px]">{order.address}</td>
                        <td className="pigment px-3 py-2 text-right">{money(order.total)}</td>
                        <td className="pigment px-3 py-2"><StatusPill status={order.status} /></td>
                        <td className="pigment px-3 py-2 text-right">
                          {order.estimatedArrivalAt != null ? (
                            <span className="font-medium tabular-nums">
                              {clockTime(order.estimatedArrivalAt)}
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <button
            type="button"
            onClick={openNewProduct}
            className="flex w-full flex-wrap items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/80 bg-black/10 p-4 text-sm font-semibold text-muted-foreground hover:bg-black/20 hover:text-white"
          >
            <Plus className="size-4" />
            {products.length === 0 ? (
              <>
                Publicá tu primer producto
                <span className="text-[10px] font-normal text-muted-foreground/80"> y empezá a recibir pedidos</span>
              </>
            ) : (
              <>
                {products.length === 1
                  ? "Publicá tu segundo producto"
                  : "Publicá otro producto"}{" "}
                <span className="text-[10px] font-normal text-muted-foreground/80">
                  aparecerá en el mazo inmediatamente
                </span>
              </>
            )}
          </button>

          <div className="flex w-full items-stretch justify-center gap-x-4 gap-y-2 rounded-2xl border border-border/50 bg-black/20 p-4">
            <Button asChild size="sm" className="border-border/60 text-muted-foreground">
              <Link to="/business?tab=menu">
                <PackagePlus className="size-4" />
                Editar catálogo
              </Link>
            </Button>
            <Button asChild size="sm" className="border-border/60 text-muted-foreground">
              <Link to="/business?tab=settings">
                <User className="size-4" />
                Configuración
              </Link>
            </Button>
            {!subscription?.hasAccess && (
              <Button asChild size="sm" className="border-primary/40 text-primary">
                <Link to="/subscriptions?tier=elite">
                  <Sparkles className="size-4" />
                  Activar Elite
                </Link>
              </Button>
            )}
          </div>

        </motion.div>
      )}

      <section className="w-full">
        {products.length === 0 ? (
          <div className="flex w-full items-center justify-center rounded-2xl border border-dashed border-border/70 bg-black/20 p-6 text-center text-sm text-muted-foreground">
            <PackagePlus className="size-5 text-muted-foreground" />
            <span className="ml-2">Aún no publicaste productos.</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Productos guardados
              </p>
              <span className="text-[11px] font-mono text-muted-foreground">
                {products.length} producto{products.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="space-y-2">
              {products.map((product) => (
                <div key={product._id} className="rounded-2xl border border-border/70 bg-black/30 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">{product.name}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {money(product.price)} · {product.fulfillmentMethods?.length ?? 0} método{(product.fulfillmentMethods?.length ?? 0) === 1 ? "" : "s"} de entrega
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Vista previa"
                        className="size-8 text-muted-foreground"
                        onClick={() => setPreviewing(product)}
                      >
                        <Eye className="size-3.5" />
                      </Button>
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
                        aria-label={`Duplicar ${product.name}`}
                        title="Duplicar producto"
                        className="size-8 text-muted-foreground"
                        disabled={duplicatingProductId !== null}
                        onClick={() => void handleDuplicateProduct(product)}
                      >
                        {duplicatingProductId === product._id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
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
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <Dialog
        open={reviewCourier !== null}
        onOpenChange={(open) => {
          if (!open) setReviewCourier(null);
        }}
      >
        <DialogContent className="border-border/80 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              Calificar a {reviewCourier?.courierName ?? "tu repartidor"}
            </DialogTitle>
            <DialogDescription>
              Pedido {reviewCourier?.code}. Contale a la plataforma cómo fue la
              entrega; tu reseña queda separada de la del comprador.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/70 bg-black/20 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <Bike className="size-4 text-accent" /> Puntualidad y trato
              </p>
              <StarPicker
                value={courierRating}
                onChange={setCourierRating}
                label={`Calificación para ${reviewCourier?.courierName ?? "el repartidor"}`}
              />
            </div>
            <Textarea
              value={courierComment}
              onChange={(event) => setCourierComment(event.target.value)}
              maxLength={500}
              placeholder="¿Llegó a tiempo? ¿Cuidó los productos? (opcional)"
              className="min-h-24 resize-none text-xs"
            />
            <Button
              className="w-full gap-1.5 bg-ember-gradient text-black"
              disabled={savingCourierReview || courierRating === 0}
              onClick={() => void handleCourierReview()}
            >
              {savingCourierReview ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Star className="size-4" />
              )}
              Enviar reseña
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={productDialog} onOpenChange={setProductDialog}>
        <DialogContent className="phone-dialog max-h-[88vh] overflow-y-auto border-border/80 bg-card [&>*]:min-w-0">
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
          <form onSubmit={handleProductSubmit} className="min-w-0 space-y-3.5">
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
            <div className="grid w-full max-w-full min-w-0 grid-cols-2 gap-3 overflow-x-clip">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="product-price">Precio (₡)</Label>
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
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((category) => (
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
                        <SelectTrigger className="w-full min-w-0">
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
            <ProductOptionsEditor
              groups={productForm.optionGroups}
              onChange={(optionGroups) =>
                setProductForm((prev) => ({ ...prev, optionGroups }))
              }
            />
            <ProductInventoryFields
              stockEnabled={productForm.stockEnabled}
              stock={productForm.stock}
              reservable={productForm.reservable}
              fulfillmentMethods={productForm.fulfillmentMethods}
              blockedSlots={productForm.blockedSlots}
              booked={editing?._id ? (availability?.booked ?? []) : []}
              onChange={(patch) => setProductForm((prev) => ({ ...prev, ...patch }))}
            />
            <ProductImageUpload
              preview={productImagePreview || undefined}
              onChange={(storageId, preview) => {
                setProductImageStorageId(storageId);
                setProductImagePreview(preview);
              }}
            />
            <div className="space-y-1.5">
              <Label htmlFor="product-image">Imagen desde URL (opcional)</Label>
              <Input
                id="product-image"
                value={productForm.image}
                onChange={(event) => {
                  setProductImageStorageId(null);
                  setProductImagePreview(event.target.value);
                  setProductForm({ ...productForm, image: event.target.value });
                }}
                placeholder="https://..."
              />
              <p className="text-[10px] text-muted-foreground">
                Si no subís una imagen desde la galería, podés pegar un enlace.
                Si la dejás vacía usamos una foto acorde a la categoría.
              </p>
            </div>
            {eliteVideoEnabled ? (
              <ProductVideoUpload
                preview={productForm.video || undefined}
                onChange={(storageId, preview) => {
                  setProductVideoStorageId(storageId);
                  setRemoveProductVideo(false);
                  setProductForm((current) => ({ ...current, video: preview }));
                }}
                onRemove={() => {
                  setProductVideoStorageId(null);
                  setRemoveProductVideo(true);
                  setProductForm((current) => ({ ...current, video: "" }));
                }}
              />
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">Video del producto</p>
                  <span className="rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
                    Élite
                  </span>
                </div>
                <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-accent/30 bg-accent/[0.04] p-3">
                  <div className="flex items-start gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                      <Crown className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">
                        Subir video es exclusivo del plan Élite
                      </p>
                      <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                        Se activa automáticamente cuando tu suscripción Élite
                        está vigente.
                        {productForm.video
                          ? " Tu producto tiene un video publicado; podés quitarlo cuando quieras."
                          : " Mientras tanto, el producto se muestra con su imagen."}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {productForm.video && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1 border-border/80"
                        onClick={() => {
                          setProductVideoStorageId(null);
                          setRemoveProductVideo(true);
                          setProductForm((current) => ({
                            ...current,
                            video: "",
                          }));
                        }}
                      >
                        Quitar video
                      </Button>
                    )}
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-accent/40 text-accent"
                    >
                      <Link to="/suscripcion">Ver Élite</Link>
                    </Button>
                  </div>
                </div>
              </div>
            )}
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
        <DialogContent className="phone-dialog max-h-[88vh] overflow-y-auto border-border/80 bg-card [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="font-display">Ajustes de la tienda</DialogTitle>
            <DialogDescription>
              Estos datos y la promoción de envío se muestran en todo tu catálogo.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSettingsSubmit} className="min-w-0 w-full max-w-full space-y-3.5 overflow-x-clip">
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
              hint="El envío lo calcula Shop To Go con la distancia entre este punto y el cliente."
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
                El costo de envío lo calcula Shop To Go según la distancia
                entre tu local y el punto de entrega del cliente.
              </p>
            </div>
            <div className="space-y-2.5 rounded-2xl border border-border/70 bg-black/20 p-3">
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
                  <Wallet className="size-3.5" /> Cobro por SINPE Móvil
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  Obligatorio: los compradores que no pagan en efectivo
                  transfieren a tu SINPE los productos de tu tienda más la parte
                  del envío que te corresponde, y te mandan la captura al
                  WhatsApp que pongas acá. El mensaje sale desde el WhatsApp del
                  comprador.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="settings-sinpe">Número de SINPE Móvil</Label>
                  <Input
                    id="settings-sinpe"
                    required
                    inputMode="tel"
                    autoComplete="tel"
                    value={settingsForm.sinpePhone}
                    onChange={(event) =>
                      setSettingsForm({
                        ...settingsForm,
                        sinpePhone: event.target.value,
                      })
                    }
                    placeholder="8888-1234"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="settings-whatsapp">WhatsApp para comprobantes</Label>
                  <Input
                    id="settings-whatsapp"
                    required
                    inputMode="tel"
                    autoComplete="tel"
                    value={settingsForm.whatsappPhone}
                    onChange={(event) =>
                      setSettingsForm({
                        ...settingsForm,
                        whatsappPhone: event.target.value,
                      })
                    }
                    placeholder="8888-1234"
                  />
                </div>
              </div>
              <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
                <MessageCircle className="mt-0.5 size-3.5 shrink-0 text-accent" />
                Usá el mismo número o uno distinto: el comprador te escribe
                directo desde su propio WhatsApp al tocar “Enviar comprobante”.
              </p>
            </div>

            <div className="space-y-2.5 rounded-2xl border border-border/70 bg-black/20 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
                    <Clock className="size-3.5" /> Horario de atención
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                    Activalo para que el local se abra y cierre solo. Fuera del
                    horario el catálogo no recibe pedidos.
                  </p>
                </div>
                <Switch
                  checked={settingsForm.hoursEnabled}
                  onCheckedChange={(checked) =>
                    setSettingsForm((current) => ({
                      ...current,
                      hoursEnabled: checked,
                      hours:
                        checked && current.hours.length === 0
                          ? DEFAULT_BUSINESS_HOURS.map((entry) => ({ ...entry }))
                          : current.hours,
                    }))
                  }
                  aria-label="Abrir y cerrar automáticamente según el horario"
                />
              </div>
              {settingsForm.hoursEnabled && (
                <div className="space-y-1.5">
                  {BUSINESS_DAY_ORDER.map((day) => {
                    const entry = settingsForm.hours.find(
                      (item) => item.day === day,
                    );
                    const label = BUSINESS_DAY_LABELS[day];
                    return (
                      <div
                        key={day}
                        className="rounded-xl border border-border/60 bg-black/20 px-2.5 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            id={`settings-hours-${day}`}
                            type="checkbox"
                            checked={Boolean(entry)}
                            onChange={(event) =>
                              toggleSettingsDay(day, event.target.checked)
                            }
                            className="size-3.5 shrink-0 accent-[var(--accent)]"
                          />
                          <label
                            htmlFor={`settings-hours-${day}`}
                            className="flex-1 text-[11px] font-medium"
                          >
                            {label}
                          </label>
                          {!entry && (
                            <span className="text-[10px] text-muted-foreground">
                              Cerrado
                            </span>
                          )}
                        </div>
                        {entry && (
                          <div className="mt-1.5 flex items-center gap-1.5 pl-5">
                            <Input
                              type="time"
                              value={entry.open}
                              onChange={(event) =>
                                updateSettingsHour(day, {
                                  open: event.target.value,
                                })
                              }
                              aria-label={`Apertura del ${label.toLowerCase()}`}
                              className="h-8 min-w-0 flex-1 border-border/80 bg-black/30 px-2 text-[11px] [color-scheme:dark]"
                            />
                            <span className="text-[10px] text-muted-foreground">
                              a
                            </span>
                            <Input
                              type="time"
                              value={entry.close}
                              onChange={(event) =>
                                updateSettingsHour(day, {
                                  close: event.target.value,
                                })
                              }
                              aria-label={`Cierre del ${label.toLowerCase()}`}
                              className="h-8 min-w-0 flex-1 border-border/80 bg-black/30 px-2 text-[11px] [color-scheme:dark]"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <p className="text-[10px] leading-relaxed text-muted-foreground">
                    Los horarios se guardan al tocar “Guardar local”. Si el
                    cierre es más temprano que la apertura, se entiende que
                    termina al día siguiente.
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pickup-instructions">Instrucciones para retiro</Label>
              <Textarea
                id="pickup-instructions"
                value={settingsForm.pickupInstructions}
                onChange={(event) => setSettingsForm({ ...settingsForm, pickupInstructions: event.target.value })}
                maxLength={500}
                placeholder="Ej.: tocar timbre lateral; preguntar en caja por el pedido Shop To Go."
                className="min-h-16 resize-none text-xs"
              />
              <p className="text-[10px] text-muted-foreground">Se muestra al repartidor. Incluí por dónde entrar o dónde esperar.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="packaging-instructions">Instrucciones de empaque</Label>
              <Textarea
                id="packaging-instructions"
                value={settingsForm.packagingInstructions}
                onChange={(event) => setSettingsForm({ ...settingsForm, packagingInstructions: event.target.value })}
                maxLength={500}
                placeholder="Ej.: bebidas separadas; sellar la bolsa; cubiertos dentro."
                className="min-h-16 resize-none text-xs"
              />
              <p className="text-[10px] text-muted-foreground">El repartidor las verá antes de retirar el pedido.</p>
            </div>
            <CoverUpload
              preview={settingsForm.image || undefined}
              onChange={(storageId, preview) => {
                setCoverStorageId(storageId);
                setSettingsForm((current) => ({ ...current, image: preview }));
              }}
              hint="Reemplaza la portada actual del negocio. También podés dejarla como está."
            />

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
                  Shop To Go: seguís recibiendo el 100% del valor de tus productos.
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

            <div className="space-y-2 rounded-2xl border border-amber-300/30 bg-amber-300/[0.05] p-3">
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-200">
                  <Zap className="size-3.5" /> Oferta flash
                  <span className="rounded-full border border-amber-300/50 bg-amber-300/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-200">
                    Élite
                  </span>
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  Anuncio corto con cuenta regresiva en el directorio, el mazo y
                  tu perfil. Dura de 1 a 24 horas y sólo se muestra con Élite
                  vigente.
                </p>
              </div>
              {eliteVideoEnabled ? (
                <>
                  {flashActive && (
                    <p className="rounded-xl border border-amber-300/30 bg-black/25 px-3 py-2 text-[11px] text-amber-100">
                      Activa: {business.flashTitle} ·{" "}
                      <FlashCountdown endsAt={business.flashEndsAt ?? 0} />
                    </p>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="flash-title">Título de la oferta</Label>
                    <Input
                      id="flash-title"
                      value={flashForm.title}
                      onChange={(event) =>
                        setFlashForm({ ...flashForm, title: event.target.value })
                      }
                      maxLength={60}
                      placeholder="Ej.: 2x1 en hamburguesas hasta medianoche"
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="flash-detail">Detalle (opcional)</Label>
                    <Input
                      id="flash-detail"
                      value={flashForm.detail}
                      onChange={(event) =>
                        setFlashForm({ ...flashForm, detail: event.target.value })
                      }
                      maxLength={140}
                      placeholder="Ej.: aplica en el local y para llevar"
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label htmlFor="flash-duration">Duración</Label>
                      <Input
                        id="flash-duration"
                        type="number"
                        min={1}
                        max={24}
                        value={flashForm.duration}
                        onChange={(event) =>
                          setFlashForm({
                            ...flashForm,
                            duration: event.target.value,
                          })
                        }
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="flex flex-1 items-end gap-2 pb-0.5">
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 flex-1 gap-1.5 bg-ember-gradient text-black"
                        disabled={flashBusy}
                        onClick={() => void handleFlashSave()}
                      >
                        {flashBusy ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Zap className="size-3.5" />
                        )}
                        Publicar
                      </Button>
                      {flashActive && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-9 border-border/80"
                          disabled={flashBusy}
                          onClick={() => void handleFlashClear()}
                        >
                          Terminar
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Duración en horas, de 1 a 24.
                  </p>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-muted-foreground">
                    Exclusivo del plan Élite: se activa solo con tu suscripción
                    vigente.
                  </p>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-amber-300/40 text-amber-200"
                  >
                    <Link to="/suscripcion">Ver Élite</Link>
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border border-border/70 bg-black/20 p-3">
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
                  <TicketPercent className="size-3.5" /> Cupones del local
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  El descuento sale de tus productos y de tu liquidación. No cambia el envío ni genera comisión. Un código puede ser porcentaje (máx. 50%) o monto fijo en colones.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={couponForm.code}
                  onChange={(event) => setCouponForm({ ...couponForm, code: event.target.value.toUpperCase() })}
                  placeholder="Código, ej. ANTOJO10"
                  maxLength={16}
                  aria-label="Código del cupón"
                  className="h-9 text-xs uppercase"
                />
                <Select
                  value={couponForm.kind}
                  onValueChange={(value) => setCouponForm({ ...couponForm, kind: value as "percent" | "amount" })}
                >
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Porcentaje</SelectItem>
                    <SelectItem value="amount">Monto en colones</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={couponForm.kind === "percent" ? 1 : 100}
                  max={couponForm.kind === "percent" ? 50 : 25000}
                  value={couponForm.value}
                  onChange={(event) => setCouponForm({ ...couponForm, value: event.target.value })}
                  placeholder={couponForm.kind === "percent" ? "% descuento" : "₡ descuento"}
                  aria-label="Descuento del cupón"
                  className="h-9 text-xs"
                />
                <Input
                  type="number"
                  min={0}
                  value={couponForm.minSubtotal}
                  onChange={(event) => setCouponForm({ ...couponForm, minSubtotal: event.target.value })}
                  placeholder="Compra mínima ₡"
                  aria-label="Compra mínima"
                  className="h-9 text-xs"
                />
                <Input
                  type="number"
                  min={1}
                  value={couponForm.expiresInDays}
                  onChange={(event) => setCouponForm({ ...couponForm, expiresInDays: event.target.value })}
                  placeholder="Vence en días (opcional)"
                  aria-label="Vigencia en días"
                  className="h-9 text-xs"
                />
                <Input
                  type="number"
                  min={1}
                  value={couponForm.maxRedemptions}
                  onChange={(event) => setCouponForm({ ...couponForm, maxRedemptions: event.target.value })}
                  placeholder="Usos máximos (opcional)"
                  aria-label="Límite de usos"
                  className="h-9 text-xs"
                />
              </div>
              <Button
                type="button"
                size="sm"
                className="gap-1.5 bg-accent text-accent-foreground"
                disabled={couponBusy || !couponForm.code.trim() || !couponForm.value}
                onClick={() => void handleCreateCoupon()}
              >
                {couponBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                Crear cupón
              </Button>
              <ul className="space-y-1.5">
                {(coupons ?? []).map((coupon) => (
                  <li key={coupon._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 px-2.5 py-2 text-[10px]">
                    <span className="min-w-0">
                      <strong className="text-xs">{coupon.code}</strong>
                      <span className="ml-2 text-muted-foreground">
                        {coupon.kind === "percent" ? `${coupon.value}%` : money(coupon.value)} · {coupon.redemptions}{coupon.maxRedemptions ? `/${coupon.maxRedemptions}` : ""} usos
                      </span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => void setCouponActive({ couponId: coupon._id, active: !coupon.active })}>
                        {coupon.active ? "Pausar" : "Activar"}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-primary" onClick={() => void removeCoupon({ couponId: coupon._id })}>
                        Quitar
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <Button type="submit" className="h-11 w-full gap-2 bg-ember-gradient text-black">
              <span aria-hidden className="text-base font-bold leading-none">
                ₡
              </span>
              Guardar local
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={previewing !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewing(null);
        }}
      >
        <DialogContent className="border-border/80 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              Vista previa en el mazo
            </DialogTitle>
            <DialogDescription>
              Así se ve {previewing?.name ?? "el producto"} en el mazo de
              swipe de los compradores.
            </DialogDescription>
          </DialogHeader>
          {previewing &&
            (() => {
              const isElitePreview =
                subscription?.plan === "elite" &&
                subscription?.hasAccess === true;
              const flashTitle = business.flashTitle?.trim() ?? "";
              const flashEndsAt = business.flashEndsAt ?? 0;
              const previewDish: Dish = {
                _id: previewing._id,
                name: previewing.name,
                description: previewing.description,
                price: previewing.price,
                image: previewing.image,
                video: previewing.video ?? null,
                category: normalizeSubcategory(previewing.category),
                department: departmentInfo.slug,
                attributes: previewing.attributes ?? [],
                optionGroups: (previewing.optionGroups ?? []) as ProductOptionGroup[],
                tags: previewing.tags,
                promo: business.deliveryPromo ?? null,
                businessId: business._id,
                businessName: business.name,
                businessSlug: business.slug,
                businessCategory: business.category,
                businessImage: business.image,
                elite: isElitePreview,
                eliteVerified:
                  isElitePreview && Boolean(business.verifiedAt),
                flash:
                  isElitePreview && flashTitle && flashEndsAt > now
                    ? {
                        title: flashTitle,
                        detail: business.flashDetail?.trim() ?? "",
                        endsAt: flashEndsAt,
                      }
                    : null,
                rating: business.rating,
                reviews: business.reviews,
                etaMinutes: business.etaMinutes,
                delivery: {
                  feeFrom: business.deliveryFee,
                  fee: null,
                  distanceKm: null,
                  available: true,
                },
                address: business.address,
              };
              return (
                <div className="mx-auto w-full max-w-[420px]">
                  <div className="relative aspect-[4/3] w-full">
                    <SwipeCard
                      dish={previewDish}
                      isTop={false}
                      onDecide={() => {}}
                    />
                  </div>
                  <p className="mt-3 text-center text-[11px] text-muted-foreground">
                    Vista previa sin botones: en el mazo real el comprador la
                    desliza para pedirla, pasarla o guardarla.
                  </p>
                </div>
              );
            })()}
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

      <AccountWelcomeModal audience="business" />
    </div>
  );
}

