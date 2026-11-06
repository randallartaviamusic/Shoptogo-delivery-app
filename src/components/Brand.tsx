import logo from "@/assets/logo.svg";
import { cn } from "@/lib/utils";

export function BrandMark({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={logo}
      alt="Whimy"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn("rounded-2xl", className)}
    />
  );
}

export function Wordmark({
  className,
  markSize = 36,
  showDot = true,
}: {
  className?: string;
  markSize?: number;
  showDot?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark size={markSize} />
      <span className="font-display text-xl font-extrabold tracking-tight text-foreground">
        Whimy
        {showDot && <span className="text-accent">.</span>}
      </span>
    </span>
  );
}
