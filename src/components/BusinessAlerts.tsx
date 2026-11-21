import { api } from "@/convex/_generated/api";
import { money } from "@/lib/format";
import { playOrderChime } from "@/lib/orderChime";
import { useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

/** Aviso en vivo al negocio cuando llega un pedido que necesita confirmación. */
export function BusinessAlerts({ enabled }: { enabled: boolean }) {
  const board = useQuery(api.orders.businessBoard, enabled ? {} : "skip");
  const navigate = useNavigate();
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
    if (!enabled || !board) return;
    const newOrders = board.newOrders ?? [];
    const ids = newOrders.map((order) => order._id);

    // Al entrar no repetimos alertas de pedidos que ya estaban pendientes.
    if (!primed.current) {
      primed.current = true;
      seen.current = new Set(ids);
      return;
    }

    const fresh = newOrders.filter((order) => !seen.current.has(order._id));
    for (const id of ids) seen.current.add(id);
    if (fresh.length === 0) return;

    playOrderChime();
    const order = fresh[0];
    toast("Nuevo pedido para confirmar", {
      description: `${order.code} · ${order.buyerName} · ${order.itemCount} productos · ${money(order.subtotal)} · preparación estimada ${board.business.etaMinutes} min`,
      duration: 16000,
      action: {
        label: "Abrir pedidos",
        onClick: () => navigate("/business?tab=orders"),
      },
    });
  }, [board, enabled, navigate]);

  return null;
}
