import { DishImage } from "@/components/DishImage";
import { EliteAura } from "@/components/EliteAura";
import { EliteSwipeBadge, FlashSaleBadge } from "@/components/EliteBusiness";
import { ProductMedia } from "@/components/ProductMedia";
import { PromoBadge } from "@/components/PromoBadge";
import { Button } from "@/components/ui/button";
import { formatKm } from "@/lib/delivery";
import { money } from "@/lib/format";
import { promoDiscount } from "@/lib/promo";
import type { PromoKind } from "@/lib/promo";
import type { ProductOptionGroup } from "@/lib/productOptions";
import { cn } from "@/lib/utils";
import { Link } from "react-router";
import {
  animate,
  motion,
  useAnimationControls,
  useMotionValue,
  useTransform,
} from "framer-motion";
import { Clock, MapPin, SlidersHorizontal, Star } from "lucide-react";
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type Dish = {
  _id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  video?: string | null;
  category: string;
  department?: string;
  attributes?: { key: string; value: string }[];
  optionGroups?: ProductOptionGroup[];
  tags: string[];
  promo?: PromoKind | null;
  businessId: string;
  businessName: string;
  businessSlug: string;
  businessCategory: string;
  businessImage: string;
  elite?: boolean;
  eliteVerified?: boolean;
  flash?: { title: string; detail: string; mediaUrl?: string | null; mediaKind?: "image" | "video" | null; endsAt: number } | null;
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
  stockEnabled?: boolean;
  stock?: number | null;
  reservable?: boolean;
};

export type SwipeDirection = "like" | "pass" | "save";

/** Texto del envío, con la promoción de la tienda aplicada si tiene una. */
function deliveryText(delivery: Dish["delivery"], promo?: PromoKind | null) {
  if (!delivery.available) return "Fuera de cobertura";
  if (delivery.fee === null) return `Envío desde ${money(delivery.feeFrom)}`;
  const distance = formatKm(delivery.distanceKm ?? 0);
  if (!promo) return `Envío ${money(delivery.fee)} · ${distance}`;
  if (promo === "free_delivery") return `Envío gratis · ${distance}`;
  const clientFee = delivery.fee - promoDiscount(delivery.fee, promo);
  return `Envío al 50% · ${money(clientFee)} · ${distance}`;
}

