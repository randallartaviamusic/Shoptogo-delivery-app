import { api } from "@/convex/_generated/api";
import { Capacitor } from "@capacitor/core";
import { useQuery } from "convex/react";
import { Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const IMAGE_SPLASH_MS = 2400;
const SPLASH_SESSION_PREFIX = "shop-to-go:splash-shown:";

/**
 * Muestra la splash cargada por el administrador y usa el icono de la app como
 * favicon. La splash se ve una vez por sesión; si no hay una configurada, no
 * tapa la app. La de video se reproduce una sola vez, con audio, y al terminar
 * deja entrar a la plataforma.
 */
export function AppSplash() {
  const branding = useQuery(api.branding.appBranding);
  const splashUrl = branding?.splashUrl ?? null;
  const splashKind = branding?.splashKind ?? "image";
  const [visible, setVisible] = useState(false);
  const [needsSoundTap, setNeedsSoundTap] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

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
    setNeedsSoundTap(false);

    // El video se reproduce completo y cierra solo al terminar. La imagen sí
    // tiene un tiempo fijo.
    if (splashKind === "video") return;

    const timeout = window.setTimeout(
      () => setVisible(false),
      IMAGE_SPLASH_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [splashUrl, splashKind]);

  useEffect(() => {
    if (!visible || splashKind !== "video") return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;

    const start = async () => {
      video.volume = 1;
      video.muted = false;
      try {
        await video.play();
      } catch (error) {
        if (cancelled) return;

        // Si no fue un bloqueo de autoplay (por ejemplo, la reproducción se
        // interrumpió mientras cargaba), reintentamos con audio.
        const blocked =
          error instanceof DOMException && error.name === "NotAllowedError";
        if (!blocked) {
          try {
            await video.play();
          } catch {
            if (!cancelled) setVisible(false);
          }
          return;
        }

        // El sistema bloqueó el audio: reproducimos en silencio para no trabar
        // la entrada y mostramos el botón para activarlo con un toque.
        video.muted = true;
        setNeedsSoundTap(true);
        try {
          await video.play();
        } catch {
          if (!cancelled) setVisible(false);
        }
      }
    };

    void start();
    return () => {
      cancelled = true;
    };
  }, [visible, splashKind, splashUrl]);

  // En un navegador que bloqueó el audio, el primer toque en cualquier parte
  // de la pantalla lo activa. En el APK el audio ya arranca solo.
  useEffect(() => {
    if (!visible || splashKind !== "video") return;

    const resumeWithSound = () => {
      const video = videoRef.current;
      if (!video) return;
      video.volume = 1;
      video.muted = false;
      setNeedsSoundTap(false);
      if (video.paused) void video.play();
    };

    window.addEventListener("pointerdown", resumeWithSound, { once: true });
    window.addEventListener("keydown", resumeWithSound, { once: true });
    return () => {
      window.removeEventListener("pointerdown", resumeWithSound);
      window.removeEventListener("keydown", resumeWithSound);
    };
  }, [visible, splashKind]);

  useEffect(() => {
    if (!visible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [visible]);

  function enableSound() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    video.volume = 1;
    setNeedsSoundTap(false);
    void video.play();
  }

  if (!visible || !splashUrl) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#0a0a0b]"
      role="status"
      aria-label="Cargando Shop To Go"
    >
      {splashKind === "video" ? (
        <video
          ref={videoRef}
          key={splashUrl}
          src={splashUrl}
          poster={branding?.iconUrl ?? undefined}
          autoPlay
          playsInline
          preload="auto"
          onPlaying={(event) => {
            const video = event.currentTarget;
            if (Capacitor.isNativePlatform()) {
              // Dentro del APK aseguramos audio y volumen completo al arrancar.
              video.volume = 1;
              video.muted = false;
            }
            // Si el sistema lo dejó en silencio, ofrecemos activar el audio.
            if (video.muted) setNeedsSoundTap(true);
          }}
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
      {needsSoundTap && (
        <button
          type="button"
          onClick={enableSound}
          className="absolute bottom-5 left-5 flex items-center gap-2 rounded-full border border-white/25 bg-black/55 px-4 py-2 text-[11px] font-semibold text-white backdrop-blur transition-colors hover:bg-black/75"
        >
          <Volume2 className="size-3.5" />
          Activar sonido
        </button>
      )}
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
