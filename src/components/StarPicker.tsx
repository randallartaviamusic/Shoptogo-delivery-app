import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Selector de 1 a 5 estrellas, usado en las reseñas de compradores y locales. */
export function StarPicker({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`${label}: ${star} ${star === 1 ? "estrella" : "estrellas"}`}
          onClick={() => onChange(star)}
          className="rounded-md p-0.5 transition-transform hover:scale-110"
        >
          <Star
            className={cn(
              "size-5",
              star <= value
                ? "fill-accent text-accent"
                : "text-muted-foreground/50",
            )}
          />
        </button>
      ))}
    </div>
  );
}
