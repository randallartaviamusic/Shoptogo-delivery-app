import {
  isNativePushPlatform,
  setupNativePush,
} from "@/lib/native-push";
import { useConvex } from "convex/react";
import { useEffect } from "react";

/**
 * Registra el teléfono en FCM en cuanto hay una cuenta activa. No muestra
 * nada: si el permiso de notificaciones ya se dio en el primer arranque, el
 * token queda guardado y el backend puede despertar la app aunque esté cerrada.
 */
export function NativePushRegistrar({ userId }: { userId?: string }) {
  const convex = useConvex();

  useEffect(() => {
    if (!userId || !isNativePushPlatform()) return;

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void setupNativePush(convex).catch(() => {
        // Falta Firebase o el teléfono rechazó el registro. La app sigue.
      });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };

    run();
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [convex, userId]);

  return null;
}
