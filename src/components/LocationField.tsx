import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatKm, isValidPoint, straightLineKm, TILARAN_CENTER } from "@/lib/delivery";
import type { GeoPoint } from "@/lib/delivery";
import { reverseGeocode } from "@/lib/geocode";
import { cn } from "@/lib/utils";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, Loader2, MapPin, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { toast } from "sonner";

const pinIcon = L.divIcon({
  className: "capricho-pin",
  html: '<span style="display:block;width:18px;height:18px;border-radius:9999px;background:var(--accent,#e0a52b);border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.45),0 6px 14px rgba(0,0,0,.45)"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function PickOnMap({ onPick }: { onPick: (point: GeoPoint) => void }) {
  useMapEvents({
    click: (event) => onPick({ lat: event.latlng.lat, lng: event.latlng.lng }),
  });
  return null;
}

function FlyTo({ point, token }: { point: GeoPoint | null; token: number }) {
  const map = useMap();
  useEffect(() => {
    if (!isValidPoint(point) || token === 0) return;
    map.flyTo([point.lat, point.lng], 16, { duration: 0.8 });
  }, [map, point, token]);
  return null;
}

type LocationFieldProps = {
  value: GeoPoint | null;
  address: string;
  onChange: (point: GeoPoint) => void;
  onAddressChange: (address: string) => void;
  label?: string;
  hint?: string;
  mapHeight?: string;
  className?: string;
};

/**
 * Mapa para fijar el punto exacto (entrega o local). Se puede usar el GPS del
 * teléfono o tocar el mapa, y la dirección se sugiere al instante.
 */
export function LocationField({
  value,
  address,
  onChange,
  onAddressChange,
  label = "Dirección exacta",
  hint,
  mapHeight = "h-56",
  className,
}: LocationFieldProps) {
  const [locating, setLocating] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [flyToken, setFlyToken] = useState(0);
  const suggested = useRef("");
  // Evita que una respuesta vieja de geocodificación pise lo que se escribe.
  const addressRef = useRef(address);
  addressRef.current = address;

  const applyPoint = async (point: GeoPoint, options?: { suggest?: boolean }) => {
    const normalized = {
      lat: Math.round(point.lat * 1e5) / 1e5,
      lng: Math.round(point.lng * 1e5) / 1e5,
    };
    onChange(normalized);
    if (options?.suggest === false) return;

    setSuggesting(true);
    const suggestion = await reverseGeocode(normalized);
    setSuggesting(false);
    if (!suggestion) return;
    if (!addressRef.current.trim() || addressRef.current === suggested.current) {
      suggested.current = suggestion;
      onAddressChange(suggestion);
    }
  };

  const locate = () => {
    if (!navigator.geolocation) {
      toast.error("Tu navegador no permite la ubicación. Marcá el punto en el mapa.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFlyToken((token) => token + 1);
        void applyPoint({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        toast.error(
          error.code === error.PERMISSION_DENIED
            ? "No diste permiso de ubicación. Podés marcar el punto en el mapa."
            : "No pudimos leer tu ubicación. Marcá el punto en el mapa.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const suggestAgain = async () => {
    if (!isValidPoint(value)) {
      toast.error("Primero marcá un punto en el mapa");
      return;
    }
    setSuggesting(true);
    const suggestion = await reverseGeocode(value);
    setSuggesting(false);
    if (suggestion) {
      suggested.current = suggestion;
      onAddressChange(suggestion);
    } else {
      toast.error("No encontramos la dirección de ese punto. Escribila a mano.");
    }
  };

  const center = isValidPoint(value) ? value : TILARAN_CENTER;
  const distanceToTown = isValidPoint(value)
    ? straightLineKm(TILARAN_CENTER, value)
    : null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <MapPin className="size-3 text-accent" />
          Tilarán, Guanacaste
        </span>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input
            value={address}
            onChange={(event) => onAddressChange(event.target.value)}
            placeholder="Calle, número, barrio o referencia"
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Sugerir dirección desde el mapa"
          onClick={suggestAgain}
          disabled={suggesting || !isValidPoint(value)}
          className="shrink-0 border-border/80"
        >
          {suggesting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
        </Button>
      </div>

      <div
        className={cn(
          "relative isolate z-0 overflow-hidden rounded-2xl border border-border/70",
          mapHeight,
        )}
      >
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
          <PickOnMap onPick={(point) => void applyPoint(point)} />
          <FlyTo point={value} token={flyToken} />
          {isValidPoint(value) && (
            <Marker
              position={[value.lat, value.lng]}
              icon={pinIcon}
              draggable
              eventHandlers={{
                dragend: (event) => {
                  const point = event.target.getLatLng();
                  void applyPoint({ lat: point.lat, lng: point.lng });
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {isValidPoint(value)
            ? `Punto fijado · ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}${
                distanceToTown !== null
                  ? ` · a ${formatKm(Math.round(distanceToTown * 10) / 10)} del centro`
                  : ""
              }`
            : "Tocá el mapa o usá tu ubicación para marcar el punto exacto."}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={locate}
          disabled={locating}
          className="gap-1.5 border-border/80"
        >
          {locating ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Crosshair className="size-3.5 text-accent" />
          )}
          Usar mi ubicación
        </Button>
      </div>

      {hint && (
        <p className="rounded-xl border border-border/60 bg-black/25 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
