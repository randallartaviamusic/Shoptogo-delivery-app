import { EmptyState, PageHeader } from "@/components/AppShell";
import { DishImage } from "@/components/DishImage";
import { PromoBadge } from "@/components/PromoBadge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { money } from "@/lib/format";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Bookmark, Clock, Loader2, MapPin, Plus, Star, Store, X } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";

export default function FavoritesPage() {
  const saved = useQuery(api.catalog.saved);
  const favoriteBusinesses = useQuery(api.businesses.favorites);
  const toggleBusinessFavorite = useMutation(api.businesses.toggleFavorite);
  const addToCart = useMutation(api.cart.add);
  const swipe = useMutation(api.catalog.swipe);

  if (saved === undefined || favoriteBusinesses === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Súper antojos"
        title="Guardados para después"
        description="Tus productos y locales favoritos, guardados en tu cuenta para volver cuando quieras."
        action={
          <Button asChild variant="outline" className="gap-2 border-accent/30 text-accent">
            <Link to="/swipe">
              <Plus className="size-4" />
              Descubrir más
            </Link>
          </Button>
        }
      />

      {favoriteBusinesses === undefined ? (
        <div className="mb-6 flex h-24 items-center justify-center"><Loader2 className="size-5 animate-spin text-accent" /></div>
      ) : favoriteBusinesses.length > 0 ? (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Store className="size-4 text-accent" />
            <h2 className="font-display text-base font-bold">Locales favoritos</h2>
            <span className="text-xs text-muted-foreground">{favoriteBusinesses.length}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {favoriteBusinesses.map((business) => (
              <article key={business._id} className="surface-raised flex overflow-hidden rounded-2xl">
                <Link to={`/negocios/${business.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <DishImage src={business.image} alt={business.name} className="size-20 shrink-0" />
                  <div className="min-w-0 py-3">
                    <p className="truncate font-display text-sm font-bold">{business.name}</p>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{business.tagline}</p>
                    <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <MapPin className="size-3 text-accent" />{business.isOpen ? "Abierto" : "Cerrado"} · {business.productCount} productos
                    </p>
                  </div>
                </Link>
                <button
                  type="button"
                  aria-label={`Quitar ${business.name} de favoritos`}
                  onClick={() => void toggleBusinessFavorite({ businessId: business._id }).catch((error) => toast.error(error instanceof Error ? error.message : "No pudimos quitar el local"))}
                  className="mr-3 flex size-8 shrink-0 items-center justify-center self-center rounded-full border border-accent/30 text-accent hover:bg-accent/10"
                ><Star className="size-4 fill-current" /></button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {saved.length === 0 && (favoriteBusinesses?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="Todavía no guardaste antojos"
          description="Deslizá hacia arriba (o tocá la estrella) en el mazo para guardar ese producto que querés probar más tarde."
          action={
            <Button asChild className="gap-2 bg-ember-gradient text-black">
              <Link to="/swipe">Volver al mazo</Link>
            </Button>
          }
        />
      ) : saved.length === 0 ? null : (
        <>
        <div className="mb-3 flex items-center gap-2">
          <Bookmark className="size-4 text-accent" />
          <h2 className="font-display text-base font-bold">Productos guardados</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {saved.map((item, index) => (
            <motion.article
              key={item._id}
              layout
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="group overflow-hidden rounded-2xl border border-border/70 bg-card"
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                <DishImage
                  src={item.image}
                  alt={item.name}
                  className="size-full transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(6,6,7,0.85)_100%)]" />
                <button
                  aria-label={`Quitar ${item.name}`}
                  onClick={async () => {
                    try {
                      await swipe({
                        productId: item._id as Id<"products">,
                        direction: "pass",
                      });
                      toast(`Quitaste ${item.name} de guardados`);
                    } catch (error) {
                      toast.error(
                        error instanceof Error ? error.message : "No pudimos quitarlo",
                      );
                    }
                  }}
                  className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/80 backdrop-blur transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <X className="size-3.5" />
                </button>
                <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
                  <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-accent backdrop-blur">
                    {money(item.price)}
                  </span>
                  <PromoBadge
                    promo={item.promo}
                    withIcon={false}
                    className="px-2 py-0.5 text-[9px]"
                  />
                </div>
                <div className="absolute inset-x-2 bottom-2">
                  <p className="line-clamp-1 font-display text-sm font-bold text-white">
                    {item.name}
                  </p>
                  <p className="line-clamp-1 text-[10px] text-white/65">
                    {item.businessName}
                  </p>
                </div>
              </div>
              <div className="space-y-2 p-3">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Star className="size-3 fill-accent text-accent" />
                    {item.rating.toFixed(1)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {item.etaMinutes} min
                  </span>
                </div>
                <Button
                  size="sm"
                  className="w-full gap-1.5 bg-secondary text-foreground hover:bg-accent hover:text-accent-foreground"
                  disabled={!item.isOpen}
                  onClick={async () => {
                    try {
                      await addToCart({ productId: item._id as Id<"products"> });
                      toast.success("Sumado al carrito", {
                        description: `${item.name} · ${money(item.price)}`,
                      });
                    } catch (error) {
                      toast.error(
                        error instanceof Error ? error.message : "No pudimos agregarlo",
                      );
                    }
                  }}
                >
                  <Plus className="size-3.5" />
                  {item.isOpen ? "Agregar" : "Cerrado"}
                </Button>
              </div>
            </motion.article>
          ))}
        </div>
        </>
      )}
    </div>
  );
}
