import defaultLogo from "@/assets/logo.svg";
import { BRAND_FONT_OPTIONS, fontStack } from "@/components/Brand";
import { PageHeader } from "@/components/AppShell";
import { SubscriptionAdmin } from "@/components/SubscriptionAdmin";
import { SupportAdmin } from "@/components/SupportAdmin";
import { TrustHistory } from "@/components/TrustHistory";
import { VerificationAdmin } from "@/components/VerificationAdmin";
import { VerificationCard } from "@/components/VerificationCard";
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
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { initials, ROLE_HOME, ROLE_LABEL } from "@/lib/format";
import {
  SUBSCRIPTION_STATUS_META,
  formatExpiry,
  planOf,
} from "@/lib/subscriptions";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  Bike,
  Camera,
  Check,
  Flame,
  ImageUp,
  Loader2,
  LogOut,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Trash2,
  UserRound,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

const LOGO_MIN = 20;
const LOGO_MAX = 88;

const TITLE_MIN = 12;
const TITLE_MAX = 30;

type AccountRow = {
  _id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: "buyer" | "business" | "courier" | null;
  city: string | null;
  createdAt: number;
  isAnonymous: boolean;
  isMe: boolean;
  isAdmin: boolean;
  sameEmail: number;
  businessName: string | null;
  orders: number;
  swipes: number;
};

const ACCOUNT_ROLE_LABEL: Record<string, string> = {
  buyer: "Comprador",
  business: "Negocio",
  courier: "Repartidor",
};

