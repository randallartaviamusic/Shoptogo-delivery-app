import defaultLogo from "@/assets/logo.svg";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";

/**
 * Logo de la plataforma. Si el perfil administrador subió uno propio, todas las
 * instancias lo usan con el tamaño que eligió; si no, va el logo original.
 */

export function BrandMark({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const brand = useQuery(api.branding.brand);
  const src = brand?.logoUrl ?? defaultLogo;
  const px = brand?.logoSize ?? size;

  return (
    <img
      src={src}
      alt="Capricho Express"
      style={{
        height: px,
        maxWidth: Math.min(px, 64),
        width: "auto",
      }}
      className={cn("shrink-0 rounded-2xl object-contain", className)}
    />
  );
}

/** Título de la plataforma que puede editar el perfil administrador. */
export function BrandHeadline({
  className,
  align,
}: {
  className?: string;
  align?: "left" | "center" | "right";
}) {
  const headline = useQuery(api.branding.brandHeadline);
  const title = headline?.title ?? "Capricho Express";
  const color = headline?.color;
  const font = headline?.font;
  const effectiveAlign = align ?? headline?.align ?? "left";

  return (
    <span
      className={cn(
        "whitespace-nowrap font-display font-extrabold tracking-tight text-foreground",
        effectiveAlign === "center" && "mx-auto text-center",
        effectiveAlign === "right" && "ml-auto",
        className,
      )}
      style={{
        ...(font && { fontFamily: font }),
        ...(color && { color }),
      }}
    >
      {title}
    </span>
  );
}
