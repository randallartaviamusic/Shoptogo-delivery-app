/**
 * Tarjetas para compartir fuera de la plataforma.
 *
 * Cada tarjeta se dibuja en un canvas (1080 × 1350) con el mismo aspecto
 * oscuro del mazo de swipe: foto, nombre, precio o datos del local, más un
 * pie con el QR que sube el administrador, el link de descarga y el texto
 * "Descarga la app, ingresa y compra ahora".
 */

const CARD_W = 1080;
const CARD_H = 1350;
const MARGIN = 64;

const BG = "#0d0b09";
const PANEL = "#171310";
const CREAM = "#f7f5f0";
const MUTED = "rgba(247,245,240,0.62)";
const FAINT = "rgba(247,245,240,0.38)";
const EMBER_TOP = "#fbbf24";
const EMBER_MID = "#f97316";
const EMBER_LOW = "#ef4444";

export type ShareCardData = {
  qrUrl: string | null;
  appUrl: string;
};

export type ProductShare = ShareCardData & {
  photoUrl: string;
  productName: string;
  price: number;
  businessName: string;
  category: string;
};

export type BusinessShare = ShareCardData & {
  imageUrl: string;
  businessName: string;
  category: string;
  tagline: string;
  rating: number;
  productCount: number;
  etaMinutes: number;
};

export type StoreShare = ShareCardData & {
  imageUrl: string;
  businessName: string;
  tagline: string;
  productPhotos: string[];
};

