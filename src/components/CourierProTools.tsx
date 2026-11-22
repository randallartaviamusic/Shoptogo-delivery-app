import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ASSIGNMENT_RULES, formatKm } from "@/lib/delivery";
import { BUSINESS_DAY_LABELS, BUSINESS_DAY_ORDER } from "@/lib/hours";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useConvex, useMutation, useQuery } from "convex/react";
import {
  CalendarClock,
  Crown,
  Download,
  Flame,
  Loader2,
  LocateFixed,
  Radar,
  Volume2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

type ActiveOrder = {
  _id: string;
  code: string;
  businessName: string;
  status: string;
};

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Herramientas Pro y Élite del repartidor: radar de zona caliente, ofertas
 * cercanas con sonido, turnos programados, reasignación rápida y exportación
 * mensual de caja.
 */
export function CourierProTools({ activeOrders }: { activeOrders: ActiveOrder[] }) {
  const convex = useConvex();
  const prefs = useQuery(api.couriers.preferences);
  const hotspots = useQuery(
    api.couriers.hotspots,
    prefs?.pro ? {} : "skip",
  );
  const savePreferences = useMutation(api.couriers.savePreferences);
  const requestReassign = useMutation(api.orders.courierRequestReassign);
  const [saving, setSaving] = useState(false);
  const [reassigning, setReassigning] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [month, setMonth] = useState(currentMonth());
  const [radius, setRadius] = useState<number>(
    ASSIGNMENT_RULES.maxPickupKm,
  );
  const [sound, setSound] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [windows, setWindows] = useState<
    Record<number, { open: string; close: string; active: boolean }>
  >({});
  const initialized = useRef(false);

  useEffect(() => {
    if (!prefs || initialized.current) return;
    initialized.current = true;
    setRadius(prefs.preferredRadiusKm);
    setSound(prefs.offerSoundEnabled);
    setEnabled(prefs.availabilityEnabled);
    const next: Record<number, { open: string; close: string; active: boolean }> = {};
    for (const day of BUSINESS_DAY_ORDER) {
      const found = prefs.availabilityWindows.find((entry) => entry.day === day);
      next[day] = found
        ? { open: found.open, close: found.close, active: true }
        : { open: "09:00", close: "21:00", active: false };
    }
    setWindows(next);
  }, [prefs]);

  if (prefs === undefined) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }
  if (!prefs?.pro) {
    return (
      <div className="mb-5 rounded-2xl border border-dashed border-accent/30 bg-accent/[0.04] p-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-accent">
          <Crown className="size-3.5" /> Herramientas Pro
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Radar de zona caliente, ofertas cercanas primero con sonido y turnos
          programados. Se activan con el plan Pro o Élite vigente.
        </p>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="mt-2 gap-1.5 border-accent/40 text-accent"
        >
          <Link to="/suscripcion">Ver planes</Link>
        </Button>
      </div>
    );
  }

  const save = async (patch: {
    preferredRadiusKm?: number;
    offerSoundEnabled?: boolean;
    availabilityEnabled?: boolean;
    availabilityWindows?: Array<{ day: number; open: string; close: string }>;
  }): Promise<boolean> => {
    setSaving(true);
    try {
      await savePreferences(patch);
      toast.success("Preferencias guardadas");
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos guardar",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveRadius = async () => {
    if (
      !Number.isFinite(radius) ||
      radius < 1 ||
      radius > ASSIGNMENT_RULES.maxPickupKm
    ) {
      setRadius(prefs.preferredRadiusKm);
      toast.error(
        `El radio tiene que estar entre 1 y ${ASSIGNMENT_RULES.maxPickupKm} km`,
      );
      return;
    }
    const value = Math.round(radius);
    setRadius(value);
    if (value === prefs.preferredRadiusKm) return;
    const ok = await save({ preferredRadiusKm: value });
    if (!ok) setRadius(prefs.preferredRadiusKm);
  };

  const saveWindows = async () => {
    const list = BUSINESS_DAY_ORDER.filter((day) => windows[day]?.active).map(
      (day) => ({
        day,
        open: windows[day].open,
        close: windows[day].close,
      }),
    );
    const ok = await save({
      availabilityEnabled: enabled,
      availabilityWindows: list,
    });
    if (!ok) {
      setEnabled(prefs.availabilityEnabled);
      const next: Record<
        number,
        { open: string; close: string; active: boolean }
      > = {};
      for (const day of BUSINESS_DAY_ORDER) {
        const found = prefs.availabilityWindows.find((entry) => entry.day === day);
        next[day] = found
          ? { open: found.open, close: found.close, active: true }
          : { open: "09:00", close: "21:00", active: false };
      }
      setWindows(next);
    }
  };

  const handleReassign = async (orderId: string) => {
    setReassigning(orderId);
    try {
      const result = await requestReassign({
        orderId: orderId as Id<"orders">,
      });
      if (result.ticket) {
        toast.success("Caso abierto", {
          description: "Ya retiraste el pedido: la administración lo reasigna.",
        });
      } else {
        toast.success("Entrega liberada", {
          description: `Se volvió a ofrecer a repartidores${result.offers ? ` (${result.offers} avisos)` : ""}.`,
        });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos reasignarla",
      );
    } finally {
      setReassigning(null);
    }
  };

  const handleExport = async () => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      toast.error("Usá el formato AAAA-MM");
      return;
    }
    setExporting(true);
    try {
      const result = await convex.query(api.orders.courierCashExport, { month });
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `caja-${result.month}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Mes exportado", {
        description: `${result.rows} entregas en el archivo.`,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos exportar",
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mb-5 space-y-3">
      {prefs.elite && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-300/40 bg-amber-300/[0.08] px-4 py-2.5">
          <Crown className="size-4 text-amber-300" />
          <p className="text-xs font-semibold text-amber-200">
            Sello Élite activo: entrás primero en pedidos grandes y tenés
            reasignación rápida y caja mensual.
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-border/70 bg-black/20 p-3.5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
          <Radar className="size-3.5" /> Radar de zona caliente
        </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            Movimiento reciente: pedidos listos ahora y entregas con ganancia de
            las últimas 24 horas, agrupados por zona.
          </p>
        {!hotspots || hotspots.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-border/70 p-3 text-center text-[11px] text-muted-foreground">
            Todavía no hay suficiente movimiento para marcar zonas calientes.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {hotspots.map((zone) => (
              <li
                key={`${zone.lat},${zone.lng}`}
                className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-2.5 py-2 text-[11px]"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Flame className="size-3.5 shrink-0 text-accent" />
                  <span className="truncate">
                    {zone.places.join(" · ") || "Zona con movimiento"}
                  </span>
                </span>
                <span className="shrink-0 font-semibold">
                  {zone.trips} retiros · {money(zone.payout)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-border/70 bg-black/20 p-3.5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
          <LocateFixed className="size-3.5" /> Ofertas cercanas primero
        </p>
        <div className="mt-2 space-y-1.5">
          <Label htmlFor="courier-radius">
            Radio máximo: {formatKm(radius)}
          </Label>
          <Input
            id="courier-radius"
            type="number"
            min={1}
            max={ASSIGNMENT_RULES.maxPickupKm}
            value={radius}
            onChange={(event) => {
              const value = Number(event.target.value);
              setRadius(value);
            }}
            onBlur={() => {
              void saveRadius();
            }}
            className="h-9 text-xs"
          />
                      <p className="text-[10px] text-muted-foreground">
              Los avisos llegan sólo dentro de este radio. El tablero sigue
              ordenando todo por cercanía.
            </p>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Volume2 className="size-3.5 text-accent" /> Ping al llegar una oferta
          </p>
          <Switch
            checked={sound}
            disabled={saving}
            onCheckedChange={(checked) => {
              const previous = sound;
              setSound(checked);
              void (async () => {
                const ok = await save({ offerSoundEnabled: checked });
                if (!ok) setSound(previous);
              })();
            }}
            aria-label="Avisar con sonido cuando llegue una oferta"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-black/20 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
            <CalendarClock className="size-3.5" /> Turnos programados
          </p>
          <Switch
            checked={enabled}
            disabled={saving}
            onCheckedChange={(checked) => {
              const previous = enabled;
              setEnabled(checked);
              const list = BUSINESS_DAY_ORDER.filter(
                (day) => windows[day]?.active,
              ).map((day) => ({
                day,
                open: windows[day].open,
                close: windows[day].close,
              }));
              void (async () => {
                const ok = await save({
                  availabilityEnabled: checked,
                  availabilityWindows: list,
                });
                if (!ok) setEnabled(previous);
              })();
            }}
            aria-label="Activar disponibilidad programada"
          />
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          {prefs.scheduledOnline === null
            ? "Activá tus turnos y sólo podés tomar entregas dentro de ellos."
            : prefs.scheduledOnline
              ? "Estás dentro de tu turno programado."
              : "Estás fuera de tu turno programado."}
        </p>
        <div className="mt-2 space-y-1.5">
          {BUSINESS_DAY_ORDER.map((day) => (
            <div
              key={day}
              className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-black/20 px-2 py-1.5"
            >
              <input
                type="checkbox"
                checked={windows[day]?.active ?? false}
                onChange={(event) =>
                  setWindows((current) => ({
                    ...current,
                    [day]: {
                      open: current[day]?.open ?? "09:00",
                      close: current[day]?.close ?? "21:00",
                      active: event.target.checked,
                    },
                  }))
                }
                className="size-3.5 shrink-0 accent-[var(--accent)]"
                aria-label={`Turno del ${BUSINESS_DAY_LABELS[day].toLowerCase()}`}
              />
              <span className="w-20 shrink-0 text-[11px] font-medium">
                {BUSINESS_DAY_LABELS[day]}
              </span>
              <Input
                type="time"
                value={windows[day]?.open ?? "09:00"}
                onChange={(event) =>
                  setWindows((current) => ({
                    ...current,
                    [day]: {
                      open: event.target.value,
                      close: current[day]?.close ?? "21:00",
                      active: current[day]?.active ?? false,
                    },
                  }))
                }
                className="h-8 min-w-0 flex-1 px-1 text-[11px] [color-scheme:dark]"
                aria-label={`Apertura del ${BUSINESS_DAY_LABELS[day].toLowerCase()}`}
              />
              <span className="text-[10px] text-muted-foreground">a</span>
              <Input
                type="time"
                value={windows[day]?.close ?? "21:00"}
                onChange={(event) =>
                  setWindows((current) => ({
                    ...current,
                    [day]: {
                      open: current[day]?.open ?? "09:00",
                      close: event.target.value,
                      active: current[day]?.active ?? false,
                    },
                  }))
                }
                className="h-8 min-w-0 flex-1 px-1 text-[11px] [color-scheme:dark]"
                aria-label={`Cierre del ${BUSINESS_DAY_LABELS[day].toLowerCase()}`}
              />
            </div>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn("mt-2 gap-1.5 border-border/80")}
          disabled={saving}
          onClick={saveWindows}
        >
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          Guardar turnos
        </Button>
      </div>

      {prefs.elite && (
        <div className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.05] p-3.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-200">
            <Crown className="size-3.5" /> Reasignación rápida
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            Si todavía no retiraste, liberá la entrega y se vuelve a ofrecer al
            instante. Si ya la retiraste, se abre un caso para reasignarla.
          </p>
          {activeOrders.filter((order) => order.status !== "delivered").length === 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              No tenés entregas activas para reasignar.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {activeOrders
                .filter((order) => order.status !== "delivered")
                .map((order) => (
                  <li
                    key={order._id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-2.5 py-2 text-[11px]"
                  >
                    <span className="truncate">
                      {order.businessName} · {order.code}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 border-amber-300/40 px-2 text-[10px] text-amber-200"
                      disabled={reassigning === order._id}
                      onClick={() => void handleReassign(order._id)}
                    >
                      {reassigning === order._id && (
                        <Loader2 className="size-3 animate-spin" />
                      )}
                      Reasignar
                    </Button>
                  </li>
                ))}
            </ul>
          )}
          <div className="mt-3 border-t border-amber-200/15 pt-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-200">
              <Download className="size-3.5" /> Caja mensual automática
            </p>
            <div className="mt-2 flex gap-2">
              <Input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="h-9 text-xs"
                aria-label="Mes a exportar"
              />
              <Button
                type="button"
                size="sm"
                className="h-9 gap-1.5 bg-ember-gradient text-black"
                disabled={exporting}
                onClick={() => void handleExport()}
              >
                {exporting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                CSV
              </Button>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Cada entrega con su estado de conciliación: al día, falta, de más
              o SINPE directo.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
