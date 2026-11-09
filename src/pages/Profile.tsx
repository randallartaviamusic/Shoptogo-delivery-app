import defaultLogo from "@/assets/logo.svg";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
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
  Trash2,
  UserRound,
  Settings,
  ArrowLeft,
  Edit3,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const LOGO_MIN = 20;
const LOGO_MAX = 88;

const ROLES = [
  {
    value: "buyer" as const,
    label: "Comprador",
    description: "Deslizá antojos y pedí a domicilio.",
    icon: ShoppingBag,
    home: "/swipe",
  },
  {
    value: "business" as const,
    label: "Negocio",
    description: "Cociná, publicá y conectá con vecinos.",
    icon: Store,
    home: "/business",
  },
  {
    value: "courier" as const,
    label: "Couriers",
    description: "Elegí rutas y entregá pedidos frescos.",
    icon: Bike,
    home: "/courier",
  },
];

const LANGUAGES = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
  { value: "pt", label: "Português" },
];

export function ProfilePage() {
  const { isLoading, isAuthenticated, user, signOut } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const isAdmin = useQuery(api.branding.amIAdmin) ?? false;
  const brand = useQuery(api.branding.brand);
  const generateLogoUploadUrl = useMutation(api.branding.generateLogoUploadUrl);
  const setLogo = useMutation(api.branding.setLogo);
  const setLogoSize = useMutation(api.branding.setLogoSize);
  const resetLogo = useMutation(api.branding.resetLogo);

  const [logoSizeDraft, setLogoSizeDraft] = useState(
    Math.min(LOGO_MAX, Math.max(LOGO_MIN, brand?.logoSize ?? LOGO_MIN)),
  );
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingLogoSize, setSavingLogoSize] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", address: "", city: "", notifications: { email: true, sms: false } });
  const [notifications, setNotifications] = useState({ email: true, sms: false });

  useEffect(() => {
    if (brand?.logoSize) setLogoSizeDraft(brand.logoSize);
  }, [brand?.logoSize]);

  const handleUploadClick = () => fileRef.current?.click();

  const handleLogoSave = async () => {
    setUploadingLogo(true);
    try {
      const url = await generateLogoUploadUrl();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: await fetch(defaultLogo as string).then((r) => r.blob()),
      });
      if (!response.ok) throw new Error("No pudimos subir el logo");
      const storageId = new URL(response.url).pathname.split("/").pop()!;
      await setLogo({ storageId: storageId as Id<"_storage"> });
      toast.success("Logo guardado en tu perfil");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos cambiarlo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSizeSave = async () => {
    setSavingLogoSize(true);
    try {
      const logoSize = await setLogoSize({ size: logoSizeDraft });
      toast.success(`Tamaño del logo guardado en ${logoSizeDraft}px`);
    } finally {
      setSavingLogoSize(false);
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

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Iniciá sesión para ver tu perfil.</p>
      </div>
    );
  }

  const safeUser = user ?? { email: "", name: "", phone: "", address: "", city: "", role: undefined, onboarded: false };
  const { email, name, phone, address, city, role, onboarded } = safeUser;

  const initialsValue = initials(name ?? "");
  const roleHome = ROLE_HOME[role ?? ""] ?? "/";
  const roleLabel = ROLE_LABEL[role ?? ""] ?? role ?? "";
  const roleEntry = ROLES.find((r) => r.value === role);

  const handleSave = async () => {
    toast.success("Datos guardados");
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* Encabezado del perfil. */}
      <PageHeader title={name?.trim() || email?.split("@")[0] || "Perfil"} description={onboarded ? roleLabel : "Completá tu perfil para desbloquear tu experiencia."} />
      <div className="flex flex-wrap items-center gap-3 px-4 sm:px-6 lg:px-8">
        {isAdmin && (
          <span className="rounded-full border border-emerald-300/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-700/30 dark:text-emerald-300">
            Administrador
          </span>
        )}
        <Button variant="outline" className="gap-2 border-border/80" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4" />
          Atrás
        </Button>
      </div>

      <div className="mt-auto flex flex-1 flex-col gap-5 px-4 pb-6 pt-4 sm:px-6 lg:flex-row lg:px-8">
        {/* Área de contenido principal. */}
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto">
          {/* Foto de perfil. */}
          <section className="surface-raised flex flex-col items-center gap-4 rounded-3xl p-5 sm:p-6">
            <div className="flex items-center gap-5">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-foreground/5 ring-1 ring-border/80">
                {user.image ? (
                  <img alt={name ?? "Tu foto"} className="h-full w-full object-cover" src={user.image} />
                ) : (
                  <span className="text-2xl font-bold">{initialsValue}</span>
                )}
              </div>
              <div>
                <h2 className="font-display text-lg font-bold">{name ?? "Sin nombre"}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{email}</p>
                {role && <p className="mt-1 text-xs text-muted-foreground">{roleLabel}</p>}
              </div>
            </div>
          </section>

          {/* Panel de logo (solo administrador). */}
          {isAdmin && (
            <section className="surface-raised mt-5 rounded-3xl p-5 sm:p-6">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-bold">Logo de la plataforma</h2>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    Subí tu imagen y ajustá el tamaño a gusto. Se aplica en toda la
                    plataforma: barra lateral, cabecera, portada y pantallas de acceso.
                  </p>
                </div>
                <Button variant="outline" className="gap-2 border-border/80" onClick={handleUploadClick}>
                  <Camera className="size-4" />
                  Subir foto
                </Button>
              </div>

              <div className="mt-4 flex min-h-[148px] items-center justify-center rounded-2xl border border-border/70 bg-black/30 p-6">
                <img
                  alt="Logo de la plataforma"
                  className="rounded-2xl object-contain drop-shadow"
                  height={logoSizeDraft}
                  src={brand?.logoUrl ?? defaultLogo}
                  style={{ maxWidth: Math.min(logoSizeDraft, 64), width: "auto" }}
                />
              </div>

              <div className="mt-3 flex items-center gap-4">
                <Label htmlFor="logo-size" className="shrink-0">
                  Tamaño
                </Label>
                <div className="flex-1">
                  <Slider
                    id="logo-size"
                    min={LOGO_MIN}
                    max={LOGO_MAX}
                    step={1}
                    value={[logoSizeDraft]}
                    onValueChange={([v]) => setLogoSizeDraft(v)}
                    className="w-full"
                  />
                  <div className="mt-2 text-right text-[11px] text-muted-foreground tabular-nums">
                    {logoSizeDraft}px
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-col items-center gap-2">
                {uploadingLogo ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    <p>Subiendo logo…</p>
                  </div>
                ) : (
                  <>
                    <Button className="gap-2" disabled={savingLogoSize} onClick={handleSizeSave}>
                      {savingLogoSize ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Save className="size-4" />
                      )}
                      Guardar tamaño
                    </Button>
                    {brand?.logoUrl && (
                      <Button variant="outline" className="gap-2 border-border/80 mt-2" onClick={handleLogoReset}>
                        <RotateCcw className="size-4" />
                        Volver al logo original
                      </Button>
                    )}
                  </>
                )}
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                PNG, JPG, WebP o SVG hasta 4 MB. Si subís un logo horizontal se
                respeta su proporción.
              </p>
            </section>
          )}

          {/* Datos de entrega. */}
          <section className="surface-raised mt-5 rounded-3xl p-5 sm:p-6">
            <h2 className="font-display text-lg font-bold">Datos de entrega</h2>
            <p className="mt-1 text-sm text-muted-foreground">Los usamos para completar tus pedidos más rápido.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nombre y apellido</Label>
                <Input id="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Camila Duarte" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Teléfono</Label>
                <Input id="phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+506 8888 8888" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="address">Dirección</Label>
                <Input id="address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="200 m norte del parque central, casa 3B" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="city">Ciudad</Label>
                <Input id="city" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder="San José" />
              </div>
            </div>
            <Button className="mt-4" onClick={handleSave}>
              <Save className="size-4 gap-2" />
              Guardar dirección
            </Button>
          </section>

          {/* Preferencias. */}
          <section className="surface-raised mt-5 rounded-3xl p-5 sm:p-6">
            <h2 className="font-display text-lg font-bold">Preferéncias</h2>
            <p className="mt-1 text-sm text-muted-foreground">Ajustá cómo querés que te contactemos y cómo te sentís en la app.</p>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Notificaciones por correo</span>
                <input type="checkbox" checked={notifications.email} onChange={(event) => setNotifications({ ...notifications, email: event.target.checked })} className="h-4 w-4 rounded border-input" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Notificaciones por SMS</span>
                <input type="checkbox" checked={notifications.sms} onChange={(event) => setNotifications({ ...notifications, sms: event.target.checked })} className="h-4 w-4 rounded border-input" />
              </div>
            </div>
            <Button className="mt-4" onClick={handleSave}>
              <Save className="size-4 gap-2" />
              Guardar preferéncias
            </Button>
          </section>

          {/* Seguridad. */}
          <section className="surface-raised mt-5 rounded-3xl p-5 sm:p-6">
            <h2 className="font-display text-lg font-bold">Seguridad</h2>
            <p className="mt-1 text-sm text-muted-foreground">Cambiá tu contraseña o cerrá sesión en todos tus dispositivos.</p>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Cambiar contraseña</p>
                  <p className="text-xs text-muted-foreground">Actualizá tu contraseña cada 90 días.</p>
                </div>
                <Button variant="outline" className="gap-2 border-border/80">
                  <ShieldCheck className="size-4 gap-2" />
                  Cambiar
                </Button>
              </div>
              <Button variant="outline" className="gap-2 border-border/80" onClick={() => toast.success("Sesión cerrada en todos los dispositivos")}>
                <LogOut className="size-4 gap-2" />
                Cerrar sesión en todos los dispositivos
              </Button>
            </div>
          </section>

          {/* Cuenta. */}
          <section className="surface-raised mt-5 rounded-3xl p-5 sm:p-6">
            <h2 className="font-display text-lg font-bold">Cuenta</h2>
            <p className="mt-1 text-sm text-muted-foreground">Cerrá sesión o eliminá tu cuenta este action no se puede undo.</p>
            <div className="mt-4 space-y-4">
              <Button variant="outline" className="gap-2 border-border/80 text-destructive hover:text-destructive" onClick={() => { toast.success("Acción próximamente"); }}>
                <Trash2 className="size-4 gap-2" />
                Eliminar cuenta
              </Button>
            </div>
          </section>
        </div>

        {/* Barra lateral de perfil. */}
        <aside className="mt-5 flex h-0 flex-1 flex-col overflow-hidden border-t border-border/70 lg:mt-0 lg:flex-none">
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-4 text-sm">
            {roleEntry && (
              <Button variant="ghost" className="justify-start gap-2" onClick={() => navigate(roleEntry.home)}>
                <roleEntry.icon className="size-4" />
                {roleEntry.label}
              </Button>
            )}
            <div className="my-2 border-t border-border/80" />
            <Button variant="ghost" className="justify-start gap-2" onClick={() => navigate("/profile")}>
              <UserRound className="size-4" />
              Tu cuenta
            </Button>
            <Button variant="ghost" className="justify-start gap-2" onClick={() => { toast.success("Ajustes próximamente"); }}>
              <Settings className="size-4" />
              Ajustes
            </Button>
            <Button variant="ghost" className="justify-start gap-2 border-destructive/50 text-destructive hover:bg-destructive/10" onClick={() => { signOut(); navigate("/auth"); }}>
              <LogOut className="size-4" />
              Cerrar sesión
            </Button>
          </nav>
        </aside>
      </div>
    </div>
  );
}

export default ProfilePage;
