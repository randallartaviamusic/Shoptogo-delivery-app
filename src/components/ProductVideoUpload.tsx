import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Loader2, Video, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

const MAX_BYTES = 30 * 1024 * 1024;

/** Sube un video de la galería para reemplazar la imagen en la card. */
export function ProductVideoUpload({
  preview,
  onChange,
  onRemove,
}: {
  preview?: string;
  onChange: (storageId: Id<"_storage">, localPreview: string) => void;
  onRemove: () => void;
}) {
  const generateUploadUrl = useMutation(
    api.businesses.generateProductVideoUploadUrl,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast.error("Elegí un video (MP4, WebM o MOV)");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("El video no puede pesar más de 30 MB");
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
      if (!response.ok) throw new Error("No pudimos subir el video");
      const { storageId } = (await response.json()) as { storageId: string };
      onChange(storageId as Id<"_storage">, URL.createObjectURL(file));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos subir el video",
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Video del producto (opcional)</p>
      <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-black/20 p-3">
        {preview ? (
          <video
            src={preview}
            aria-label="Video del producto"
            autoPlay
            muted
            loop
            playsInline
            controls
            className="h-20 w-28 shrink-0 rounded-xl border border-border/60 object-cover"
          />
        ) : (
          <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-xl border border-dashed border-border/70 text-muted-foreground">
            <Video className="size-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 border-border/80"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Video className="size-3.5" />
              )}
              {uploading
                ? "Subiendo..."
                : preview
                  ? "Cambiar video"
                  : "Subir video desde galería"}
            </Button>
            {preview && !uploading && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-primary hover:text-primary"
                onClick={onRemove}
              >
                <X className="size-3.5" />
                Quitar
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            Si subís un video, se reproduce en el mazo en vez de la imagen.
            MP4, WebM o MOV, hasta 30 MB.
          </p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
    </div>
  );
}
