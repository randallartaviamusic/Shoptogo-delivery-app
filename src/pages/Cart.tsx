import { EmptyState, PageHeader } from "@/components/AppShell";
import { DishImage } from "@/components/DishImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { money } from "@/lib/format";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Loader2,
  MapPin,
  Minus,
  Plus,
  ShoppingBag,
  Star,
  Store,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

export default function CartPage() {
  const { user } = useAuth();
  const isGuest = Boolean(user?.isAnonymous);
  const navigate = useNavigate();
  const cart = useQuery(api.cart.myCart);
  const setQuantity = useMutation(api.cart.setQuantity);
  const removeItem = useMutation(api.cart.remove);
  const clearCart = useMutation(api.cart.clear);
  const checkout = useMutation(api.cart.checkout);

  const [address, setAddress] = useState(user?.address ?? "");
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);

  const groups = cart?.groups ?? [];
  const count = cart?.count ?? 0;
  const hasClosed = groups.some((group) => !group.isOpen);

  const handleCheckout = async () => {
    if (isGuest) {
      toast("Creá tu cuenta para confirmar el pedido", {
        description: "Tu carrito queda guardado y vuelve con vos al entrar.",
      });
      navigate("/auth?role=buyer&returnTo=%2Fcart");
      return;
    }

    setPlacing(true);
    try {
      const result = await checkout({ address, notes });
      toast.success(
        result.created === 1
          ? "Pedido confirmado"
          : `${result.created} pedidos confirmados`,
        {
          description: `Total ${money(result.total)}. Seguí el estado en Pedidos.`,
        },
      );
      setNotes("");
      navigate("/orders");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos cerrar el pedido");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Checkout"
        title="Tu carrito"
        description="Los antojos que elegiste, agrupados por negocio. Cada local tiene su propio envío."
        action={
          count > 0 ? (
            <Button
              variant="ghost"
              className="gap-2 text-muted-foreground hover:text-destructive"
              onClick={async () => {
                await clearCart();
                toast("Carrito vaciado");
              }}
            >
              <Trash2 className="size-4" />
              Vaciar
            </Button>
          ) : null
        }
      />

      {count === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Todavía no hay antojos"
          description="Volvé al mazo y deslizá a la derecha los productos que quieras pedir."
          action={
            <Button asChild className="gap-2 bg-ember-gradient text-black">
              <Link to="/swipe">
                Descubrir antojos
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="space-y-4">
            {groups.map((group) => (
              <motion.section
                key={group.businessId}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="surface-raised overflow-hidden rounded-3xl"
              >
                <header className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5">
                  <DishImage
                    src={group.businessImage}
                    alt={group.businessName}
                    className="size-11 rounded-xl"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-bold">
                      {group.businessName}
                    </p>
                    <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Star className="size-3 fill-accent text-accent" />
                      {group.rating.toFixed(1)}
                      <span>·</span>
                      {group.etaMinutes} min
                      <span>·</span>
                      Envío {money(group.deliveryFee)}
                    </p>
                  </div>
                  {!group.isOpen && (
                    <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                      Cerrado
                    </span>
                  )}
                </header>

                <ul className="divide-y divide-border/50">
                  {group.items.map((item) => (
                    <li key={item.cartItemId} className="flex gap-3 px-4 py-3.5">
                      <DishImage
                        src={item.image}
                        alt={item.name}
                        className="size-16 shrink-0 rounded-xl"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold leading-tight">
                            {item.name}
                          </p>
                          <button
                            aria-label={`Quitar ${item.name}`}
                            onClick={() =>
                              removeItem({
                                productId: item.productId as Id<"products">,
                              })
                            }
                            className="text-muted-foreground transition-colors hover:text-primary"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {money(item.price)} c/u
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-1 rounded-full border border-border/80 p-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Restar uno"
                              className="size-7 rounded-full text-muted-foreground"
                              onClick={() =>
                                setQuantity({
                                  productId: item.productId as Id<"products">,
                                  quantity: item.quantity - 1,
                                })
                              }
                            >
                              <Minus className="size-3.5" />
                            </Button>
                            <span className="w-5 text-center text-sm font-semibold">
                              {item.quantity}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Sumar uno"
                              className="size-7 rounded-full text-muted-foreground"
                              onClick={() =>
                                setQuantity({
                                  productId: item.productId as Id<"products">,
                                  quantity: item.quantity + 1,
                                })
                              }
                            >
                              <Plus className="size-3.5" />
                            </Button>
                          </div>
                          <p className="font-display text-sm font-bold">
                            {money(item.price * item.quantity)}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="flex items-center justify-between bg-black/25 px-4 py-2.5 text-xs text-muted-foreground">
                  <span>Subtotal del local</span>
                  <span className="font-semibold text-foreground">
                    {money(group.subtotal + group.deliveryFee)}
                  </span>
                </div>
              </motion.section>
            ))}

            <Link
              to="/swipe"
              className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border/80 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
            >
              <Plus className="size-4" />
              Seguir descubriendo
            </Link>
          </div>

          <motion.aside
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="surface-raised rounded-3xl p-5 lg:sticky lg:top-8"
          >
            <h2 className="font-display text-lg font-bold">Confirmar pedido</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Un pedido por negocio. Los repartidores lo toman apenas esté listo.
            </p>

            <div className="mt-5 space-y-3">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Dirección de entrega
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 size-4 text-muted-foreground" />
                <Input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Calle, número, piso y barrio"
                  className="pl-9"
                />
              </div>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Notas para el local o el repartidor (timbre, sin cebolla...)"
                className="min-h-20 resize-none"
              />
            </div>

            <div className="mt-5 space-y-2 border-t border-border/60 pt-4 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{money(cart?.subtotal ?? 0)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Envíos ({groups.length})</span>
                <span>{money(cart?.deliveryTotal ?? 0)}</span>
              </div>
              <div className="flex items-end justify-between pt-2">
                <span className="font-semibold">Total</span>
                <span className="font-display text-2xl font-extrabold">
                  {money(cart?.total ?? 0)}
                </span>
              </div>
            </div>

            {hasClosed && (
              <p className="mt-3 rounded-xl border border-primary/30 bg-primary/10 p-2.5 text-[11px] leading-relaxed text-primary">
                Hay un negocio cerrado en tu carrito. Quitá sus productos para
                poder continuar.
              </p>
            )}

            {isGuest && (
              <p className="mt-3 rounded-xl border border-accent/25 bg-accent/[0.06] p-2.5 text-[11px] leading-relaxed text-accent">
                Estás deslizando sin cuenta. Al confirmar te pedimos crear tu
                cuenta o iniciar sesión: tu carrito no se pierde.
              </p>
            )}

            <Button
              className="mt-5 w-full gap-2 bg-ember-gradient text-black hover:opacity-95"
              disabled={placing || !address.trim() || hasClosed}
              onClick={handleCheckout}
            >
              {placing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Confirmando...
                </>
              ) : (
                <>
                  Confirmar pedido
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <Store className="size-3.5" />
              {groups.length} {groups.length === 1 ? "negocio" : "negocios"} ·
              Pago en la entrega
            </p>


          </motion.aside>
        </div>
      )}
    </div>
  );
}
