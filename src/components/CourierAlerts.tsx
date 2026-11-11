import { api } from "@/convex/_generated/api";
import { money } from "@/lib/format";
import { useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

type AvailableOrder = {
  _id: string;
  code: string;
  businessName: string;
  deliveryFee: number;
  sameCourier?: boolean;
  remainingDeliveries?: number;
  tripStops?: number;
  tripEarnings?: number;
};

function playChime() {
  try {
    const Ctor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    const audio = new Ctor();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, audio.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, audio.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, audio.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.32);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.34);
    osc.onended = () => void audio.close();
  } catch {
    /* el navegador puede bloquear el sonido hasta que haya interacción */
  }
}

/**
 * Aviso en vivo para repartidores: cuando un pedido queda listo para retirar
 * les suena y salta un aviso, en cualquier pantalla de la app.
 */
export function CourierAlerts({ enabled }: { enabled: boolean }) {
  const board = useQuery(api.orders.courierBoard, enabled ? {} : "skip");
  const navigate = useNavigate();
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
    if (!enabled || !board) return;
    const available = (board.available ?? []) as unknown as AvailableOrder[];
    const ids = available.map((order) => order._id);

    // La primera carga no avisa: son los pedidos que ya estaban publicados.
    if (!primed.current) {
      primed.current = true;
      seen.current = new Set(ids);
      return;
    }

    const fresh = available.filter((order) => !seen.current.has(order._id));
    for (const id of ids) seen.current.add(id);

    // Si está en medio de una entrega no se le ofrece otra.
    if (!board?.canAccept || fresh.length === 0) return;

    const first = fresh[0];
    playChime();
    const multiple =
      first.sameCourier && (first.remainingDeliveries ?? 0) > 0
        ? ` · compra de ${(first.remainingDeliveries ?? 0) + 1} entregas para el mismo repartidor`
        : "";
    const stops =
      (first.tripStops ?? 1) > 1 ? ` · retirás en ${first.tripStops} tiendas` : "";
    toast("Pedido listo para entregar", {
      description: `${first.businessName} · ${money(first.tripEarnings ?? first.deliveryFee)}${stops}${multiple}${
        fresh.length > 1 ? ` · y ${fresh.length - 1} más` : ""
      }`,
      duration: multiple ? 16000 : 12000,
      action: {
        label: "Ver pedidos",
        onClick: () => navigate("/courier"),
      },
    });
  }, [board, enabled, navigate]);

  return null;
}
