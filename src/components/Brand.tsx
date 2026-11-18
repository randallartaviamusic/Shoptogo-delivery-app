import defaultLogo from "@/assets/logo.svg";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";

/** Tipografías disponibles para el título de la barra superior. */
export const BRAND_FONT_OPTIONS = [
  { value: "sora", label: "Sora", stack: '"Sora", "Manrope", sans-serif' },
  { value: "manrope", label: "Manrope", stack: '"Manrope", sans-serif' },
  { value: "serif", label: "Georgia", stack: 'Georgia, "Times New Roman", serif' },
  { value: "mono", label: "Monoespaciada", stack: "ui-monospace, SFMono-Regular, Menlo, monospace" },
] as const;

export function fontStack(token: string) {
  return (
    BRAND_FONT_OPTIONS.find((option) => option.value === token)?.stack ??
    BRAND_FONT_OPTIONS[0].stack
  );
}

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
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl"
      style={{ height: px, maxWidth: px * 2.6 }}
    >
      <img
        src={src}
        alt="Shop To Go"
        style={{ height: px, maxWidth: px * 2.6, width: "auto" }}
        className={cn("shrink-0 rounded-2xl object-contain", className)}
      />
      <span
        aria-hidden
        className="glass-sheen pointer-events-none absolute inset-0 rounded-2xl"
      />
    </span>
  );
}

/**
 * Título que va al lado del logo. El perfil administrador decide el texto, el
 * color, la tipografía y el tamaño desde su perfil.
 */
export function BrandHeadline({ className }: { className?: string }) {
  const headline = useQuery(api.branding.brandHeadline);

  return (
    <span
      className={cn("min-w-0 truncate font-extrabold leading-none tracking-tight", className)}
      style={{
        color: headline?.color ?? "#f7f5f0",
        fontFamily: fontStack(headline?.font ?? "sora"),
        fontSize: headline?.size ?? 18,
      }}
    >
      {headline?.title ?? "Shop To Go"}
    </span>
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
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <BrandMark size={markSize} />
      <BrandHeadline />
    </span>
  );
}
