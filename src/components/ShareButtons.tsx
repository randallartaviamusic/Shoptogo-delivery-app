import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import {
  renderBusinessShareCard,
  renderProductShareCard,
  renderStoreShareCard,
  shareCardImage,
} from "@/lib/shareCards";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { Loader2, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function useShareConfig() {
  return useQuery(api.branding.shareConfig);
}

function missingQr() {
  toast.error("Todavía no hay QR configurado", {
    description:
      "El administrador tiene que subir la imagen del QR desde su panel.",
  });
}

type ProductData = {
  image: string;
  name: string;
  price: number;
  businessName: string;
  category: string;
};

type BusinessData = {
  image: string;
  name: string;
  category: string;
  tagline: string;
  rating: number;
  productCount: number;
  etaMinutes: number;
};

async function runShare(
  task: () => Promise<{ blob: Blob; title: string; text: string; filename: string }>,
  setBusy: (busy: boolean) => void,
) {
  setBusy(true);
  try {
    const card = await task();
    const outcome = await shareCardImage(card);
    if (outcome === "downloaded") {
      toast.success("Imagen descargada", {
        description:
          "Tu teléfono no permite compartir directo: la guardamos y copiamos el texto con el link.",
      });
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    toast.error(
      error instanceof Error ? error.message : "No pudimos crear la imagen",
    );
  } finally {
    setBusy(false);
  }
}

export function ShareProductButton({
  dish,
  className,
  iconClassName,
}: {
  dish: ProductData;
  className?: string;
  iconClassName?: string;
}) {
  const config = useShareConfig();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      aria-label={`Compartir ${dish.name}`}
      title="Compartir fuera de la app"
      disabled={busy || config === undefined}
      onClick={() => {
        if (!config) return;
        if (!config.qrUrl) {
          missingQr();
          return;
        }
        void runShare(async () => {
          const blob = await renderProductShareCard({
            qrUrl: config.qrUrl,
            appUrl: config.appUrl,
            photoUrl: dish.image,
            productName: dish.name,
            price: dish.price,
            businessName: dish.businessName,
            category: dish.category,
          });
          return {
            blob,
            title: dish.name,
            text: `${dish.name} de ${dish.businessName}. Descarga la app, ingresa y compra ahora: ${config.appUrl}`,
            filename: `shop-to-go-producto-${Date.now()}.png`,
          };
        }, setBusy);
      }}
      className={cn(
        "flex size-8 items-center justify-center rounded-full border border-white/15 bg-black/65 text-white backdrop-blur transition-colors hover:border-accent/50 hover:text-accent",
        className,
      )}
    >
      {busy ? (
        <Loader2 className={cn("size-3.5 animate-spin", iconClassName)} />
      ) : (
        <Share2 className={cn("size-3.5", iconClassName)} />
      )}
    </button>
  );
}

export function ShareBusinessButton({ business }: { business: BusinessData }) {
  const config = useShareConfig();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      aria-label={`Compartir ${business.name}`}
      title="Compartir fuera de la app"
      disabled={busy || config === undefined}
      onClick={() => {
        if (!config) return;
        if (!config.qrUrl) {
          missingQr();
          return;
        }
        void runShare(async () => {
          const blob = await renderBusinessShareCard({
            qrUrl: config.qrUrl,
            appUrl: config.appUrl,
            imageUrl: business.image,
            businessName: business.name,
            category: business.category,
            tagline: business.tagline,
            rating: business.rating,
            productCount: business.productCount,
            etaMinutes: business.etaMinutes,
          });
          return {
            blob,
            title: business.name,
            text: `${business.name} está en Shop To Go. Descarga la app, ingresa y compra ahora: ${config.appUrl}`,
            filename: `shop-to-go-negocio-${Date.now()}.png`,
          };
        }, setBusy);
      }}
      className="flex size-8 items-center justify-center rounded-full border border-white/15 bg-black/65 text-white backdrop-blur transition-colors hover:border-accent/50 hover:text-accent"
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Share2 className="size-3.5" />
      )}
    </button>
  );
}

export function ShareStoreButton({
  businessName,
  tagline,
  image,
  productPhotos,
  className,
}: {
  businessName: string;
  tagline: string;
  image: string;
  productPhotos: string[];
  className?: string;
}) {
  const config = useShareConfig();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="outline"
      className={cn("gap-2 border-border/80", className)}
      disabled={busy || config === undefined}
      onClick={() => {
        if (!config) return;
        if (!config.qrUrl) {
          missingQr();
          return;
        }
        void runShare(async () => {
          const blob = await renderStoreShareCard({
            qrUrl: config.qrUrl,
            appUrl: config.appUrl,
            imageUrl: image,
            businessName,
            tagline,
            productPhotos,
          });
          return {
            blob,
            title: businessName,
            text: `${businessName} está en Shop To Go. Descarga la app, ingresa y compra ahora: ${config.appUrl}`,
            filename: `shop-to-go-tienda-${Date.now()}.png`,
          };
        }, setBusy);
      }}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Share2 className="size-4" />
      )}
      Compartir mi tienda
    </Button>
  );
}
