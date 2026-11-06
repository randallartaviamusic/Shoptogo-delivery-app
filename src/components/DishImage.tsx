import { Flame } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Product photo with a branded gradient fallback if the remote image fails. */
export function DishImage({
  src,
  alt,
  className,
  imgClassName,
}: {
  src?: string;
  alt: string;
  className?: string;
  imgClassName?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-[linear-gradient(135deg,#2a1210_0%,#171718_45%,#2a2208_100%)]",
          className,
        )}
      >
        <Flame className="size-10 text-accent/40" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("object-cover", className, imgClassName)}
    />
  );
}
