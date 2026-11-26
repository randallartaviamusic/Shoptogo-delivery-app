import { DishImage } from "@/components/DishImage";
import { cn } from "@/lib/utils";
import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Media de una card de producto: si el local subió un video, se reproduce en
 * silencio y en bucle; si no, se muestra la imagen de siempre.
 */
export function ProductMedia({
  image,
  video,
  alt,
  className,
  imgClassName,
  withSoundToggle = false,
}: {
  image?: string;
  video?: string | null;
  alt: string;
  className?: string;
  imgClassName?: string;
  /** Muestra un botón para activar o silenciar el audio del video. */
  withSoundToggle?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setFailed(false);
    // Un video nuevo vuelve a arrancar en silencio para que el navegador lo
    // pueda reproducir sin interacción previa.
    setMuted(true);
  }, [video]);

  if (!video || failed) {
    return (
      <DishImage
        src={image}
        alt={alt}
        className={className}
        imgClassName={imgClassName}
      />
    );
  }

  const toggleSound = () => {
    const element = videoRef.current;
    if (!element) return;
    const nextMuted = !muted;
    element.muted = nextMuted;
    setMuted(nextMuted);
    if (!nextMuted) {
      void element.play().catch(() => {
        element.muted = true;
        setMuted(true);
      });
    }
  };

  return (
    <>
      <video
        ref={videoRef}
        src={video}
        poster={image || undefined}
        aria-label={alt}
        autoPlay
        muted={muted}
        loop
        playsInline
        preload="metadata"
        onError={() => setFailed(true)}
        className={cn("object-cover", className)}
      />
      {withSoundToggle && (
        <button
          type="button"
          aria-label={muted ? "Activar sonido del video" : "Silenciar video"}
          title={muted ? "Activar sonido" : "Silenciar"}
          onPointerDownCapture={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            toggleSound();
          }}
          className="absolute right-3 top-1/2 z-20 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/60 text-white shadow-lg backdrop-blur-md transition-colors hover:border-accent/70 hover:text-accent"
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
      )}
    </>
  );
}
