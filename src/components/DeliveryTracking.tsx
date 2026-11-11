import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { OrderStatus } from "@/convex/schema";
import { straightLineKm, type GeoPoint } from "@/lib/delivery";
import { clockTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Bike, Check, MapPin, Store } from "lucide-react";
import { useEffect, useRef } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import { useMutation } from "convex/react";
import { toast } from "sonner";

type TrackingProps = {
  status: OrderStatus;
  businessLocation: GeoPoint | null;
  deliveryLocation: GeoPoint | null;
  courierLocation: GeoPoint | null;
  courierLocationAt: number | null;
  courierAcceptedAt: number | null;
  pickedUpAt: number | null;
  deliveredAt: number | null;
  estimatedArrivalAt?: number | null;
  promisedArrivalAt?: number | null;
  lateMinutes?: number | null;
};

function markerIcon(color: string, glyph: string) {
  return L.divIcon({
    className: "capricho-pin",
    html: `<span style="display:flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:9999px;background:${color};border:3px solid white;box-shadow:0 2px 12px #0009;color:white;font-size:16px;font-weight:700">${glyph}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

const storeIcon = markerIcon("#d99c27", "S");
const buyerIcon = markerIcon("#e84343", "C");
const courierIcon = markerIcon("#161616", "🚴");

function FitTrackingBounds({
  businessLocation,
  deliveryLocation,
}: {
  businessLocation: GeoPoint | null;
  deliveryLocation: GeoPoint | null;
}) {
  const map = useMap();
  useEffect(() => {
    const points = [businessLocation, deliveryLocation].filter(
      (point): point is GeoPoint => point !== null,
    );
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 15, { animate: true });
    } else if (points.length > 1) {
      map.fitBounds(
        points.map((point) => [point.lat, point.lng] as [number, number]),
        { padding: [32, 32], maxZoom: 15, animate: true },
      );
    }
  }, [
    map,
    businessLocation?.lat,
    businessLocation?.lng,
    deliveryLocation?.lat,
    deliveryLocation?.lng,
  ]);
  return null;
}

export function DeliveryTrackingMap(props: TrackingProps) {
  const {
    status,
    businessLocation,
    deliveryLocation,
    courierLocation,
    courierLocationAt,
    courierAcceptedAt,
    pickedUpAt,
    deliveredAt,
    estimatedArrivalAt,
    promisedArrivalAt,
    lateMinutes,
  } = props;
  const late = (lateMinutes ?? 0) > 0;
  const center = businessLocation ?? deliveryLocation ?? { lat: 10.47093, lng: -84.96745 };
  const steps = [
    { label: "Repartidor asignado", at: courierAcceptedAt, icon: Check },
    { label: "Retirado en el negocio", at: pickedUpAt, icon: Store },
    { label: "Entregado al cliente", at: deliveredAt, icon: MapPin },
  ];

  return (
    <section className="space-y-3 rounded-2xl border border-accent/20 bg-black/15 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-sm font-bold">Seguimiento en vivo</h3>
          <p className="text-[11px] text-muted-foreground">
            {courierLocationAt
              ? `Ubicación actualizada ${clockTime(courierLocationAt)} hs`
              : "Esperando la ubicación del repartidor…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {estimatedArrivalAt && status !== "delivered" && (
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[10px] font-semibold",
                late
                  ? "bg-primary/10 text-primary"
                  : "bg-accent/10 text-accent",
              )}
            >
              {late
                ? `Demora +${lateMinutes} min`
                : `Llegada ~${clockTime(estimatedArrivalAt)}`}
            </span>
          )}
          {status === "picked_up" && (
            <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
              <Bike className="size-3" /> En camino
            </span>
          )}
        </div>
      </div>

      {late && status !== "delivered" && status !== "cancelled" && (
        <p className="rounded-xl border border-primary/30 bg-primary/[0.07] p-2.5 text-[11px] leading-relaxed text-primary">
          La entrega va {lateMinutes} min más tarde de lo estimado
          {promisedArrivalAt ? ` (llegada prometida ${clockTime(promisedArrivalAt)})` : ""}.
          Si no llega pronto, escribile al repartidor. La demora queda visible
          para el local y para el comprador.
        </p>
      )}

      <div className="relative isolate z-0 h-56 overflow-hidden rounded-xl border border-border/70 sm:h-64">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={14}
          scrollWheelZoom={false}
          className="size-full"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <FitTrackingBounds
            businessLocation={businessLocation}
            deliveryLocation={deliveryLocation}
          />
          {businessLocation && (
            <Marker position={[businessLocation.lat, businessLocation.lng]} icon={storeIcon}>
              <Tooltip>Negocio · punto de retiro</Tooltip>
            </Marker>
          )}
          {deliveryLocation && (
            <Marker position={[deliveryLocation.lat, deliveryLocation.lng]} icon={buyerIcon}>
              <Tooltip>Cliente · punto de entrega</Tooltip>
            </Marker>
          )}
          {courierLocation && (
            <Marker position={[courierLocation.lat, courierLocation.lng]} icon={courierIcon}>
              <Tooltip>Repartidor</Tooltip>
            </Marker>
          )}
        </MapContainer>
      </div>

      <ol className="grid gap-2 sm:grid-cols-3">
        {steps.map((step) => {
          const done = step.at !== null;
          const current = !done && step.label === (status === "picked_up" ? "Entregado al cliente" : "Retirado en el negocio");
          return (
            <li
              key={step.label}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-2.5 py-2",
                done
                  ? "border-accent/25 bg-accent/5"
                  : current
                    ? "border-primary/25 bg-primary/5"
                    : "border-border/60 bg-black/10",
              )}
            >
              <step.icon className={cn("size-3.5 shrink-0", done ? "text-accent" : current ? "text-primary" : "text-muted-foreground")} />
              <span className="min-w-0 flex-1 text-[10px] font-medium leading-tight">{step.label}</span>
              {step.at !== null && <time className="text-[10px] text-muted-foreground">{clockTime(step.at)}</time>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * Comparte la ubicación del repartidor aunque todavía no tenga una entrega.
 * Con eso la plataforma ordena los pedidos cercanos y bloquea los lejanos.
 */
export function CourierPresenceReporter({ enabled = true }: { enabled?: boolean }) {
  const updatePresence = useMutation(api.orders.updateCourierPresence);
  const lastSent = useRef(0);
  const lastPosition = useRef<GeolocationPosition | null>(null);
  const warned = useRef(false);

  useEffect(() => {
    if (!enabled || !navigator.geolocation) return;

    const send = (position: GeolocationPosition) => {
      lastPosition.current = position;
      const now = Date.now();
      // No hace falta mandar cada segundo: 45 s o un cambio relevante alcanza.
      if (now - lastSent.current < 45_000) return;
      lastSent.current = now;
      void updatePresence({
        location: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        },
      }).catch(() => {
        if (warned.current) return;
        warned.current = true;
        toast.error(
          "No pudimos compartir tu ubicación. Revisá el permiso del navegador.",
        );
      });
    };

    navigator.geolocation.getCurrentPosition(send, () => undefined, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000,
    });
    const watchId = navigator.geolocation.watchPosition(
      send,
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    // Si el repartidor no se mueve, el GPS puede no emitir: reenviamos la
    // última posición para que la presencia no venza a los 12 minutos.
    const heartbeat = window.setInterval(() => {
      if (lastPosition.current) {
        send(lastPosition.current);
      } else {
        navigator.geolocation.getCurrentPosition(send, () => undefined, {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 15000,
        });
      }
    }, 240_000);
    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(heartbeat);
    };
  }, [enabled, updatePresence]);

  return null;
}

export function CourierLocationReporter({ orderIds }: { orderIds: string[] }) {
  const updateLocation = useMutation(api.orders.updateCourierLocation);
  const ids = orderIds.join(",");
  const lastSent = useRef(new Map<string, { point: GeoPoint; at: number }>());
  const warned = useRef(false);

  useEffect(() => {
    if (!ids) {
      lastSent.current.clear();
      return;
    }
    if (!navigator.geolocation) {
      if (!warned.current) {
        warned.current = true;
        toast.error("Este dispositivo no permite compartir la ubicación en vivo.");
      }
      return;
    }

    const activeIds = ids.split(",") as Id<"orders">[];
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        const now = Date.now();
        for (const orderId of activeIds) {
          const previous = lastSent.current.get(orderId);
          if (
            previous &&
            now - previous.at < 8000 &&
            straightLineKm(previous.point, point) < 0.01
          ) {
            continue;
          }
          lastSent.current.set(orderId, { point, at: now });
          void updateLocation({ orderId, location: point }).catch(() => {
            lastSent.current.delete(orderId);
            if (!warned.current) {
              warned.current = true;
              toast.error("No pudimos compartir tu ubicación. Revisá el permiso de ubicación.");
            }
          });
        }
      },
      (error) => {
        if (!warned.current) {
          warned.current = true;
          toast.error(
            error.code === error.PERMISSION_DENIED
              ? "Permití el acceso a la ubicación para compartir el seguimiento."
              : "No pudimos obtener tu ubicación. Revisá el GPS e intentá de nuevo.",
          );
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [ids, updateLocation]);

  return null;
}
