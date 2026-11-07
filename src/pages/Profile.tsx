import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { initials, ROLE_HOME, ROLE_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  Bike,
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
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
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

      {user.isAnonymous && (
        <div className="mb-5 rounded-2xl border border-accent/25 bg-accent/[0.06] p-4">
          <p className="text-sm font-semibold text-accent">
            Estás navegando como invitado
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Podés deslizar y armar tu carrito sin cuenta. Para confirmar el
            pedido te vamos a pedir registrarte.
          </p>
          <Button asChild size="sm" className="mt-3 bg-ember-gradient text-black">
            <Link to="/auth?role=buyer&returnTo=%2Fprofile">
              Crear mi cuenta de comprador
            </Link>
          </Button>
        </div>
      )}

      <div className="surface-raised rounded-3xl p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-ember-gradient font-display text-xl font-extrabold text-black">
            {initials(user.name)}
          </div>
          <div className="min-w-0 flex-1">
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

        <div className="mt-5 grid grid-cols-3 gap-2">
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
          navigate("/swipe");
        }}
      >
        <LogOut className="size-4" />
        Cerrar sesión
      </Button>
    </div>
  );
}
