import { BrandMark, Wordmark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { useAuth, useAuthActions } from "@/hooks/use-auth";
import { useMutation } from "convex/react";
import { motion } from "framer-motion";
import { KeyRound, Loader2, Mail, Sparkles, UserRound } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";

type Role = "buyer" | "business" | "courier";

export const SIGNUP_ROLES: { value: Role; label: string; description: string }[] = [
  {
    value: "buyer",
    label: "Comprador",
    description: "Deslizá antojos de distintos locales y pedí a domicilio.",
  },
  {
    value: "business",
    label: "Negocio",
    description: "Publicá tu catálogo y gestioná pedidos en tiempo real.",
  },
  {
    value: "courier",
    label: "Repartidor",
    description: "Tomá entregas listas y sumá ganancias por cada entrega.",
  },
];

const ROLE_HOME: Record<Role, string> = {
  buyer: "/swipe",
  business: "/business",
  courier: "/courier",
};

export function resolveRedirectAfterAuth(
  returnTo: string | null,
  role: Role,
  fallback = ROLE_HOME.buyer,
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return ROLE_HOME[role] ?? fallback;
}

function roleFromReturnTo(returnTo: string | null): Role | null {
  if (!returnTo) return null;
  if (returnTo.startsWith("/business")) return "business";
  if (returnTo.startsWith("/courier")) return "courier";
  const requested = new URLSearchParams(returnTo.split("?")[1] ?? "").get("role");
  if (requested === "business" || requested === "courier" || requested === "buyer") {
    return requested;
  }
  return null;
}

interface AuthProps {
  redirectAfterAuth?: string;
}

type Step = "signup" | "signIn" | "code";

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, user } = useAuth();
  const { signIn, signOut } = useAuthActions();
  const register = useMutation(api.accounts.register);
  const verifyPassword = useMutation(api.accounts.verifyPassword);
  const bindCurrentUser = useMutation(api.accounts.bindCurrentUser);
  const [searchParams] = useSearchParams();
  const redirectParam = searchParams.get("returnTo");

  const [step, setStep] = useState<Step>("signup");
  const [role, setRole] = useState<Role>(roleFromReturnTo(redirectParam) ?? "buyer");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    passwordConfirm: "",
    code: "",
  });
  const [pendingEmail, setPendingEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sesiones de invitado viejas: no cuentan como cuenta registrada. Se cierran
  // para que la persona pueda registrarse o entrar con correo y contraseña.
  const isLegacyGuest = Boolean(user?.isAnonymous);

  useEffect(() => {
    if (isLegacyGuest) void signOut();
  }, [isLegacyGuest, signOut]);

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

  if (isAuthenticated && user && !isLegacyGuest) {
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

  const sendCode = async (email: string) => {
    await signIn("email-otp", { email });
    setPendingEmail(email);
    setForm((prev) => ({ ...prev, code: "" }));
    setStep("code");
  };

  const handleSignUp = async () => {
    setSaving(true);
    setError(null);
    try {
      const email = form.email.trim().toLowerCase();
      await register({
        name: form.name,
        email,
        password: form.password,
        passwordConfirm: form.passwordConfirm,
        role,
      });
      await sendCode(email);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No pudimos crear tu cuenta.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSignIn = async () => {
    setSaving(true);
    setError(null);
    try {
      const email = form.email.trim().toLowerCase();
      const account = await verifyPassword({ email, password: form.password });
      setRole(account.role);
      await sendCode(email);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No pudimos iniciar sesión.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCode = async () => {
    setSaving(true);
    setError(null);
    try {
      await signIn("email-otp", {
        email: pendingEmail,
        code: form.code.trim(),
      });
      await bindCurrentUser({ email: pendingEmail });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "El código no es correcto o ya venció.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative min-h-screen px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-30" />
      <div className="mx-auto flex max-w-lg flex-col gap-8">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="Capricho Express">
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
          <div className="mb-6 text-center">
            <div className="mb-4 hidden justify-center lg:flex">
              <BrandMark size={48} />
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
              <Sparkles className="size-3" />
              Capricho Express
            </div>
          </div>

          <div className="surface-raised rounded-3xl p-5 sm:p-6">
            {step === "code" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  handleCode();
                }}
                className="space-y-4"
              >
                <div>
                  <p className="font-display text-lg font-bold">Verificá tu correo</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Te enviamos un código de 6 dígitos a{" "}
                    <span className="font-semibold text-foreground">{pendingEmail}</span>.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="code"
                    className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Código
                  </label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={form.code}
                    onChange={(event) =>
                      setForm({ ...form, code: event.target.value.replace(/\D/g, "") })
                    }
                    placeholder="000000"
                    className="h-11 w-full rounded-xl border border-border/70 bg-card/70 text-center text-lg tracking-[0.4em]"
                    disabled={saving}
                    required
                  />
                </div>

                {error && (
                  <p className="rounded-xl border border-primary/30 bg-primary/10 p-2.5 text-xs text-primary">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  className="h-11 w-full gap-2 bg-ember-gradient text-black"
                  disabled={saving || form.code.length < 6}
                >
                  {saving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Verificando
                    </>
                  ) : (
                    <>
                      <KeyRound className="size-4" />
                      Entrar a mi cuenta
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  disabled={saving}
                  onClick={() => {
                    setError(null);
                    setStep("signIn");
                  }}
                >
                  Usar otro correo
                </Button>
              </form>
            ) : step === "signup" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSignUp();
                }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                    Elegí tu rol
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {SIGNUP_ROLES.map((option) => {
                      const selected = role === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setRole(option.value)}
                          className={`rounded-xl border p-3 text-left transition-colors ${
                            selected
                              ? "border-accent/40 bg-accent/[0.06] text-accent"
                              : "border-border/70 bg-card/70 text-muted-foreground"
                          }`}
                          disabled={saving}
                        >
                          <span className="block text-[11px] font-semibold uppercase tracking-wider">
                            {option.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Field label="Tu nombre" htmlFor="name">
                  <input
                    id="name"
                    type="text"
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="Camila Duarte"
                    className="h-11 w-full rounded-xl border border-border/70 bg-card/70 px-3 text-sm"
                    disabled={saving}
                    required
                  />
                </Field>

                <Field label="Tu correo" htmlFor="email">
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    placeholder="vos@email.com"
                    className="h-11 w-full rounded-xl border border-border/70 bg-card/70 px-3 text-sm"
                    disabled={saving}
                    required
                  />
                </Field>

                <Field label="Contraseña" htmlFor="password">
                  <input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    placeholder="Mínimo 8 caracteres"
                    className="h-11 w-full rounded-xl border border-border/70 bg-card/70 px-3 text-sm"
                    autoComplete="new-password"
                    disabled={saving}
                    required
                    minLength={8}
                  />
                </Field>

                <Field label="Confirmá tu contraseña" htmlFor="passwordConfirm">
                  <input
                    id="passwordConfirm"
                    type="password"
                    value={form.passwordConfirm}
                    onChange={(event) =>
                      setForm({ ...form, passwordConfirm: event.target.value })
                    }
                    placeholder="Repetí tu contraseña"
                    className="h-11 w-full rounded-xl border border-border/70 bg-card/70 px-3 text-sm"
                    autoComplete="new-password"
                    disabled={saving}
                    required
                    minLength={8}
                  />
                </Field>

                {error && (
                  <p className="rounded-xl border border-primary/30 bg-primary/10 p-2.5 text-xs text-primary">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  className="h-11 w-full gap-2 bg-ember-gradient text-black"
                  disabled={
                    saving ||
                    form.password.length < 8 ||
                    form.password !== form.passwordConfirm
                  }
                >
                  {saving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Creando tu cuenta
                    </>
                  ) : (
                    "Crear mi cuenta"
                  )}
                </Button>

                <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                  Te vamos a enviar un código al correo para confirmar la cuenta.
                </p>

                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full gap-2 border-border/80"
                  onClick={() => {
                    setError(null);
                    setStep("signIn");
                  }}
                  disabled={saving}
                >
                  <UserRound className="size-4" />
                  Ya tengo cuenta
                </Button>
              </form>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSignIn();
                }}
                className="space-y-4"
              >
                <div>
                  <p className="font-display text-lg font-bold">Iniciá sesión</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Entrá con el correo y la contraseña con los que te registraste.
                  </p>
                </div>

                <Field label="Tu correo" htmlFor="signInEmail">
                  <Input
                    id="signInEmail"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    placeholder="vos@email.com"
                    className="h-11 w-full rounded-xl border border-border/70 bg-card/70 px-3 text-sm"
                    disabled={saving}
                    required
                  />
                </Field>

                <Field label="Tu contraseña" htmlFor="signInPassword">
                  <input
                    id="signInPassword"
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    placeholder="Tu contraseña"
                    className="h-11 w-full rounded-xl border border-border/70 bg-card/70 px-3 text-sm"
                    autoComplete="current-password"
                    disabled={saving}
                    required
                  />
                </Field>

                {error && (
                  <p className="rounded-xl border border-primary/30 bg-primary/10 p-2.5 text-xs text-primary">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  className="h-11 w-full gap-2 bg-ember-gradient text-black"
                  disabled={saving || form.email.length === 0 || form.password.length === 0}
                >
                  {saving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Enviando código
                    </>
                  ) : (
                    <>
                      <Mail className="size-4" />
                      Entrar
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full gap-2 border-border/80"
                  onClick={() => {
                    setError(null);
                    setStep("signup");
                  }}
                  disabled={saving}
                >
                  <UserRound className="size-4" />
                  Registrarme
                </Button>
              </form>
            )}
          </div>

          <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground">
            Cada cuenta elige su rol al registrarse: comprador, negocio o
            repartidor.
          </p>
        </motion.div>
      </div>
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
