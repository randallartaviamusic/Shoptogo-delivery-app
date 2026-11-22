import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { MarketingState } from "./marketingState";

/**
 * Difusión automática de la plataforma para cuentas de comprador.
 *
 * El ciclo intercalado repite los intervalos 3, 5, 2, 4 y 1 hora. Cada aviso
 * alterna entre un anuncio creativo y un producto destacado al azar; los
 * productos nuevos se anuncian aparte en cuanto se publican. Los productos
 * destacados no se repiten hasta agotar los disponibles.
 */

const HOUR_MS = 60 * 60 * 1000;
const CYCLE_HOURS = [3, 5, 2, 4, 1];
const MAX_RECENT_PRODUCTS = 40;

type CreativeAd = {
  title: string;
  body: string;
  url: string;
};

const CREATIVE_ADS: CreativeAd[] = [
  {
    title: "¿Antojo? Resolvelo en minutos",
    body: "Abrí Shop To Go, deslizá el mazo y pedí sin salir de casa.",
    url: "/swipe",
  },
  {
    title: "Hoy se come rico",
    body: "Entrá, elegí tu antojo y seguí tu pedido en la app.",
    url: "/swipe",
  },
  {
    title: "Tus favoritos te esperan",
    body: "Guardá lo que te gusta y pedilo cuando tengas hambre.",
    url: "/favorites",
  },
  {
    title: "Apoyá a tu barrio",
    body: "Pedí directo a los locales y ayudá a que la zona siga cocinando.",
    url: "/negocios",
  },
  {
    title: "¿Cena resuelta?",
    body: "Elegí, confirmá y esperá tu pedido en la puerta.",
    url: "/swipe",
  },
  {
    title: "Merienda, almuerzo o cena",
    body: "Siempre hay un antojo cerca: abrí Shop To Go y pedilo.",
    url: "/swipe",
  },
  {
    title: "Pedí sin vueltas",
    body: "Elegí tu producto, confirmá y seguí la entrega en la app.",
    url: "/swipe",
  },
  {
    title: "El mazo tiene algo para vos",
    body: "Deslizá, guardá tus antojos y pedí el que más te tiente.",
    url: "/swipe",
  },
];

function formatPrice(value: number) {
  return `₡${Math.round(value).toLocaleString("es-CR")}`;
}

function randomIndex(length: number, exclude: number) {
  if (length <= 0) return -1;
  if (length === 1) return 0;
  let index = Math.floor(Math.random() * length);
  let guard = 0;
  while (index === exclude && guard < 10) {
    index = Math.floor(Math.random() * length);
    guard += 1;
  }
  return index;
}

type TickResult = {
  due: boolean;
  initialized?: boolean;
  kind?: "creative" | "product";
  productId?: string | null;
  nextAt: number;
  count?: number;
};

/** Aviso programado: alterna anuncio creativo y producto destacado. */
export const tickMarketing = internalAction({
  args: {},
  handler: async (ctx): Promise<TickResult> => {
    const now = Date.now();
    const state: MarketingState | null = await ctx.runQuery(
      internal.marketingState.marketingState,
      {},
    );
    if (!state) {
      const initialized: MarketingState = {
        count: 0,
        nextAt: now + CYCLE_HOURS[0] * HOUR_MS,
        recentProducts: [],
        lastCreative: -1,
      };
      await ctx.runMutation(
        internal.marketingState.saveMarketingState,
        initialized,
      );
      return { due: false, initialized: true, nextAt: initialized.nextAt };
    }
    if (now < state.nextAt) {
      return { due: false, nextAt: state.nextAt, count: state.count };
    }

    let recentProducts = state.recentProducts;
    let lastCreative = state.lastCreative;
    let kind: "creative" | "product" =
      state.count % 2 === 1 ? "product" : "creative";
    let title = "";
    let body = "";
    let url = "/swipe";
    let tag = "shop-to-go-creative";
    let productId: string | null = null;

    if (kind === "product") {
      let pick = await ctx.runQuery(
        internal.marketingState.randomProductPick,
        { exclude: recentProducts },
      );
      if (pick.status === "exhausted") {
        recentProducts = [];
        pick = await ctx.runQuery(
          internal.marketingState.randomProductPick,
          { exclude: [] },
        );
      }
      if (pick.status === "picked") {
        productId = pick.productId;
        title = `${pick.name} en ${pick.businessName}`;
        body = `${formatPrice(pick.price)} · Pedilo ahora en Shop To Go.`;
        url = `/negocios/${pick.slug}`;
        tag = "shop-to-go-producto";
        recentProducts = [pick.productId, ...recentProducts].slice(
          0,
          MAX_RECENT_PRODUCTS,
        );
      } else {
        kind = "creative";
      }
    }

    if (kind === "creative") {
      const index = randomIndex(CREATIVE_ADS.length, lastCreative);
      const creative = CREATIVE_ADS[index] ?? CREATIVE_ADS[0];
      lastCreative = index;
      title = creative.title;
      body = creative.body;
      url = creative.url;
      tag = "shop-to-go-creative";
    }

    await ctx.scheduler.runAfter(0, internal.pushNode.sendBuyerBroadcast, {
      title,
      body,
      url,
      tag,
    });

    const count = state.count + 1;
    const nextAt = now + CYCLE_HOURS[count % CYCLE_HOURS.length] * HOUR_MS;
    await ctx.runMutation(internal.marketingState.saveMarketingState, {
      count,
      nextAt,
      recentProducts,
      lastCreative,
    });

    return { due: true, kind, productId, nextAt, count };
  },
});

/** Anuncia un producto nuevo a los compradores con avisos activados. */
export const announceNewProduct = internalAction({
  args: { productId: v.id("products") },
  handler: async (
    ctx,
    args,
  ): Promise<{ scheduled: boolean; reason?: string; productId?: string }> => {
    const item = await ctx.runQuery(
      internal.marketingState.productAnnouncement,
      { productId: args.productId },
    );
    if (!item) {
      return { scheduled: false, reason: "producto no disponible" };
    }

    await ctx.scheduler.runAfter(0, internal.pushNode.sendBuyerBroadcast, {
      title: `Nuevo en ${item.businessName}: ${item.name}`,
      body: `${formatPrice(item.price)} · Recién publicado, entrá a verlo.`,
      url: `/negocios/${item.slug}`,
      tag: "shop-to-go-nuevo",
    });
    return { scheduled: true, productId: String(args.productId) };
  },
});
