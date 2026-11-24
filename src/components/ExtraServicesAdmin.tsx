import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { EXTRA_SERVICE_ICONS } from "@/lib/extraServices";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ExtraService = {
  _id: Id<"extraServices">;
  name: string;
  headline: string;
  price: number;
  details: string[];
  icon: string;
  isActive: boolean;
};

type ServiceDraft = {
  name: string;
  headline: string;
  price: string;
  details: string;
  icon: string;
};

function draftOf(service: ExtraService): ServiceDraft {
  return {
    name: service.name,
    headline: service.headline,
    price: String(service.price),
    details: service.details.join("\n"),
    icon: service.icon,
  };
}

function emptyDraft(): ServiceDraft {
  return { name: "", headline: "", price: "", details: "", icon: "sparkles" };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function ExtraServicesAdmin() {
  const services = useQuery(api.extraServices.list);
  const seedDefaults = useMutation(api.extraServices.seedDefaults);
  const createService = useMutation(api.extraServices.createService);
  const updateService = useMutation(api.extraServices.updateService);
  const removeService = useMutation(api.extraServices.removeService);

  const [editing, setEditing] = useState<ExtraService | null>(null);
  const [draft, setDraft] = useState<ServiceDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newDraft, setNewDraft] = useState<ServiceDraft | null>(null);
  const [deleting, setDeleting] = useState<ExtraService | null>(null);
  const [removing, setRemoving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const parseDraft = (value: ServiceDraft) => {
    const price = Number(value.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error("El precio tiene que ser mayor a 0");
    }
    return {
      name: value.name,
      headline: value.headline,
      price,
      details: value.details
        .split("\n")
        .map((detail) => detail.trim())
        .filter(Boolean),
      icon: value.icon,
    };
  };

  const handleCreate = async () => {
    if (!newDraft) return;
    setSaving(true);
    try {
      await createService(parseDraft(newDraft));
      toast.success("Servicio añadido", {
        description: newDraft.name.trim(),
      });
      setCreating(false);
      setNewDraft(null);
    } catch (error) {
      toast.error(errorMessage(error, "No pudimos añadir el servicio"));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!editing || !draft) return;
    setSaving(true);
    try {
      await updateService({ serviceId: editing._id, ...parseDraft(draft) });
      toast.success("Servicio actualizado", {
        description: draft.name.trim(),
      });
      setEditing(null);
      setDraft(null);
    } catch (error) {
      toast.error(errorMessage(error, "No pudimos guardar el servicio"));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (service: ExtraService, isActive: boolean) => {
    try {
      await updateService({ serviceId: service._id, isActive });
      toast.success(isActive ? "Servicio visible" : "Servicio oculto", {
        description: service.name,
      });
    } catch (error) {
      toast.error(errorMessage(error, "No pudimos cambiar el servicio"));
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setRemoving(true);
    try {
      await removeService({ serviceId: deleting._id });
      toast.success("Servicio eliminado", { description: deleting.name });
      setDeleting(null);
    } catch (error) {
      toast.error(errorMessage(error, "No pudimos eliminar el servicio"));
    } finally {
      setRemoving(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const result = await seedDefaults({});
      toast.success("Servicios iniciales cargados", {
        description: `${result.seeded} servicios listos para editar`,
      });
    } catch (error) {
      toast.error(errorMessage(error, "No pudimos cargar los servicios"));
    } finally {
      setSeeding(false);
    }
  };

  const formFields = (
    value: ServiceDraft,
    onChange: (next: ServiceDraft) => void,
    prefix: string,
  ) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${prefix}-name`}>Nombre</Label>
        <Input
          id={`${prefix}-name`}
          value={value.name}
          maxLength={90}
          placeholder="Ej. Tienda lista con 10 productos"
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefix}-headline`}>Titular</Label>
        <Input
          id={`${prefix}-headline`}
          value={value.headline}
          maxLength={80}
          placeholder="Ej. Ideal si no tenés tiempo"
          onChange={(event) =>
            onChange({ ...value, headline: event.target.value })
          }
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefix}-price`}>Precio (₡ pago único)</Label>
        <Input
          id={`${prefix}-price`}
          type="number"
          min={1}
          step={1}
          value={value.price}
          onChange={(event) =>
            onChange({ ...value, price: event.target.value })
          }
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${prefix}-icon`}>Ícono</Label>
        <Select
          value={value.icon}
          onValueChange={(icon) => onChange({ ...value, icon })}
        >
          <SelectTrigger id={`${prefix}-icon`} className="w-full bg-background/40">
            <SelectValue placeholder="Elegí un ícono" />
          </SelectTrigger>
          <SelectContent>
            {EXTRA_SERVICE_ICONS.map((icon) => (
              <SelectItem key={icon} value={icon}>
                {icon}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${prefix}-details`}>
          Detalles (uno por línea)
        </Label>
        <Textarea
          id={`${prefix}-details`}
          value={value.details}
          className="min-h-24 resize-none"
          placeholder={"Configuración del perfil de tu tienda.\nPublica 10 productos..."}
          onChange={(event) =>
            onChange({ ...value, details: event.target.value })
          }
        />
      </div>
    </div>
  );

  return (
    <section className="surface-raised mt-5 rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
            <ShieldCheck className="size-3.5" />
            Perfil administrador
          </p>
          <h2 className="font-display text-lg font-bold">
            Servicios adicionales
          </h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Los servicios de pago único que ven los negocios en su pestaña
            Servicios. Editá precios y textos, ocultá los que no apliquen o
            añadí nuevos.
          </p>
        </div>
        <Button
          className="gap-2 bg-ember-gradient text-black"
          onClick={() => {
            setNewDraft(emptyDraft());
            setCreating(true);
          }}
        >
          <Plus className="size-4" />
          Añadir servicio
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {services === undefined ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-primary" />
          </div>
        ) : services.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center">
            <Wrench className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-2 text-xs text-muted-foreground">
              Todavía no hay servicios guardados. Cargá los 4 iniciales para
              editarlos o añadí uno desde cero.
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-border/80"
                disabled={seeding}
                onClick={() => void handleSeed()}
              >
                {seeding ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                Cargar los 4 iniciales
              </Button>
              <Button
                size="sm"
                className="gap-1.5 bg-ember-gradient text-black"
                onClick={() => {
                  setNewDraft(emptyDraft());
                  setCreating(true);
                }}
              >
                <Plus className="size-3.5" />
                Añadir uno nuevo
              </Button>
            </div>
          </div>
        ) : (
          services.map((service) => (
            <div
              key={service._id}
              className={cn(
                "rounded-2xl border border-border/70 bg-black/20 p-3",
                !service.isActive && "opacity-60",
              )}
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <span className="truncate">{service.name}</span>
                    {!service.isActive && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                        Oculto
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {service.headline} · {money(service.price)} pago único ·{" "}
                    {service.details.length} detalles
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Switch
                    checked={service.isActive}
                    aria-label={
                      service.isActive
                        ? `Ocultar ${service.name}`
                        : `Mostrar ${service.name}`
                    }
                    onCheckedChange={(checked) =>
                      void handleToggle(service, checked)
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${service.name}`}
                    title="Editar servicio"
                    onClick={() => {
                      setEditing(service);
                      setDraft(draftOf(service));
                    }}
                    className="size-8 text-muted-foreground hover:text-accent"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Eliminar ${service.name}`}
                    title="Eliminar servicio"
                    onClick={() => setDeleting(service)}
                    className="size-8 text-muted-foreground hover:text-primary"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Añadir servicio */}
      <Dialog
        open={creating}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setNewDraft(null);
          }
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Añadir servicio</DialogTitle>
            <DialogDescription>
              Aparece de inmediato en la pestaña Servicios de los negocios.
            </DialogDescription>
          </DialogHeader>
          {newDraft &&
            formFields(newDraft, setNewDraft, "extra-new")}
          <DialogFooter>
            <Button
              variant="outline"
              className="border-border/80"
              disabled={saving}
              onClick={() => {
                setCreating(false);
                setNewDraft(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              className="gap-2 bg-ember-gradient text-black"
              disabled={saving}
              onClick={() => void handleCreate()}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Añadir servicio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar servicio */}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setDraft(null);
          }
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar servicio</DialogTitle>
            <DialogDescription>
              Los cambios se ven al instante en las cuentas de negocio.
            </DialogDescription>
          </DialogHeader>
          {draft && formFields(draft, setDraft, "extra-edit")}
          <DialogFooter>
            <Button
              variant="outline"
              className="border-border/80"
              disabled={saving}
              onClick={() => {
                setEditing(null);
                setDraft(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              className="gap-2 bg-ember-gradient text-black"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Pencil className="size-4" />
              )}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar borrado */}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este servicio?</AlertDialogTitle>
            <AlertDialogDescription>
              Se quita {deleting?.name ?? "el servicio"} de la pestaña
              Servicios de los negocios. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={() => void handleDelete()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {removing ? "Eliminando..." : "Eliminar servicio"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
