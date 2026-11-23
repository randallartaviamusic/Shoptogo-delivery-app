import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { clockTime, money } from "@/lib/format";
import { shiftCostaRicaDay } from "@/lib/orders";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { AlertCircle, CheckCircle2, Loader2, Lock, Store, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Cierre de caja del repartidor: lo que cobró, lo que entregó a cada local y lo
 * que quedó pendiente. Al firmar, el día queda sellado con su nombre y una
 * huella que detecta cualquier cambio posterior.
 */
export function CashClosing() {
  // null = hoy; cualquier otro valor permite revisar días anteriores.
  const [day, setDay] = useState<string | null>(null);
  const data = useQuery(api.orders.courierCashDay, day ? { day } : {});
  const sign = useMutation(api.orders.signCourierCash);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (data === undefined) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }
  if (data === null) return null;

  const { summary, closing } = data;
  const needsNote =
    summary.pendingToBusinesses > 0 ||
    data.openIssues > 0 ||
    summary.collectionDifference !== 0;
  const blocked = !closing && data.isToday && data.activeTrips > 0;

  const handleSign = async () => {
    setBusy(true);
    try {
      const result = await sign({
        day: day ?? undefined,
        signedName: name.trim(),
        note: note.trim() || undefined,
      });
      toast.success("Cierre firmado", {
        description: `Folio ${result.signature} · ${clockTime(result.signedAt)} hs`,
      });
      setNote("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos firmar el cierre",
      );
    } finally {
      setBusy(false);
    }
  };

  const stats = [
    {
      label: "Cobraste a clientes",
      value: money(summary.collected),
      hint:
        summary.collectionDifference === 0
          ? "Coincide con lo esperado"
          : `${summary.collectionDifference < 0 ? "Faltó" : "Sobró"} ${money(Math.abs(summary.collectionDifference))}`,
      tone: summary.collectionDifference === 0 ? "" : "text-primary",
    },
    {
      label: "Entregaste a locales",
      value: money(summary.handedToBusinesses),
      hint: `De ${money(summary.dueToBusinesses)} que correspondía`,
      tone: "",
    },
    {
      label: "Pendiente con locales",
      value: money(summary.pendingToBusinesses),
      hint:
        summary.pendingToBusinesses === 0
          ? "Todo entregado"
          : `${summary.businesses.filter((line) => line.pending > 0).length} local(es) por pagar`,
      tone: summary.pendingToBusinesses === 0 ? "" : "text-primary",
    },
    {
      label: "Ganancia en envíos",
      value: money(summary.earnings),
      hint: `${summary.deliveries} ${summary.deliveries === 1 ? "entrega" : "entregas"}`,
      tone: "text-accent",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="surface-raised rounded-3xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
              Conciliación de caja
            </p>
            <h2 className="mt-1 font-display text-xl font-bold">
              {data.isToday ? "Hoy" : data.day}
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Una línea por local: lo que le corresponde, lo que confirmó y lo que
              falta. Se cierra una sola vez por día.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 border-border/80 px-2 text-[10px]"
                onClick={() => setDay(shiftCostaRicaDay(data.day, -1))}
              >
                ← Día anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 border-border/80 px-2 text-[10px]"
                disabled={data.isToday}
                onClick={() => setDay(shiftCostaRicaDay(data.day, 1))}
              >
                Día siguiente →
              </Button>
              {!data.isToday && (
                <button
                  type="button"
                  onClick={() => setDay(null)}
                  className="text-[10px] font-semibold text-accent hover:underline"
                >
                  Volver a hoy
                </button>
              )}
            </div>
          </div>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider",
              closing
                ? "bg-accent text-accent-foreground"
                : "border border-border/80 text-muted-foreground",
            )}
          >
            {closing ? "Firmado" : "Sin firmar"}
          </span>
        </div>

        <div className="mt-4 grid w-full max-w-full min-w-0 grid-cols-2 gap-3 overflow-x-clip lg:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-black/20 p-3"
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </p>
              <p
                className={cn(
                  "mt-1.5 font-display text-lg font-extrabold",
                  stat.tone,
                )}
              >
                {stat.value}
              </p>
              <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                {stat.hint}
              </p>
            </div>
          ))}
        </div>

        {data.carryOverPending > 0 && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/[0.07] p-3 text-[11px] leading-relaxed text-primary">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            Arrastrás {money(data.carryOverPending)} pendiente de días anteriores.
          </p>
        )}
        {summary.overpaidToBusinesses > 0 && (
          <p className="mt-2 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/[0.07] p-3 text-[11px] leading-relaxed text-primary">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            Entregaste {money(summary.overpaidToBusinesses)} de más: el sobrante no
            tapa el faltante de otro local.
          </p>
        )}
        {data.openIssues > 0 && (
          <p className="mt-2 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/[0.07] p-3 text-[11px] leading-relaxed text-primary">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            Tenés {data.openIssues} caso(s) de efectivo sin resolver de este día.
            Podés firmar explicando en la nota cómo se resuelve.
          </p>
        )}
      </div>

      <div className="surface-raised overflow-hidden rounded-3xl">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <Store className="size-4 text-accent" />
          <p className="text-sm font-semibold">Detalle por local</p>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {summary.orders} pedido(s)
          </span>
        </div>
        {summary.businesses.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            Todavía no hay entregas completadas en este día.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {summary.businesses.map((line) => (
              <li
                key={line.businessId}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{line.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {line.orders} pedido(s) · correspondía {money(line.due)} ·
                    confirmó {money(line.handed)}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                    line.pending > 0
                      ? "bg-primary/15 text-primary"
                      : line.pending < 0
                        ? "bg-accent/15 text-accent"
                        : "bg-black/30 text-muted-foreground",
                  )}
                >
                  {line.pending > 0
                    ? `Falta ${money(line.pending)}`
                    : line.pending < 0
                      ? `De más ${money(-line.pending)}`
                      : "Al día"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {closing ? (
        <div className="surface-raised rounded-3xl p-5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
            <Lock className="size-3.5" /> Cierre firmado
          </p>
          <p className="mt-2 text-sm font-semibold">{closing.signedName}</p>
          <p className="text-[11px] text-muted-foreground">
            {clockTime(closing.signedAt)} hs · Folio{" "}
            <span className="font-mono">{closing.signature}</span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Cobrado {money(closing.collected)} · a locales{" "}
            {money(closing.handedToBusinesses)} · pendiente{" "}
            {money(closing.pendingToBusinesses)}
            {closing.carryOverPending > 0
              ? ` · arrastre ${money(closing.carryOverPending)}`
              : ""}
          </p>
          {closing.note && (
            <p className="mt-2 rounded-xl bg-secondary/50 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
              “{closing.note}”
            </p>
          )}
          {data.signatureValid === false && (
            <p className="mt-2 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/[0.07] p-3 text-[11px] leading-relaxed text-primary">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              La firma no coincide con los montos guardados. Avisá a la
              administración antes de operar con este cierre.
            </p>
          )}
          {data.changedSinceClosing && (
            <p className="mt-2 flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/[0.07] p-3 text-[11px] leading-relaxed text-accent">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              Hubo movimientos después del cierre: los montos firmados no cambian,
              pero el día ya no coincide con lo que ves arriba.
            </p>
          )}
        </div>
      ) : (
        <div className="surface-raised rounded-3xl p-5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
            <Wallet className="size-3.5" /> Firmar el cierre del día
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Queda un registro con tu nombre, los montos y la hora. No se puede
            editar después.
          </p>

          <div className="mt-3 space-y-1.5">
            <Label htmlFor="closing-name">Tu nombre completo</Label>
            <Input
              id="closing-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Como figura en tu cuenta"
              autoComplete="name"
            />
          </div>

          <div className="mt-3 space-y-1.5">
            <Label htmlFor="closing-note">
              Nota{" "}
              {needsNote
                ? "(obligatoria: hay pendientes o diferencias)"
                : "(opcional)"}
            </Label>
            <Textarea
              id="closing-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ej: quedan ₡1.500 con la pulpería, los entrego mañana."
              className="min-h-16 resize-none"
            />
          </div>

          {blocked && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/[0.07] p-3 text-[11px] leading-relaxed text-primary">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              Tenés {data.activeTrips} entrega(s) en curso. Cerralas antes de firmar
              para que el saldo del día quede completo.
            </p>
          )}

          <Button
            className="mt-3 w-full gap-2 bg-ember-gradient text-black"
            disabled={
              busy || blocked || summary.orders === 0 || name.trim().length < 3
            }
            onClick={() => void handleSign()}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            Firmar cierre
          </Button>
        </div>
      )}
    </div>
  );
}
