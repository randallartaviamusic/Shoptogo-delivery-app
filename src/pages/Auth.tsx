import { BrandMark, Wordmark } from "@/components/Brand";
import { DishImage } from "@/components/DishImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Flame,
  Loader2,
  Mail,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
      setIsLoading(false);
    } catch (submitError) {
      console.error("Email sign-in error:", submitError);
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No pudimos enviar el código. Probá de nuevo.",
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      navigate(redirect);
    } catch (submitError) {
      console.error("OTP verification error:", submitError);
      setError("El código no es correcto. Revisalo e intentá otra vez.");
      setIsLoading(false);
      setOtp("");
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch (guestError) {
      console.error("Guest login error:", guestError);
      setError(
        guestError instanceof Error
          ? `No pudimos entrar como invitado: ${guestError.message}`
          : "No pudimos entrar como invitado.",
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-border/60 bg-[radial-gradient(ellipse_at_top_left,rgba(255,45,85,0.22),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(255,201,60,0.12),transparent_55%)] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 grid-lines opacity-30" />
        <Link to="/" className="relative w-fit">
          <Wordmark markSize={38} />
        </Link>

        <div className="relative max-w-md">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-accent"
          >
            <Sparkles className="size-3" />
            El delivery que se desliza
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="mt-5 font-display text-4xl font-extrabold leading-[1.05] tracking-tight xl:text-5xl"
          >
            Un swipe y el
            <br />
            antojo está
            <br />
            <span className="text-gradient-whim">en camino.</span>
          </motion.h2>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Comprá deslizando, vendé tu carta al azar de la ciudad o tomá
            entregas cuando te convenga. Todo en la misma cuenta.
          </p>

          <div className="mt-8 flex gap-2">
            {[
              {
                image:
                  "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80",
              },
              {
                image:
                  "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=400&q=80",
              },
              {
                image:
                  "https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=400&q=80",
              },
            ].map((dish) => (
              <DishImage
                key={dish.image}
                src={dish.image}
                alt="Antojo Whimy"
                className="size-20 rounded-2xl border border-white/10"
              />
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-3 rounded-2xl border border-border/70 bg-black/30 p-4 text-xs text-muted-foreground backdrop-blur">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Flame className="size-4" />
          </span>
          <p>
            <span className="font-semibold text-foreground">40+ antojos</span> de
            10 locales esperando tu decisión. Sin menús infinitos.
          </p>
        </div>
      </aside>

      <main className="relative flex min-h-screen flex-col px-4 py-8 sm:px-8">
        <div className="flex items-center justify-between lg:hidden">
          <Link to="/">
            <Wordmark markSize={32} />
          </Link>
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <Link to="/">
              <ArrowLeft className="size-4" />
              Inicio
            </Link>
          </Button>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="w-full max-w-[400px]"
          >
            <div className="mb-6 text-center">
              <div className="mb-4 hidden justify-center lg:flex">
                <BrandMark size={52} />
              </div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight">
                {step === "signIn" ? "Entrá a Whimy" : "Revisá tu email"}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {step === "signIn"
                  ? "Un código por mail y listo. Sin contraseñas."
                  : `Te mandamos un código de 6 dígitos a ${step.email}`}
              </p>
            </div>

            <div className="surface-raised rounded-3xl p-5 sm:p-6">
              {step === "signIn" ? (
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="email"
                      className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      Tu email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 size-4 text-muted-foreground" />
                      <Input
                        id="email"
                        name="email"
                        placeholder="vos@email.com"
                        type="email"
                        className="h-11 pl-9"
                        disabled={isLoading}
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
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Enviando código
                      </>
                    ) : (
                      <>
                        Recibir código
                        <ArrowRight className="size-4" />
                      </>
                    )}
                  </Button>

                  <div className="relative py-1">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border/70" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-card px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                        o probá sin cuenta
                      </span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full gap-2 border-border/80"
                    onClick={handleGuestLogin}
                    disabled={isLoading}
                  >
                    <UserRound className="size-4 text-accent" />
                    Entrar como invitado
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleOtpSubmit} className="space-y-4">
                  <input type="hidden" name="email" value={step.email} />
                  <input type="hidden" name="code" value={otp} />

                  <div className="flex justify-center">
                    <InputOTP
                      value={otp}
                      onChange={setOtp}
                      maxLength={6}
                      disabled={isLoading}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && otp.length === 6 && !isLoading) {
                          const form = (event.target as HTMLElement).closest("form");
                          form?.requestSubmit();
                        }
                      }}
                    >
                      <InputOTPGroup>
                        {Array.from({ length: 6 }).map((_, index) => (
                          <InputOTPSlot key={index} index={index} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  {error && (
                    <p className="rounded-xl border border-primary/30 bg-primary/10 p-2.5 text-center text-xs text-primary">
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    className="h-11 w-full gap-2 bg-ember-gradient text-black"
                    disabled={isLoading || otp.length !== 6}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Verificando
                      </>
                    ) : (
                      <>
                        Verificar y entrar
                        <ArrowRight className="size-4" />
                      </>
                    )}
                  </Button>

                  <div className="flex flex-col gap-1 text-center">
                    <button
                      type="button"
                      className="text-xs font-semibold text-accent hover:underline"
                      onClick={() => {
                        setStep("signIn");
                        setOtp("");
                        setError(null);
                      }}
                    >
                      Usar otro email
                    </button>
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setStep("signIn");
                        setOtp("");
                        setError(null);
                      }}
                    >
                      ¿No te llegó? Reintentar
                    </button>
                  </div>
                </form>
              )}
            </div>

            <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground">
              Al continuar aceptás los términos de Whimy. Después de entrar
              elegís si comprás, vendés o repartís.
            </p>
            <div className="mt-4 flex justify-center lg:hidden">
              <Link
                to="/"
                className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
              >
                Volver al inicio
              </Link>
            </div>
          </motion.div>
        </div>
      </main>
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
