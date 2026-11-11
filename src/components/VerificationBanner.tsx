import { api } from "@/convex/_generated/api";
import { VERIFICATION_META, verificationOf } from "@/lib/trust";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { ChevronRight, ShieldAlert, ShieldCheck } from "lucide-react";
import { Link } from "react-router";

/** Aviso operativo: sin verificación no se reciben pedidos ni se toman entregas. */
export function VerificationBanner() {
  const data = useQuery(api.verification.mine);
  if (!data || data.status === "verified") return null;

  const pending = data.status === "pending";
  const meta = VERIFICATION_META[verificationOf(data.status)];

  return (
    <div
      className={cn(
        "mb-4 flex flex-col gap-3 rounded-2xl border p-3.5 sm:flex-row sm:items-center sm:justify-between",
        pending
          ? "border-accent/40 bg-accent/[0.07]"
          : "border-primary/40 bg-primary/[0.08]",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl",
            pending ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary",
          )}
        >
          {pending ? (
            <ShieldCheck className="size-4" />
          ) : (
            <ShieldAlert className="size-4" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold">
            {meta.label} · {data.role === "business" ? "tu local" : "tu cuenta de repartidor"}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {pending
              ? "La administración está revisando tus datos. Mientras tanto, la operación con pedidos queda en pausa."
              : data.role === "business"
                ? "Tu local no aparece en el catálogo ni recibe pedidos nuevos hasta completar la verificación."
                : "No podés tomar entregas hasta completar la verificación de tu cuenta."}
          </p>
        </div>
      </div>
      <Link
        to="/profile#verificacion"
        className="flex shrink-0 items-center gap-1 self-start rounded-full border border-border/80 px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:border-accent/40 sm:self-auto"
      >
        {pending ? "Ver estado" : "Verificar ahora"}
        <ChevronRight className="size-3.5" />
      </Link>
    </div>
  );
}
