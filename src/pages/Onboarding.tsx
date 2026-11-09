import { BrandMark, Wordmark } from "@/components/Brand";
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
import { useMutation } from "convex/react";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, Store } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

export default function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const createBusiness = useMutation(api.businesses.create);

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

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </main>
    );
  }

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
      toast.success("Tu negocio ya está en Capricho Express", {
        description: "Cargá productos para que aparezcan en el mazo.",
      });
      navigate("/business");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos crear el negocio");
    } finally {
      setCreating(false);
    }
  };

  const isBusiness = user.role === "business";

  return (
    <div className="relative min-h-screen px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-25 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="relative mx-auto w-full max-w-2xl">
        <div className="flex items-center justify-between">
          <Link to="/bienvenida" aria-label="Capricho Express">
            <span className="sm:hidden">
              <BrandMark size={32} />
            </span>
            <span className="hidden sm:block">
              <Wordmark markSize={32} />
            </span>
          </Link>
          <Link
            to="/swipe"
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Volver al mazo →
          </Link>
        </div>

        {!isBusiness ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="surface-raised mt-10 rounded-3xl p-6 text-center"
          >
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <Store className="size-5" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight">
              Necesitás una cuenta de negocio
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Cada rol es una cuenta aparte. Para cargar tu local, entrá con tu
              cuenta de negocio o creá una nueva con su correo y contraseña.
            </p>
            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              <Button asChild className="gap-2 bg-ember-gradient text-black">
                <Link to="/auth?role=business&returnTo=%2Fonboarding">
                  Entrar con cuenta de negocio
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <Link to="/swipe">Seguir mirando antojos</Link>
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-10"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
              Cuenta de negocio
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
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
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
                      {getDepartment(form.department).subcategories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="business-tagline">Frase corta</Label>
                  <Input
                    id="business-tagline"
                    value={form.tagline}
                    onChange={(event) => setForm({ ...form, tagline: event.target.value })}
                    placeholder="Carne al carbón, pan brioche"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="business-address">Dirección del local</Label>
                  <Input
                    id="business-address"
                    required
                    value={form.address}
                    onChange={(event) => setForm({ ...form, address: event.target.value })}
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
                  <p className="text-sm font-semibold">Cargar catálogo de ejemplo</p>
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
      </div>
    </div>
  );
}
