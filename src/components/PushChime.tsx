import { playOrderChime } from "@/lib/orderChime";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

/**
 * Suena la melodía de 5 segundos cuando llega un push con la app abierta. El
 * service worker manda el mensaje a las pestañas vivas; con la app cerrada el
 * sonido lo pone el sistema operativo.
 */
export function PushChime({
  enabled,
  role,
}: {
  enabled: boolean;
  role: "buyer" | "business" | "courier";
}) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        title?: string;
        body?: string;
        url?: string;
      } | null;
      if (data?.type !== "shop-to-go:order-push") return;

      playOrderChime();

      // El negocio y el repartidor ya tienen su propio aviso en vivo; el
      // comprador no, así que acá ve el detalle del pedido que llegó.
      if (role === "buyer") {
        const target =
          data.url && data.url.startsWith("/") ? data.url : "/orders";
        toast(data.title ?? "Tu pedido", {
          description: data.body,
          duration: 16000,
          action: {
            label: "Ver pedidos",
            onClick: () => navigate(target),
          },
        });
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [enabled, role, navigate]);

  return null;
}
