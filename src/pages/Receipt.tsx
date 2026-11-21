import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { money, ORDER_STATUS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  BadgeCheck,
  Bike,
  CheckCircle2,
  Flame,
  Loader2,
  MapPin,
  Printer,
  ReceiptText,
  Store,
  Wallet,
} from "lucide-react";
import { Link, useParams } from "react-router";

const fullDate = new Intl.DateTimeFormat("es-CR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Costa_Rica",
});

export default function ReceiptPage() {
  const { orderId } = useParams();
  const receipt = useQuery(
    api.orders.receipt,
    orderId ? { orderId: orderId as Id<"orders"> } : "skip",
  );

  if (receipt === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="surface-raised mx-auto mt-8 max-w-lg rounded-3xl p-6 text-center">
        <ReceiptText className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-3 font-display text-xl font-bold">
          Comprobante no disponible
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ese pedido no existe o no pertenece a tu cuenta.
        </p>
        <Button asChild className="mt-4 bg-ember-gradient text-black">
          <Link to="/orders">Volver a mis pedidos</Link>
        </Button>
      </div>
    );
  }

  const status = ORDER_STATUS[receipt.status];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <Link to="/orders">
            <ArrowLeft className="size-4" /> Volver a mis pedidos
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-border/80"
            onClick={() => window.print()}
          >
            <Printer className="size-4" /> Imprimir o guardar PDF
          </Button>
          <Button asChild size="sm" className="gap-1.5 bg-ember-gradient text-black">
            <Link to={`/ayuda?order=${orderId ?? ""}`}>Reportar un problema</Link>
          </Button>
        </div>
      </div>

      <article className="mx-auto max-w-3xl overflow-hidden rounded-3xl bg-[#f7f1e6] text-[#201a14] shadow-[0_24px_80px_-32px_rgba(0,0,0,0.8)] print:max-w-none print:rounded-none print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#d9cbb4] px-6 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-[#1d1914] text-[#f4b942]">
              <Flame className="size-5" />
            </span>
            <div>
              <p className="font-display text-lg font-extrabold tracking-tight">
                Shop To Go
              </p>
              <p className="text-[11px] text-[#6d5f4d]">
                Tilarán, Guanacaste · Pago contra entrega
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8a765c]">
              Comprobante de pedido
            </p>
            <p className="font-display text-xl font-extrabold">{receipt.code}</p>
            <p className="text-[11px] text-[#6d5f4d]">
              {fullDate.format(receipt.createdAt)}
            </p>
          </div>
        </header>

        <div className="border-b border-[#d9cbb4] px-6 py-3 sm:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
                receipt.status === "delivered"
                  ? "border-[#2f7a52]/40 bg-[#2f7a52]/10 text-[#2f7a52]"
                  : receipt.status === "cancelled"
                    ? "border-[#b23a2f]/40 bg-[#b23a2f]/10 text-[#b23a2f]"
                    : "border-[#b07d2a]/40 bg-[#b07d2a]/10 text-[#8a5f16]",
              )}
            >
              {status.label}
            </span>
            <span className="text-[11px] text-[#6d5f4d]">
              {receipt.status === "delivered" && receipt.deliveredAt
                ? `Entregado ${fullDate.format(receipt.deliveredAt)}`
                : receipt.status === "cancelled" && receipt.cancelledAt
                  ? `Cancelado ${fullDate.format(receipt.cancelledAt)}`
                  : "Pedido en curso"}
            </span>
          </div>
          {receipt.status === "cancelled" && (
            <p className="mt-2 rounded-lg border border-[#b23a2f]/30 bg-[#b23a2f]/[0.06] px-3 py-2 text-[11px] text-[#8f2d25]">
              <strong>Motivo:</strong>{" "}
              {receipt.cancellationReason ?? "Cancelado por una de las partes."}
            </p>
          )}
        </div>

        <div className="grid gap-4 border-b border-[#d9cbb4] px-6 py-5 sm:grid-cols-3 sm:px-8">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8a765c]">
              <Store className="size-3.5" /> Negocio
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
              {receipt.business?.name ?? "Negocio"}
              {receipt.business?.verified && (
                <BadgeCheck className="size-4 text-[#2f7a52]" />
              )}
            </p>
            <p className="text-[11px] leading-relaxed text-[#6d5f4d]">
              {receipt.business?.address ?? "—"}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8a765c]">
              <Bike className="size-3.5" /> Repartidor
            </p>
            <p className="mt-1 text-sm font-semibold">
              {receipt.courier?.name ?? "Aún sin asignar"}
            </p>
            <p className="text-[11px] leading-relaxed text-[#6d5f4d]">
              {receipt.courier
                ? [receipt.courier.vehicle, receipt.courier.phone]
                    .filter(Boolean)
                    .join(" · ") +
                  (receipt.courier.verified ? " · Verificado" : "")
                : "Se asigna cuando el pedido esté listo."}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8a765c]">
              <MapPin className="size-3.5" /> Entrega
            </p>
            <p className="mt-1 text-sm font-semibold">{receipt.buyer?.name ?? "Cliente"}</p>
            <p className="text-[11px] leading-relaxed text-[#6d5f4d]">
              {receipt.address}
              {receipt.buyer?.phone ? ` · ${receipt.buyer.phone}` : ""}
            </p>
          </div>
        </div>

        <div className="px-6 py-5 sm:px-8">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#d9cbb4] text-[10px] uppercase tracking-wider text-[#8a765c]">
                <th className="pb-2 font-bold">Producto</th>
                <th className="pb-2 text-center font-bold">Cant.</th>
                <th className="pb-2 text-right font-bold">Precio</th>
                <th className="pb-2 text-right font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item, index) => (
                <tr
                  key={`${item.productId}-${index}`}
                  className="border-b border-[#e5dac8]"
                >
                  <td className="py-2.5 pr-2 font-medium">{item.name}</td>
                  <td className="py-2.5 text-center">{item.quantity}</td>
                  <td className="py-2.5 text-right">{money(item.price)}</td>
                  <td className="py-2.5 text-right font-semibold">
                    {money(item.price * item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 ml-auto max-w-xs space-y-1.5 text-xs">
            <div className="flex justify-between text-[#6d5f4d]">
              <span>Subtotal</span>
              <span>{money(receipt.subtotal)}</span>
            </div>
            <div className="flex justify-between text-[#6d5f4d]">
              <span>Envío</span>
              <span>{money(receipt.deliveryFee)}</span>
            </div>
            {receipt.deliveryDiscount > 0 && (
              <div className="flex justify-between text-[#2f7a52]">
                <span>Promoción del local</span>
                <span>−{money(receipt.deliveryDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-[#d9cbb4] pt-2 font-display text-base font-extrabold">
              <span>
                {receipt.paymentMethod === "sinpe"
                  ? "Total por SINPE Móvil"
                  : "Total en efectivo"}
              </span>
              <span>{money(receipt.total)}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-3 border-t border-[#d9cbb4] px-6 py-5 sm:grid-cols-2 sm:px-8">
          <div className="rounded-xl border border-[#d9cbb4] bg-white/50 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8a765c]">
              <Wallet className="size-3.5" />{" "}
              {receipt.paymentMethod === "sinpe" ? "SINPE Móvil" : "Efectivo"}
            </p>
            {receipt.paymentMethod === "sinpe" ? (
              <>
                <p className="mt-1 text-xs">
                  {receipt.paymentReceipt ? "Transferido" : "A transferir"} a la
                  tienda: <strong>{money(receipt.total)}</strong>
                </p>
                {receipt.paymentReceipt ? (
                  <a
                    href={receipt.paymentReceipt.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs font-semibold underline"
                  >
                    Ver captura del comprobante
                  </a>
                ) : (
                  <p className="mt-1 text-xs">Captura del comprobante: pendiente</p>
                )}
              </>
            ) : (
              <>
                <p className="mt-1 text-xs">
                  Cobrado al cliente:{" "}
                  <strong>
                    {receipt.cashCollected !== null ? money(receipt.cashCollected) : "Pendiente"}
                  </strong>
                </p>
                <p className="text-xs">
                  Entregado al negocio:{" "}
                  <strong>
                    {receipt.cashHanded !== null ? money(receipt.cashHanded) : "Pendiente"}
                  </strong>
                </p>
                {receipt.cashIssue && (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[#8f2d25]">
                    <strong>Incidencia:</strong> {receipt.cashIssue.note}
                    {receipt.cashIssue.resolvedAt ? " (resuelta)" : " (abierta)"}
                  </p>
                )}
              </>
            )}
          </div>
          <div className="rounded-xl border border-[#d9cbb4] bg-white/50 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8a765c]">
              <ReceiptText className="size-3.5" /> Códigos de custodia
            </p>
            <div className="mt-1 flex items-center justify-between gap-2 text-xs">
              <span>Código de retiro</span>
              <strong className="font-mono tracking-widest">
                {receipt.pickupCode ?? "—"}
              </strong>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span>PIN de entrega</span>
              <strong className="font-mono tracking-widest">
                {receipt.deliveryPin ?? "—"}
              </strong>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-[#6d5f4d]">
              El local entrega el código al repartidor y el cliente confirma con su
              PIN al recibir.
            </p>
          </div>
        </div>

        {receipt.notes && (
          <div className="border-t border-[#d9cbb4] px-6 py-4 sm:px-8">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#8a765c]">
              Notas del pedido
            </p>
            <p className="mt-1 text-xs italic text-[#6d5f4d]">"{receipt.notes}"</p>
          </div>
        )}

        <footer className="border-t border-[#d9cbb4] bg-[#efe5d4] px-6 py-4 text-[10px] leading-relaxed text-[#6d5f4d] sm:px-8">
          <p className="flex items-center gap-1.5 font-semibold text-[#201a14]">
            <CheckCircle2 className="size-3.5 text-[#2f7a52]" />
            Comprobante generado por Shop To Go
          </p>
          <p className="mt-1">
            Conservá este comprobante para reclamos de pago, producto o entrega.
            Las tarifas de envío son fijas y nunca un porcentaje del pedido. Si algo
            no coincide, abrí un caso en Ayuda con el código {receipt.code}.
          </p>
        </footer>
      </article>
    </div>
  );
}
