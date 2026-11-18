import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Rutas y geocodificación.
 *
 * Antes el mapa unía los puntos con una línea recta y multiplicaba por 1,25
 * para adivinar la distancia. Ahora se le pide la ruta a un motor real y se
 * cachea el resultado: la tarifa no cambia (sigue siendo fija por zona), pero
 * la ETA, la geometría del mapa y la distancia que ve el repartidor sí son las
 * de la calle.
 *
 * Endpoints configurables por entorno:
 *   ROUTING_BASE_URL   servidor compatible con OSRM (por defecto el demo público).
 *   GEOCODE_BASE_URL   servidor compatible con Nominatim.
 * El demo público de OSRM y Nominatim sirven para el piloto, no para volumen
 * alto: sus políticas piden como máximo una consulta por segundo, atribución
 * visible y caché. Por eso todo pasa por la caché de Convex.
 */

type RoutePoint = { lat: number; lng: number };

/** Tipos explícitos: sin ellos el `api` generado entra en un ciclo de inferencia. */
type RouteResult = {
  km: number;
  minutes: number;
  geometry: RoutePoint[];
  source: string;
  cached: boolean;
};

type GeocodeResult = { label: string; lat: number; lng: number };

const ROUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const GEOCODE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Tilarán y alrededores: la búsqueda no debe devolver direcciones de Panamá. */
const TILARAN_VIEWBOX = "-85.15,10.62,-84.80,10.40";

function routingBase() {
  return (
    process.env.ROUTING_BASE_URL?.trim() || "https://router.project-osrm.org"
  ).replace(/\/+$/, "");
}

function geocodeBase() {
  return (
    process.env.GEOCODE_BASE_URL?.trim() ||
    "https://nominatim.openstreetmap.org"
  ).replace(/\/+$/, "");
}

/** Identificarse es requisito de Nominatim, no una cortesía. */
function userAgent() {
  return (
    process.env.GEOCODE_USER_AGENT?.trim() ||
    "ShopToGo/1.0 (operacion@shoptogo.cr)"
  );
}

function roundPoint(point: { lat: number; lng: number }) {
  return {
    lat: Math.round(point.lat * 1e4) / 1e4,
    lng: Math.round(point.lng * 1e4) / 1e4,
  };
}

function routeKey(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const a = roundPoint(from);
  const b = roundPoint(to);
  return `${a.lat},${a.lng}>${b.lat},${b.lng}`;
}

export const cachedRoute = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const hit = await ctx.db
      .query("routeCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (!hit) return null;
    if (Date.now() - hit.createdAt > ROUTE_TTL_MS) return null;
    return hit;
  },
});

export const storeRoute = internalMutation({
  args: {
    key: v.string(),
    km: v.number(),
    minutes: v.number(),
    geometry: v.array(v.object({ lat: v.number(), lng: v.number() })),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("routeCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    const patch = {
      km: args.km,
      minutes: args.minutes,
      geometry: args.geometry,
      source: args.source,
      createdAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("routeCache", { key: args.key, ...patch });
  },
});

export const cachedGeocode = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const hit = await ctx.db
      .query("geocodeCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (!hit) return null;
    if (Date.now() - hit.createdAt > GEOCODE_TTL_MS) return null;
    return hit;
  },
});

export const storeGeocode = internalMutation({
  args: {
    key: v.string(),
    results: v.array(
      v.object({ label: v.string(), lat: v.number(), lng: v.number() }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("geocodeCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        results: args.results,
        createdAt: Date.now(),
      });
    } else {
      await ctx.db.insert("geocodeCache", {
        key: args.key,
        results: args.results,
        createdAt: Date.now(),
      });
    }
  },
});

const pointValidator = v.object({ lat: v.number(), lng: v.number() });

/**
 * Ruta real entre dos puntos. Devuelve null si el motor no responde: la app
 * cae a la estimación local y nunca deja el mapa en blanco.
 */
export const route = action({
  args: { from: pointValidator, to: pointValidator },
  handler: async (ctx, args): Promise<RouteResult | null> => {
    const key = routeKey(args.from, args.to);
    const cached: {
      km: number;
      minutes: number;
      geometry: RoutePoint[];
      source: string;
    } | null = await ctx.runQuery(internal.maps.cachedRoute, { key });
    if (cached) {
      return {
        km: cached.km,
        minutes: cached.minutes,
        geometry: cached.geometry,
        source: cached.source,
        cached: true,
      };
    }

    const from = roundPoint(args.from);
    const to = roundPoint(args.to);
    const url = `${routingBase()}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=simplified&geometries=geojson`;

    let payload: {
      code?: string;
      routes?: Array<{
        distance?: number;
        duration?: number;
        geometry?: { coordinates?: number[][] };
      }>;
    };
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return null;
      payload = await response.json();
    } catch {
      return null;
    }

    const best = payload.routes?.[0];
    if (!best || typeof best.distance !== "number") return null;

    // OSRM devuelve [lng, lat]; el mapa espera {lat, lng}.
    const geometry: RoutePoint[] = (best.geometry?.coordinates ?? [])
      .map((pair) => ({ lat: pair[1], lng: pair[0] }))
      .filter(
        (point) =>
          Number.isFinite(point.lat) &&
          Number.isFinite(point.lng) &&
          Math.abs(point.lat) <= 90 &&
          Math.abs(point.lng) <= 180,
      );

    const km = Math.round((best.distance / 1000) * 10) / 10;
    const minutes = Math.max(1, Math.round((best.duration ?? 0) / 60));
    const source = routingBase().includes("project-osrm")
      ? "OSRM / OpenStreetMap"
      : new URL(routingBase()).host;

    await ctx.runMutation(internal.maps.storeRoute, {
      key,
      km,
      minutes,
      geometry,
      source,
    });

    return { km, minutes, geometry, source, cached: false };
  },
});

/**
 * Buscar una dirección escrita ("frente a la iglesia de Tilarán"). Devuelve
 * hasta 5 candidatos con coordenadas para que el cliente elija: geocodificar
 * a ciegas puede mandar al repartidor a la calle equivocada.
 */
export const geocode = action({
  args: { query: v.string() },
  handler: async (ctx, args): Promise<GeocodeResult[]> => {
    const query = args.query.trim().replace(/\s+/g, " ");
    if (query.length < 5) return [];
    const key = query.toLowerCase();

    const cached: { results: GeocodeResult[] } | null = await ctx.runQuery(
      internal.maps.cachedGeocode,
      { key },
    );
    if (cached) return cached.results;

    const url = new URL(`${geocodeBase()}/search`);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "5");
    url.searchParams.set("accept-language", "es");
    url.searchParams.set("countrycodes", "cr");
    url.searchParams.set("viewbox", TILARAN_VIEWBOX);
    url.searchParams.set("bounded", "1");

    let payload: Array<{ display_name?: string; lat?: string; lon?: string }>;
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": userAgent(),
        },
      });
      if (!response.ok) return [];
      payload = await response.json();
    } catch {
      return [];
    }

    const results: GeocodeResult[] = payload
      .map((row) => {
        const lat = Number(row.lat);
        const lng = Number(row.lon);
        if (!row.display_name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }
        return {
          label: row.display_name.split(",").slice(0, 3).join(",").trim(),
          lat,
          lng,
        };
      })
      .filter((row): row is GeocodeResult => !!row);

    if (results.length > 0) {
      await ctx.runMutation(internal.maps.storeGeocode, { key, results });
    }
    return results;
  },
});
