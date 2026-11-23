import { BrandMark, Wordmark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useAuth, useAuthActions } from "@/hooks/use-auth";
import {
  forgetCredentials,
  loadRememberedCredentials,
  readRememberedEmail,
  rememberCredentials,
  usesNativeCredentialStore,
} from "@/lib/credential-store";
import { motion } from "framer-motion";
import { Bike, Eye, EyeOff, Loader2, ShoppingBag, Store } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";

type Role = "buyer" | "business" | "courier";
type Mode = "signup" | "signIn";

const ROLES: { value: Role; label: string; icon: typeof Store }[] = [
  { value: "buyer", label: "Comprador", icon: ShoppingBag },
  { value: "business", label: "Negocio", icon: Store },
  { value: "courier", label: "Repartidor", icon: Bike },
];

// Apenas inicia sesión (o crea su cuenta) la persona entra al perfil de esa
// cuenta. Si venía de una página puntual —el carrito para confirmar el pedido,
// por ejemplo— esa página manda.
const AFTER_AUTH_FALLBACK = "/profile";
// Volver a estas rutas dejaría a la persona otra vez fuera de su cuenta.
const PUBLIC_RETURNS = ["/", "/auth", "/bienvenida"];

function isRole(value: string | null | undefined): value is Role {
  return value === "buyer" || value === "business" || value === "courier";
}

function resolveRedirectAfterAuth(returnTo: string | null, fallback?: string) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    const base = returnTo.split("?")[0];
    if (!PUBLIC_RETURNS.includes(base)) return returnTo;
  }
  return fallback ?? AFTER_AUTH_FALLBACK;
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

interface AuthProps {
  redirectAfterAuth?: string;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, user } = useAuth();
  const { signIn, signOut } = useAuthActions();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectParam = searchParams.get("returnTo");
  const roleParam = searchParams.get("role");
  // Cambio de rol desde el perfil: hay que cerrar la sesión anterior sin
  // perder el rol ni el modo "Iniciar sesión" elegidos.
  const switchAccount = searchParams.get("switch") === "1";
  const nativeCredentialStore = usesNativeCredentialStore();

  const [remember, setRemember] = useState(true);
  const [mode, setMode] = useState<Mode>(() =>
    searchParams.get("mode") === "signin" ? "signIn" : "signup",
  );
  const [role, setRole] = useState<Role>(roleFromUrl(redirectParam, roleParam));
  const [form, setForm] = useState(() => ({
    name: "",
    email: readRememberedEmail(),
    password: "",
    passwordConfirm: "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [slow, setSlow] = useState(false);
  const switchStarted = useRef(false);
  useEffect(() => {
    if (!authLoading) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [authLoading]);

  useEffect(() => {
    if (!switchAccount || !isAuthenticated || switchStarted.current) return;
    switchStarted.current = true;
    void signOut();
  }, [isAuthenticated, signOut, switchAccount]);

  // En el APK, el correo y la contraseña guardados viajan cifrados desde el
  // Keystore de Android. En la web el correo ya viene del localStorage.
  useEffect(() => {
    if (!nativeCredentialStore) return;
    let cancelled = false;
    void loadRememberedCredentials().then((saved) => {
      if (cancelled || !saved) return;
      setForm((current) => ({
        ...current,
        email: current.email || saved.email,
        password: current.password || saved.password,
      }));
      setRemember(true);
    });
    return () => {
      cancelled = true;
    };
  }, [nativeCredentialStore]);

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

  if (switchAccount && isAuthenticated) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Cerrando la sesión anterior...
        </p>
      </main>
    );
  }

  // Con una cuenta abierta esta pantalla no tiene nada que hacer: sigue de largo.
  if (isAuthenticated && user && !user.isAnonymous) {
    return (
      <Navigate
        to={resolveRedirectAfterAuth(redirectParam, redirectAfterAuth)}
        replace
      />
    );
  }

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    // Si quedó una sesión vieja abierta, el cliente de Convex no vuelve a leer el
    // token por su cuenta: recargamos en el destino ya con la cuenta nueva.
    const hadSession = isAuthenticated;
    const email = form.email.trim().toLowerCase();
    try {
      await signIn("password", {
        email,
        password: form.password,
        role,
        name: form.name,
        flow: mode === "signup" ? "signUp" : "signIn",
      });

      // Guardamos después de que Convex confirmó la cuenta. Si el guardado
      // falla, no bloqueamos la entrada a la app.
      try {
        if (remember) {
          await rememberCredentials(email, form.password, form.name);
        } else {
          await forgetCredentials();
        }
      } catch {
        // El inicio de sesión ya funcionó.
      }

      const destination = resolveRedirectAfterAuth(redirectParam, redirectAfterAuth);
      const target = destination === "/cart" ? "/cart?confirm=1" : destination;
      if (hadSession) {
        window.location.replace(target);
      } else {
        navigate(target, { replace: true });
      }
    } catch (submitError) {
      setError(friendlyError(submitError, mode));
    } finally {
      setSaving(false);
    }
  };

  const signupReady =
    form.name.trim().length > 0 &&
    form.email.includes("@") &&
    form.password.length > 0 &&
    form.password === form.passwordConfirm;
  const signInReady = form.email.includes("@") && form.password.length > 0;

  return (
    <div className="relative min-h-screen w-full max-w-full min-w-0 overflow-x-clip px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-30" />
      <div className="mx-auto flex max-w-lg flex-col gap-8">
        <div className="flex items-center justify-between">
          <Link to="/bienvenida" aria-label="Shop To Go">
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
                  {option === "signup" ? "Crear cuenta" : "Iniciar sesión"}
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
                    name="name"
                    autoComplete="name"
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
                  name="email"
                  type="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
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
                  name="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={form.password}
                  onChange={(value) => setForm({ ...form, password: value })}
                  placeholder={mode === "signup" ? "Mínimo 8 caracteres" : "Tu contraseña"}
                  disabled={saving}
                />
                {mode === "signup" &&
                  form.password.length > 0 &&
                  form.password.length < 8 && (
                    <p className="text-[11px] text-muted-foreground">
                      La contraseña necesita al menos 8 caracteres.
                    </p>
                  )}
              </Field>

              {mode === "signup" && (
                <Field label="Repetí tu contraseña" htmlFor="passwordConfirm">
                  <PasswordInput
                    id="passwordConfirm"
                    name="passwordConfirm"
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

              <label
                htmlFor="remember-credentials"
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-card/40 p-3"
              >
                <Checkbox
                  id="remember-credentials"
                  checked={remember}
                  onCheckedChange={(checked) => {
                    const next = checked === true;
                    setRemember(next);
                    if (!next) void forgetCredentials();
                  }}
                  disabled={saving}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-foreground">
                    Guardar correo y contraseña
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                    {nativeCredentialStore
                      ? "Se guardan cifrados en este teléfono para entrar más rápido la próxima vez."
                      : "Guardamos tu correo y usamos el gestor de contraseñas de tu navegador."}
                  </span>
                </span>
              </label>

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
            Tu cuenta se crea con correo y contraseña, sin códigos por mail.
            Cada rol (comprador, negocio, repartidor) es una cuenta aparte con
            su propio correo.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function PasswordInput({
  id,
  name,
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled,
}: {
  id: string;
  name: string;
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
        name={name}
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
