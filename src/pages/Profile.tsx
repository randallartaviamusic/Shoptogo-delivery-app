import defaultLogo from "@/assets/logo.svg";
import { BrandHeadline, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { initials, ROLE_HOME, ROLE_LABEL } from "@/lib/format";
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
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const LOGO_MIN = 20;
const LOGO_MAX = 88;

const BRAND_FONTS = [
  { value: "", label: "Tipografía predeterminada" },
  { value: "Georgia, serif", label: "Georgia (serif)" },
  { value: "'Courier New', monospace", label: "Courier New (monoespaciada)" },
  { value: "Verdana, sans-serif", label: "Verdana (sans)" },
  { value: "Impact, sans-serif", label: "Impact (strong)" },
];

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
  const updateProfile = useMutation(api.profiles.updateProfile);
  const generatePhotoUploadUrl = useMutation(api.profiles.generatePhotoUploadUrl);
  const setPhoto = useMutation(api.profiles.setPhoto);

  // Administración de la marca (sólo para el perfil administrador).
  const isAdmin = useQuery(api.branding.amIAdmin) ?? false;
  const brand = useQuery(api.branding.brand);
  const headline = useQuery(api.branding.brandHeadline);
  const generateLogoUploadUrl = useMutation(api.branding.generateLogoUploadUrl);
  const setLogo = useMutation(api.branding.setLogo);
  const setLogoSize = useMutation(api.branding.setLogoSize);
  const resetLogo = useMutation(api.branding.resetLogo);
  const setBrandTitle = useMutation(api.branding.setBrandTitle);
  const setBrandTitleColor = useMutation(api.branding.setBrandTitleColor);
  const setBrandTitleFont = useMutation(api.branding.setBrandTitleFont);

  const [uploading, setUploading] = useState<"avatar" | "cover" | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingLogoSize, setSavingLogoSize] = useState(false);
  const [logoSizeDraft, setLogoSizeDraft] = useState(40);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    city: "",
  });
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  // Estado de edición del título de la marca.
  const [titleDraft, setTitleDraft] = useState(headline?.title ?? "Capricho Express");
  const [colorDraft, setColorDraft] = useState(headline?.color ?? "");
  const [fontDraft, setFontDraft] = useState(headline?.font ?? "");
  const [savingTitle, setSavingTitle] = useState(false);
  const [savingColor, setSavingColor] = useState(false);
  const [savingFont, setSavingFont] = useState(false);

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
    if (headline) {
      setTitleDraft(headline.title);
      setColorDraft(headline.color);
      setFontDraft(headline.font);
    }
  }, [headline]);

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
    } finally {
      setSavingLogoSize(false);
    }
  };

  const handleTitleSave = async () => {
    setSavingTitle(true);
    try {
      await setBrandTitle({ title: titleDraft });
      toast.success("Título de la barra actualizado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardar");
    } finally {
      setSavingTitle(false);
    }
  };

  const handleColorSave = async () => {
    setSavingColor(true);
    try {
      await setBrandTitleColor({ color: colorDraft });
      toast.success("Color del título actualizado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardar");
    } finally {
      setSavingColor(false);
    }
  };

  const handleFontSave = async () => {
    setSavingFont(true);
    try {
      await setBrandTitleFont({ font: fontDraft });
      toast.success("Tipo de letra del título actualizado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardar");
    } finally {
      setSavingFont(false);
    }    };

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
              <h2 className="font-display text-lg font-bold">Logo y nombre de la plataforma</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Subí tu imagen, ajustá el tamaño y escribí el nombre que aparece en la
                barra superior. Se aplica en toda la plataforma: barra lateral, cabecera,
                portada y pantallas de acceso.
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

          {/* Panel de edición del nombre de la plataforma. */}
          <div className="mt-6 rounded-2xl border border-border/70 bg-black/25 p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <Label htmlFor="brand-title">Título de la barra</Label>
              <span className="rounded-full border border-border/70 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                {titleDraft}
              </span>
            </div>
            <Input
              id="brand-title"
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              placeholder="Capricho Express"
              className="mt-1"
            />
            <Button
              className="mt-3 gap-2"
              disabled={savingTitle || titleDraft === headline?.title}
              onClick={handleTitleSave}
            >
              {savingTitle ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Guardar título
            </Button>
          </div>

          {/* Color del título. */}
          <div className="mt-5 rounded-2xl border border-border/70 bg-black/25 p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <Label htmlFor="brand-color">Color del título</Label>
              <div className="flex items-center gap-2">
                <input
                  id="brand-color"
                  type="color"
                  value={colorDraft || "#ffffff"}
                  onChange={(event) => setColorDraft(event.target.value)}
                  className="block size-8 rounded border border-border/70 p-0.5 cursor-pointer"
                />
                <span className="rounded-full border border-border/70 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {colorDraft || "Sin color (predeterminado)"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                className="gap-2"
                disabled={savingColor}
                onClick={handleColorSave}
              >
                {savingColor ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Guardar color
              </Button>
              <Button
                variant="outline"
                className="gap-2 border-border/80"
                disabled={savingColor}
                onClick={() => {
                  setColorDraft("");
                  handleColorSave();
                }}
              >
                <RotateCcw className="size-4" />
                Usar color por defecto
              </Button>
            </div>
          </div>

          {/* Familia de letra del título. */}
          <div className="mt-5 rounded-2xl border border-border/70 bg-black/25 p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <Label htmlFor="brand-font">Tipo de letra del título</Label>
              <span className="rounded-full border border-border/70 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                {fontDraft ? fontDraft : "Predeterminado"}
              </span>
            </div>
            <Select
              value={fontDraft}
              onValueChange={(value) => setFontDraft(value)}
            >
              <SelectTrigger id="brand-font">
                <SelectValue placeholder="Seleccioná una tipografía" />
              </SelectTrigger>
              <SelectContent>
                {BRAND_FONTS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="mt-3 gap-2"
              disabled={savingFont || fontDraft === headline?.font}
              onClick={handleFontSave}
            >
              {savingFont ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Guardar tipo de letra
            </Button>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            PNG, JPG, WebP o SVG hasta 4 MB. Si subís un logo horizontal se
            respeta su proporción.
          </p>
        </section>
      )}

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
