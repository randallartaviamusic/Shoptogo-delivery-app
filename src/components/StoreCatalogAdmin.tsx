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
import { DEPARTMENTS, getDepartment } from "@/lib/departments";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  ChevronDown,
  ImageUp,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Store,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

const STORE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

function AdminProductImagePicker({
  preview,
  fallbackUrl,
  onPicked,
}: {
  preview: string;
  fallbackUrl: string;
  onPicked: (storageId: Id<"_storage">, localPreview: string) => void;
}) {
  const generateUploadUrl = useMutation(
    api.admin.generateStoreProductImageUploadUrl,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const shown = preview || fallbackUrl.trim();

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Elegi una imagen (JPG, PNG o WebP)");
      return;
    }
    if (file.size > STORE_IMAGE_MAX_BYTES) {
      toast.error("La imagen no puede pesar mas de 8 MB");
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
      onPicked(storageId as Id<"_storage">, URL.createObjectURL(file));
      toast.success("Foto cargada desde la galeria");
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
    <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-black/20 p-3">
      {shown ? (
        <img
          src={shown}
          alt="Foto del producto"
          className="h-24 w-full rounded-xl border border-border/60 object-cover"
        />
      ) : (
        <div className="flex h-24 w-full items-center justify-center rounded-xl border border-dashed border-border/70 text-muted-foreground">
          <ImageUp className="size-5" />
        </div>
      )}
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
          : shown
            ? "Cambiar foto desde galeria"
            : "Subir foto desde galeria"}
      </Button>
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

type StoreProduct = {
  _id: Id<"products">;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  tags: string[];
  isAvailable: boolean;
};

type StoreBusiness = {
  _id: Id<"businesses">;
  name: string;
  slug: string;
  department: string;
  category: string;
  tagline: string;
  image: string;
  address: string;
  etaMinutes: number;
  isOpen: boolean;
  rating: number;
  reviews: number;
  ownerName: string | null;
  ownerEmail: string | null;
  products: StoreProduct[];
};

type BusinessDraft = {
  name: string;
  tagline: string;
  category: string;
  department: string;
  image: string;
  address: string;
  etaMinutes: string;
  isOpen: boolean;
};

type ProductDraft = {
  name: string;
  description: string;
  price: string;
  category: string;
  image: string;
  tags: string;
  isAvailable: boolean;
};

function businessDraftOf(business: StoreBusiness): BusinessDraft {
  return {
    name: business.name,
    tagline: business.tagline,
    category: business.category,
    department: business.department,
    image: business.image,
    address: business.address,
    etaMinutes: String(business.etaMinutes),
    isOpen: business.isOpen,
  };
}

function productDraftOf(product: StoreProduct): ProductDraft {
  return {
    name: product.name,
    description: product.description,
    price: String(product.price),
    category: product.category,
    image: product.image,
    tags: product.tags.join(", "),
    isAvailable: product.isAvailable,
  };
}

function emptyProductDraft(category: string): ProductDraft {
  return {
    name: "",
    description: "",
    price: "",
    category,
    image: "",
    tags: "",
    isAvailable: true,
  };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function StoreCatalogAdmin() {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const catalog = useQuery(api.admin.storeCatalog, { search });

  const updateBusiness = useMutation(api.admin.updateStoreBusiness);
  const createProduct = useMutation(api.admin.createStoreProduct);
  const updateProduct = useMutation(api.admin.updateStoreProduct);
  const deleteProduct = useMutation(api.admin.deleteStoreProduct);

  const [editingBusiness, setEditingBusiness] = useState<StoreBusiness | null>(null);
  const [businessDraft, setBusinessDraft] = useState<BusinessDraft | null>(null);
  const [savingBusiness, setSavingBusiness] = useState(false);

  const [editingProduct, setEditingProduct] = useState<StoreProduct | null>(null);
  const [productDraft, setProductDraft] = useState<ProductDraft | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<StoreProduct | null>(null);
  const [editImageStorageId, setEditImageStorageId] =
    useState<Id<"_storage"> | null>(null);
  const [editImagePreview, setEditImagePreview] = useState("");

  const [creatingFor, setCreatingFor] = useState<StoreBusiness | null>(null);
  const [newDraft, setNewDraft] = useState<ProductDraft | null>(null);
  const [creating, setCreating] = useState(false);
  const [newImageStorageId, setNewImageStorageId] =
    useState<Id<"_storage"> | null>(null);
  const [newImagePreview, setNewImagePreview] = useState("");

  const [removing, setRemoving] = useState(false);

  const openBusinessEditor = (business: StoreBusiness) => {
    setEditingBusiness(business);
    setBusinessDraft(businessDraftOf(business));
  };

  const openProductEditor = (product: StoreProduct) => {
    setEditingProduct(product);
    setProductDraft(productDraftOf(product));
    setEditImageStorageId(null);
    setEditImagePreview("");
  };

  const openProductCreator = (business: StoreBusiness) => {
    setCreatingFor(business);
    setNewDraft(emptyProductDraft(business.category));
    setNewImageStorageId(null);
    setNewImagePreview("");
  };

  const handleSaveBusiness = async () => {
    if (!editingBusiness || !businessDraft) return;
    setSavingBusiness(true);
    try {
      const etaMinutes = Number(businessDraft.etaMinutes);
      await updateBusiness({
        businessId: editingBusiness._id,
        name: businessDraft.name,
        tagline: businessDraft.tagline,
        category: businessDraft.category,
        department: businessDraft.department,
        image: businessDraft.image,
        address: businessDraft.address,
        etaMinutes: Number.isFinite(etaMinutes)
          ? etaMinutes
          : editingBusiness.etaMinutes,
        isOpen: businessDraft.isOpen,
      });
      toast.success("Tienda actualizada", {
        description: businessDraft.name,
      });
      setEditingBusiness(null);
      setBusinessDraft(null);
    } catch (error) {
      toast.error(errorMessage(error, "No pudimos guardar la tienda"));
    } finally {
      setSavingBusiness(false);
    }
  };

  const handleSaveProduct = async () => {
    if (!editingProduct || !productDraft) return;
    setSavingProduct(true);
    try {
      const price = Number(productDraft.price);
      if (!Number.isFinite(price) || price <= 0) {
        throw new Error("El precio tiene que ser mayor a 0");
      }
      await updateProduct({
        productId: editingProduct._id,
        name: productDraft.name,
        description: productDraft.description,
        price,
        category: productDraft.category,
        image: editImageStorageId ? undefined : productDraft.image,
        ...(editImageStorageId ? { imageStorageId: editImageStorageId } : {}),
        tags: productDraft.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        isAvailable: productDraft.isAvailable,
      });
      toast.success("Producto actualizado", {
        description: productDraft.name,
      });
      setEditingProduct(null);
      setProductDraft(null);
      setEditImageStorageId(null);
      setEditImagePreview("");
    } catch (error) {
      toast.error(errorMessage(error, "No pudimos guardar el producto"));
    } finally {
      setSavingProduct(false);
    }
  };

  const handleCreateProduct = async () => {
    if (!creatingFor || !newDraft) return;
    setCreating(true);
    try {
      const name = newDraft.name.trim();
      if (name.length < 2) {
        throw new Error("El producto necesita al menos 2 letras");
      }
      const price = Number(newDraft.price);
      if (!Number.isFinite(price) || price <= 0) {
        throw new Error("El precio tiene que ser mayor a 0");
      }
      await createProduct({
        businessId: creatingFor._id,
        name,
        description: newDraft.description,
        price,
        category: newDraft.category,
        image: newImageStorageId
          ? undefined
          : newDraft.image.trim()
            ? newDraft.image
            : undefined,
        ...(newImageStorageId ? { imageStorageId: newImageStorageId } : {}),
        tags: newDraft.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        isAvailable: newDraft.isAvailable,
      });
      toast.success("Producto publicado", {
        description: `${name} ya aparece en ${creatingFor.name}`,
      });
      setCreatingFor(null);
      setNewDraft(null);
      setNewImageStorageId(null);
      setNewImagePreview("");
    } catch (error) {
      toast.error(errorMessage(error, "No pudimos publicar el producto"));
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!deletingProduct) return;
    setRemoving(true);
    try {
      const cleared = await deleteProduct({ productId: deletingProduct._id });
      toast.success("Producto eliminado", {
        description: `${deletingProduct.name}${
          cleared.cartItems ? ` · ${cleared.cartItems} en carritos` : ""
        }`,
      });
      setDeletingProduct(null);
    } catch (error) {
      toast.error(errorMessage(error, "No pudimos eliminar el producto"));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <section className="surface-raised mt-5 rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
            <ShieldCheck className="size-3.5" />
            Perfil administrador
          </p>
          <h2 className="font-display text-lg font-bold">
            Tiendas y productos de negocios
          </h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Editá los datos de cualquier tienda real, corregí sus productos o
            publicá productos nuevos en la tienda que te lo solicite.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1">
            <Store className="size-3" />
            {catalog?.totals.businesses ?? 0} tiendas
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1">
            <Package className="size-3" />
            {catalog?.totals.products ?? 0} productos
          </span>
        </div>
      </div>

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar tienda, dueño, producto o dirección"
          className="pl-9"
        />
      </div>

      <div className="mt-3 space-y-2">
        {catalog === undefined ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-primary" />
          </div>
        ) : catalog.businesses.length === 0 ? (
          <p className="rounded-xl border border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
            {search.trim()
              ? "No hay tiendas con esa búsqueda."
              : "Todavía no hay tiendas de negocios registradas."}
          </p>
        ) : (
          catalog.businesses.map((business) => {
            const isExpanded = expanded === business._id;
            const department = getDepartment(business.department);
            return (
              <div
                key={business._id}
                className="rounded-2xl border border-border/70 bg-black/20 p-3"
              >
                <div className="flex flex-wrap items-start gap-3">
                  <img
                    src={business.image}
                    alt={business.name}
                    className="size-14 shrink-0 rounded-xl border border-border/60 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      <span className="truncate">{business.name}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                          business.isOpen
                            ? "bg-accent/15 text-accent"
                            : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {business.isOpen ? "Abierta" : "Cerrada"}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {department.label} · {business.category} ·{" "}
                      {business.address}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      {(business.ownerName ?? business.ownerEmail ?? "Sin dueño")} ·{" "}
                      {business.products.length} productos · {business.etaMinutes}{" "}
                      min · ⭐ {business.rating.toFixed(1)} (
                      {business.reviews})
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Publicar producto en ${business.name}`}
                      title="Publicar producto nuevo"
                      onClick={() => openProductCreator(business)}
                      className="size-8 text-muted-foreground hover:text-accent"
                    >
                      <Plus className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar ${business.name}`}
                      title="Editar tienda"
                      onClick={() => openBusinessEditor(business)}
                      className="size-8 text-muted-foreground hover:text-accent"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setExpanded(isExpanded ? null : business._id)
                  }
                  className="mt-2 flex w-full items-center gap-1.5 rounded-lg px-1 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                  aria-expanded={isExpanded}
                >
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      isExpanded && "rotate-180",
                    )}
                  />
                  {isExpanded
                    ? "Ocultar productos"
                    : `Ver productos (${business.products.length})`}
                </button>

                {isExpanded && (
                  <div className="mt-1 space-y-1.5 border-t border-border/60 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5 border-dashed text-xs"
                      onClick={() => openProductCreator(business)}
                    >
                      <Plus className="size-3.5" />
                      Publicar producto nuevo en esta tienda
                    </Button>
                    {business.products.length === 0 ? (
                      <p className="px-2 py-2 text-[11px] text-muted-foreground">
                        Esta tienda todavía no tiene productos.
                      </p>
                    ) : (
                      business.products.map((product) => (
                        <div
                          key={product._id}
                          className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-black/15 p-2"
                        >
                          <img
                            src={product.image}
                            alt={product.name}
                            className="size-9 shrink-0 rounded-lg border border-border/50 object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">
                              {product.name}
                            </p>
                            <p className="truncate text-[10px] text-muted-foreground">
                              {product.category} · {money(product.price)}
                              {product.tags.length > 0
                                ? ` · ${product.tags.join(" · ")}`
                                : ""}
                            </p>
                          </div>
                          {!product.isAvailable && (
                            <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
                              Agotado
                            </span>
                          )}
                          <div className="flex shrink-0 items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Editar ${product.name}`}
                              title="Editar producto"
                              onClick={() => openProductEditor(product)}
                              className="size-7 text-muted-foreground hover:text-accent"
                            >
                              <Pencil className="size-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Eliminar ${product.name}`}
                              title="Eliminar producto"
                              onClick={() => setDeletingProduct(product)}
                              className="size-7 text-muted-foreground hover:text-primary"
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
        Los cambios se aplican al instante en la tienda, el mazo y el carrito.
        Borrar un producto lo saca también de carritos y antojos guardados; los
        pedidos entregados se conservan como historial.
      </p>

      {/* Editar tienda */}
      <Dialog
        open={editingBusiness !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingBusiness(null);
            setBusinessDraft(null);
          }
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar tienda</DialogTitle>
            <DialogDescription>
              {editingBusiness?.ownerName ?? editingBusiness?.ownerEmail ?? "La tienda"}{" "}
              se actualiza al instante en el modo negocios y en las tarjetas.
            </DialogDescription>
          </DialogHeader>

          {businessDraft && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="store-business-name">Nombre</Label>
                <Input
                  id="store-business-name"
                  value={businessDraft.name}
                  maxLength={80}
                  onChange={(event) =>
                    setBusinessDraft({
                      ...businessDraft,
                      name: event.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="store-business-department">Departamento</Label>
                <Select
                  value={businessDraft.department}
                  onValueChange={(value) =>
                    setBusinessDraft({
                      ...businessDraft,
                      department: value,
                    })
                  }
                >
                  <SelectTrigger
                    id="store-business-department"
                    className="w-full bg-background/40"
                  >
                    <SelectValue placeholder="Elegí un departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((department) => (
                      <SelectItem key={department.slug} value={department.slug}>
                        {department.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="store-business-category">Categoría</Label>
                <Input
                  id="store-business-category"
                  value={businessDraft.category}
                  maxLength={60}
                  onChange={(event) =>
                    setBusinessDraft({
                      ...businessDraft,
                      category: event.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="store-business-tagline">Frase corta</Label>
                <Input
                  id="store-business-tagline"
                  value={businessDraft.tagline}
                  maxLength={140}
                  onChange={(event) =>
                    setBusinessDraft({
                      ...businessDraft,
                      tagline: event.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="store-business-address">Dirección</Label>
                <Input
                  id="store-business-address"
                  value={businessDraft.address}
                  maxLength={200}
                  onChange={(event) =>
                    setBusinessDraft({
                      ...businessDraft,
                      address: event.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="store-business-image">Foto (enlace)</Label>
                <Input
                  id="store-business-image"
                  value={businessDraft.image}
                  placeholder="https://..."
                  onChange={(event) =>
                    setBusinessDraft({
                      ...businessDraft,
                      image: event.target.value,
                    })
                  }
                />
                {businessDraft.image.trim() && (
                  <img
                    src={businessDraft.image}
                    alt="Vista previa de la tienda"
                    className="mt-1 h-24 w-full rounded-xl border border-border/60 object-cover"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="store-business-eta">Tiempo estimado (min)</Label>
                <Input
                  id="store-business-eta"
                  type="number"
                  min={5}
                  max={180}
                  value={businessDraft.etaMinutes}
                  onChange={(event) =>
                    setBusinessDraft({
                      ...businessDraft,
                      etaMinutes: event.target.value,
                    })
                  }
                />
              </div>

              <label className="flex items-center justify-between gap-3 self-end rounded-xl border border-border/70 bg-black/20 px-3 py-2.5">
                <span className="text-sm font-medium">Tienda abierta</span>
                <Switch
                  checked={businessDraft.isOpen}
                  onCheckedChange={(checked) =>
                    setBusinessDraft({
                      ...businessDraft,
                      isOpen: checked,
                    })
                  }
                />
              </label>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              className="border-border/80"
              disabled={savingBusiness}
              onClick={() => {
                setEditingBusiness(null);
                setBusinessDraft(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              className="gap-2 bg-ember-gradient text-black"
              disabled={savingBusiness}
              onClick={() => void handleSaveBusiness()}
            >
              {savingBusiness ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Pencil className="size-4" />
              )}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publicar producto nuevo */}
      <Dialog
        open={creatingFor !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreatingFor(null);
            setNewDraft(null);
            setNewImageStorageId(null);
            setNewImagePreview("");
          }
        }}
      >
        <DialogContent className="phone-dialog max-h-[88vh] overflow-y-auto [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>Publicar producto nuevo</DialogTitle>
            <DialogDescription>
              Se publica en {creatingFor?.name ?? "la tienda"} y aparece en el
              mazo de inmediato.
            </DialogDescription>
          </DialogHeader>

          {newDraft && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="store-new-name">Nombre</Label>
                <Input
                  id="store-new-name"
                  value={newDraft.name}
                  maxLength={90}
                  placeholder="Ej. Casado con pollo"
                  onChange={(event) =>
                    setNewDraft({ ...newDraft, name: event.target.value })
                  }
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="store-new-description">Descripción</Label>
                <Textarea
                  id="store-new-description"
                  value={newDraft.description}
                  maxLength={500}
                  className="min-h-20 resize-none"
                  placeholder="Contale al comprador qué trae el producto"
                  onChange={(event) =>
                    setNewDraft({
                      ...newDraft,
                      description: event.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="store-new-price">Precio (₡)</Label>
                <Input
                  id="store-new-price"
                  type="number"
                  min={1}
                  step={1}
                  value={newDraft.price}
                  onChange={(event) =>
                    setNewDraft({ ...newDraft, price: event.target.value })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="store-new-category">Categoría</Label>
                <Input
                  id="store-new-category"
                  value={newDraft.category}
                  maxLength={60}
                  onChange={(event) =>
                    setNewDraft({ ...newDraft, category: event.target.value })
                  }
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="store-new-tags">
                  Etiquetas (separadas por coma)
                </Label>
                <Input
                  id="store-new-tags"
                  value={newDraft.tags}
                  placeholder="Más pedido, Vegetariano"
                  onChange={(event) =>
                    setNewDraft({ ...newDraft, tags: event.target.value })
                  }
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Foto del producto</Label>
                <AdminProductImagePicker
                  preview={newImagePreview}
                  fallbackUrl={newDraft.image}
                  onPicked={(storageId, preview) => {
                    setNewImageStorageId(storageId);
                    setNewImagePreview(preview);
                    setNewDraft({ ...newDraft, image: "" });
                  }}
                />
                <Label htmlFor="store-new-image">O pegá un enlace</Label>
                <Input
                  id="store-new-image"
                  value={newDraft.image}
                  placeholder="https://..."
                  onChange={(event) => {
                    setNewDraft({ ...newDraft, image: event.target.value });
                    if (event.target.value.trim()) {
                      setNewImageStorageId(null);
                      setNewImagePreview("");
                    }
                  }}
                />
                {!newImagePreview && !newDraft.image.trim() && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Sin foto se usa la foto de la tienda.
                  </p>
                )}
              </div>

              <label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-black/20 px-3 py-2.5 sm:col-span-2">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    Disponible para pedir
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    Si lo apagás, se publica pausado.
                  </span>
                </span>
                <Switch
                  checked={newDraft.isAvailable}
                  onCheckedChange={(checked) =>
                    setNewDraft({ ...newDraft, isAvailable: checked })
                  }
                />
              </label>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              className="border-border/80"
              disabled={creating}
              onClick={() => {
                setCreatingFor(null);
                setNewDraft(null);
                setNewImageStorageId(null);
                setNewImagePreview("");
              }}
            >
              Cancelar
            </Button>
            <Button
              className="gap-2 bg-ember-gradient text-black"
              disabled={creating}
              onClick={() => void handleCreateProduct()}
            >
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Publicar producto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar producto */}
      <Dialog
        open={editingProduct !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingProduct(null);
            setProductDraft(null);
            setEditImageStorageId(null);
            setEditImagePreview("");
          }
        }}
      >
        <DialogContent className="phone-dialog max-h-[88vh] overflow-y-auto [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>Editar producto</DialogTitle>
            <DialogDescription>
              Se actualiza en la tienda, en el mazo y en el carrito.
            </DialogDescription>
          </DialogHeader>

          {productDraft && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="store-product-name">Nombre</Label>
                <Input
                  id="store-product-name"
                  value={productDraft.name}
                  maxLength={90}
                  onChange={(event) =>
                    setProductDraft({
                      ...productDraft,
                      name: event.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="store-product-description">Descripción</Label>
                <Textarea
                  id="store-product-description"
                  value={productDraft.description}
                  maxLength={500}
                  className="min-h-20 resize-none"
                  onChange={(event) =>
                    setProductDraft({
                      ...productDraft,
                      description: event.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="store-product-price">Precio (₡)</Label>
                <Input
                  id="store-product-price"
                  type="number"
                  min={1}
                  step={1}
                  value={productDraft.price}
                  onChange={(event) =>
                    setProductDraft({
                      ...productDraft,
                      price: event.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="store-product-category">Categoría</Label>
                <Input
                  id="store-product-category"
                  value={productDraft.category}
                  maxLength={60}
                  onChange={(event) =>
                    setProductDraft({
                      ...productDraft,
                      category: event.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="store-product-tags">
                  Etiquetas (separadas por coma)
                </Label>
                <Input
                  id="store-product-tags"
                  value={productDraft.tags}
                  placeholder="Más pedido, Vegetariano"
                  onChange={(event) =>
                    setProductDraft({
                      ...productDraft,
                      tags: event.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Foto del producto</Label>
                <AdminProductImagePicker
                  preview={editImagePreview}
                  fallbackUrl={productDraft.image}
                  onPicked={(storageId, preview) => {
                    setEditImageStorageId(storageId);
                    setEditImagePreview(preview);
                    setProductDraft({ ...productDraft, image: "" });
                  }}
                />
                <Label htmlFor="store-product-image">O pegá un enlace</Label>
                <Input
                  id="store-product-image"
                  value={productDraft.image}
                  placeholder="https://..."
                  onChange={(event) => {
                    setProductDraft({
                      ...productDraft,
                      image: event.target.value,
                    });
                    if (event.target.value.trim()) {
                      setEditImageStorageId(null);
                      setEditImagePreview("");
                    }
                  }}
                />
              </div>

              <label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-black/20 px-3 py-2.5 sm:col-span-2">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    Disponible para pedir
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    Si lo apagás, deja de aparecer en el catálogo.
                  </span>
                </span>
                <Switch
                  checked={productDraft.isAvailable}
                  onCheckedChange={(checked) =>
                    setProductDraft({
                      ...productDraft,
                      isAvailable: checked,
                    })
                  }
                />
              </label>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              className="border-border/80"
              disabled={savingProduct}
              onClick={() => {
                setEditingProduct(null);
                setProductDraft(null);
                setEditImageStorageId(null);
                setEditImagePreview("");
              }}
            >
              Cancelar
            </Button>
            <Button
              className="gap-2 bg-ember-gradient text-black"
              disabled={savingProduct}
              onClick={() => void handleSaveProduct()}
            >
              {savingProduct ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Pencil className="size-4" />
              )}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar borrado de producto */}
      <AlertDialog
        open={deletingProduct !== null}
        onOpenChange={(open) => !open && setDeletingProduct(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este producto?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra {deletingProduct?.name ?? "el producto"} del catálogo de
              la tienda y de los carritos y favoritos que lo tengan. No se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={() => void handleDeleteProduct()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {removing ? "Eliminando..." : "Eliminar producto"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
