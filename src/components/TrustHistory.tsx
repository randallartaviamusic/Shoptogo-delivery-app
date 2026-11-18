import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { CASH_ISSUE_LABELS } from "@/lib/cash";
import { money, ORDER_STATUS, relativeTime } from "@/lib/format";
import { VERIFICATION_META } from "@/lib/trust";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import {
  ArrowRight,
  BadgeCheck,
  PackageCheck,
  CircleSlash,
  History,
  ShieldAlert,
  Star,
  Wallet,
} from "lucide-react";
import { Link } from "react-router";

const HISTORY_HOME: Record<string, string> = {
  buyer: "/orders",
  business: "/business?tab=orders",
  courier: "/courier?tab=history",
};

const TONE: Record<string, string> = {
  muted: "border-border/80 bg-secondary/50 text-muted-foreground",
  ember: "border-accent/40 bg-accent/10 text-accent",
  green: "border-accent/40 bg-accent/10 text-accent",
  chili: "border-primary/40 bg-primary/10 text-primary",
};

/** Resumen de pedidos, cancelaciones e incidencias para dar contexto y confianza. */
export function TrustHistory() {
  const data = useQuery(api.trust.overview);
  if (!data) return null;

  const verification =
    data.verificationStatus !== null
      ? VERIFICATION_META[data.verificationStatus]
      : null;

  return (
    <section className="surface-raised mt-5 rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
            <History className="size-3.5" /> Historial y confianza
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-bold">
              Tu actividad en Capricho Express
            </h2>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                data.standing.level === "restricted"
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : data.standing.level === "watch"
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-border/70 bg-secondary/40 text-muted-foreground",
              )}
            >
              {data.standing.label}
            </span>
          </div>
          <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-muted-foreground">
            {data.standing.hint}
          </p>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Todo lo importante queda registrado: entregas, cancelaciones,
            incidencias de efectivo y calificaciones.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {verification && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
                TONE[verification.tone],
              )}
            >
              <BadgeCheck className="size-3" />
              {verification.label}
            </span>
          )}
          {data.rating !== null && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] font-bold text-accent">
              <Star className="size-3 fill-current" />
              {data.rating.toFixed(1)} · {data.reviews}{" "}
              {data.role === "buyer" ? "calificaciones dadas" : "calificaciones"}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Pedidos", value: String(data.totals.orders) },
          { label: "Entregados", value: String(data.totals.delivered) },
          { label: "Cancelados", value: String(data.totals.cancelled) },
          { label: "Incidencias", value: String(data.totals.incidents) },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-border/70 bg-black/20 px-3 py-3 text-center"
          >
            <p className="font-display text-xl font-extrabold">{stat.value}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-black/20 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
            <CircleSlash className="size-3.5" /> Cancelaciones recientes
          </p>
          {data.recentCancellations.length === 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              No hay cancelaciones registradas.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {data.recentCancellations.map((order) => (
                <li key={order._id} className="text-[11px] leading-relaxed">
                  <p className="font-semibold">
                    {order.code} · {money(order.total)}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {relativeTime(order.cancelledAt)}
                    </span>
                  </p>
                  <p className="text-muted-foreground">
                    {order.actorLabel} · {order.reason}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border/70 bg-black/20 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
            <Wallet className="size-3.5" /> Incidencias de efectivo
          </p>
          {data.recentIncidents.length === 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              No hay incidencias de efectivo.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {data.recentIncidents.map((issue) => (
                <li key={issue._id} className="text-[11px] leading-relaxed">
                  <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                    {issue.code} · {CASH_ISSUE_LABELS[issue.kind]?.label ?? issue.kind}
                    {issue.resolvedAt ? (
                      <span className="rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent">
                        Resuelta
                      </span>
                    ) : (
                      <span className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                        Abierta
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground">
                    {money(issue.amount)} · {issue.note}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {data.role === "buyer" && (
        <p className="mt-3 text-[10px] text-muted-foreground">
          En los últimos 30 días: {data.totals.cancelledByBuyer} canceladas por vos · {data.totals.cancelledByBusiness} por el local · {data.totals.cancelledBySystem} automáticamente.
        </p>
      )}

      <div className="mt-4">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
          <ShieldAlert className="size-3.5" /> Últimos pedidos
        </p>
        {data.recentOrders.length === 0 ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Todavía no hay pedidos en este historial.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border/60 rounded-xl border border-border/70">
            {data.recentOrders.map((order) => (
              <li
                key={order._id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[11px]"
              >
                <span className="font-semibold">
                  {order.code}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {relativeTime(order.createdAt)} · {money(order.total)}
                  </span>
                </span>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                    order.status === "delivered"
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : order.status === "cancelled"
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/80 bg-secondary/40 text-muted-foreground",
                  )}
                >
                  {ORDER_STATUS[order.status].label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm" className="gap-1.5 border-border/80">
          <Link to={HISTORY_HOME[data.role] ?? "/orders"}>
            Ver historial completo <ArrowRight className="size-3.5" />
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <Link to="/ayuda">
            Ayuda y reportes
            {data.totals.openTickets > 0
              ? ` · ${data.totals.openTickets} abierto${data.totals.openTickets === 1 ? "" : "s"}`
              : ""}
          </Link>
        </Button>
      </div>
    </section>
  );
}
