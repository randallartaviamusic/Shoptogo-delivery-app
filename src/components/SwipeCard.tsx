import { DishImage } from "@/components/DishImage";
import { Button } from "@/components/ui/button";
import { formatKm } from "@/lib/delivery";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  animate,
  motion,
  useAnimationControls,
  useMotionValue,
  useTransform,
} from "framer-motion";
import { Clock, MapPin, Star } from "lucide-react";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";

export type Dish = {
  _id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  department?: string;
  attributes?: { key: string; value: string }[];
  tags: string[];
  businessId: string;
  businessName: string;
  businessCategory: string;
  businessImage: string;
  rating: number;
  reviews: number;
  etaMinutes: number;
  delivery: {
    feeFrom: number;
    fee: number | null;
    distanceKm: number | null;
    available: boolean;
  };
  address: string;
};

export type SwipeDirection = "like" | "pass" | "save";

function CardBody({ dish, dimmed }: { dish: Dish; dimmed?: boolean }) {
  return (
    <>
      <DishImage
        src={dish.image}
        alt={dish.name}
        className="absolute inset-0 size-full"
        imgClassName={cn("transition-transform duration-700", dimmed && "scale-105")}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,6,7,0.72)_0%,rgba(6,6,7,0.05)_28%,rgba(6,6,7,0.35)_58%,rgba(6,6,7,0.94)_100%)]" />

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
        <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/45 py-1 pl-1 pr-3 backdrop-blur-md">
          <DishImage
            src={dish.businessImage}
            alt={dish.businessName}
            className="size-7 rounded-full"
          />
          <div className="leading-none">
            <p className="text-[11px] font-semibold text-white">
              {dish.businessName}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-white/65">
              <Star className="size-2.5 fill-accent text-accent" />
              {dish.rating.toFixed(1)} · {dish.etaMinutes} min
            </p>
          </div>
        </div>
        <span className="rounded-full bg-accent px-3 py-1.5 font-display text-sm font-bold text-accent-foreground">
          {money(dish.price)}
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-5">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {dish.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent"
            >
              {tag}
            </span>
          ))}
        </div>
        <h2 className="font-display text-[26px] font-extrabold leading-tight text-white">
          {dish.name}
        </h2>
        <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-white/70">
          {dish.description}
        </p>
        <div className="mt-3 flex items-center gap-3 border-t border-white/10 pt-3 text-[11px] text-white/60">
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3.5 text-accent" />
            {dish.businessCategory}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5 text-accent" />
            {!dish.delivery.available
              ? "Fuera de cobertura"
              : dish.delivery.fee === null
                ? `Envío desde ${money(dish.delivery.feeFrom)}`
                : `Envío ${money(dish.delivery.fee)} · ${formatKm(dish.delivery.distanceKm ?? 0)}`}
          </span>
        </div>
      </div>
    </>
  );
}

export type SwipeCardHandle = {
  decide: (direction: SwipeDirection) => Promise<void>;
};

type SwipeCardProps = {
  dish: Dish;
  onDecide: (id: string, direction: SwipeDirection) => void;
  isTop: boolean;
};

