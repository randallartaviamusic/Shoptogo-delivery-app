import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  SUPPORT_CATEGORY_META,
  SUPPORT_STATUS_META,
  supportStatusOf,
} from "@/lib/trust";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  CheckCircle2,
  LifeBuoy,
  Loader2,
  RotateCcw,
  Search,
  Send,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const TONE: Record<string, string> = {
  chili: "border-primary/40 bg-primary/10 text-primary",
  ember: "border-accent/40 bg-accent/10 text-accent",
  green: "border-accent/40 bg-accent/10 text-accent",
};

const date = new Intl.DateTimeFormat("es-CR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Costa_Rica",
});

/** Cola de ayuda para la administración: responder y resolver. */
export function SupportAdmin() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "in_review" | "resolved">(
    "all",
  );
  const data = useQuery(api.support.adminList, {
    search,
    ...(filter === "all" ? {} : { status: filter }),
  });
  const update = useMutation(api.support.adminUpdate);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const handleUpdate = async (
    ticketId: string,
    status: "in_review" | "resolved" | "open",
  ) => {
    setBusy(ticketId);
    try {
      await update({
        ticketId: ticketId as Id<"supportTickets">,
        status,
        note: notes[ticketId] || undefined,
      });
      toast.success(
        status === "resolved"
          ? "Caso resuelto"
          : status === "in_review"
            ? "Caso en revisión"
            : "Caso reabierto",
        {
          description:
            status === "resolved"
              ? "La persona ve tu respuesta en Ayuda."
              : "El estado queda visible para la cuenta.",
        },
      );
      setNotes((current) => ({ ...current, [ticketId]: "" }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos actualizar el caso",
      );
    } finally {
      setBusy(null);
    }
  };

  if (data === undefined) {
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
            <LifeBuoy className="size-3.5" /> Perfil administrador
          </p>
          <h2 className="font-display text-lg font-bold">Ayuda y reportes</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Casos de pagos, productos, direcciones y entregas. Respondé con una
            nota y la persona lo ve en su página de Ayuda.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-semibold text-primary">
            {data.totals.open} abiertos
          </span>
          <span className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 font-semibold text-accent">
            {data.totals.inReview} en revisión
          </span>
          <span className="rounded-full border border-border/80 bg-secondary/40 px-2.5 py-1 text-muted-foreground">
            {data.totals.resolved} resueltos
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por cuenta, pedido o mensaje"
            className="h-9 pl-8 text-xs"
          />
        </div>
        <Select
          value={filter}
          onValueChange={(value) =>
            setFilter(value as "all" | "open" | "in_review" | "resolved")
          }
        >
          <SelectTrigger className="h-9 w-full text-xs sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="open">Abiertos</SelectItem>
            <SelectItem value="in_review">En revisión</SelectItem>
            <SelectItem value="resolved">Resueltos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.tickets.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
          No hay casos que coincidan con el filtro.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {data.tickets.map((ticket) => {
            const status = supportStatusOf(ticket.status);
            const meta = SUPPORT_STATUS_META[status];
            return (
              <li
                key={ticket._id}
                className="rounded-xl border border-border/70 bg-black/20 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">
                      {ticket.businessName ?? ticket.name ?? "Cuenta"}
                      <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                        {ticket.role === "business"
                          ? "Negocio"
                          : ticket.role === "courier"
                            ? "Repartidor"
                            : "Comprador"}
                        {ticket.orderCode ? ` · ${ticket.orderCode}` : ""}
                      </span>
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {[ticket.email, ticket.phone].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-1 text-[11px] font-medium">
                      {SUPPORT_CATEGORY_META[ticket.category].label}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      {ticket.message}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Abierto {date.format(ticket.createdAt)}
                      {ticket.adminNote ? " · con respuesta" : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold",
                      TONE[meta.tone],
                    )}
                  >
                    {meta.label}
                  </span>
                </div>

                {ticket.adminNote && (
                  <p className="mt-2 rounded-lg border border-accent/25 bg-accent/[0.06] p-2 text-[11px] leading-relaxed text-accent">
                    <CheckCircle2 className="mr-1 inline size-3.5" />
                    {ticket.adminNote}
                  </p>
                )}

                <div className="mt-2 space-y-2">
                  <Textarea
                    value={notes[ticket._id] ?? ""}
                    onChange={(event) =>
                      setNotes((current) => ({
                        ...current,
                        [ticket._id]: event.target.value,
                      }))
                    }
                    placeholder="Respuesta o nota interna visible para la persona"
                    className="min-h-14 resize-none text-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 border-accent/40 text-xs text-accent"
                      disabled={busy === ticket._id}
                      onClick={() => void handleUpdate(ticket._id, "in_review")}
                    >
                      <Send className="size-3.5" />
                      En revisión
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
                      disabled={busy === ticket._id}
                      onClick={() => void handleUpdate(ticket._id, "resolved")}
                    >
                      {busy === ticket._id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-3.5" />
                      )}
                      Resolver
                    </Button>
                    {status === "resolved" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1.5 text-xs text-muted-foreground"
                        disabled={busy === ticket._id}
                        onClick={() => void handleUpdate(ticket._id, "open")}
                      >
                        <RotateCcw className="size-3.5" />
                        Reabrir
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
