import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  FULFILLMENT_OPTIONS,
  productFulfillmentMethods,
  type FulfillmentMethod,
} from "@/lib/fulfillment";
import { cn } from "@/lib/utils";
import { Bike, CalendarClock, Package, Plus, ShoppingBag, Trash2, UtensilsCrossed } from "lucide-react";
import { useState } from "react";

export type BlockedSlot = { start: number; end: number; note?: string };
export type BookedSlot = { at: number; code: string; quantity: number };

function toLocalInput(value: number) {
  const d = new Date(value - 6 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 16);
}

function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const ts = Date.parse(`${value}:00-06:00`);
  return Number.isFinite(ts) ? ts : null;
}

function formatSlot(start: number, end: number) {
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) =>
    d.toLocaleString("es-CR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Costa_Rica",
    });
  return `${fmt(s)} → ${fmt(e)}`;
}

const FULFILLMENT_ICON: Record<FulfillmentMethod, typeof Bike> = {
  delivery: Bike,
  pickup: ShoppingBag,
  dine_in: UtensilsCrossed,
  reservation: CalendarClock,
};

export function ProductInventoryFields({
  stockEnabled,
  stock,
  reservable,
  blockedSlots,
  booked = [],
  fulfillmentMethods,
  onChange,
}: {
  stockEnabled: boolean;
  stock: string;
  reservable: boolean;
  blockedSlots: BlockedSlot[];
  booked?: BookedSlot[];
  /** Modalidades activas del producto. Ausente = se derivan de `reservable`. */
  fulfillmentMethods?: FulfillmentMethod[];
  onChange: (patch: {
    stockEnabled?: boolean;
    stock?: string;
    reservable?: boolean;
    blockedSlots?: BlockedSlot[];
    fulfillmentMethods?: FulfillmentMethod[];
  }) => void;
}) {
  const active = productFulfillmentMethods({ fulfillmentMethods, reservable });
  const toggleMethod = (method: FulfillmentMethod, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...active, method]))
      : active.filter((value) => value !== method);
    if (next.length === 0) return;
    onChange({
      fulfillmentMethods: FULFILLMENT_OPTIONS.filter((option) =>
        next.includes(option.value),
      ).map((option) => option.value),
      reservable: next.includes("reservation"),
    });
  };
  const reservationActive = active.includes("reservation");
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [draftNote, setDraftNote] = useState("");

  const addBlocked = () => {
    const start = fromLocalInput(draftStart);
    const end = fromLocalInput(draftEnd);
    if (!start || !end || end <= start) return;
    onChange({
      blockedSlots: [...blockedSlots, { start, end, ...(draftNote.trim() ? { note: draftNote.trim() } : {}) }].sort(
        (a, b) => a.start - b.start,
      ),
    });
    setDraftStart("");
    setDraftEnd("");
    setDraftNote("");
  };

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-black/20 p-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Stock y reservación
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          Activalo solo si aplica para este producto. El stock se descuenta solo al confirmar la compra.
        </p>
      </div>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-black/30 px-3 py-2.5">
        <span className="flex min-w-0 items-center gap-2">
          <Package className="size-4 shrink-0 text-accent" />
          <span className="min-w-0">
            <span className="block break-words text-sm font-medium">Controlar stock</span>
            <span className="block break-words text-[11px] text-muted-foreground">
              Cuántos hay disponibles de este producto
            </span>
          </span>
        </span>
        <Switch checked={stockEnabled} onCheckedChange={(checked) => onChange({ stockEnabled: checked })} />
      </label>
      {stockEnabled && (
        <div className="space-y-1.5">
          <Label>Cantidad en stock</Label>
          <Input
            type="number"
            min={0}
            step={1}
            value={stock}
            onChange={(e) => onChange({ stock: e.target.value })}
            placeholder="Ej. 20"
          />
          <p className="text-[10px] text-muted-foreground">
            Se resta automáticamente con cada compra y vuelve si el pedido se cancela.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <p className="break-words text-xs font-semibold">Cómo se puede pedir este producto</p>
        <p className="break-words text-[10px] leading-relaxed text-muted-foreground">
          Marcá las opciones que acepta este producto. En el carrito solo aparecen las que estén activas.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {FULFILLMENT_OPTIONS.map((option) => {
            const Icon = FULFILLMENT_ICON[option.value];
            const checked = active.includes(option.value);
            return (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-2.5 py-2",
                  checked ? "border-accent/50 bg-accent/10" : "border-border/60 bg-black/30",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="size-4 shrink-0 text-accent" />
                  <span className="min-w-0">
                    <span className="block break-words text-xs font-semibold">{option.label}</span>
                    <span className="block break-words text-[10px] text-muted-foreground">{option.hint}</span>
                  </span>
                </span>
                <Switch
                  checked={checked}
                  onCheckedChange={(value) => toggleMethod(option.value, value)}
                />
              </label>
            );
          })}
        </div>
      </div>

      {reservationActive && (
        <div className="space-y-2 rounded-xl border border-border/60 bg-black/30 p-2.5">
          <p className="break-words text-xs font-semibold">Días y horas no disponibles</p>
          <p className="break-words text-[10px] leading-relaxed text-muted-foreground">
            Bloqueá almuerzos, citas ya tomadas o días cerrados. El cliente solo puede elegir horarios libres.
          </p>
          {booked.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Ya reservado ({booked.length})
              </p>
              <div className="max-h-24 space-y-1 overflow-y-auto">
                {booked.slice(0, 20).map((b, i) => (
                  <p key={`${b.at}-${i}`} className="break-words rounded-lg bg-accent/10 px-2 py-1 text-[10px] text-accent">
                    {new Date(b.at).toLocaleString("es-CR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "America/Costa_Rica",
                    })}{" "}
                    · {b.code} ×{b.quantity}
                  </p>
                ))}
              </div>
            </div>
          )}
          {blockedSlots.length > 0 ? (
            <div className="space-y-1.5">
              {blockedSlots.map((slot, index) => (
                <div
                  key={`${slot.start}-${index}`}
                  className="flex w-full max-w-full min-w-0 items-center gap-2 rounded-lg border border-border/60 px-2 py-1.5"
                >
                  <p className="min-w-0 flex-1 break-words text-[11px]">
                    {formatSlot(slot.start, slot.end)}
                    {slot.note ? <span className="text-muted-foreground"> · {slot.note}</span> : null}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 shrink-0 p-0 text-primary hover:text-primary"
                    onClick={() =>
                      onChange({ blockedSlots: blockedSlots.filter((_, i) => i !== index) })
                    }
                    aria-label="Quitar bloqueo"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground">Sin bloqueos: todos los horarios están libres.</p>
          )}
          <div className="grid w-full max-w-full min-w-0 grid-cols-2 gap-2">
            <div className="min-w-0 space-y-1">
              <Label className="text-[10px]">Desde</Label>
              <Input
                type="datetime-local"
                value={draftStart}
                onChange={(e) => setDraftStart(e.target.value)}
                className="h-9 min-w-0 text-[11px]"
              />
            </div>
            <div className="min-w-0 space-y-1">
              <Label className="text-[10px]">Hasta</Label>
              <Input
                type="datetime-local"
                value={draftEnd}
                onChange={(e) => setDraftEnd(e.target.value)}
                className="h-9 min-w-0 text-[11px]"
              />
            </div>
          </div>
          <Input
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            maxLength={80}
            placeholder="Motivo (opcional): ya reservado, cerrado..."
            className="h-9 text-[11px]"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-1.5 border-border/80"
            disabled={!draftStart || !draftEnd}
            onClick={addBlocked}
          >
            <Plus className="size-3.5" /> Bloquear ese horario
          </Button>
        </div>
      )}
    </div>
  );
}

export function slotsToArgs(slots: BlockedSlot[]) {
  return slots.map((s) => ({ start: s.start, end: s.end, ...(s.note ? { note: s.note } : {}) }));
}

export { toLocalInput };
