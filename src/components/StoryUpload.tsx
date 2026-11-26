import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  Crown,
  Eye,
  ImagePlus,
  Loader2,
  Pause,
  Pencil,
  Play,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
const MAX_CAPTION = 140;

type StoryCtaKind = "local" | "product" | "offer";

export type StoryCtaProduct = {
  _id: string;
  name: string;
  price: number;
};

const CTA_LABELS: Record<StoryCtaKind, string> = {
  local: "Ver local",
  product: "Ver producto",
  offer: "Ver oferta",
};

/** Selector compartido entre publicar y editar: qué botón ve el comprador. */
function StoryCtaFields({
  idPrefix,
  kind,
  productId,
  products,
  offerReady,
  offerTitle,
  onKindChange,
  onProductChange,
}: {
  idPrefix: string;
  kind: StoryCtaKind;
  productId: string;
  products: StoryCtaProduct[];
  offerReady: boolean;
  offerTitle?: string;
  onKindChange: (kind: StoryCtaKind) => void;
  onProductChange: (productId: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-cta`}>Botón de la historia</Label>
      <Select
        value={kind}
        onValueChange={(value) => onKindChange(value as StoryCtaKind)}
      >
        <SelectTrigger id={`${idPrefix}-cta`} className="h-9 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="select-scroll">
          <SelectItem value="local">Ver local · abre tu catálogo</SelectItem>
          <SelectItem value="product" disabled={products.length === 0}>
            Ver producto · card para añadirlo al carrito
          </SelectItem>
          <SelectItem value="offer" disabled={!offerReady}>
            Ver oferta · card de tu oferta flash
          </SelectItem>
        </SelectContent>
      </Select>
      {kind === "product" &&
        (products.length === 0 ? (
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Publicá un producto en tu catálogo para usar este botón.
          </p>
        ) : (
          <Select
            value={productId || undefined}
            onValueChange={onProductChange}
          >
            <SelectTrigger
              aria-label="Producto de la historia"
              className="h-9 text-xs"
            >
              <SelectValue placeholder="Elegí el producto" />
            </SelectTrigger>
            <SelectContent className="select-scroll">
              {products.map((product) => (
                <SelectItem key={product._id} value={product._id}>
                  {product.name} · {money(product.price)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      {kind === "offer" && (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {offerReady
            ? `Se abre “${offerTitle || "tu oferta flash"}” con su producto para añadirlo al carrito.`
            : "Activá una oferta flash con un producto en la pestaña Ofertas flash para usar este botón."}
        </p>
      )}
    </div>
  );
}

function timeLeft(expiresAt: number) {
  const ms = Math.max(0, expiresAt - Date.now());
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours <= 0) return `quedan ${minutes} min`;
  return `quedan ${hours} h ${minutes} min`;
}

/**
 * Historias del negocio: foto o video de 24 horas. Sólo se habilita con el
 * plan Pro o Élite vigente; si no, muestra cómo activarlo. Cada historia se
 * puede previsualizar como la ve el comprador, editar su texto o borrarla.
 */
export function StoryUpload({
  enabled,
  businessName,
  businessImage,
  products = [],
  flashActive = false,
  flashTitle,
  flashProductId,
}: {
  enabled: boolean;
  businessName?: string;
  businessImage?: string | null;
  products?: StoryCtaProduct[];
  flashActive?: boolean;
  flashTitle?: string;
  flashProductId?: string;
}) {
  const stories = useQuery(api.stories.mine);
  const generateUploadUrl = useMutation(api.stories.generateStoryUploadUrl);
  const publishStory = useMutation(api.stories.publish);
  const removeStory = useMutation(api.stories.remove);
  const updateStory = useMutation(api.stories.update);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewPaused, setPreviewPaused] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(true);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [ctaKind, setCtaKind] = useState<StoryCtaKind>("local");
  const [ctaProductId, setCtaProductId] = useState("");
  const [editCtaKind, setEditCtaKind] = useState<StoryCtaKind>("local");
  const [editCtaProductId, setEditCtaProductId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const offerReady =
    flashActive &&
    Boolean(flashProductId) &&
    products.some((product) => product._id === flashProductId);

  const previewStory = stories?.find((story) => story._id === previewId);
  const editingStory = stories?.find((story) => story._id === editingId);

  useEffect(() => {
    setPreviewPaused(false);
    setPreviewMuted(true);
    setPreviewProgress(0);
  }, [previewId]);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video || previewStory?.kind !== "video") return;
    if (previewPaused) {
      video.pause();
    } else {
      void video.play().catch(() => undefined);
    }
  }, [previewPaused, previewStory?._id, previewStory?.kind]);

  if (!enabled) {
    return (
      <div className="rounded-2xl border border-dashed border-accent/30 bg-accent/[0.04] p-4">
        <div className="flex items-start gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Crown className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold">
              Las historias son del plan Pro
            </p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
              Publicá fotos y videos de 24 horas, igual que en Instagram. Se
              activan solas cuando tu suscripción Pro o Élite está vigente.
            </p>
          </div>
        </div>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="mt-3 gap-1.5 border-accent/40 text-accent"
        >
          <Link to="/suscripcion">Ver planes</Link>
        </Button>
      </div>
    );
  }

  const handleFile = async (file?: File | null) => {
    if (!file || uploading) return;
    if (ctaKind === "product" && !ctaProductId) {
      toast.error("Elegí el producto para el botón de la historia");
      return;
    }
    if (ctaKind === "offer" && !offerReady) {
      toast.error("Activá una oferta flash con producto para usar este botón");
      return;
    }
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      toast.error("Elegí una foto o un video");
      return;
    }
    const limit = file.type.startsWith("image/")
      ? MAX_IMAGE_BYTES
      : MAX_VIDEO_BYTES;
    if (file.size > limit) {
      toast.error(
        file.type.startsWith("image/")
          ? "La foto no puede pesar más de 8 MB"
          : "El video no puede pesar más de 30 MB",
      );
      return;
    }

    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("No pudimos subir la historia");
      const { storageId } = (await response.json()) as { storageId: string };
      await publishStory({
        storageId: storageId as Id<"_storage">,
        caption: caption.trim() || undefined,
        ctaKind,
        ctaProductId:
          ctaKind === "product"
            ? (ctaProductId as Id<"products">)
            : undefined,
      });
      setCaption("");
      toast.success("Historia publicada", {
        description: "Se muestra 24 horas en la sección Negocios.",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos publicar",
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async (storyId: string) => {
    setRemovingId(storyId);
    try {
      await removeStory({ storyId: storyId as Id<"businessStories"> });
      setEditingId((current) => (current === storyId ? null : current));
      setPreviewId((current) => (current === storyId ? null : current));
      toast.success("Historia eliminada");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos eliminarla",
      );
    } finally {
      setRemovingId(null);
    }
  };

  const openEdit = (storyId: string, currentCaption?: string | null) => {
    const story = stories?.find((item) => item._id === storyId);
    setEditingId(storyId);
    setEditCaption(currentCaption ?? "");
    setEditCtaKind(story?.ctaKind ?? "local");
    setEditCtaProductId(story?.ctaProductId ?? "");
  };

  const handleSaveCaption = async () => {
    if (!editingId) return;
    setSavingEdit(true);
    try {
      await updateStory({
        storyId: editingId as Id<"businessStories">,
        caption: editCaption.trim() || undefined,
        ctaKind: editCtaKind,
        ctaProductId:
          editCtaKind === "product"
            ? (editCtaProductId as Id<"products">)
            : undefined,
      });
      setEditingId(null);
      toast.success("Historia actualizada", {
        description: "El texto y el botón ya se ven en Negocios.",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos actualizarla",
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const openPreview = (storyId: string) => {
    setPreviewPaused(false);
    setPreviewMuted(true);
    setPreviewProgress(0);
    setPreviewId(storyId);
  };

  const togglePreviewSound = () => {
    setPreviewMuted((value) => !value);
    void previewVideoRef.current?.play().catch(() => undefined);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border/70 bg-black/20 p-3">
        <Input
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          maxLength={MAX_CAPTION}
          placeholder="Texto de la historia (opcional)"
          aria-label="Texto de la historia"
          className="h-9 text-xs"
        />
        <div className="mt-2">
          <StoryCtaFields
            idPrefix="new-story"
            kind={ctaKind}
            productId={ctaProductId}
            products={products}
            offerReady={offerReady}
            offerTitle={flashTitle}
            onKindChange={(kind) => {
              setCtaKind(kind);
              if (kind === "product" && !ctaProductId) {
                setCtaProductId(products[0]?._id ?? "");
              }
            }}
            onProductChange={setCtaProductId}
          />
        </div>
        <Button
          type="button"
          className="mt-2 h-10 w-full gap-2 bg-ember-gradient text-black"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ImagePlus className="size-4" />
          )}
          {uploading ? "Publicando..." : "Subir foto o video"}
        </Button>
        <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
          Foto hasta 8 MB o video hasta 30 MB. Dura 24 horas y aparece arriba de
          “Todos los negocios” para las cuentas de comprador. El botón elegido
          abre tu catálogo, un producto o tu oferta flash.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
      </div>

      {stories === undefined ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : stories.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
          Todavía no tenés historias activas. Subí la primera para aparecer en
          Negocios.
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {stories.map((story) => (
            <li
              key={story._id}
              className="relative overflow-hidden rounded-xl border border-border/60 bg-black/30"
            >
              <button
                type="button"
                onClick={() => openPreview(story._id)}
                aria-label={`Ver historia de ${timeLeft(story.expiresAt)} como comprador`}
                className="group relative block w-full"
              >
                {story.kind === "video" ? (
                  <video
                    src={story.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="aspect-[9/16] w-full object-cover"
                  />
                ) : (
                  <img
                    src={story.url}
                    alt={story.caption || "Historia del local"}
                    className="aspect-[9/16] w-full object-cover"
                  />
                )}
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/15 transition-colors group-hover:bg-black/35">
                  <span className="flex size-8 items-center justify-center rounded-full border border-white/30 bg-black/55 text-white backdrop-blur">
                    {story.kind === "video" ? (
                      <Play className="size-3.5 fill-current" />
                    ) : (
                      <Eye className="size-3.5" />
                    )}
                  </span>
                </span>
              </button>
              <div className="absolute right-1 top-1 flex gap-1">
                <button
                  type="button"
                  aria-label="Editar historia"
                  onClick={() => openEdit(story._id, story.caption)}
                  className="flex size-7 items-center justify-center rounded-full bg-black/65 text-white"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Eliminar historia"
                  disabled={removingId === story._id}
                  onClick={() => void handleRemove(story._id)}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full bg-black/65 text-white",
                    removingId === story._id && "opacity-60",
                  )}
                >
                  {removingId === story._id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </button>
              </div>
              <span className="pointer-events-none absolute inset-x-1 bottom-1 rounded-full bg-black/65 px-1.5 py-0.5 text-center text-[9px] font-semibold text-white">
                {timeLeft(story.expiresAt)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {previewStory && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Vista previa de la historia como comprador"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/95 sm:p-4"
        >
          <div className="relative h-full w-full overflow-hidden bg-black select-none sm:aspect-[9/16] sm:h-[85vh] sm:w-auto sm:rounded-2xl sm:border sm:border-white/10">
            {previewStory.kind === "video" ? (
              <video
                key={previewStory._id}
                ref={previewVideoRef}
                src={previewStory.url}
                autoPlay
                muted={previewMuted}
                loop
                playsInline
                preload="auto"
                onClick={() => setPreviewPaused((value) => !value)}
                onTimeUpdate={(event) => {
                  const video = event.currentTarget;
                  if (video.duration > 0) {
                    setPreviewProgress(video.currentTime / video.duration);
                  }
                }}
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <img
                key={previewStory._id}
                src={previewStory.url}
                alt={previewStory.caption || "Historia del local"}
                className="absolute inset-0 size-full object-cover"
                draggable={false}
              />
            )}

            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/75 to-transparent" />
            <div className="absolute inset-x-0 top-0 h-0.5 bg-white/25">
              <div
                className="h-full bg-white transition-[width] duration-150"
                style={{
                  width:
                    previewStory.kind === "video"
                      ? `${Math.round(previewProgress * 100)}%`
                      : "100%",
                }}
              />
            </div>

            <div className="absolute inset-x-0 top-4 flex items-center gap-2 px-3">
              {businessImage ? (
                <img
                  src={businessImage}
                  alt={businessName || "Tu local"}
                  className="size-8 shrink-0 rounded-full border border-white/30 object-cover"
                />
              ) : (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/15 text-[11px] font-bold text-white">
                  {(businessName || "Local").slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[13px] font-semibold text-white">
                  {businessName || "Tu local"}
                </p>
                <p className="text-[11px] text-white/70">
                  {timeLeft(previewStory.expiresAt)}
                </p>
              </div>
              {previewStory.kind === "video" && (
                <button
                  type="button"
                  aria-label={previewMuted ? "Activar sonido" : "Silenciar"}
                  onClick={togglePreviewSound}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-black/45 text-white"
                >
                  {previewMuted ? (
                    <VolumeX className="size-4" />
                  ) : (
                    <Volume2 className="size-4" />
                  )}
                </button>
              )}
              <button
                type="button"
                aria-label="Cerrar vista previa"
                onClick={() => setPreviewId(null)}
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-black/45 text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            {previewStory.kind === "video" && previewPaused && (
              <span className="pointer-events-none absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white">
                <Pause className="size-5" />
              </span>
            )}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/85 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 space-y-2 p-4">
              {previewStory.caption && (
                <p className="text-[13px] font-semibold leading-snug text-white text-shadow-dark">
                  {previewStory.caption}
                </p>
              )}
              <p className="inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-bold text-black">
                {CTA_LABELS[(previewStory.ctaKind ?? "local") as StoryCtaKind]}
              </p>
              <p className="inline-flex rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/80 backdrop-blur">
                Vista previa · así aparece en Negocios
              </p>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={editingStory !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditingId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border/80 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Editar historia</DialogTitle>
            <DialogDescription>
              Cambiá el texto y el botón que aparecen abajo de la foto o el
              video. También podés borrar la historia.
            </DialogDescription>
          </DialogHeader>
          {editingStory && (
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="h-24 w-16 shrink-0 overflow-hidden rounded-xl border border-border/70 bg-black/40">
                  {editingStory.kind === "video" ? (
                    <video
                      src={editingStory.url}
                      muted
                      playsInline
                      preload="metadata"
                      className="size-full object-cover"
                    />
                  ) : (
                    <img
                      src={editingStory.url}
                      alt=""
                      className="size-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor="story-caption">Texto de la historia</Label>
                  <Textarea
                    id="story-caption"
                    value={editCaption}
                    onChange={(event) => setEditCaption(event.target.value)}
                    maxLength={MAX_CAPTION}
                    placeholder="Ej: Hoy 2x1 en postres"
                    className="min-h-20 resize-none text-xs"
                  />
                  <p className="text-right text-[10px] text-muted-foreground">
                    {editCaption.length}/{MAX_CAPTION}
                  </p>
                </div>
              </div>
              <StoryCtaFields
                idPrefix="edit-story"
                kind={editCtaKind}
                productId={editCtaProductId}
                products={products}
                offerReady={offerReady}
                offerTitle={flashTitle}
                onKindChange={(kind) => {
                  setEditCtaKind(kind);
                  if (kind === "product" && !editCtaProductId) {
                    setEditCtaProductId(products[0]?._id ?? "");
                  }
                }}
                onProductChange={setEditCtaProductId}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                  disabled={removingId === editingStory._id}
                  onClick={() => void handleRemove(editingStory._id)}
                >
                  {removingId === editingStory._id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  Borrar historia
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    className="gap-1.5 bg-ember-gradient text-black"
                    disabled={savingEdit}
                    onClick={() => void handleSaveCaption()}
                  >
                    {savingEdit && (
                      <Loader2 className="size-3.5 animate-spin" />
                    )}
                    Guardar texto
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