export const SwipeCard = forwardRef<SwipeCardHandle, SwipeCardProps>(function SwipeCard(
  { dish, onDecide, isTop }: SwipeCardProps,
  ref,
) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-320, 0, 320], [-16, 0, 16]);
  const likeOpacity = useTransform(x, [14, 80], [0, 1]);
  const passOpacity = useTransform(x, [-80, -14], [1, 0]);
  const stampScale = useTransform(x, [-110, 0, 110], [1, 0.8, 1]);
  const controls = useAnimationControls();
  const busy = useRef(false);
  const [label, setLabel] = useState<string | null>(null);

  const flyOut = async (direction: SwipeDirection) => {
    if (busy.current) return;
    busy.current = true;
    setLabel(
      direction === "like" ? "ANTOJO" : direction === "save" ? "GUARDADO" : "PASO",
    );
    const target =
      direction === "pass"
        ? { x: -700, rotate: -26, opacity: 0 }
        : direction === "save"
          ? { y: -760, opacity: 0, scale: 0.9 }
          : { x: 700, rotate: 26, opacity: 0 };
    await controls.start({
      ...target,
      transition: { duration: 0.32, ease: [0.22, 0.61, 0.36, 1] },
    });
    onDecide(dish._id, direction);
  };

  useImperativeHandle(ref, () => ({ decide: flyOut }));

  if (!isTop) {
    return (
      <div className="pointer-events-none absolute inset-0 select-none overflow-hidden rounded-[30px] border border-white/10">
        <CardBody dish={dish} dimmed />
      </div>
    );
  }

  return (
    <motion.div
      className="absolute inset-0 cursor-grab touch-none overflow-hidden rounded-[30px] border border-white/12 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] active:cursor-grabbing"
      style={{ x, rotate }}
      drag
      dragElastic={0.85}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      animate={controls}
      whileTap={{ scale: 0.995 }}
      onDragEnd={async (_, info) => {
        const swipeX = info.offset.x;
        const swipeY = info.offset.y;
        if (swipeY < -170 && Math.abs(swipeX) < 120) {
          await flyOut("save");
          return;
        }
        if (swipeX > 110 || (info.velocity.x > 650 && swipeX > 40)) {
          await flyOut("like");
          return;
        }
        if (swipeX < -110 || (info.velocity.x < -650 && swipeX < -40)) {
          await flyOut("pass");
          return;
        }
        await animate(x, 0, { type: "spring", stiffness: 380, damping: 30 });
      }}
    >
      <CardBody dish={dish} />

      <motion.div
        style={{ opacity: likeOpacity, scale: stampScale }}
        className="pointer-events-none absolute left-4 top-20 -rotate-12 rounded-xl border-[3px] border-[#f97316] px-4 py-2 font-display text-3xl font-extrabold uppercase leading-none tracking-[0.12em] sm:text-4xl"
      >
        <span className="inline-block bg-[linear-gradient(95deg,var(--primary)_0%,#f97316_52%,var(--accent)_100%)] bg-clip-text text-transparent">
          LO QUIERO
        </span>
      </motion.div>
      <motion.div
        style={{ opacity: passOpacity, scale: stampScale }}
        className="pointer-events-none absolute right-4 top-20 rotate-12 rounded-xl border-[3px] border-primary px-4 py-2 font-display text-3xl font-extrabold uppercase leading-none tracking-[0.12em] text-primary sm:text-4xl"
      >
        PASO
      </motion.div>

      {label && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
          <span className="rounded-2xl border-2 border-accent/70 bg-black/60 px-5 py-2 font-display text-3xl font-extrabold tracking-widest text-accent">
            {label}
          </span>
        </div>
      )}
    </motion.div>
  );
});

export function DeckActions({
  onPass,
  onSave,
  onLike,
  onUndo,
  disabled,
  canUndo,
}: {
  onPass: () => void;
  onSave: () => void;
  onLike: () => void;
  onUndo: () => void;
  disabled: boolean;
  canUndo: boolean;
}) {
  return (
    <div className="mt-5 flex items-center justify-center gap-3 sm:gap-4">
      <Button
        variant="outline"
        size="icon"
        aria-label="Deshacer"
        disabled={!canUndo || disabled}
        onClick={onUndo}
        className="size-11 rounded-full border-border/80 bg-secondary/40 text-muted-foreground hover:text-foreground"
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-5">
          <path
            d="M3 9h11a5 5 0 0 1 0 10h-4M3 9l4-4M3 9l4 4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Button>
      <Button
        size="icon"
        aria-label="Pasar"
        disabled={disabled}
        onClick={onPass}
        className="size-16 rounded-full border border-primary/40 bg-primary/10 text-primary transition-transform hover:scale-105 hover:bg-primary/20"
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-7">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </Button>
      <Button
        size="icon"
        aria-label="Súper antojo"
        disabled={disabled}
        onClick={onSave}
        className="flex size-12 flex-col items-center justify-center gap-0 rounded-full border border-accent/40 bg-accent/10 text-accent transition-transform hover:scale-105 hover:bg-accent/20"
      >
        <Star className="size-5" />
      </Button>
      <Button
        size="icon"
        aria-label="Lo quiero"
        disabled={disabled}
        onClick={onLike}
        className="size-16 rounded-full bg-ember-gradient text-black transition-transform hover:scale-105"
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-7">
          <path
            d="M12 20s-7-4.35-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5C19 15.65 12 20 12 20Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </Button>
    </div>
  );
}
