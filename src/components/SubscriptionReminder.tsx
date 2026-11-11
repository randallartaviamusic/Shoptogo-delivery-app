import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import {
  SUBSCRIPTION_STATUS_META,
  SUSPENDED_CAPABILITIES,
  countdownText,
  formatExpiry,
  planOf,
  reminderSoundId,
} from "@/lib/subscriptions";
import { playReminderSound } from "@/lib/reminderSounds";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { AlarmClock, ChevronRight, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

/**
 * Aviso de suscripción en los paneles de negocio y repartidor, con cuenta
 * regresiva y el sonido de recordatorio que eligió la persona.
 */
export function SubscriptionReminder() {
  const data = useQuery(api.subscriptions.mine);
  const [now, setNow] = useState(Date.now());
  const played = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const status = data?.status;
  const activeUntil = data?.activeUntil ?? null;
  const needsReminder =
    status === "expiring" ||
    status === "grace" ||
    status === "expired" ||
    status === "none";
  const sound = reminderSoundId(data?.reminderSound);

  // Un solo aviso sonoro por sesión y por vencimiento.
  useEffect(() => {
    if (!data || !needsReminder || data.reminderEnabled === false) return;
    if (played.current) return;
    played.current = true;
    const key = `capricho:reminder:${activeUntil ?? "none"}`;
    try {
      if (window.sessionStorage.getItem(key) === "played") return;
      window.sessionStorage.setItem(key, "played");
    } catch {
      // Si el navegador bloquea el almacenamiento, igual intentamos una vez.
    }
    void playReminderSound(sound);
  }, [data, needsReminder, activeUntil, sound]);

  if (!data || !needsReminder) return null;

  const meta = SUBSCRIPTION_STATUS_META[data.status];
  const expired = data.status === "expired" || data.status === "none";
  const remaining = activeUntil ? activeUntil - now : 0;

  return (
    <div
      className={cn(
        "mb-4 flex flex-col gap-3 rounded-2xl border p-3.5 sm:flex-row sm:items-center sm:justify-between",
        expired
          ? "border-primary/40 bg-primary/[0.08]"
          : "border-accent/40 bg-accent/[0.07]",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl",
            expired ? "bg-primary/15 text-primary" : "bg-accent/15 text-accent",
          )}
        >
          <AlarmClock className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className={expired ? "text-primary" : "text-accent"}>
              {meta.label}
            </span>
            <span className="text-muted-foreground">
              · {data.plan ? `Plan ${planOf(data.plan).name}` : "Sin plan elegido"}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {meta.hint}
            {!data.hasAccess && ` ${SUSPENDED_CAPABILITIES[data.role][0]}`}
          </p>
          {activeUntil && (
            <p className="mt-1 font-display text-sm font-bold tabular-nums">
              {countdownText(remaining)}
              <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                · vence {formatExpiry(activeUntil)}
              </span>
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => void playReminderSound(sound)}
        >
          <Volume2 className="size-3.5" />
          Recordatorio
        </Button>
        <Button
          asChild
          size="sm"
          className={expired ? "bg-primary text-primary-foreground" : "bg-ember-gradient text-black"}
        >
          <Link to="/suscripcion">
            {data.hasAccess ? "Renovar" : "Activar plan"}
            <ChevronRight className="size-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
