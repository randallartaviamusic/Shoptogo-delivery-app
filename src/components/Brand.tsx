import defaultLogo from "@/assets/logo.svg";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";/**
 * Logo de la plataforma. Si el perfil administrador subió uno propio, todas las
 * instancias lo usan con el tamaño que eligió; si no, va el logo original.
 *
 * El palabra "Capricho Express" va pegado al derecho del logo cuando es horizontal
 * (ancho > alto). Si admin sube un logo quadrado, el icono va sólo.
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
  const isSquare = src === defaultLogo || brand?.logoUrl === undefined;

  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      {isSquare && (
        <span className="font-display text-[14px] font-extrabold tracking-tight text-foreground">
          Capricho <span className="text-accent">Express</span>
        </span>
      )}
      <img
        src={src}
        alt="Capricho Express"
        style={{
          height: px,
          maxWidth: isSquare ? px * 2.6 : Math.min(px, 64),
          width: "auto",
        }}
        className="shrink-0 rounded-2xl object-contain"
      />
    </div>
  );
}

export function Wordmark({
  className,
  markSize = 36,
}: {
  className?: string;
  markSize?: number;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark size={markSize} />
      <span className="whitespace-nowrap font-display text-[17px] font-extrabold tracking-tight text-foreground">
        Capricho <span className="text-accent">Express</span>
      </span>
    </span>
  );
}
