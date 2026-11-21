import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
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

// Archivos que se meten dentro del APK para que la splash no dependa de
// internet. El manifiesto lo lee AppSplash al arrancar.
const LOCAL_SPLASH_VIDEO = "public/splash-video.mp4";
const LOCAL_SPLASH_IMAGE = "public/splash-image.png";
const LOCAL_SPLASH_POSTER = "public/splash-poster.png";
const BUNDLED_SPLASH_MANIFEST = "src/generated/splash-assets.ts";

async function download(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No pudimos descargar ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error("El archivo supera el tamaño permitido");
  }
  return buffer;
}

/** Splash desde la imagen del administrador: recorte central sin deformar. */
async function writeSplashFromImage(buffer: Buffer) {
  const png = await sharp(buffer)
    .resize(SPLASH_WIDTH, SPLASH_HEIGHT, {
      fit: "cover",
      position: "center",
    })
    .flatten({ background: SPLASH_BACKGROUND })
    .png()
    .toBuffer();
  await writeFile("resources/splash.png", png);
  return png;
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

/** Mueve el índice del MP4 al inicio para que arranque sin esperar al final. */
async function optimizeSplashVideo() {
  const probe = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (probe.error || probe.status !== 0) {
    console.log("ffmpeg no disponible: el video se usa tal cual.");
    return;
  }

  const temp = "public/splash-video.fast.mp4";
  const result = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      LOCAL_SPLASH_VIDEO,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      temp,
    ],
    { stdio: "inherit" },
  );
  if (result.error || result.status !== 0) {
    await rm(temp, { force: true });
    console.log("No pudimos optimizar el video: se usa el original.");
    return;
  }

  await rm(LOCAL_SPLASH_VIDEO, { force: true });
  await rename(temp, LOCAL_SPLASH_VIDEO);
  console.log("Video de splash listo para arrancar sin buffering.");
}

/** Manifiesto que le dice a la app qué splash ya viene dentro del APK. */
async function writeBundledSplashManifest(
  kind: "image" | "video" | null,
  src: string | null,
  poster: string | null,
) {
  await mkdir(path.dirname(BUNDLED_SPLASH_MANIFEST), { recursive: true });
  const content = `// Archivo generado por scripts/fetch-brand-assets.ts. No editar a mano.
// En GitHub Actions se reemplaza con el video/imagen del perfil admin para
// que la splash del APK se reproduzca sin internet.

export type BundledSplashKind = "image" | "video";

export type BundledSplash = {
  kind: BundledSplashKind | null;
  src: string | null;
  poster: string | null;
};

export const bundledSplash: BundledSplash = {
  kind: ${JSON.stringify(kind)},
  src: ${JSON.stringify(src)},
  poster: ${JSON.stringify(poster)},
};
`;
  await writeFile(BUNDLED_SPLASH_MANIFEST, content);
}

async function main() {
  await mkdir("resources", { recursive: true });
  await mkdir("public", { recursive: true });

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

  // Borramos cualquier splash local de una ejecución anterior.
  await rm(LOCAL_SPLASH_VIDEO, { force: true });
  await rm(LOCAL_SPLASH_IMAGE, { force: true });
  await rm(LOCAL_SPLASH_POSTER, { force: true });

  let bundledKind: "image" | "video" | null = null;
  let bundledSrc: string | null = null;
  let bundledPoster: string | null = null;

  if (splashKind === "image" && splashBuffer) {
    const splashPng = await writeSplashFromImage(splashBuffer);
    await writeFile(LOCAL_SPLASH_IMAGE, splashPng);
    bundledKind = "image";
    bundledSrc = "/splash-image.png";
    bundledPoster = "/splash-image.png";
    console.log("Splash vertical 886x1920 actualizada desde el perfil admin.");
  } else if (splashKind === "video" && splashBuffer) {
    // El video viaja dentro del APK: no se descarga al abrir la app.
    await writeFile(LOCAL_SPLASH_VIDEO, splashBuffer);
    await optimizeSplashVideo();
    await writeSplashFromIcon(iconBuffer);
    await copyFile("resources/splash.png", LOCAL_SPLASH_POSTER);
    bundledKind = "video";
    bundledSrc = "/splash-video.mp4";
    bundledPoster = "/splash-poster.png";
    console.log(
      "Video de splash incluido en la app (se reproduce sin internet).",
    );
  } else {
    // Un video no se puede mostrar en la splash nativa: usamos el icono
    // centrado como respaldo. El video se reproduce dentro de la app.
    await writeSplashFromIcon(iconBuffer);
    console.log("Splash vertical 886x1920 generada con el icono de la app.");
  }

  await writeBundledSplashManifest(bundledKind, bundledSrc, bundledPoster);

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
