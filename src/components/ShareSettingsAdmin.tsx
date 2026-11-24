import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  ImageUp,
  Link2,
  Loader2,
  QrCode,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const QR_MAX_BYTES = 5 * 1024 * 1024;

/**
 * QR y link de descarga que llevan las tarjetas para compartir fuera de la
 * app. El QR se sube como imagen y el link apunta a la descarga de la app.
 */
export function ShareSettingsAdmin() {
  const config = useQuery(api.branding.shareConfig);
  const generateUploadUrl = useMutation(api.branding.generateShareQrUploadUrl);
  const setShareQr = useMutation(api.branding.setShareQr);
  const setShareAppUrl = useMutation(api.branding.setShareAppUrl);

  const qrInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [appUrl, setAppUrl] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);

  useEffect(() => {
    if (config && appUrl === "") setAppUrl(config.appUrl);
  }, [config, appUrl]);

  const effectiveQr = qrPreview ?? config?.qrUrl ?? null;

  async function uploadQr(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Elegí una imagen para el QR");
      return;
    }
    if (file.size > QR_MAX_BYTES) {
      toast.error("El QR no puede pesar más de 5 MB");
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
      if (!response.ok) throw new Error("No pudimos subir el QR");
      const { storageId } = (await response.json()) as { storageId: string };
      await setShareQr({ storageId: storageId as Id<"_storage"> });
      setQrPreview(URL.createObjectURL(file));
      toast.success("QR guardado", {
        description: "Ya aparece en las tarjetas para compartir.",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos subir el QR",
      );
    } finally {
      setUploading(false);
      if (qrInputRef.current) qrInputRef.current.value = "";
    }
  }

  async function saveUrl() {
    setSavingUrl(true);
    try {
      const saved = await setShareAppUrl({ url: appUrl });
      setAppUrl(saved);
      toast.success("Link de descarga guardado");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos guardar el link",
      );
    } finally {
      setSavingUrl(false);
    }
  }

  return (
    <section className="surface-raised mt-5 rounded-3xl p-5 sm:p-6">
      <div>
        <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
          <ShieldCheck className="size-3.5" />
          Perfil administrador
        </p>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <QrCode className="size-4 text-accent" />
          Compartir fuera de la app
        </h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          El QR y el link aparecen en las tarjetas que se comparten del mazo,
          los negocios y las tiendas. El link debe llevar a la descarga de la
          app.
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-black/25 p-4">
          <p className="text-sm font-semibold">Código QR</p>
          <div className="mt-3 flex items-center gap-4">
            <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/70 bg-white">
              {effectiveQr ? (
                <img
                  src={effectiveQr}
                  alt="QR para descargar la app"
                  className="size-full object-contain"
                />
              ) : (
                <QrCode className="size-8 text-black/30" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2 border-border/80"
                disabled={uploading}
                onClick={() => qrInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ImageUp className="size-3.5" />
                )}
                {uploading
                  ? "Subiendo..."
                  : effectiveQr
                    ? "Cambiar QR"
                    : "Subir QR"}
              </Button>
            </div>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
            Imagen cuadrada del QR, hasta 5 MB. Sin QR configurado no se puede
            compartir.
          </p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-black/25 p-4">
          <p className="text-sm font-semibold">Link de descarga</p>
          <div className="mt-3 space-y-2">
            <div className="space-y-1.5">
              <Label htmlFor="share-app-url">A dónde lleva la tarjeta</Label>
              <div className="relative">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="share-app-url"
                  value={appUrl}
                  onChange={(event) => setAppUrl(event.target.value)}
                  placeholder="https://…"
                  inputMode="url"
                  className="bg-background/40 pl-9"
                />
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              className="w-full gap-2 bg-ember-gradient text-black"
              disabled={savingUrl || appUrl.trim().length === 0}
              onClick={() => void saveUrl()}
            >
              {savingUrl ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              Guardar link
            </Button>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
            Aparece escrito en la tarjeta y en el mensaje que acompaña la
            imagen al compartir.
          </p>
        </div>
      </div>

      <input
        ref={qrInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void uploadQr(event.target.files?.[0])}
      />
    </section>
  );
}