const ROLES = [
  {
    value: "buyer" as const,
    label: "Comprador",
    description: "Deslizá antojos y pedí a domicilio.",
    icon: ShoppingBag,
  },
  {
    value: "business" as const,
    label: "Negocio",
    description: "Publicá tu catálogo y gestioná pedidos.",
    icon: Store,
  },
  {
    value: "courier" as const,
    label: "Repartidor",
    description: "Tomá entregas y sumá ganancias.",
    icon: Bike,
  },
];

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const stats = useQuery(api.catalog.myStats);
  const myBusiness = useQuery(api.businesses.mine);
  const mySubscription = useQuery(api.subscriptions.mine);
  const updateProfile = useMutation(api.profiles.updateProfile);
  const generatePhotoUploadUrl = useMutation(api.profiles.generatePhotoUploadUrl);
  const setPhoto = useMutation(api.profiles.setPhoto);

  // Administración de la marca (sólo para el perfil administrador).
  const isAdmin = useQuery(api.branding.amIAdmin) ?? false;
  const brand = useQuery(api.branding.brand);
  const generateLogoUploadUrl = useMutation(api.branding.generateLogoUploadUrl);
  const setLogo = useMutation(api.branding.setLogo);
  const setLogoSize = useMutation(api.branding.setLogoSize);
  const resetLogo = useMutation(api.branding.resetLogo);
  const headline = useQuery(api.branding.brandHeadline);
  const setBrandHeadline = useMutation(api.branding.setBrandHeadline);
  const resetBrandHeadline = useMutation(api.branding.resetBrandHeadline);

  // Gestión de cuentas (sólo para el perfil administrador).
  const [userSearch, setUserSearch] = useState("");
  const [deletingUser, setDeletingUser] = useState<AccountRow | null>(null);
  const [removingUser, setRemovingUser] = useState(false);
  const accounts = useQuery(
    api.admin.users,
    isAdmin ? { search: userSearch } : "skip",
  );
  const removeUser = useMutation(api.admin.deleteUser);

  const handleDeleteAccount = async () => {
    if (!deletingUser) return;
    setRemovingUser(true);
    try {
      const cleared = await removeUser({
        userId: deletingUser._id as Id<"users">,
      });
      const details = [
        cleared.cartItems ? `${cleared.cartItems} en carrito` : null,
        cleared.swipes ? `${cleared.swipes} swipes` : null,
        cleared.orders ? `${cleared.orders} pedidos abiertos` : null,
        cleared.products ? `${cleared.products} productos` : null,
        cleared.businesses ? `${cleared.businesses} local` : null,
      ].filter(Boolean);
      toast.success("Cuenta eliminada", {
        description: `${deletingUser.email ?? deletingUser.name ?? "La cuenta"}${details.length > 0 ? ` · ${details.join(", ")}` : ""}`,
      });
      setDeletingUser(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos eliminar la cuenta",
      );
    } finally {
      setRemovingUser(false);
    }
  };

  const [uploading, setUploading] = useState<"avatar" | "cover" | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingLogoSize, setSavingLogoSize] = useState(false);
  const [logoSizeDraft, setLogoSizeDraft] = useState(40);

  const [titleDraft, setTitleDraft] = useState("Capricho Express");
  const [titleColorDraft, setTitleColorDraft] = useState("#f7f5f0");
  const [titleFontDraft, setTitleFontDraft] = useState("sora");
  const [titleSizeDraft, setTitleSizeDraft] = useState(18);
  const [savingHeadline, setSavingHeadline] = useState(false);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    city: "",
  });
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name ?? "",
      phone: user.phone ?? "",
      address: user.address ?? "",
      city: user.city ?? "",
    });
  }, [user]);

  useEffect(() => {
    if (brand?.logoSize) setLogoSizeDraft(brand.logoSize);
  }, [brand?.logoSize]);

  useEffect(() => {
    if (!headline) return;
    setTitleDraft(headline.title);
    setTitleColorDraft(headline.color);
    setTitleFontDraft(headline.font);
    setTitleSizeDraft(headline.size);
  }, [headline?.title, headline?.color, headline?.font, headline?.size]);

  if (!user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  const role = user.role ?? "buyer";
  const hasBusiness = Boolean(myBusiness?.business);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile(form);
      toast.success("Perfil actualizado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardar");
    } finally {
      setSaving(false);
    }
  };

  const handlePhoto = async (kind: "avatar" | "cover", file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Elegí una imagen (JPG, PNG o WebP)");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("La imagen no puede pesar más de 8 MB");
      return;
    }

    setUploading(kind);
    try {
      const uploadUrl = await generatePhotoUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("No pudimos subir la imagen");
      const { storageId } = (await response.json()) as { storageId: string };
      await setPhoto({ kind, storageId: storageId as Id<"_storage"> });
      toast.success(
        kind === "avatar" ? "Foto de perfil actualizada" : "Portada actualizada",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos subir la imagen",
      );
    } finally {
      setUploading(null);
    }
  };

  const handleLogoUpload = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Elegí una imagen (PNG, JPG, WebP o SVG)");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("El logo no puede pesar más de 4 MB");
      return;
    }

    setUploadingLogo(true);
    try {
      const uploadUrl = await generateLogoUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("No pudimos subir la imagen");
      const { storageId } = (await response.json()) as { storageId: string };
      await setLogo({ storageId: storageId as Id<"_storage"> });
      toast.success("Logo de la plataforma actualizado");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos subir el logo",
      );
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleLogoSave = async () => {
    setSavingLogoSize(true);
    try {
      await setLogoSize({ size: logoSizeDraft });
      toast.success(`Tamaño del logo guardado en ${logoSizeDraft}px`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardar");
    } finally {
      setSavingLogoSize(false);
    }
  };

  const handleHeadlineSave = async () => {
    setSavingHeadline(true);
    try {
      await setBrandHeadline({
        title: titleDraft,
        color: titleColorDraft,
        font: titleFontDraft,
        size: titleSizeDraft,
      });
      toast.success("Título de la barra actualizado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardar");
    } finally {
      setSavingHeadline(false);
    }
  };

  const handleHeadlineReset = async () => {
    setSavingHeadline(true);
    try {
      await resetBrandHeadline();
      toast.success("Volvimos al título original");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos cambiarlo");
    } finally {
      setSavingHeadline(false);
    }
  };

  const handleLogoReset = async () => {
    setUploadingLogo(true);
    try {
      await resetLogo();
      toast.success("Volvimos al logo original");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos cambiarlo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRole = async (next: "buyer" | "business" | "courier") => {
    if (next === role) return;
    // Cada rol es una cuenta aparte: cerramos esta sesión para que pueda entrar
    // (o registrar) la cuenta de ese rol.
    await signOut();
    toast(`Entrá con tu cuenta de ${ROLE_LABEL[next].toLowerCase()}`, {
      description:
        "Cada rol es una cuenta separada. Iniciá sesión o creá una nueva con correo y contraseña.",
    });
    navigate(
      `/auth?role=${next}&returnTo=${encodeURIComponent(ROLE_HOME[next])}`,
    );
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Tu cuenta"
        title="Perfil"
        description={
          "Tus datos de entrega, tu rol en Capricho Express y tus números de antojos."
        }
      />

      <div className="surface-raised overflow-hidden rounded-3xl">
        <div className="relative h-32 sm:h-44">
          {user.coverImage ? (
            <img
              src={user.coverImage}
              alt="Portada del perfil"
              className="size-full object-cover"
            />
          ) : (
            <div className="size-full bg-ember-gradient opacity-70" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              handlePhoto("cover", file);
            }}
          />
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            disabled={uploading === "cover"}
            className="absolute right-3 top-3 flex cursor-pointer items-center gap-1.5 rounded-full border border-white/25 bg-black/55 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur transition-colors hover:bg-black/75 disabled:opacity-70"
          >
            {uploading === "cover" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Camera className="size-3.5" />
            )}
            {uploading === "cover" ? "Subiendo" : "Cambiar portada"}
          </button>
        </div>

        <div className="px-5 pb-5 sm:px-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="relative -mt-10 shrink-0">
              <div className="flex size-20 items-center justify-center overflow-hidden rounded-2xl border-4 border-background bg-ember-gradient font-display text-2xl font-extrabold text-black">
                {user.image ? (
                  <img
                    src={user.image}
                    alt="Foto de perfil"
                    className="size-full object-cover"
                  />
                ) : (
                  initials(user.name)
                )}
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  handlePhoto("avatar", file);
                }}
              />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploading === "avatar"}
                aria-label="Cambiar foto de perfil"
                title="Cambiar foto de perfil"
                className="absolute -bottom-1 -right-1 flex size-8 cursor-pointer items-center justify-center rounded-full border-2 border-background bg-accent text-black transition-transform hover:scale-105 disabled:opacity-70"
              >
                {uploading === "avatar" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Camera className="size-4" />
                )}
              </button>
            </div>

            <div className="min-w-0 flex-1 pb-1">
              <p className="truncate font-display text-xl font-bold">
                {user.name ?? "Completá tu nombre"}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {user.email ?? "Sin email"}
              </p>
              <span className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-accent">
                  {ROLE_LABEL[role]}
                </span>
                {isAdmin && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                    <ShieldCheck className="size-3" />
                    Administrador
                  </span>
                )}
                {mySubscription && (
                  <Link
                    to="/suscripcion"
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-secondary/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                    title={
                      mySubscription.activeUntil
                        ? `Vence ${formatExpiry(mySubscription.activeUntil)}`
                        : "Sin suscripción activa"
                    }
                  >
                    <Wallet className="size-3" />
                    {SUBSCRIPTION_STATUS_META[mySubscription.status].label}
                    {mySubscription.plan
                      ? ` · ${planOf(mySubscription.plan).name}`
                      : ""}
                  </Link>
                )}
              </span>
            </div>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Subí tu foto de perfil y tu portada desde la galería del teléfono o
            los archivos de tu compu. JPG, PNG o WebP hasta 8 MB.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { label: "Antojos", value: stats?.likes ?? 0, icon: Flame },
              { label: "Guardados", value: stats?.saved ?? 0, icon: Star },
              { label: "Pedidos", value: stats?.orders ?? 0, icon: ShoppingBag },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-border/70 bg-black/25 px-3 py-3 text-center"
              >
                <stat.icon className="mx-auto size-4 text-accent" />
                <p className="mt-1 font-display text-xl font-bold">{stat.value}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isAdmin && (
        <section className="surface-raised mt-5 rounded-3xl p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
                <ShieldCheck className="size-3.5" />
                Perfil administrador
              </p>
              <h2 className="font-display text-lg font-bold">Logo de la plataforma</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Subí tu imagen y ajustá el tamaño a gusto. Se aplica en toda la
                plataforma: barra lateral, cabecera, portada y pantallas de acceso.
              </p>
            </div>
          </div>

          <div className="mt-4 flex min-h-[148px] items-center justify-center rounded-2xl border border-border/70 bg-black/30 p-6">
            <img
              src={brand?.logoUrl ?? defaultLogo}
              alt="Logo de Capricho Express"
              style={{
                height: logoSizeDraft,
                maxWidth: logoSizeDraft * 2.6,
                width: "auto",
              }}
              className="rounded-2xl object-contain"
            />
          </div>

          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              handleLogoUpload(file);
            }}
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              className="gap-2 bg-ember-gradient text-black"
              disabled={uploadingLogo}
              onClick={() => logoInputRef.current?.click()}
            >
              {uploadingLogo ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImageUp className="size-4" />
              )}
              {uploadingLogo ? "Subiendo" : brand?.logoUrl ? "Cambiar logo" : "Subir imagen"}
            </Button>
            {brand?.logoUrl && (
              <Button
                variant="outline"
                className="gap-2 border-border/80"
                disabled={uploadingLogo}
                onClick={handleLogoReset}
              >
                <RotateCcw className="size-4" />
                Usar logo original
              </Button>
            )}
          </div>

          <div className="mt-5 rounded-2xl border border-border/70 bg-black/25 p-4">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="logo-size">Tamaño del logo</Label>
              <span className="rounded-full border border-border/70 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                {logoSizeDraft}px
              </span>
            </div>
            <Slider
              id="logo-size"
              className="mt-3"
              min={LOGO_MIN}
              max={LOGO_MAX}
              step={2}
              value={[logoSizeDraft]}
              onValueChange={([value]) => setLogoSizeDraft(value ?? LOGO_MIN)}
            />
            <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>Más chico</span>
              <span>Más grande</span>
            </div>
            <Button
              className="mt-3 gap-2"
              disabled={savingLogoSize || logoSizeDraft === brand?.logoSize}
              onClick={handleLogoSave}
            >
              {savingLogoSize ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Guardar tamaño
            </Button>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            PNG, JPG, WebP o SVG hasta 4 MB. Si subís un logo horizontal se
            respeta su proporción.
          </p>
        </section>
      )}

      {isAdmin && (
        <section className="surface-raised mt-5 rounded-3xl p-5 sm:p-6">
          <div>
            <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
              <ShieldCheck className="size-3.5" />
              Perfil administrador
            </p>
            <h2 className="font-display text-lg font-bold">
              Título de la barra superior
            </h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Es el texto que aparece al lado del logo. Elegí el color, la
              tipografía y el tamaño.
            </p>
          </div>

          <div className="mt-4 flex min-h-[92px] items-center justify-center gap-2.5 overflow-hidden rounded-2xl border border-border/70 bg-black/30 px-4 py-5">
            <img
              src={brand?.logoUrl ?? defaultLogo}
              alt="Logo de Capricho Express"
              style={{ height: 34, maxWidth: 34 * 2.6, width: "auto" }}
              className="shrink-0 rounded-2xl object-contain"
            />
            <span
              className="min-w-0 truncate font-extrabold leading-none tracking-tight"
              style={{
                color: titleColorDraft,
                fontFamily: fontStack(titleFontDraft),
                fontSize: titleSizeDraft,
              }}
            >
              {titleDraft.trim() || "Capricho Express"}
            </span>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="brand-title">Texto del título</Label>
              <Input
                id="brand-title"
                value={titleDraft}
                maxLength={40}
                placeholder="Capricho Express"
                onChange={(event) => setTitleDraft(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brand-title-font">Tipo de letra</Label>
              <Select value={titleFontDraft} onValueChange={setTitleFontDraft}>
                <SelectTrigger id="brand-title-font" className="w-full bg-background/40">
                  <SelectValue placeholder="Elegí una tipografía" />
                </SelectTrigger>
                <SelectContent>
                  {BRAND_FONT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <span style={{ fontFamily: option.stack }}>{option.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brand-title-color">Color del título</Label>
              <div className="flex items-center gap-2">
                <input
                  id="brand-title-color"
                  type="color"
                  value={titleColorDraft}
                  onChange={(event) => setTitleColorDraft(event.target.value)}
                  className="size-10 shrink-0 cursor-pointer rounded-xl border border-border/70 bg-transparent p-1"
                />
                <Input
                  value={titleColorDraft}
                  maxLength={7}
                  spellCheck={false}
                  onChange={(event) => setTitleColorDraft(event.target.value)}
                  className="font-mono text-xs uppercase"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="brand-title-size">Tamaño del título</Label>
                <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {titleSizeDraft}px
                </span>
              </div>
              <Slider
                id="brand-title-size"
                className="py-2"
                min={TITLE_MIN}
                max={TITLE_MAX}
                step={1}
                value={[titleSizeDraft]}
                onValueChange={([value]) => setTitleSizeDraft(value ?? TITLE_MIN)}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              className="gap-2"
              disabled={savingHeadline}
              onClick={handleHeadlineSave}
            >
              {savingHeadline ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Guardar título
            </Button>
            <Button
              variant="outline"
              className="gap-2 border-border/80"
              disabled={savingHeadline}
              onClick={handleHeadlineReset}
            >
              <RotateCcw className="size-4" />
              Restablecer
            </Button>
          </div>
        </section>
      )}

      <VerificationCard />

      {isAdmin && <VerificationAdmin />}
      {isAdmin && <SupportAdmin />}
      {isAdmin && <SubscriptionAdmin />}

      {isAdmin && (
        <section className="surface-raised mt-5 rounded-3xl p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
                <ShieldAlert className="size-3.5" />
                Moderación
              </p>
              <h2 className="font-display text-lg font-bold">
                Cuentas de la plataforma
              </h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Revisá y borrá cuentas falsas, duplicadas, de spam o de usuarios
                problemáticos.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span className="rounded-full border border-border/70 px-2.5 py-1">
                {accounts?.total ?? 0} cuentas
              </span>
              <span className="rounded-full border border-border/70 px-2.5 py-1">
                {accounts?.anonymous ?? 0} invitados
              </span>
              {(accounts?.duplicates ?? 0) > 0 && (
                <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-accent">
                  {accounts?.duplicates} correos repetidos
                </span>
              )}
            </div>
          </div>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              placeholder="Buscar por nombre, correo o teléfono"
              className="pl-9"
            />
          </div>

          <div className="mt-3 space-y-2">
            {accounts === undefined ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-5 animate-spin text-primary" />
              </div>
            ) : accounts.users.length === 0 ? (
              <p className="rounded-xl border border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
                No hay cuentas con esa búsqueda.
              </p>
            ) : (
              accounts.users.map((account) => {
                const blocked = account.isMe || account.isAdmin;
                return (
                  <div
                    key={account._id}
                    className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-black/20 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        <span className="truncate">
                          {account.name ?? "Sin nombre"}
                        </span>
                        {account.isAdmin && (
                          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
                            Admin
                          </span>
                        )}
                        {account.isAnonymous && (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            Invitado
                          </span>
                        )}
                        {account.sameEmail > 1 && (
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            Correo repetido ×{account.sameEmail}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {account.email ?? "sin correo"}
                        {account.phone ? ` · ${account.phone}` : ""}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {ACCOUNT_ROLE_LABEL[account.role ?? ""] ?? "Sin rol"}
                        {account.businessName ? ` · ${account.businessName}` : ""} ·{" "}
                        {account.orders} pedidos · {account.swipes} swipes
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Eliminar ${account.email ?? account.name ?? "cuenta"}`}
                      title={
                        blocked
                          ? "Esta cuenta no se puede eliminar"
                          : "Eliminar cuenta"
                      }
                      disabled={blocked}
                      onClick={() => setDeletingUser(account)}
                      className="size-8 shrink-0 text-muted-foreground hover:text-primary disabled:opacity-30"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>

          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
            Al borrar una cuenta se eliminan su carrito y sus swipes, su local con
            productos y sus pedidos abiertos. Los pedidos ya entregados se
            mantienen como historial, y los que tuviera como repartidor vuelven a
            la lista.
          </p>
        </section>
      )}

      <AlertDialog
        open={deletingUser !== null}
        onOpenChange={(open) => !open && setDeletingUser(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta cuenta?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra {deletingUser?.email ?? deletingUser?.name ?? "la cuenta"}{" "}
              con su carrito, sus swipes, sus pedidos abiertos y, si tiene local,
              su catálogo. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removingUser}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={removingUser}
              onClick={() => void handleDeleteAccount()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {removingUser ? "Eliminando..." : "Eliminar cuenta"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <section className="surface-raised mt-5 rounded-3xl p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold">Datos de entrega</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Los usamos para completar tus pedidos más rápido.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre y apellido</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Camila Duarte"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Teléfono</Label>
            <Input
              id="phone"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              placeholder="+506 8888 8888"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="address">Dirección</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(event) =>
                setForm({ ...form, address: event.target.value })
              }
              placeholder="200 m norte del parque central, casa 3B"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="city">Ciudad</Label>
            <Input
              id="city"
              value={form.city}
              onChange={(event) => setForm({ ...form, city: event.target.value })}
              placeholder="San José"
            />
          </div>
        </div>
        <Button
          className="mt-4 gap-2 bg-ember-gradient text-black"
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Guardando
            </>
          ) : (
            <>
              <Save className="size-4" />
              Guardar cambios
            </>
          )}
        </Button>
      </section>

      <TrustHistory />

      <section className="mt-5">
        <h2 className="mb-3 font-display text-lg font-bold">Tu rol en Capricho Express</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {ROLES.map((option) => {
            const active = role === option.value;
            return (
              <button
                key={option.value}
                onClick={() => handleRole(option.value)}
                disabled={switching !== null}
                className={cn(
                  "rounded-2xl border p-4 text-left transition-colors",
                  active
                    ? "border-accent/40 bg-accent/[0.07]"
                    : "border-border/70 bg-card/60 hover:border-accent/25",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-xl",
                      active
                        ? "bg-accent/15 text-accent"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {switching === option.value ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <option.icon className="size-4" />
                    )}
                  </span>
                  {active && <Check className="size-4 text-accent" />}
                </div>
                <p className="mt-3 text-sm font-semibold">{option.label}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  {option.description}
                </p>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Cada rol es una cuenta aparte: comprador, negocio y repartidor se
          registran con su propio correo y contraseña.
        </p>
      </section>

      <Button
        variant="outline"
        className="mt-5 w-full gap-2 border-primary/25 text-primary hover:bg-primary/10"
        onClick={async () => {
          await signOut();
          navigate("/auth");
        }}
      >
        <LogOut className="size-4" />
        Cerrar sesión
      </Button>
    </div>
  );
}
