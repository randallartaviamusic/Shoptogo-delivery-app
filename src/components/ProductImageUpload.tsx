import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { ImageUp, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

const MAX_BYTES = 8 * 1024 * 1024;

/** Sube la imagen principal del producto desde la galería. */
export function ProductImageUpload({
  preview,
  onChange,
}: {
  preview?: string;
  onChange: (storageId: Id<"_storage">, localPreview: string) => void;
}) {
  const generateUploadUrl = useMutation(
    api.businesses.generateProductImageUploadUrl,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Elegí una imagen (JPG, PNG o WebP)");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("La imagen no puede pesar más de 8 MB");
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
      <p className="text-sm font-medium">Imagen del producto</p>
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-black/20 p-3">
        {preview ? (
          <img
            src={preview}
            alt="Imagen del producto"
            className="aspect-[4/3] w-full rounded-xl border border-border/60 object-cover"
          />
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed border-border/70 text-muted-foreground">
            <ImageUp className="size-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-2 border-border/80"
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
                ? "Cambiar imagen desde galería"
                : "Subir imagen desde galería"}
          </Button>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            JPG, PNG o WebP, hasta 8 MB. Es la foto que se muestra en el mazo y
            en tu catálogo.
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
