import type { GeoPoint } from "@/lib/delivery";

/**
 * Dirección aproximada de un punto del mapa (Nominatim / OpenStreetMap).
 * No tiene costo ni necesita API key. Si falla, se sigue pudiendo escribir la
 * dirección a mano.
 */
export async function reverseGeocode(point: GeoPoint): Promise<string | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(point.lat));
    url.searchParams.set("lon", String(point.lng));
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "es");

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };
    const address = data.address ?? {};
    const street = address.road ?? address.pedestrian ?? address.path;
    const neighbourhood =
      address.neighbourhood ?? address.suburb ?? address.village ?? address.town;

    const parts = [
      street ? `${street}${address.house_number ? ` ${address.house_number}` : ""}` : null,
      neighbourhood,
      address.city ?? address.county,
    ].filter(Boolean);

    if (parts.length > 0) return parts.slice(0, 3).join(", ");
    return data.display_name?.split(",").slice(0, 3).join(",").trim() ?? null;
  } catch {
    return null;
  }
}
