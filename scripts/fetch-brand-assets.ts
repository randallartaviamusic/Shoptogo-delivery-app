import { spawnSync } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import sharp from "sharp";
import { api } from "../src/convex/_generated/api";

const ICON_SIZE = 1024;
// Pantalla vertical de referencia: 886x1920 px (relación 9:19.5).
const SPLASH_WIDTH = 886;
const SPLASH_HEIGHT = 1920;
const SPLASH_BACKGROUND = "#0a0a0b";
const MAX_BYTES = 30 * 1024 * 1024;

async function download(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No pudimos descargar ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error("La imagen supera el tamaño permitido");
  }
  return buffer;
}

/** Splash desde la imagen del administrador: recorte central sin deformar. */
async function writeSplashFromImage(buffer: Buffer) {
  await sharp(buffer)
    .resize(SPLASH_WIDTH, SPLASH_HEIGHT, {
      fit: "cover",
      position: "center",
    })
    .flatten({ background: SPLASH_BACKGROUND })
    .png()
    .toFile("resources/splash.png");
}

/** Splash de respaldo: logo de la app centrado en el lienzo vertical. */
async function writeSplashFromIcon(iconBuffer: Buffer | null) {
  const logo = await sharp(iconBuffer ?? "resources/icon.png")
    .resize({ width: Math.round(SPLASH_WIDTH * 0.45) })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: SPLASH_WIDTH,
      height: SPLASH_HEIGHT,
      channels: 4,
      background: SPLASH_BACKGROUND,
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile("resources/splash.png");
}

/**
 * capacitor-assets recorta la splash a tamaños fijos (por ejemplo 1280x1920,
 * proporción de tableta). Volvemos a escribir cada variante con la proporción
 * vertical del teléfono para que ocupe toda la pantalla sin deformarse.
 */
async function fitAndroidSplashes() {
  const resDir = path.join("android", "app", "src", "main", "res");
  const entries = await readdir(resDir, { withFileTypes: true });
  const splash = await sharp("resources/splash.png").png().toBuffer();

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("drawable")) continue;

    const splashPath = path.join(resDir, entry.name, "splash.png");
    try {
      const { width, height } = await sharp(splashPath).metadata();
      if (!width || !height) continue;

      if (entry.name === "drawable") {
        await sharp(splash)
          .resize(SPLASH_WIDTH, SPLASH_HEIGHT, { fit: "cover" })
          .png()
          .toFile(splashPath);
        continue;
      }

      const portrait = !entry.name.includes("land");
      const targetWidth = portrait
        ? Math.max(1, Math.round((height * SPLASH_WIDTH) / SPLASH_HEIGHT))
        : width;

      await sharp(splash)
        .resize(targetWidth, height, { fit: "cover", position: "center" })
        .png()
        .toFile(splashPath);
    } catch {
      // Esa carpeta no tiene splash.png.
    }
  }
}

async function main() {
  await mkdir("resources", { recursive: true });

  const convexUrl = process.env.VITE_CONVEX_URL?.trim();
  let iconBuffer: Buffer | null = null;
  let splashBuffer: Buffer | null = null;
  let splashKind: "image" | "video" | null = null;

  if (convexUrl) {
    const client = new ConvexHttpClient(convexUrl);
    const branding = await client.query(api.branding.appBranding, {});

    if (branding.iconUrl) {
      iconBuffer = await download(branding.iconUrl);
      await sharp(iconBuffer)
        .resize(ICON_SIZE, ICON_SIZE, { fit: "cover" })
        .flatten({ background: SPLASH_BACKGROUND })
        .png()
        .toFile("resources/icon.png");
      console.log("Icono de la app actualizado desde el perfil admin.");
    }

    if (branding.splashUrl) {
      splashBuffer = await download(branding.splashUrl);
      splashKind = branding.splashKind ?? "image";
    }
  } else {
    console.log("Sin VITE_CONVEX_URL: usamos el branding guardado en el repo.");
  }

  if (splashKind === "image" && splashBuffer) {
    await writeSplashFromImage(splashBuffer);
    console.log("Splash vertical 886x1920 actualizada desde el perfil admin.");
  } else {
    // Un video no se puede mostrar en la splash nativa: usamos el icono
    // centrado como respaldo. El video se reproduce dentro de la app.
    await writeSplashFromIcon(iconBuffer);
    console.log("Splash vertical 886x1920 generada con el icono de la app.");
  }

  const command = process.platform === "win32" ? "bunx.cmd" : "bunx";
  const result = spawnSync(
    command,
    ["capacitor-assets", "generate", "--android"],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error("No pudimos generar los iconos y splash de Android");
  }

  await fitAndroidSplashes();
  console.log("Splash de Android ajustada a 886x1920 (pantalla completa).");
}

main().catch((error) => {
  console.error("Error preparando la identidad de la app:", error);
  process.exitCode = 1;
});
