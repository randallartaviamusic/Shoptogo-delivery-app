import { Wordmark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
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
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { DEPARTMENTS, getDepartment } from "@/lib/departments";
import { ROLE_HOME, ROLE_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Bike,
  Check,
  Loader2,
  ShoppingBag,
  Store,
} from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

const OPTIONS = [
  {
    value: "buyer" as const,
    title: "Quiero pedir",
    subtitle: "Comprador",
    description:
      "Deslizá antojos de distintos locales, armá tu carrito y seguí tu pedido en vivo.",
    icon: ShoppingBag,
    cta: "Empezar a deslizar",
  },
  {
    value: "business" as const,
    title: "Tengo un local",
    subtitle: "Negocio",
    description:
      "Publicá tu catálogo, recibí pedidos en tiempo real y actualizá el estado de cada uno.",
    icon: Store,
    cta: "Cargar mi negocio",
  },
  {
    value: "courier" as const,
    title: "Quiero repartir",
    subtitle: "Repartidor",
    description:
      "Tomá pedidos listos para retirar, entregalos y mirá tus ganancias por envío.",
    icon: Bike,
    cta: "Ver entregas",
  },
];

export default function OnboardingPage() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setRole = useMutation(api.profiles.setRole);
  const createBusiness = useMutation(api.businesses.create);

  const startInBusiness = params.get("role") === "business";
  const [mode, setMode] = useState<"role" | "business">(
    startInBusiness ? "business" : "role",
  );
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    department: "comida",
    category: "Hamburguesas",
    tagline: "",
    address: user?.address ?? "",
    deliveryFee: "1900",
    etaMinutes: "30",
    addStarterMenu: true,
  });

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/auth?returnTo=%2Fonboarding" replace />;
  }

  const handleRole = async (role: "buyer" | "business" | "courier") => {
    if (role === "business") {
      setMode("business");
      return;
    }
    setPendingRole(role);
    try {
      await setRole({ role });
      toast(
        role === "courier" ? "Modo repartidor activado" : "Bienvenido a Whimy",
        {
          description:
            role === "courier"
              ? "Ya podés ver los pedidos listos para retirar."
              : "Deslizá a la derecha lo que se te antoje.",
        },
      );
      navigate(role === "courier" ? "/courier" : "/swipe");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardar tu rol");
    } finally {
      setPendingRole(null);
    }
  };

  const handleCreateBusiness = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    try {
      await createBusiness({
        name: form.name,
        department: form.department,
        category: form.category,
        tagline: form.tagline,
        address: form.address,
        deliveryFee: Number(form.deliveryFee) || 0,
        etaMinutes: Number(form.etaMinutes) || 30,
        addStarterMenu: form.addStarterMenu,
      });
      toast.success("Tu negocio ya está en Whimy", {
        description: "Cargá productos para que aparezcan en el mazo.",
      });
      navigate("/business");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos crear el negocio");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative min-h-screen px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-25 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="relative mx-auto w-full max-w-2xl">
        <div className="flex items-center justify-between">
          <Link to="/">
            <Wordmark markSize={32} />
          </Link>
          {user.role ? (
            <Link
              to={ROLE_HOME[user.role] ?? "/swipe"}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Ir a {ROLE_LABEL[user.role]} →
            </Link>
          ) : (
            <Link
              to="/"
              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Volver al inicio
            </Link>
          )}
        </div>

        <AnimatePresence mode="wait">
          {mode === "role" ? (
            <motion.div
              key="role"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="mt-10"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
                Paso 1 de 2
              </p>
              <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                ¿Cómo vas a usar Whimy?
              </h1>
              <p className="mt-2 max-w-lg text-sm text-muted-foreground">
                Elegí tu rol principal. Podés cambiarlo cuando quieras desde tu
                perfil: es la misma cuenta.
              </p>

              <div className="mt-7 space-y-3">
                {OPTIONS.map((option) => {
                  const active = user.role === option.value;
                  return (
                    <motion.button
                      key={option.value}
                      whileHover={{ y: -2 }}
                      onClick={() => handleRole(option.value)}
                      disabled={pendingRole !== null}
                      className={cn(
                        "flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors sm:p-5",
                        active
                          ? "border-accent/40 bg-accent/[0.06]"
                          : "border-border/70 bg-card/60 hover:border-accent/30",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-12 shrink-0 items-center justify-center rounded-2xl",
                          option.value === "business"
                            ? "bg-primary/12 text-primary"
                            : "bg-secondary text-accent",
                        )}
                      >
                        {pendingRole === option.value ? (
                          <Loader2 className="size-5 animate-spin" />
                        ) : (
                          <option.icon className="size-5" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-base font-bold">
                            {option.title}
                          </span>
                          <span className="rounded-full border border-border/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                            {option.subtitle}
                          </span>
                          {active && <Check className="size-3.5 text-accent" />}
                        </span>
                        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                      <ArrowRight className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="business"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="mt-10"
            >
              <button
                onClick={() => {
                  setMode("role");
                  navigate("/onboarding", { replace: true });
                }}
                className="mb-5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" />
                Volver a los roles
              </button>

              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
                Paso 2 de 2 · Negocio
              </p>
              <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                Cargá los datos de tu local
              </h1>
              <p className="mt-2 max-w-lg text-sm text-muted-foreground">
                Con esto tu catálogo ya puede aparecer en el mazo. Elegí el
                departamento correcto para que llegue a las personas indicadas.
              </p>

              <form
                onSubmit={handleCreateBusiness}
                className="surface-raised mt-7 space-y-4 rounded-3xl p-5 sm:p-6"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="business-name">Nombre del local</Label>
                    <Input
                      id="business-name"
                      required
                      value={form.name}
                      onChange={(event) =>
                        setForm({ ...form, name: event.target.value })
                      }
                      placeholder="Brasa Negra"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Departamento</Label>
                    <Select
                      value={form.department}
                      onValueChange={(value) => {
                        const next = getDepartment(value);
                        setForm({
                          ...form,
                          department: value,
                          category: next.subcategories[0] ?? "General",
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DEPARTMENTS.map((item) => (
                          <SelectItem key={item.slug} value={item.slug}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Rubro</Label>
                    <Select
                      value={form.category}
                      onValueChange={(value) => setForm({ ...form, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Elegí un rubro" />
                      </SelectTrigger>
                      <SelectContent>
                        {getDepartment(form.department).subcategories.map(
                          (category) => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="business-tagline">Frase corta</Label>
                    <Input
                      id="business-tagline"
                      value={form.tagline}
                      onChange={(event) =>
                        setForm({ ...form, tagline: event.target.value })
                      }
                      placeholder="Carne al carbón, pan brioche"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="business-address">Dirección del local</Label>
                    <Input
                      id="business-address"
                      required
                      value={form.address}
                      onChange={(event) =>
                        setForm({ ...form, address: event.target.value })
                      }
                      placeholder="Av. Corrientes 1520, CABA"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="business-fee">Costo de envío ($)</Label>
                    <Input
                      id="business-fee"
                      type="number"
                      min={0}
                      value={form.deliveryFee}
                      onChange={(event) =>
                        setForm({ ...form, deliveryFee: event.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="business-eta">Tiempo de preparación (min)</Label>
                    <Input
                      id="business-eta"
                      type="number"
                      min={5}
                      value={form.etaMinutes}
                      onChange={(event) =>
                        setForm({ ...form, etaMinutes: event.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border/70 bg-black/25 p-3">
                  <div>
                    <p className="text-sm font-semibold">
                      Cargar catálogo de ejemplo
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Sumamos 3 productos para que puedas probar el flujo.
                    </p>
                  </div>
                  <Switch
                    checked={form.addStarterMenu}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, addStarterMenu: checked })
                    }
                  />
                </div>

                <Button
                  type="submit"
                  className="h-11 w-full gap-2 bg-ember-gradient text-black"
                  disabled={creating}
                >
                  {creating ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Creando negocio
                    </>
                  ) : (
                    <>
                      Crear negocio y entrar al panel
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </Button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
