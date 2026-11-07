import { BrandMark, Wordmark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth, useAuthActions } from "@/hooks/use-auth";
import { useMutation } from "convex/react";
import { motion } from "framer-motion";
import { Bike, Eye, EyeOff, Loader2, ShoppingBag, Store } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";

type Role = "buyer" | "business" | "courier";
type Mode = "signup" | "signIn";

const ROLES: { value: Role; label: string; icon: typeof Store }[] = [
  { value: "buyer", label: "Comprador", icon: ShoppingBag },
  { value: "business", label: "Negocio", icon: Store },
  { value: "courier", label: "Repartidor", icon: Bike },
];

const ROLE_HOME: Record<Role, string> = {
  buyer: "/swipe",
  business: "/business",
  courier: "/courier",
};

function isRole(value: string | null | undefined): value is Role {
  return value === "buyer" || value === "business" || value === "courier";
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  role: Role,
  fallback = ROLE_HOME.buyer,
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return ROLE_HOME[role] ?? fallback;
}

function roleFromUrl(returnTo: string | null, roleParam: string | null): Role {
  if (isRole(roleParam)) return roleParam;
  if (returnTo?.startsWith("/business")) return "business";
  if (returnTo?.startsWith("/courier")) return "courier";
  const requested = new URLSearchParams(returnTo?.split("?")[1] ?? "").get("role");
  if (isRole(requested)) return requested;
  return "buyer";
}

