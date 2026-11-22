import { api } from "@/convex/_generated/api";
import { playOrderChime, setOrderChimeUrl } from "@/lib/orderChime";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

/**
 * Suena la campanita de avisos (o el audio que subió el administrador) cuando
 * llega un push con la app abierta. En la web el service worker manda el
 * mensaje a las pestañas vivas; en el APK lo manda FCM. Con la app cerrada el
 * sonido y la bandeja los pone Android.
 */
export function PushChime({
  enabled,
  role,
}: {
  enabled: boolean;
  role: "buyer" | "business" | "courier";
}) {
  const navigate = useNavigate();
  const notificationSound = useQuery(api.branding.notificationSound);

  // El audio que subió el administrador se usa en todos los avisos que suenan
  // con la app abierta. Si no hay uno, queda la campanita de siempre.
  useEffect(() => {
    setOrderChimeUrl(notificationSound?.url ?? null);
  }, [notificationSound?.url]);

  useEffect(() => {
    if (!enabled) return;

    const handlePush = (data: {
      title?: string;
      body?: string;
      url?: string;
    }) => {
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

    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        title?: string;
        body?: string;
        url?: string;
      } | null;
      if (data?.type !== "shop-to-go:order-push") return;
      handlePush(data);
    };

    const onNativePush = (event: Event) => {
      const data = (
        event as CustomEvent<{
          title?: string;
          body?: string;
          url?: string;
        }>
      ).detail;
      if (data) handlePush(data);
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onMessage);
    }
    window.addEventListener("shop-to-go:native-push", onNativePush);

    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onMessage);
      }
      window.removeEventListener("shop-to-go:native-push", onNativePush);
    };
  }, [enabled, role, navigate]);

  return null;
}
