import {
  Boxes,
  Footprints,
  Guitar,
  Hammer,
  Headphones,
  HeartPulse,
  Microwave,
  Pill,
  Shirt,
  ShoppingBasket,
  Sofa,
  Sparkles,
  SprayCan,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  utensils: UtensilsCrossed,
  shirt: Shirt,
  footprints: Footprints,
  spray: SprayCan,
  sparkles: Sparkles,
  heart: HeartPulse,
  pill: Pill,
  headphones: Headphones,
  microwave: Microwave,
  sofa: Sofa,
  guitar: Guitar,
  hammer: Hammer,
  basket: ShoppingBasket,
  boxes: Boxes,
};

export function DepartmentIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon className={className} />;
}