function font(weight: number, size: number) {
  return `${weight} ${size}px Sora, Manrope, Arial, sans-serif`;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

async function loadBitmap(url: string): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return null;
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap | null,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  label: string,
) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.save();
  ctx.clip();
  if (bitmap) {
    const scale = Math.max(w / bitmap.width, h / bitmap.height);
    const dw = bitmap.width * scale;
    const dh = bitmap.height * scale;
    ctx.drawImage(bitmap, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } else {
    const gradient = ctx.createLinearGradient(x, y, x, y + h);
    gradient.addColorStop(0, "#3a2a1e");
    gradient.addColorStop(1, "#141010");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = FAINT;
    ctx.font = font(800, 150);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label.slice(0, 1).toUpperCase() || "S", x + w / 2, y + h / 2);
  }
  ctx.restore();
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) {
        current = "";
        break;
      }
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/…?$/, "")}…`;
  }
  return lines;
}

function paintBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const glow = ctx.createRadialGradient(
    CARD_W / 2,
    -120,
    60,
    CARD_W / 2,
    -120,
    760,
  );
  glow.addColorStop(0, "rgba(249,115,22,0.28)");
  glow.addColorStop(0.5, "rgba(249,115,22,0.07)");
  glow.addColorStop(1, "rgba(249,115,22,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
}

function paintBrand(ctx: CanvasRenderingContext2D, label: string) {
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = font(800, 34);
  const dotX = MARGIN + 14;
  ctx.fillStyle = EMBER_MID;
  ctx.beginPath();
  ctx.arc(dotX, 66, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = CREAM;
  ctx.fillText("SHOP TO GO", MARGIN + 38, 78);
  ctx.textAlign = "right";
  ctx.fillStyle = FAINT;
  ctx.font = font(700, 26);
  ctx.fillText(label.toUpperCase(), CARD_W - MARGIN, 76);
  ctx.textAlign = "left";
}

function paintPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts?: { dark?: boolean; fontSize?: number },
) {
  const size = opts?.fontSize ?? 30;
  ctx.font = font(800, size);
  const w = ctx.measureText(text).width + 56;
  const h = size + 34;
  const gradient = opts?.dark
    ? null
    : ctx.createLinearGradient(x, y, x + w, y);
  roundRectPath(ctx, x, y, w, h, h / 2);
  if (gradient) {
    gradient.addColorStop(0, EMBER_LOW);
    gradient.addColorStop(0.55, EMBER_MID);
    gradient.addColorStop(1, EMBER_TOP);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = "rgba(0,0,0,0.62)";
  }
  ctx.fill();
  ctx.fillStyle = opts?.dark ? CREAM : "#140c06";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 28, y + h / 2 + 2);
  ctx.textBaseline = "alphabetic";
  return w;
}

function shortLink(appUrl: string) {
  return appUrl.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

async function paintFooter(
  ctx: CanvasRenderingContext2D,
  data: ShareCardData,
  top: number,
) {
  ctx.fillStyle = "rgba(247,245,240,0.14)";
  ctx.fillRect(MARGIN, top, CARD_W - MARGIN * 2, 3);

  const qrSize = 236;
  const qrX = MARGIN + 8;
  const qrY = top + 34;
  const qr = data.qrUrl ? await loadBitmap(data.qrUrl) : null;
  roundRectPath(ctx, qrX, qrY, qrSize, qrSize, 36);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(qrX, qrY, qrSize, qrSize);
  if (qr) {
    const inset = 18;
    const scale = Math.min(
      (qrSize - inset * 2) / qr.width,
      (qrSize - inset * 2) / qr.height,
    );
    const dw = qr.width * scale;
    const dh = qr.height * scale;
    ctx.drawImage(qr, qrX + (qrSize - dw) / 2, qrY + (qrSize - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = "#0d0b09";
    ctx.font = font(800, 44);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("QR", qrX + qrSize / 2, qrY + qrSize / 2);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
  }
  ctx.restore();

  const tx = qrX + qrSize + 40;
  const maxW = CARD_W - MARGIN - tx;
  ctx.fillStyle = CREAM;
  ctx.font = font(800, 44);
  const cta = wrapLines(ctx, "Descarga la app, ingresa y compra ahora.", maxW, 3);
  cta.forEach((line, i) => {
    ctx.fillText(line, tx, qrY + 52 + i * 54);
  });
  const linkY = qrY + 52 + cta.length * 54 + 6;
  ctx.fillStyle = EMBER_TOP;
  ctx.font = font(700, 32);
  const link = shortLink(data.appUrl);
  const linkLines = wrapLines(ctx, link, maxW, 2);
  linkLines.forEach((line, i) => {
    ctx.fillText(line, tx, linkY + i * 40);
  });
}

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement("canvas");
  element.width = CARD_W;
  element.height = CARD_H;
  const ctx = element.getContext("2d");
  if (!ctx) throw new Error("Tu teléfono no pudo crear la imagen");
  return [element, ctx];
}

async function toPng(element: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) =>
    element.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("No pudimos generar la imagen");
  return blob;
}

function paintPricePill(ctx: CanvasRenderingContext2D, price: number, right: number, y: number) {
  const text = `₡${Math.round(price).toLocaleString("es-CR")}`;
  ctx.font = font(800, 34);
  const w = ctx.measureText(text).width + 60;
  paintPill(ctx, text, right - w, y, { fontSize: 34 });
}

/** Tarjeta de un producto tal como se ve en el mazo de swipe. */
export async function renderProductShareCard(data: ProductShare): Promise<Blob> {
  const [element, ctx] = canvas();
  paintBackground(ctx);
  paintBrand(ctx, "Para vos");

  const photo = await loadBitmap(data.photoUrl);
  const px = MARGIN;
  const py = 108;
  const pw = CARD_W - MARGIN * 2;
  const ph = 640;
  drawCover(ctx, photo, px, py, pw, ph, 48, data.productName);

  const shade = ctx.createLinearGradient(0, py + ph - 260, 0, py + ph);
  shade.addColorStop(0, "rgba(6,6,7,0)");
  shade.addColorStop(1, "rgba(6,6,7,0.88)");
  roundRectPath(ctx, px, py, pw, ph, 48);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = shade;
  ctx.fillRect(px, py + ph - 260, pw, 260);
  ctx.restore();

  // Píldora del local sobre la foto.
  ctx.font = font(700, 27);
  const bizW = ctx.measureText(data.businessName).width + 108;
  roundRectPath(ctx, px + 26, py + 26, bizW, 62, 31);
  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fill();
  ctx.fillStyle = EMBER_MID;
  ctx.beginPath();
  ctx.arc(px + 26 + 36, py + 26 + 31, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#140c06";
  ctx.font = font(800, 24);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(
    data.businessName.slice(0, 1).toUpperCase(),
    px + 26 + 36,
    py + 26 + 33,
  );
  ctx.textAlign = "left";
  ctx.fillStyle = CREAM;
  ctx.font = font(700, 27);
  ctx.fillText(data.businessName, px + 26 + 64, py + 26 + 33);
  ctx.textBaseline = "alphabetic";

  paintPricePill(ctx, data.price, px + pw - 26, py + 26);

  let y = py + ph + 44;
  ctx.fillStyle = EMBER_TOP;
  ctx.font = font(700, 28);
  ctx.fillText(data.category.toUpperCase().slice(0, 42), px, y);
  y += 62;
  ctx.fillStyle = CREAM;
  ctx.font = font(800, 62);
  const nameLines = wrapLines(ctx, data.productName, pw, 2);
  nameLines.forEach((line) => {
    ctx.fillText(line, px, y);
    y += 70;
  });
  y += 6;
  ctx.fillStyle = MUTED;
  ctx.font = font(500, 31);
  const meta = `${data.businessName} · Pedilo en Shop To Go`;
  wrapLines(ctx, meta, pw, 1).forEach((line) => {
    ctx.fillText(line, px, y);
    y += 42;
  });

  await paintFooter(ctx, data, 1022);
  return toPng(element);
}

/** Tarjeta de un local tal como se ve su card en Negocios. */
export async function renderBusinessShareCard(
  data: BusinessShare,
): Promise<Blob> {
  const [element, ctx] = canvas();
  paintBackground(ctx);
  paintBrand(ctx, "Negocios");

  const banner = await loadBitmap(data.imageUrl);
  roundRectPath(ctx, MARGIN, 108, CARD_W - MARGIN * 2, 470, 48);
  ctx.save();
  ctx.clip();
  if (banner) {
    const w = CARD_W - MARGIN * 2;
    const scale = Math.max(w / banner.width, 470 / banner.height);
    ctx.drawImage(
      banner,
      MARGIN + (w - banner.width * scale) / 2,
      108 + (470 - banner.height * scale) / 2,
      banner.width * scale,
      banner.height * scale,
    );
  } else {
    const gradient = ctx.createLinearGradient(0, 108, 0, 578);
    gradient.addColorStop(0, "#3a2a1e");
    gradient.addColorStop(1, "#141010");
    ctx.fillStyle = gradient;
    ctx.fillRect(MARGIN, 108, CARD_W - MARGIN * 2, 470);
  }
  const shade = ctx.createLinearGradient(0, 300, 0, 578);
  shade.addColorStop(0, "rgba(6,6,7,0)");
  shade.addColorStop(1, "rgba(6,6,7,0.92)");
  ctx.fillStyle = shade;
  ctx.fillRect(MARGIN, 300, CARD_W - MARGIN * 2, 278);
  ctx.restore();

  ctx.fillStyle = EMBER_TOP;
  ctx.font = font(700, 28);
  ctx.fillText(data.category.toUpperCase().slice(0, 42), MARGIN + 32, 492);
  ctx.fillStyle = CREAM;
  ctx.font = font(800, 58);
  wrapLines(ctx, data.businessName, CARD_W - MARGIN * 2 - 64, 1).forEach(
    (line) => ctx.fillText(line, MARGIN + 32, 548),
  );

  let y = 648;
  ctx.fillStyle = MUTED;
  ctx.font = font(500, 32);
  wrapLines(ctx, data.tagline || "Conocé todo su catálogo.", CARD_W - MARGIN * 2, 2).forEach(
    (line) => {
      ctx.fillText(line, MARGIN, y);
      y += 44;
    },
  );
  y += 22;
  ctx.fillStyle = CREAM;
  ctx.font = font(700, 33);
  const stats =
    `★ ${data.rating.toFixed(1)}   ·   ${data.productCount} ` +
    `${data.productCount === 1 ? "producto" : "productos"}   ·   ~${data.etaMinutes} min`;
  ctx.fillText(stats, MARGIN, y);
  y += 30;
  ctx.fillStyle = FAINT;
  ctx.font = font(500, 29);
  ctx.fillText("Buscalo en Shop To Go y pedí sin salir de casa.", MARGIN, y);

  await paintFooter(ctx, data, 1022);
  return toPng(element);
}

/** Tarjeta del perfil de la tienda con su catálogo, para el administrador. */
export async function renderStoreShareCard(data: StoreShare): Promise<Blob> {
  const [element, ctx] = canvas();
  paintBackground(ctx);
  paintBrand(ctx, "Mi tienda");

  const cover = await loadBitmap(data.imageUrl);
  drawCover(ctx, cover, MARGIN, 108, CARD_W - MARGIN * 2, 330, 44, data.businessName);
  const shade = ctx.createLinearGradient(0, 220, 0, 438);
  shade.addColorStop(0, "rgba(6,6,7,0)");
  shade.addColorStop(1, "rgba(6,6,7,0.85)");
  roundRectPath(ctx, MARGIN, 108, CARD_W - MARGIN * 2, 330, 44);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = shade;
  ctx.fillRect(MARGIN, 220, CARD_W - MARGIN * 2, 218);
  ctx.restore();

  ctx.fillStyle = CREAM;
  ctx.font = font(800, 60);
  wrapLines(ctx, data.businessName, CARD_W - MARGIN * 2 - 40, 1).forEach(
    (line) => ctx.fillText(line, MARGIN + 20, 388),
  );

  let y = 500;
  ctx.fillStyle = MUTED;
  ctx.font = font(500, 31);
  wrapLines(
    ctx,
    data.tagline || "Pedí directo por Shop To Go.",
    CARD_W - MARGIN * 2,
    2,
  ).forEach((line) => {
    ctx.fillText(line, MARGIN, y);
    y += 42;
  });

  y += 26;
  ctx.fillStyle = EMBER_TOP;
  ctx.font = font(800, 30);
  ctx.fillText("NUESTRO CATÁLOGO", MARGIN, y);
  y += 24;

  const photos = data.productPhotos.slice(0, 6);
  const gap = 20;
  const tileW = (CARD_W - MARGIN * 2 - gap * 2) / 3;
  const tileH = 196;
  const bitmaps = await Promise.all(photos.map((url) => loadBitmap(url)));
  bitmaps.forEach((bitmap, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    drawCover(
      ctx,
      bitmap,
      MARGIN + col * (tileW + gap),
      y + row * (tileH + gap),
      tileW,
      tileH,
      28,
      data.businessName,
    );
  });
  if (photos.length === 0) {
    ctx.fillStyle = FAINT;
    ctx.font = font(500, 30);
    ctx.fillText("Publicá productos para mostrarlos acá.", MARGIN, y + 60);
  }

  await paintFooter(ctx, data, 1022);
  return toPng(element);
}

export type ShareOutcome = "shared" | "downloaded";

/**
 * Comparte la imagen fuera de la app: usa el menú nativo cuando el teléfono
 * lo permite y si no, la descarga y copia el texto con el link.
 */
export async function shareCardImage(args: {
  blob: Blob;
  filename: string;
  title: string;
  text: string;
}): Promise<ShareOutcome> {
  const file = new File([args.blob], args.filename, { type: "image/png" });
  if (
    typeof navigator.share === "function" &&
    (!navigator.canShare || navigator.canShare({ files: [file] }))
  ) {
    await navigator.share({ files: [file], title: args.title, text: args.text });
    return "shared";
  }
  const url = URL.createObjectURL(args.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = args.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  try {
    await navigator.clipboard.writeText(args.text);
  } catch {
    // El portapapeles puede estar bloqueado: igual queda la imagen descargada.
  }
  return "downloaded";
}