function friendlyError(error: unknown, mode: Mode) {
  // Convex entrega los mensajes pensados para la persona en `error.data`.
  const data = (error as { data?: unknown })?.data;
  if (typeof data === "string" && data.length > 0) return data;

  const message = (error instanceof Error ? error.message : "").replace(
    /^.*Uncaught ConvexError:\s*/i,
    "",
  );
  if (/already exists/i.test(message)) {
    return "Ya existe una cuenta con ese correo para ese rol. Probá iniciar sesión.";
  }
  if (/Invalid credentials|invalid secret/i.test(message)) {
    return "Correo o contraseña incorrectos.";
  }
  if (/Invalid password/i.test(message)) {
    return "La contraseña debe tener al menos 8 caracteres.";
  }
  if (/fetch|network|connection/i.test(message)) {
    return "No pudimos conectar. Revisá tu conexión e intentá de nuevo.";
  }
  return (
    message ||
    (mode === "signup" ? "No pudimos crear tu cuenta." : "No pudimos entrar.")
  );
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface AuthProps {
  redirectAfterAuth?: string;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, user } = useAuth();
  const { signIn } = useAuthActions();
  const adoptGuestCart = useMutation(api.guests.adoptGuestCart);
  const [searchParams] = useSearchParams();
  const redirectParam = searchParams.get("returnTo");
  const roleParam = searchParams.get("role");

  const [mode, setMode] = useState<Mode>("signup");
  const [role, setRole] = useState<Role>(roleFromUrl(redirectParam, roleParam));
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    passwordConfirm: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si venía navegando como invitado, guardamos su id para traspasarle el carrito.
  const guestRef = useRef<Id<"users"> | null>(null);
  useEffect(() => {
    if (user?.isAnonymous) guestRef.current = user._id;
  }, [user]);

  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!authLoading) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [authLoading]);

  if (authLoading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        {slow ? (
          <>
            <p className="font-display text-lg font-bold">No pudimos abrir la sesión</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Revisá tu conexión y volvé a intentar.
            </p>
            <Button onClick={() => window.location.reload()}>Reintentar</Button>
          </>
        ) : (
          <Loader2 className="size-6 animate-spin text-primary" />
        )}
      </main>
    );
  }

  // Un invitado puede ver este formulario; una cuenta de verdad sigue de largo.
  if (isAuthenticated && user && !user.isAnonymous) {
    return (
      <Navigate
        to={resolveRedirectAfterAuth(
          redirectParam,
          (user.role as Role | undefined) ?? role,
          redirectAfterAuth,
        )}
        replace
      />
    );
  }

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    const guestId = guestRef.current;
    try {
      await signIn("password", {
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role,
        name: form.name,
        flow: mode === "signup" ? "signUp" : "signIn",
      });

      // El carrito que armó como invitado pasa a la cuenta nueva.
      if (guestId) {
        for (let attempt = 0; attempt < 4; attempt += 1) {
          try {
            await adoptGuestCart({ guestId });
            break;
          } catch {
            await wait(250);
          }
        }
      }
    } catch (submitError) {
      setError(friendlyError(submitError, mode));
    } finally {
      setSaving(false);
    }
  };

  const signupReady =
    form.name.trim().length >= 2 &&
    form.email.includes("@") &&
    form.password.length >= 8 &&
    form.password === form.passwordConfirm;
  const signInReady = form.email.includes("@") && form.password.length > 0;

  return (
    <div className="relative min-h-screen px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-30" />
      <div className="mx-auto flex max-w-lg flex-col gap-8">
        <div className="flex items-center justify-between">
          <Link to="/bienvenida" aria-label="Capricho Express">
            <Wordmark markSize={30} />
          </Link>
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <Link to="/bienvenida">Inicio</Link>
          </Button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <div className="surface-raised rounded-3xl p-5 sm:p-6">
            <div className="mb-5 flex items-start gap-3">
              <div className="hidden sm:block">
                <BrandMark size={40} />
              </div>
              <div>
                <p className="font-display text-xl font-bold tracking-tight">
                  {mode === "signup" ? "Creá tu cuenta" : "Iniciá sesión"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Con tu correo y tu contraseña. Sin códigos por correo.
                </p>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-border/70 bg-black/25 p-1">
              {(["signup", "signIn"] as Mode[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setMode(option);
                    setError(null);
                  }}
                  className={`cursor-pointer rounded-lg py-2 text-xs font-semibold transition-colors ${
                    mode === option
                      ? "bg-ember-gradient text-black"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option === "signup" ? "Crear cuenta" : "Ya tengo cuenta"}
                </button>
              ))}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleSubmit();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Esta cuenta es de
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {ROLES.map((option) => {
                    const Icon = option.icon;
                    const selected = role === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setRole(option.value);
                          setError(null);
                        }}
                        disabled={saving}
                        className={`cursor-pointer rounded-xl border p-2.5 text-center transition-colors ${
                          selected
                            ? "border-accent/40 bg-accent/[0.07] text-accent"
                            : "border-border/70 bg-card/60 text-muted-foreground hover:border-accent/25"
                        }`}
                      >
                        <Icon className="mx-auto size-4" />
                        <span className="mt-1.5 block text-[10px] font-semibold uppercase tracking-wider">
                          {option.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {role === "business"
                    ? "Tu cuenta de negocio es aparte de la de comprador: sirve para publicar tu local y sus pedidos."
                    : role === "courier"
                      ? "Tu cuenta de repartidor es aparte: sirve para tomar entregas y ver tus ganancias."
                      : "Tu cuenta de comprador sirve para deslizar antojos y confirmar pedidos."}
                </p>
              </div>

              {mode === "signup" && (
                <Field label="Tu nombre" htmlFor="name">
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="Camila Duarte"
                    className="h-11 rounded-xl border border-border/70 bg-card/70 text-sm"
                    disabled={saving}
                    required
                  />
                </Field>
              )}

              <Field label="Tu correo" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="vos@email.com"
                  className="h-11 rounded-xl border border-border/70 bg-card/70 text-sm"
                  disabled={saving}
                  required
                />
              </Field>

              <Field label="Tu contraseña" htmlFor="password">
                <PasswordInput
                  id="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={form.password}
                  onChange={(value) => setForm({ ...form, password: value })}
                  placeholder={mode === "signup" ? "Mínimo 8 caracteres" : "Tu contraseña"}
                  disabled={saving}
                />
              </Field>

              {mode === "signup" && (
                <Field label="Repetí tu contraseña" htmlFor="passwordConfirm">
                  <PasswordInput
                    id="passwordConfirm"
                    autoComplete="new-password"
                    value={form.passwordConfirm}
                    onChange={(value) => setForm({ ...form, passwordConfirm: value })}
                    placeholder="Repetí tu contraseña"
                    disabled={saving}
                  />
                </Field>
              )}

              {mode === "signup" &&
                form.passwordConfirm.length > 0 &&
                form.password !== form.passwordConfirm && (
                  <p className="text-[11px] text-primary">Las contraseñas no coinciden.</p>
                )}

              {error && (
                <p className="rounded-xl border border-primary/30 bg-primary/10 p-2.5 text-xs text-primary">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="h-11 w-full gap-2 bg-ember-gradient text-black"
                disabled={saving || (mode === "signup" ? !signupReady : !signInReady)}
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {mode === "signup" ? "Creando tu cuenta" : "Entrando"}
                  </>
                ) : mode === "signup" ? (
                  "Crear mi cuenta"
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>
          </div>

          <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground">
            Podés mirar el mazo sin cuenta y registrarte recién al confirmar tu
            pedido. Cada rol (comprador, negocio, repartidor) es una cuenta
            aparte con su propio correo y contraseña.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: string;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 rounded-xl border border-border/70 bg-card/70 pr-11 text-sm"
        disabled={disabled}
        required
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        title={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
