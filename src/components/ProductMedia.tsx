import { DishImage } from "@/components/DishImage";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

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
}: {
  image?: string;
  video?: string | null;
  alt: string;
  className?: string;
  imgClassName?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
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

  return (
    <video
      src={video}
      poster={image || undefined}
      aria-label={alt}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
      className={cn("object-cover", className)}
    />
  );
}
