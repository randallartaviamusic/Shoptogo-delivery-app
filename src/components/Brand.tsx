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
      alt="Capricho Express"
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
}: {
  className?: string;
  markSize?: number;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark size={markSize} />
      <span className="whitespace-nowrap font-display text-[19px] font-extrabold tracking-tight text-foreground">
        Capricho <span className="text-accent">Express</span>
      </span>
    </span>
  );
}