function CardBody({
  dish,
  dimmed,
  eliteBadgeUrl,
  eliteBadgeSize = 36,
  titleSize = 26,
  soundToggle = false,
}: {
  dish: Dish;
  dimmed?: boolean;
  eliteBadgeUrl?: string | null;
  eliteBadgeSize?: number;
  titleSize?: number;
  soundToggle?: boolean;
}) {
  return (
    <>
      <ProductMedia
        image={dish.image}
        video={dish.video}
        alt={dish.name}
        className="absolute inset-0 size-full"
        imgClassName={cn("transition-transform duration-700", dimmed && "scale-105")}
        withSoundToggle={soundToggle}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,6,7,0.72)_0%,rgba(6,6,7,0.05)_28%,rgba(6,6,7,0.35)_58%,rgba(6,6,7,0.94)_100%)]" />
      {dish.elite && <EliteAura />}

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-2">
        <Link
          to={`/negocios/${dish.businessSlug}`}
          aria-label={`Ver el catálogo de ${dish.businessName}`}
          title={`Ver el catálogo de ${dish.businessName}`}
          onPointerDown={(event) => event.stopPropagation()}
          className="flex min-w-0 items-center gap-2 rounded-full border border-white/15 bg-black/45 py-1 pl-1 pr-3 backdrop-blur-md transition-colors hover:border-accent/60"
        >
          <DishImage
            src={dish.businessImage}
            alt={dish.businessName}
            className="size-7 rounded-full"
          />
          <span className="min-w-0 leading-none">
            <span className="block truncate text-[11px] font-semibold text-white">
              {dish.businessName}
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-[10px] text-white/65">
              <Star className="size-2.5 fill-accent text-accent" />
              {dish.rating.toFixed(1)} · {dish.etaMinutes} min
            </span>
          </span>
        </Link>
        {dish.elite && (
          <EliteSwipeBadge size={eliteBadgeSize} imageUrl={eliteBadgeUrl} />
        )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="rounded-full bg-accent px-3 py-1.5 font-display text-sm font-bold text-accent-foreground">
            {money(dish.price)}
          </span>
          <PromoBadge
            promo={dish.promo}
            className="px-2.5 py-1 text-[11px] normal-case tracking-normal"
          />
          {dish.flash && (
            <FlashSaleBadge flash={dish.flash} className="max-w-[13rem]" />
          )}
        </div>
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
          {(dish.optionGroups?.length ?? 0) > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/90">
              <SlidersHorizontal className="size-2.5" />
              Personalizable
            </span>
          )}
          {dish.stockEnabled && dish.stock !== null && dish.stock !== undefined && dish.stock <= 5 && dish.stock > 0 && (
            <span className="rounded-full border border-primary/50 bg-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              ¡Solo quedan {dish.stock}!
            </span>
          )}
          {dish.stockEnabled && dish.stock === 0 && (
            <span className="rounded-full border border-primary/50 bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              Agotado
            </span>
          )}
          {dish.reservable && (
            <span className="rounded-full border border-accent/50 bg-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              Se reserva con cita
            </span>
          )}
        </div>
        <h2
          className="text-shadow-dark font-display font-extrabold leading-tight text-white"
          style={{ fontSize: titleSize }}
        >
          {dish.name}
        </h2>
        <p className="mt-1.5 line-clamp-2 text-[13px] font-bold leading-snug text-white text-shadow-dark">
          {dish.description}
        </p>
        <div className="mt-3 flex items-center gap-3 border-t border-white/10 pt-3 text-[11px] text-white/60">
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3.5 text-accent" />
            {dish.businessCategory}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5 text-accent" />
            {deliveryText(dish.delivery, dish.promo)}
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
  eliteBadgeUrl?: string | null;
  eliteBadgeSize?: number;
  titleSize?: number;
};

export const SwipeCard = forwardRef<SwipeCardHandle, SwipeCardProps>(function SwipeCard(
  {
    dish,
    onDecide,
    isTop,
    eliteBadgeUrl,
    eliteBadgeSize,
    titleSize,
  }: SwipeCardProps,
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
        <CardBody
          dish={dish}
          dimmed
          eliteBadgeUrl={eliteBadgeUrl}
          eliteBadgeSize={eliteBadgeSize}
          titleSize={titleSize}
        />
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
      <CardBody
        dish={dish}
        eliteBadgeUrl={eliteBadgeUrl}
        eliteBadgeSize={eliteBadgeSize}
        titleSize={titleSize}
        soundToggle
      />

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
  shareSlot,
}: {
  onPass: () => void;
  onSave: () => void;
  onLike: () => void;
  onUndo: () => void;
  disabled: boolean;
  canUndo: boolean;
  shareSlot?: ReactNode;
}) {
  return (
    <div className="mt-5 flex items-center justify-center gap-3 sm:gap-4">
      <Button
        variant="outline"
        size="icon"
        aria-label="Deshacer"
        disabled={!canUndo || disabled}
        onClick={onUndo}
        className="glass-sheen size-11 rounded-full border-border/80 bg-secondary/40 text-muted-foreground hover:text-foreground"
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
        className="glass-sheen size-16 rounded-full border border-primary/40 bg-primary/10 text-primary transition-transform hover:scale-105 hover:bg-primary/20"
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
        className="glass-sheen flex size-12 flex-col items-center justify-center gap-0 rounded-full border border-accent/40 bg-accent/10 text-accent transition-transform hover:scale-105 hover:bg-accent/20"
      >
        <Star className="size-5" />
      </Button>
      {shareSlot}
      <Button
        size="icon"
        aria-label="Lo quiero"
        disabled={disabled}
        onClick={onLike}
        className="relative isolate size-16 overflow-hidden rounded-full bg-ember-gradient text-black transition-transform hover:scale-105"
      >
        <span
          aria-hidden
          className="glass-sheen pointer-events-none absolute inset-0 rounded-full"
        />
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
