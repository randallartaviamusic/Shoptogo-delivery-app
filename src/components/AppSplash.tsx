import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";

const IMAGE_SPLASH_MS = 2400;
const VIDEO_SPLASH_MAX_MS = 8000;
const SPLASH_SESSION_PREFIX = "shop-to-go:splash-shown:";

/**
 * Muestra la splash cargada por el administrador y usa el icono de la app como
 * favicon. La splash se ve una vez por sesión; si no hay una configurada, no
 * tapa la app.
 */
export function AppSplash() {
  const branding = useQuery(api.branding.appBranding);
  const splashUrl = branding?.splashUrl ?? null;
  const splashKind = branding?.splashKind ?? "image";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!branding?.iconUrl) return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) return;
    link.href = branding.iconUrl;
    link.removeAttribute("type");
  }, [branding?.iconUrl]);

  useEffect(() => {
    if (!splashUrl) {
      setVisible(false);
      return;
    }

    const key = `${SPLASH_SESSION_PREFIX}${splashUrl}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Sin sessionStorage mostramos la splash igual.
    }

    setVisible(true);
    const timeout = window.setTimeout(
      () => setVisible(false),
      splashKind === "video" ? VIDEO_SPLASH_MAX_MS : IMAGE_SPLASH_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [splashUrl, splashKind]);

  useEffect(() => {
    if (!visible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [visible]);

  if (!visible || !splashUrl) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#0a0a0b]"
      role="status"
      aria-label="Cargando Shop To Go"
    >
      {splashKind === "video" ? (
        <video
          key={splashUrl}
          src={splashUrl}
          poster={branding?.iconUrl ?? undefined}
          autoPlay
          muted
          playsInline
          onEnded={() => setVisible(false)}
          onError={() => setVisible(false)}
          className="size-full object-cover"
        />
      ) : (
        <img
          src={splashUrl}
          alt=""
          onError={() => setVisible(false)}
          className="size-full object-cover"
        />
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/70 to-transparent" />
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="absolute bottom-5 right-5 rounded-full border border-white/25 bg-black/55 px-4 py-2 text-[11px] font-semibold text-white backdrop-blur transition-colors hover:bg-black/75"
      >
        Saltar
      </button>
    </div>
  );
}
