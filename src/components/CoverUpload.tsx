import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { ImageUp, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Portada del local: sube una imagen de la galería a Convex Storage y devuelve
 * su id para guardarla al crear o editar el negocio.
 */
export function CoverUpload({
  preview,
  onChange,
  hint = "Si no subís una, usamos la portada por defecto de tu departamento.",
}: {
  preview?: string;
  onChange: (storageId: Id<"_storage">, localPreview: string) => void;
  hint?: string;
}) {
  const generateUploadUrl = useMutation(api.businesses.generateCoverUploadUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Elegí una imagen (JPG, PNG o WebP)");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("La portada no puede pesar más de 8 MB");
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
      if (!response.ok) throw new Error("No pudimos subir la imagen");
      const { storageId } = (await response.json()) as { storageId: string };
      onChange(storageId as Id<"_storage">, URL.createObjectURL(file));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos subir la imagen",
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Portada del local</p>
      <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-black/20 p-3">
        {preview ? (
          <img
            src={preview}
            alt="Portada del local"
            className="h-20 w-28 shrink-0 rounded-xl border border-border/60 object-cover"
          />
        ) : (
          <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-xl border border-dashed border-border/70 text-muted-foreground">
            <ImageUp className="size-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
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
              <ImageUp className="size-3.5" />
            )}
            {uploading
              ? "Subiendo..."
              : preview
                ? "Cambiar desde galería"
                : "Subir desde galería"}
          </Button>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            {hint}
          </p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
    </div>
  );
}
