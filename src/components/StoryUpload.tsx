import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { Crown, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 30 * 1024 * 1024;

function timeLeft(expiresAt: number) {
  const ms = Math.max(0, expiresAt - Date.now());
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours <= 0) return `quedan ${minutes} min`;
  return `quedan ${hours} h ${minutes} min`;
}

/**
 * Historias del negocio: foto o video de 24 horas. Sólo se habilita con el
 * plan Pro o Élite vigente; si no, muestra cómo activarlo.
 */
export function StoryUpload({ enabled }: { enabled: boolean }) {
  const stories = useQuery(api.stories.mine);
  const generateUploadUrl = useMutation(api.stories.generateStoryUploadUrl);
  const publishStory = useMutation(api.stories.publish);
  const removeStory = useMutation(api.stories.remove);
  const inputRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

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
      toast.success("Historia eliminada");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos eliminarla",
      );
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border/70 bg-black/20 p-3">
        <Input
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          maxLength={140}
          placeholder="Texto de la historia (opcional)"
          aria-label="Texto de la historia"
          className="h-9 text-xs"
        />
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
          “Todos los negocios” para las cuentas de comprador.
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
              <span className="absolute inset-x-1 bottom-1 rounded-full bg-black/65 px-1.5 py-0.5 text-center text-[9px] font-semibold text-white">
                {timeLeft(story.expiresAt)}
              </span>
              <button
                type="button"
                aria-label="Eliminar historia"
                disabled={removingId === story._id}
                onClick={() => void handleRemove(story._id)}
                className={cn(
                  "absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/65 text-white",
                  removingId === story._id && "opacity-60",
                )}
              >
                {removingId === story._id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
