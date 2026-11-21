import defaultLogo from "@/assets/logo.svg";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  ImageUp,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Video,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

const ICON_MAX_BYTES = 8 * 1024 * 1024;
const SPLASH_MAX_BYTES = 30 * 1024 * 1024;

type SplashPreview = {
  url: string;
  kind: "image" | "video";
};

/**
 * Identidad de la app que se instala: icono del teléfono y splash.
 *
 * El icono y la splash nativa viajan dentro del APK, así que se aplican al
 * volver a compilarlo. La splash de imagen o video que se muestra dentro de la
 * app se actualiza sola, sin reconstruir.
 */
export function AppBrandingAdmin() {
  const appBranding = useQuery(api.branding.appBranding);
  const generateUploadUrl = useMutation(
    api.branding.generateAppAssetUploadUrl,
  );
  const setAppIcon = useMutation(api.branding.setAppIcon);
  const setSplash = useMutation(api.branding.setSplash);
  const resetAppIcon = useMutation(api.branding.resetAppIcon);
  const resetSplash = useMutation(api.branding.resetSplash);

  const iconInputRef = useRef<HTMLInputElement>(null);
  const splashInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<"icon" | "splash" | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [splashPreview, setSplashPreview] = useState<SplashPreview | null>(null);

  const effectiveIcon =
    iconPreview ?? appBranding?.customIconUrl ?? appBranding?.iconUrl ?? defaultLogo;
  const effectiveSplash: SplashPreview | null =
    splashPreview ??
    (appBranding?.splashUrl
      ? {
          url: appBranding.splashUrl,
          kind: appBranding.splashKind ?? "image",
        }
      : null);

  async function uploadAsset(file: File | undefined, kind: "icon" | "splash") {
    if (!file) return;

    if (kind === "icon" && !file.type.startsWith("image/")) {
      toast.error("Elegí una imagen para el icono");
      return;
    }
    if (
      kind === "splash" &&
      !file.type.startsWith("image/") &&
      !file.type.startsWith("video/")
    ) {
      toast.error("Elegí una imagen o un video para la splash");
      return;
    }

    const max = kind === "icon" ? ICON_MAX_BYTES : SPLASH_MAX_BYTES;
    if (file.size > max) {
      toast.error(
        kind === "icon"
          ? "El icono no puede pesar más de 8 MB"
          : "La splash no puede pesar más de 30 MB",
      );
      return;
    }

    setUploading(kind);
    try {
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("No pudimos subir el archivo");
      const { storageId } = (await response.json()) as { storageId: string };

      if (kind === "icon") {
        await setAppIcon({ storageId: storageId as Id<"_storage"> });
        setIconPreview(URL.createObjectURL(file));
        toast.success("Icono de la app actualizado");
      } else {
        const saved = await setSplash({
          storageId: storageId as Id<"_storage">,
        });
        setSplashPreview({
          url: URL.createObjectURL(file),
          kind: saved.kind,
        });
        toast.success(
          saved.kind === "video"
            ? "Video de splash guardado"
            : "Imagen de splash guardada",
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos subir el archivo",
      );
    } finally {
      setUploading(null);
      if (kind === "icon" && iconInputRef.current) {
        iconInputRef.current.value = "";
      }
      if (kind === "splash" && splashInputRef.current) {
        splashInputRef.current.value = "";
      }
    }
  }

  async function resetIcon() {
    setUploading("icon");
    try {
      await resetAppIcon();
      setIconPreview(null);
      toast.success("Volvimos al logo de la plataforma");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos cambiar el icono",
      );
    } finally {
      setUploading(null);
    }
  }

  async function resetSplashAction() {
    setUploading("splash");
    try {
      await resetSplash();
      setSplashPreview(null);
      toast.success("Splash restablecida");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos cambiar la splash",
      );
    } finally {
      setUploading(null);
    }
  }

  return (
    <section className="surface-raised mt-5 rounded-3xl p-5 sm:p-6">
      <div>
        <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
          <ShieldCheck className="size-3.5" />
          Perfil administrador
        </p>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Smartphone className="size-4 text-accent" />
          Icono y splash de la app
        </h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Elegí desde la galería el icono que va a tener la app y la pantalla
          que aparece al abrirla. Podés usar una imagen o un video para la
          splash.
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-black/25 p-4">
          <p className="text-sm font-semibold">Icono de la app</p>
          <div className="mt-3 flex items-center gap-4">
            <div className="size-24 shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-[#0a0a0b]">
              <img
                src={effectiveIcon}
                alt="Icono de la app"
                className="size-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2 border-border/80"
                disabled={uploading === "icon"}
                onClick={() => iconInputRef.current?.click()}
              >
                {uploading === "icon" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ImageUp className="size-3.5" />
                )}
                {uploading === "icon"
                  ? "Subiendo..."
                  : appBranding?.customIconUrl
                    ? "Cambiar icono"
                    : "Subir icono"}
              </Button>
              {appBranding?.customIconUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full gap-2 text-muted-foreground"
                  disabled={uploading === "icon"}
                  onClick={() => void resetIcon()}
                >
                  <RotateCcw className="size-3.5" />
                  Usar logo
                </Button>
              )}
            </div>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
            Cuadrado, PNG, JPG, WebP o SVG, hasta 8 MB. Si no subís uno, se usa
            el logo de la plataforma.
          </p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-black/25 p-4">
          <p className="text-sm font-semibold">Splash de la app</p>
          <div className="mx-auto mt-3 aspect-[886/1920] w-36 overflow-hidden rounded-2xl border border-border/70 bg-[#0a0a0b]">
            {effectiveSplash ? (
              effectiveSplash.kind === "video" ? (
                <video
                  src={effectiveSplash.url}
                  aria-label="Vista previa de la splash"
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="size-full object-cover"
                />
              ) : (
                <img
                  src={effectiveSplash.url}
                  alt="Vista previa de la splash"
                  className="size-full object-cover"
                />
              )
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
                <Video className="size-5" />
                <span className="text-[10px]">Splash original</span>
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 gap-2 border-border/80"
              disabled={uploading === "splash"}
              onClick={() => splashInputRef.current?.click()}
            >
              {uploading === "splash" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ImageUp className="size-3.5" />
              )}
              {uploading === "splash"
                ? "Subiendo..."
                : effectiveSplash
                  ? "Cambiar splash"
                  : "Subir splash"}
            </Button>
            {effectiveSplash && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground"
                disabled={uploading === "splash"}
                onClick={() => void resetSplashAction()}
              >
                <RotateCcw className="size-3.5" />
                Quitar
              </Button>
            )}
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
            Vertical 886 × 1920 px (9:19.5). Se recorta al centro para llenar
            toda la pantalla. Imagen o video desde la galería, hasta 30 MB (MP4
            recomendado). Para el APK se usa una imagen nativa; el video se
            reproduce dentro de la app.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-accent/25 bg-accent/[0.06] p-4 text-[11px] leading-relaxed text-muted-foreground">
        <strong className="text-foreground">Para que se vea en el teléfono:</strong>{" "}
        el icono del home y la splash nativa se graban al compilar el APK.
        Después de subirlos, generá un APK nuevo desde GitHub Actions. La splash
        que se ve dentro de la app se actualiza al instante.
      </div>

      <input
        ref={iconInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) =>
          void uploadAsset(event.target.files?.[0], "icon")
        }
      />
      <input
        ref={splashInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(event) =>
          void uploadAsset(event.target.files?.[0], "splash")
        }
      />
    </section>
  );
}
