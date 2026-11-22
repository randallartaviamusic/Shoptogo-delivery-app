import { cn } from "@/lib/utils";
import { Crown, Zap } from "lucide-react";
import { useEffect, useState } from "react";

export type FlashSale = {
  title: string;
  detail: string;
  endsAt: number;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Elige el local de la semana de forma estable: rota cada 7 días. */
export function weeklySpotlight<T extends { _id: string }>(items: T[], now = Date.now()): T | null {
  if (items.length === 0) return null;
  const ordered = [...items].sort((a, b) =>
    String(a._id).localeCompare(String(b._id)),
  );
  return ordered[Math.floor(now / WEEK_MS) % ordered.length] ?? null;
}

function remainingText(endsAt: number, now: number) {
  const ms = Math.max(0, endsAt - now);
  if (ms <= 0) return "Terminó";
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `Termina en ${hours}h ${minutes}m`;
  if (minutes > 0) return `Termina en ${minutes}m ${seconds}s`;
  return `Termina en ${seconds}s`;
}

/** Cuenta regresiva viva de la oferta flash. */
export function FlashCountdown({
  endsAt,
  className,
}: {
  endsAt: number;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt - Date.now() <= 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [endsAt]);
  return (
    <span className={cn("tabular-nums", className)}>
      {remainingText(endsAt, now)}
    </span>
  );
}

/** Sello Élite verificado: plan Élite vigente + cuenta verificada. */
export function EliteVerifiedSeal({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-300/15 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-amber-200",
        className,
      )}
    >
      <Crown className="size-2.5" />
      Élite verificado
    </span>
  );
}

/** Insignia compacta de oferta flash con cuenta regresiva. */
export function FlashSaleBadge({
  flash,
  className,
}: {
  flash: FlashSale;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-amber-300/50 bg-amber-300/10 px-2.5 py-1 text-[10px] font-bold text-amber-200",
        className,
      )}
    >
      <Zap className="size-3 shrink-0" />
      <span className="truncate">{flash.title}</span>
      <FlashCountdown
        endsAt={flash.endsAt}
        className="shrink-0 font-semibold text-amber-100/90"
      />
    </span>
  );
}
