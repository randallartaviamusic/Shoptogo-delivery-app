import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { ASSIGNMENT_RULES } from "@/lib/delivery";
import { money } from "@/lib/format";
import { useQuery } from "convex/react";
import { Activity, Bike, Clock3, Loader2, Store, TrendingUp } from "lucide-react";
import { useState } from "react";

const percent = (value: number | null) =>
  value === null ? "—" : `${Math.round(value * 100)}%`;
const duration = (value: number | null) =>
  value === null ? "—" : `${Math.round(value)} min`;
const dateTime = (value: number) =>
  new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Costa_Rica",
  }).format(value);

function Metric({ label, value, hint, icon: Icon }: {
  label: string;
  value: string;
  hint: string;
  icon: typeof TrendingUp;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-black/25 p-4">
      <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}<Icon className="size-4 text-accent" />
      </div>
      <p className="mt-2 font-display text-xl font-extrabold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

export function AdminMetrics() {
  const [days, setDays] = useState<7 | 30>(7);
  const data = useQuery(api.admin.analytics, { days });
  if (data === undefined) {
    return <section className="surface-raised mt-5 rounded-3xl p-6"><div className="flex h-28 items-center justify-center"><Loader2 className="size-5 animate-spin text-accent" /></div></section>;
  }

  const maxOrders = Math.max(1, ...data.ordersByHour.map((row) => row.orders));
  return (
    <section className="surface-raised mt-5 rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent"><TrendingUp className="size-3.5" />Tendencias de la plataforma</p>
          <h2 className="font-display text-lg font-bold">Rendimiento y operación</h2>
          <p className="mt-1 text-xs text-muted-foreground">GMV y actividad de los últimos {days} días · pedidos por hora de hoy (Costa Rica)</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-border/70 bg-black/20 p-1">
          {([7, 30] as const).map((value) => <Button key={value} size="sm" variant={days === value ? "default" : "ghost"} className="h-7 px-3 text-[11px]" onClick={() => setDays(value)}>{value} días</Button>)}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric label="GMV entregado" value={money(data.metrics.gmv)} hint={`${data.metrics.completedOrders} pedidos completados`} icon={TrendingUp} />
        <Metric label="Cancelación" value={percent(data.metrics.cancellationRate)} hint={`${data.metrics.cancellations} cancelados de ${data.metrics.orders} pedidos creados`} icon={Activity} />
        <Metric label="Tiempo real / promesa" value={`${duration(data.metrics.averageActualMinutes)} / ${duration(data.metrics.averagePromisedMinutes)}`} hint={`${percent(data.metrics.onTimeRate)} dentro de ${ASSIGNMENT_RULES.delayToleranceMinutes} min · demora media ${duration(data.metrics.averageDelayMinutes)} · ${data.metrics.measuredDeliveries} medidos`} icon={Clock3} />
        <Metric label="Repartidores activos" value={String(data.metrics.activeCourierCount)} hint="Ubicación reciente, verificados y habilitados" icon={Bike} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-border/70 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold">Pedidos por hora</h3>
            <span className="text-[10px] text-muted-foreground">Hoy · hora local</span>
          </div>
          <div className="mt-4 flex h-32 items-end gap-1" role="img" aria-label="Gráfico de pedidos por hora de hoy">
            {data.ordersByHour.map((row) => (
              <div key={row.hour} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${row.label}: ${row.orders} pedidos`}>
                <div className="w-full rounded-t bg-accent/80 transition-[height]" style={{ height: `${Math.max(row.orders ? 8 : 2, (row.orders / maxOrders) * 100)}%` }} />
                {row.hour % 3 === 0 && <span className="text-[8px] text-muted-foreground">{String(row.hour).padStart(2, "0")}</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold">Suscripciones por vencer</h3>
            <span className="rounded-full border border-accent/30 px-2 py-0.5 text-[10px] text-accent">7 días · {data.metrics.expiringBusinessCount}</span>
          </div>
          {data.expiringBusinesses.length === 0 ? (
            <p className="mt-4 text-[11px] text-muted-foreground">No hay locales con suscripción por vencer esta semana.</p>
          ) : (
            <ul className="mt-2 max-h-36 space-y-2 overflow-y-auto">
              {data.expiringBusinesses.map((business) => (
                <li key={business.businessId} className="flex items-center justify-between gap-3 border-b border-border/50 pb-2 text-[10px] last:border-0">
                  <span className="flex min-w-0 items-center gap-2"><Store className="size-3 shrink-0 text-accent" /><span className="min-w-0"><span className="block truncate font-semibold">{business.name}</span><span className="text-muted-foreground">{business.ownerName}</span></span></span>
                  <span className="shrink-0 text-right"><span className="block font-semibold text-accent">{business.daysLeft} d</span><span className="text-muted-foreground">{dateTime(business.activeUntil)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="mt-3 text-right text-[9px] text-muted-foreground">Actualizado {dateTime(data.generatedAt)} · entregas de últimos {days} días</p>
    </section>
  );
}
