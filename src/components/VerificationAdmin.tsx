import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  isValidCostaRicaId,
  isValidCostaRicaPhone,
  VERIFICATION_META,
} from "@/lib/trust";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  BadgeCheck,
  CheckCircle2,
  Loader2,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const TONE: Record<string, string> = {
  muted: "border-border/80 bg-secondary/50 text-muted-foreground",
  ember: "border-accent/40 bg-accent/10 text-accent",
  green: "border-accent/40 bg-accent/10 text-accent",
  chili: "border-primary/40 bg-primary/10 text-primary",
};

const date = new Intl.DateTimeFormat("es-CR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Costa_Rica",
});

/** Cola de verificación de negocios y repartidores. */
export function VerificationAdmin() {
  const [search, setSearch] = useState("");
  const queue = useQuery(api.verification.adminQueue, { search });
  const review = useMutation(api.verification.adminReview);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const handleReview = async (userId: string, approve: boolean) => {
    setBusy(userId);
    try {
      await review({
        userId: userId as Id<"users">,
        approve,
        note: notes[userId] || undefined,
      });
      toast.success(
        approve ? "Cuenta verificada" : "Verificación rechazada",
        {
          description: approve
            ? "El sello de confianza ya se muestra en la cuenta y en el local."
            : "La persona ve la nota y puede corregir sus datos.",
        },
      );
      setNotes((current) => ({ ...current, [userId]: "" }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos revisar la cuenta",
      );
    } finally {
      setBusy(null);
    }
  };

  if (queue === undefined) {
    return (
      <section className="surface-raised mt-5 rounded-3xl p-5">
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  return (
    <section className="surface-raised mt-5 rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
            <ShieldCheck className="size-3.5" /> Perfil administrador
          </p>
          <h2 className="font-display text-lg font-bold">Verificación de cuentas</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Las cuentas confirmadas por SMS y registro civil se activan automáticamente. Esta cola queda sólo para excepciones, fallas de proveedor, datos incompletos y revisiones de negocio o vehículo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 font-semibold text-accent">
            {queue.totals.pending} en revisión
          </span>
          <span className="rounded-full border border-border/80 bg-secondary/40 px-2.5 py-1 text-muted-foreground">
            {queue.totals.verified} verificadas
          </span>
          <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-semibold text-primary">
            {queue.totals.rejected + queue.totals.unverified} pendientes
          </span>
        </div>
      </div>

      <div className="relative mt-4 sm:max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nombre, correo, teléfono o local"
          className="h-9 pl-8 text-xs"
        />
      </div>

      {queue.accounts.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
          No hay cuentas que coincidan con la búsqueda.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {queue.accounts.slice(0, 40).map((account) => {
            const meta = VERIFICATION_META[account.status];
            const canApprove =
              isValidCostaRicaPhone(account.phone) &&
              isValidCostaRicaId(account.idNumber) &&
              (account.role !== "courier" || (account.vehicle ?? "").length >= 3);
            return (
              <li
                key={account.userId}
                className="rounded-xl border border-border/70 bg-black/20 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">
                      {account.businessName ?? account.name ?? "Cuenta"}
                      <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                        {account.role === "business" ? "Negocio" : "Repartidor"}
                      </span>
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {[account.name, account.email, account.phone]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Cédula: {account.idNumber ?? "sin dato"}
                      {account.role === "courier"
                        ? ` · Vehículo: ${account.vehicle ?? "sin dato"}`
                        : ""}
                      {account.businessAddress ? ` · ${account.businessAddress}` : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {account.submittedAt
                        ? `Enviada ${date.format(account.submittedAt)}`
                        : "Sin enviar"}
                      {account.rating !== null
                        ? ` · ⭐ ${account.rating.toFixed(1)} (${account.reviews})`
                        : ""}
                    </p>
                    {account.note && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Nota: {account.note}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                      TONE[meta.tone],
                    )}
                  >
                    {meta.label}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input
                    value={notes[account.userId] ?? ""}
                    onChange={(event) =>
                      setNotes((current) => ({
                        ...current,
                        [account.userId]: event.target.value,
                      }))
                    }
                    placeholder="Nota de revisión (opcional)"
                    className="h-8 max-w-xs text-xs"
                  />
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
                    disabled={busy === account.userId || !canApprove}
                    title={
                      canApprove
                        ? undefined
                        : "Faltan teléfono, cédula o vehículo válidos"
                    }
                    onClick={() => void handleReview(account.userId, true)}
                  >
                    {busy === account.userId ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-3.5" />
                    )}
                    Verificar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                    disabled={busy === account.userId}
                    onClick={() => void handleReview(account.userId, false)}
                  >
                    <X className="size-3.5" />
                    Rechazar
                  </Button>
                  {account.status === "verified" && (
                    <span className="flex items-center gap-1 text-[10px] text-accent">
                      <BadgeCheck className="size-3.5" /> Verificada
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
