import { BrandMark, Wordmark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { useAuth, useAuthActions } from "@/hooks/use-auth";
import { useMutation } from "convex/react";
import { motion } from "framer-motion";
import { Sparkles, Mail, UserRound } from "lucide-react";
import { Suspense, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

export const SIGNUP_ROLES = [
  {
    value: "buyer" as const,
    label: "Comprador",
    description: "Deslizá antojos de distintos locales y pedí a domicilio.",
    icon: "ShoppingBag",
  },
  {
    value: "business" as const,
    label: "Negocio",
    description: "Publicá tu catálogo y gestioná pedidos en tiempo real.",
    icon: "Store",
  },
  {
    value: "courier" as const,
    label: "Repartidor",
    description: "Tomá entregas listas y sumá ganancias por cada entrega.",
    icon: "Bike",
  },
] as const;

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  role: "buyer" | "business" | "courier",
  fallback = "/swipe",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return role === "buyer" ? "/swipe" : role === "business" ? "/business" : "/courier";
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const {
    isLoading: authLoading,
    isAuthenticated,
    user,
  } = useAuth();
  const { signIn } = useAuthActions();
  const createAccount = useMutation(api.profiles.createAccount);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectParam = searchParams.get("returnTo");

  const [mode, setMode] = useState<"signup" | "signIn">("signup");
  const [role, setRole] = useState<"buyer" | "business" | "courier">("buyer");
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    password: "",
    passwordConfirm: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirect = resolveRedirectAfterAuth(
    redirectParam,
    role,
    redirectAfterAuth,
  );

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Sparkles className="size-6 animate-spin text-primary" />
      </main>
    );
  }

  if (isAuthenticated && user) {
    const next = resolveRedirectAfterAuth(
      redirectParam,
      (user.role as "buyer" | "business" | "courier") ?? "buyer",
      redirectAfterAuth,
    );
    navigate(next, { replace: true });
    return null;
  }

  return (
    <div className="relative min-h-screen px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-30" />
      <div className="mx-auto flex max-w-lg flex-col gap-8">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="Capricho Express">
            <Wordmark markSize={30} />
          </Link>

          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <Link to="/">
              <motion.span
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
              >
                Inicio
              </motion.span>
            </Link>
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
            {mode === "signup" ? (
              <SignUpCard
                role={role}
                profile={profile}
                setProfile={setProfile}
                setRole={setRole}
                saving={saving}
                error={error}
                setError={setError}
                onSubmit={async (profile) => {
                  setSaving(true);
                  setError(null);
                  try {
                    await createAccount({ ...profile, role });
                    navigate(redirect, { replace: true });
                  } catch (submitError) {
                    setError(
                      submitError instanceof Error
                        ? submitError.message
                        : "No pudimos crear tu cuenta.",
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
                onSwitchToSignIn={() => setMode("signIn")}
              />
            ) : (
              <SignInCard
                email={profile.email}
                setEmail={(email) => setProfile({ ...profile, email })}
                saving={saving}
                error={error}
                setError={setError}
                onSubmit={async (email) => {
                  setSaving(true);
                  setError(null);
                  try {
                    await signIn("email-otp", { email });
                    setMode("signIn");
                  } catch (submitError) {
                    setError(
                      submitError instanceof Error
                        ? submitError.message
                        : "No pudimos enviar el código.",
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
                onSwitchToSignUp={() => setMode("signup")}
              />
            )}
          </div>

          <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground">
            Al continuar aceptás los términos de Capricho Express. Cada cuenta
            comienza eligiendo tu rol: es la misma cuenta, podés cambiarlo luego
            desde tu perfil.
          </p>
        </motion.div>
      </div>
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

function SignUpCard({
  role,
  profile,
  setProfile,
  setRole,
  saving,
  error,
  setError,
  onSubmit,
  onSwitchToSignIn,
}: {
  role: "buyer" | "business" | "courier";
  profile: {
    name: string;
    email: string;
    password: string;
    passwordConfirm: string;
  };
  setProfile: (next: {
    name: string;
    email: string;
    password: string;
    passwordConfirm: string;
  }) => void;
  setRole: (next: "buyer" | "business" | "courier") => void;
  saving: boolean;
  error: string | null;
  setError: (next: string | null) => void;
  onSubmit: (profile: {
    name: string;
    email: string;
    password: string;
    passwordConfirm: string;
  }) => Promise<void>;
  onSwitchToSignIn: () => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(profile);
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
                className={`
                  rounded-xl border p-3 text-left transition-colors
                  ${selected
                    ? "border-accent/40 bg-accent/[0.06] text-accent"
                    : "border-border/70 bg-card/70 text-muted-foreground"
                  }
                `}
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

      <div className="space-y-1.5">
        <label
          htmlFor="name"
          className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Tu nombre
        </label>
        <input
          id="name"
          type="text"
          value={profile.name}
          onChange={(event) =>
            setProfile({ ...profile, name: event.target.value })
          }
          placeholder="Camila Duarte"
          className="h-11 w-full rounded-xl border border-border/70 bg-card/70 px-3 text-sm "
          disabled={saving}
          required
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="email"
          className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Tu email
        </label>
        <div className="relative">
          <Input
            id="email"
            type="email"
            value={profile.email}
            onChange={(event) =>
              setProfile({ ...profile, email: event.target.value })
            }
            placeholder="vos@email.com"
            className="h-11 w-full rounded-xl border border-border/70 bg-card/70 pl-9 text-sm "
            disabled={saving}
            required
          />
        </div>
      </div>

      <div className="grid gap-3">
        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            value={profile.password}
            onChange={(event) =>
              setProfile({ ...profile, password: event.target.value })
            }
            placeholder="Mínimo 8 caracteres"
            className="h-11 w-full rounded-xl border border-border/70 bg-card/70 px-3 text-sm "
            disabled={saving}
            required
            minLength={8}
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="passwordConfirm"
            className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Confirmá tu contraseña
          </label>
          <input
            id="passwordConfirm"
            type="password"
            value={profile.passwordConfirm}
            onChange={(event) =>
              setProfile({ ...profile, passwordConfirm: event.target.value })
            }
            placeholder="Repetí tu contraseña"
            className="h-11 w-full rounded-xl border border-border/70 bg-card/70 px-3 text-sm "
            disabled={saving}
            required
          />
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-primary/30 bg-primary/10 p-2.5 text-xs text-primary">
          {error}
        </p>
      )}

      <Button
        type="submit"
        className="h-11 w-full gap-2 bg-ember-gradient text-black"
        disabled={saving || profile.password !== profile.passwordConfirm}
      >
        {saving ? (
          <>
            <Sparkles className="size-4 animate-spin" />
            Creando tu cuenta
          </>
        ) : (
          <>
            Crear mi cuenta
          </>
        )}
      </Button>

      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border/70" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-card px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            ya tenés cuenta
          </span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="h-11 w-full gap-2 border-border/80"
        onClick={onSwitchToSignIn}
        disabled={saving}
      >
        <Mail className="size-4" />
        Enviarme un código
      </Button>
    </form>
  );
}

function SignInCard({
  email,
  setEmail,
  saving,
  error,
  setError,
  onSubmit,
  onSwitchToSignUp,
}: {
  email: string;
  setEmail: (next: string) => void;
  saving: boolean;
  error: string | null;
  setError: (next: string | null) => void;
  onSubmit: (email: string) => Promise<void>;
  onSwitchToSignUp: () => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(email);
      }}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <label
          htmlFor="signInEmail"
          className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Tu email
        </label>
        <div className="relative">
          <Input
            id="signInEmail"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="vos@email.com"
            className="h-11 w-full rounded-xl border border-border/70 bg-card/70 pl-9 text-sm "
            disabled={saving}
            required
          />
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-primary/30 bg-primary/10 p-2.5 text-xs text-primary">
          {error}
        </p>
      )}

      <Button
        type="submit"
        className="h-11 w-full gap-2 bg-ember-gradient text-black"
        disabled={saving || email.length === 0}
      >
        {saving ? (
          <>
            <Sparkles className="size-4 animate-spin" />
            Enviando código
          </>
        ) : (
          <>
            Recibir código
          </>
        )}
      </Button>

      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border/70" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-card px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            no tenés cuenta
          </span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="h-11 w-full gap-2 border-border/80"
        onClick={onSwitchToSignUp}
        disabled={saving}
      >
        <UserRound className="size-4" />
        Crear mi cuenta
      </Button>
    </form>
  );
}
