import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Loader2,
  LogOut,
  Save,
  ShoppingBag,
  Star,
  Store,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

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

  const [uploading, setUploading] = useState<"avatar" | "cover" | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

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
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-accent">
                {ROLE_LABEL[role]}
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
              placeholder="+54 11 5555 5555"
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
              placeholder="Av. Siempreviva 742, 3B"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="city">Ciudad</Label>
            <Input
              id="city"
              value={form.city}
              onChange={(event) => setForm({ ...form, city: event.target.value })}
              placeholder="Buenos Aires"
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
