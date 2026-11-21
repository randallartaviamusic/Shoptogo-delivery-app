import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import sharp from "sharp";
import { api } from "../src/convex/_generated/api";

const ICON_SIZE = 1024;
const SPLASH_SIZE = 2732;
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

async function main() {
  const convexUrl = process.env.VITE_CONVEX_URL?.trim();
  if (!convexUrl) {
    console.log("Sin VITE_CONVEX_URL: dejamos los assets originales.");
    return;
  }

  const client = new ConvexHttpClient(convexUrl);
  const branding = await client.query(api.branding.appBranding, {});
  if (!branding.iconUrl && !branding.splashUrl) {
    console.log("No hay icono ni splash personalizados.");
    return;
  }

  await mkdir("resources", { recursive: true });
  let iconBuffer: Buffer | null = null;

  if (branding.iconUrl) {
    iconBuffer = await download(branding.iconUrl);
    await sharp(iconBuffer)
      .resize(ICON_SIZE, ICON_SIZE, { fit: "cover" })
      .flatten({ background: "#0a0a0b" })
      .png()
      .toFile("resources/icon.png");
    console.log("Icono de la app actualizado desde el perfil admin.");
  }

  if (branding.splashKind === "image" && branding.splashUrl) {
    const splashBuffer = await download(branding.splashUrl);
    await sharp(splashBuffer)
      .resize(SPLASH_SIZE, SPLASH_SIZE, {
        fit: "contain",
        background: "#0a0a0b",
      })
      .png()
      .toFile("resources/splash.png");
    console.log("Splash nativa actualizada desde el perfil admin.");
  } else if (branding.splashKind === "video" && iconBuffer) {
    // Android no reproduce video en la splash nativa. Usamos el icono
    // centrado como respaldo; el video se ve dentro de la app.
    const icon = await sharp(iconBuffer)
      .resize(900, 900, { fit: "contain", background: "#0a0a0b" })
      .png()
      .toBuffer();
    await sharp({
      create: {
        width: SPLASH_SIZE,
        height: SPLASH_SIZE,
        channels: 4,
        background: "#0a0a0b",
      },
    })
      .composite([{ input: icon, gravity: "center" }])
      .png()
      .toFile("resources/splash.png");
    console.log("Splash nativa de respaldo generada desde el icono.");
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
}

main().catch((error) => {
  console.error("Error preparando la identidad de la app:", error);
  process.exitCode = 1;
});
