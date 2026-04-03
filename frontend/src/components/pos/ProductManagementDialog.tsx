import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Package, PencilLine, Printer, RefreshCw, Search, Trash2 } from "lucide-react";
import type {
  BulkGenerateMissingProductBarcodesResponse,
  CatalogProduct,
  UpdateProductRequest
} from "@/lib/api";
import {
  bulkGenerateMissingProductBarcodes,
  deleteProduct,
  hardDeleteProduct,
  fetchCategories,
  fetchProductCatalogItems,
  generateAndAssignProductBarcode,
  updateProduct,
  validateProductBarcode,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import BarcodeLabelPrintDialog from "./BarcodeLabelPrintDialog";

type CategoryOption = {
  category_id: string;
  name: string;
  is_active: boolean;
};

type ProductFormState = {
  name: string;
  sku: string;
  barcode: string;
  imageUrl: string;
  categoryId: string;
  unitPrice: string;
  costPrice: string;
  reorderLevel: string;
  allowNegativeStock: boolean;
  isActive: boolean;
};

const buildFormState = (product: CatalogProduct): ProductFormState => ({
  name: product.name,
  sku: product.sku || "",
  barcode: product.barcode || "",
  imageUrl: product.image || "",
  categoryId: product.categoryId || "",
  unitPrice: String(product.unitPrice),
  costPrice: String(product.costPrice),
  reorderLevel: String(product.reorderLevel),
  allowNegativeStock: product.allowNegativeStock,
  isActive: product.isActive,
});

const emptyFormState = (): ProductFormState => ({
  name: "",
  sku: "",
  barcode: "",
  imageUrl: "",
  categoryId: "",
  unitPrice: "0",
  costPrice: "0",
  reorderLevel: "5",
  allowNegativeStock: true,
  isActive: true,
});
const isBarcodeFeatureEnabled = import.meta.env.VITE_BARCODE_FEATURE_ENABLED !== "false";

type ProductThumbnailProps = {
  imageUrl?: string;
  name: string;
};

function ProductThumbnail({ imageUrl, name }: ProductThumbnailProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(imageUrl) && !imageFailed;

  return (
    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/50">
      {showImage ? (
        <img
          src={imageUrl}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <Package className="h-5 w-5" />
        </div>
      )}
    </div>
  );
}

type ProductEditorDialogProps = {
  open: boolean;
  product: CatalogProduct | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void> | void;
  onPrintLabel: (product: CatalogProduct) => void;
};

function ProductEditorDialog({ open, product, onOpenChange, onSaved, onPrintLabel }: ProductEditorDialogProps) {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generatingBarcode, setGeneratingBarcode] = useState(false);
  const [validatingBarcode, setValidatingBarcode] = useState(false);
  const [barcodeValidationMessage, setBarcodeValidationMessage] = useState("");
  const [barcodeValidationTone, setBarcodeValidationTone] = useState<"neutral" | "success" | "error">("neutral");
  const [form, setForm] = useState<ProductFormState>(emptyFormState());

  useEffect(() => {
    if (!open) {
      return;
    }

    if (product) {
      setForm(buildFormState(product));
      setBarcodeValidationMessage("");
      setBarcodeValidationTone("neutral");
    }

    let alive = true;
    setLoadingCategories(true);

    void fetchCategories(true)
      .then((items) => {
        if (alive) {
          setCategories(items);
        }
      })
      .catch((error) => {
        console.error(error);
        toast.error("Failed to load categories.");
      })
      .finally(() => {
        if (alive) {
          setLoadingCategories(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [open, product]);

  const updateField = (field: keyof ProductFormState, value: string | boolean) => {
    if (field === "barcode") {
      setBarcodeValidationMessage("");
      setBarcodeValidationTone("neutral");
    }
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    if (!product) {
      return;
    }

    const name = form.name.trim();
    const unitPrice = Number(form.unitPrice);
    const costPrice = Number(form.costPrice);
    const reorderLevel = Number(form.reorderLevel);

    if (!name) {
      toast.error("Product name is required.");
      return;
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      toast.error("Enter a valid unit price.");
      return;
    }

    if (!Number.isFinite(costPrice) || costPrice < 0) {
      toast.error("Enter a valid cost price.");
      return;
    }

    if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
      toast.error("Enter a valid reorder level.");
      return;
    }

    const payload: UpdateProductRequest = {
      name,
      sku: form.sku.trim() || null,
      barcode: form.barcode.trim() || null,
      image_url: form.imageUrl.trim() || null,
      category_id: form.categoryId || null,
      unit_price: unitPrice,
      cost_price: costPrice,
      reorder_level: reorderLevel,
      allow_negative_stock: form.allowNegativeStock,
      is_active: form.isActive,
    };

    setSaving(true);
    try {
      await updateProduct(product.id, payload);
      toast.success("Product updated.");
      await onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to update product.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!product) {
      return;
    }

    if (product.isActive) {
      toast.error("Only inactive products can be permanently deleted. Deactivate and save first.");
      return;
    }

    const confirmed = window.confirm(
      `Permanently delete "${product.name}"? This cannot be undone.`
    );
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    try {
      await hardDeleteProduct(product.id);
      toast.success("Product permanently deleted.");
      await onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to permanently delete product.");
    } finally {
      setDeleting(false);
    }
  };

  const handleGenerateBarcode = async (forceReplace: boolean) => {
    if (!isBarcodeFeatureEnabled) {
      toast.info("Barcode feature is disabled for this rollout.");
      return;
    }

    if (!product || generatingBarcode) {
      return;
    }

    if (forceReplace && form.barcode.trim()) {
      const confirmed = window.confirm("Regenerate barcode and replace the current value?");
      if (!confirmed) {
        return;
      }
    }

    setGeneratingBarcode(true);
    try {
      const updated = await generateAndAssignProductBarcode(product.id, {
        force_replace: forceReplace,
        seed: form.sku.trim() || form.name.trim() || null,
      });

      setForm(buildFormState(updated));
      setBarcodeValidationMessage("Generated EAN-13 barcode is ready.");
      setBarcodeValidationTone("success");
      toast.success(forceReplace ? "Barcode regenerated." : "Barcode generated.");
      await onSaved();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to generate barcode.");
    } finally {
      setGeneratingBarcode(false);
    }
  };

  const handleBarcodeBlur = async () => {
    if (!isBarcodeFeatureEnabled) {
      setBarcodeValidationMessage("");
      setBarcodeValidationTone("neutral");
      return;
    }

    if (!product) {
      return;
    }

    const barcode = form.barcode.trim();
    if (!barcode) {
      setBarcodeValidationMessage("");
      setBarcodeValidationTone("neutral");
      return;
    }

    setValidatingBarcode(true);
    try {
      const response = await validateProductBarcode({
        barcode,
        exclude_product_id: product.id,
        check_existing: true,
      });

      if (!response.is_valid) {
        setBarcodeValidationMessage(response.message || "Barcode format is invalid.");
        setBarcodeValidationTone("error");
        return;
      }

      if (response.exists) {
        setBarcodeValidationMessage("Barcode already exists in another product.");
        setBarcodeValidationTone("error");
        return;
      }

      setBarcodeValidationMessage(`Barcode is valid (${response.format}).`);
      setBarcodeValidationTone("success");
    } catch (error) {
      console.error(error);
      setBarcodeValidationMessage(error instanceof Error ? error.message : "Failed to validate barcode.");
      setBarcodeValidationTone("error");
    } finally {
      setValidatingBarcode(false);
    }
  };

  const selectedCategoryName = form.categoryId
    ? categories.find((category) => category.category_id === form.categoryId)?.name || "Selected category"
    : product?.categoryName || "No category";
  const imagePreviewUrl = form.imageUrl.trim() || product?.image || "";
  const printableProduct: CatalogProduct | null = product
    ? {
        ...product,
        name: form.name.trim() || product.name,
        sku: form.sku.trim() || product.sku,
        barcode: form.barcode.trim() || undefined,
        image: form.imageUrl.trim() || product.image,
        imageUrl: form.imageUrl.trim() || product.imageUrl || null,
        categoryId: form.categoryId || null,
        categoryName: selectedCategoryName === "No category" ? null : selectedCategoryName,
        unitPrice: Number.isFinite(Number(form.unitPrice)) ? Number(form.unitPrice) : product.unitPrice,
      }
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[96vh] w-[96vw] max-w-[1180px] flex-col overflow-hidden rounded-2xl border border-slate-300 bg-[#f7f8fa] p-0 shadow-2xl">
        <div className="border-b border-slate-300 bg-transparent px-5 py-4">
          <DialogHeader className="space-y-1 text-left sm:text-left">
            <DialogTitle className="text-[1.8rem] font-semibold tracking-tight text-slate-800">
              Manage Product
            </DialogTitle>
            <DialogDescription className="max-w-2xl text-sm text-slate-500">
              Edit price, stock settings, and active status. Permanent delete is only for inactive products.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col px-5 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
              <div className="space-y-4 rounded-2xl border border-slate-300 bg-white p-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="manage-image" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                      Item image URL
                    </Label>
                    <Input
                      id="manage-image"
                      value={form.imageUrl}
                      onChange={(event) => updateField("imageUrl", event.target.value)}
                      placeholder="https://..."
                      className="h-10 rounded-xl border-slate-300 bg-white"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="manage-name" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                      Item name
                    </Label>
                    <Input
                      id="manage-name"
                      value={form.name}
                      onChange={(event) => updateField("name", event.target.value)}
                      className="h-10 rounded-xl border-slate-300 bg-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="manage-sku" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                      SKU
                    </Label>
                    <Input
                      id="manage-sku"
                      value={form.sku}
                      onChange={(event) => updateField("sku", event.target.value)}
                      className="h-10 rounded-xl border-slate-300 bg-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="manage-barcode" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                      Barcode
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="manage-barcode"
                        value={form.barcode}
                        onChange={(event) => updateField("barcode", event.target.value)}
                        onBlur={() => void handleBarcodeBlur()}
                        className="h-10 rounded-xl border-slate-300 bg-white"
                      />
                      {isBarcodeFeatureEnabled ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-10 rounded-xl border-slate-300 bg-white px-3 text-xs font-semibold uppercase tracking-[0.08em]"
                            onClick={() => void handleGenerateBarcode(false)}
                            disabled={saving || deleting || generatingBarcode || validatingBarcode || !!form.barcode.trim()}
                            title={form.barcode.trim() ? "Clear barcode or use Regenerate." : "Generate EAN-13 barcode"}
                          >
                            {generatingBarcode ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gen"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-10 rounded-xl border-slate-300 bg-white px-3 text-xs font-semibold uppercase tracking-[0.08em]"
                            onClick={() => void handleGenerateBarcode(true)}
                            disabled={saving || deleting || generatingBarcode || validatingBarcode}
                            title="Regenerate and replace barcode"
                          >
                            Reg
                          </Button>
                        </>
                      ) : null}
                    </div>
                    {validatingBarcode ? (
                      <p className="text-[11px] text-slate-500">Validating barcode...</p>
                    ) : barcodeValidationMessage ? (
                      <p
                        className={`text-[11px] ${
                          barcodeValidationTone === "success" ? "text-emerald-700" : "text-rose-600"
                        }`}
                      >
                        {barcodeValidationMessage}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Category</Label>
                    <Select
                      value={form.categoryId || "__none__"}
                      onValueChange={(value) => updateField("categoryId", value === "__none__" ? "" : value)}
                    >
                      <SelectTrigger className="h-10 rounded-xl border-slate-300 bg-white">
                        <SelectValue placeholder={loadingCategories ? "Loading categories..." : "Select category"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No category</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category.category_id} value={category.category_id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="manage-unit-price" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                      Unit price
                    </Label>
                    <Input
                      id="manage-unit-price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.unitPrice}
                      onChange={(event) => updateField("unitPrice", event.target.value)}
                      className="h-10 rounded-xl border-slate-300 bg-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="manage-cost-price" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                      Cost price
                    </Label>
                    <Input
                      id="manage-cost-price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.costPrice}
                      onChange={(event) => updateField("costPrice", event.target.value)}
                      className="h-10 rounded-xl border-slate-300 bg-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="manage-reorder" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                      Reorder level
                    </Label>
                    <Input
                      id="manage-reorder"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.reorderLevel}
                      onChange={(event) => updateField("reorderLevel", event.target.value)}
                      className="h-10 rounded-xl border-slate-300 bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
                  <div className="border-b border-slate-200 bg-transparent px-4 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                      Live Preview
                    </p>
                  </div>
                  <div className="space-y-2.5 p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Package className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[1.15rem] font-semibold">
                          {form.name.trim() || "Item name"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {selectedCategoryName}
                        </p>
                      </div>
                      <Badge variant={form.isActive ? "default" : "secondary"} className="shrink-0">
                        {form.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>

                    <div className="grid gap-1 rounded-xl border border-slate-200 bg-[#f9fafb] p-2.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-emerald-700">Unit price</span>
                        <span className="font-semibold text-slate-800">Rs. {Number(form.unitPrice || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-emerald-700">Cost price</span>
                        <span className="font-semibold text-slate-800">Rs. {Number(form.costPrice || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Stock</span>
                        <span className="font-semibold text-slate-800">{product?.stockQuantity.toLocaleString() ?? "0"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Reorder level</span>
                        <span className="font-semibold text-slate-800">{Number(form.reorderLevel || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
                  <div className="p-3">
                    {imagePreviewUrl ? (
                      <div className="overflow-hidden rounded-xl border border-border bg-muted">
                        <img
                          src={imagePreviewUrl}
                          alt={form.name || "Product preview"}
                          className="h-36 w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="grid h-36 place-items-center rounded-xl border border-dashed border-slate-300 bg-[#f9fafb] text-center">
                        <div className="space-y-1 px-6">
                          <Package className="mx-auto h-10 w-10 text-slate-300" />
                          <p className="text-sm font-medium text-slate-600">Catalog visual preview</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl border border-slate-300 bg-white p-4">
                  <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-300 bg-[#f9fafb] px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium leading-none">Allow negative stock</p>
                      <p className="mt-1 text-xs text-slate-500">Lets sales continue below zero stock.</p>
                    </div>
                    <Switch
                      checked={form.allowNegativeStock}
                      onCheckedChange={(checked) => updateField("allowNegativeStock", checked)}
                    />
                  </label>

                  <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-300 bg-[#f9fafb] px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium leading-none">Active item</p>
                      <p className="mt-1 text-xs text-slate-500">Inactive products are hidden from sales.</p>
                    </div>
                    <Switch
                      checked={form.isActive}
                      onCheckedChange={(checked) => updateField("isActive", checked)}
                    />
                  </label>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Delete safety</p>
                      <p className="text-sm text-amber-900/80">
                        Permanently deleting is allowed only for inactive products without transaction history.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-slate-300 bg-slate-100 px-5 py-3 sm:gap-0 sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={saving || deleting || generatingBarcode || validatingBarcode || !product || product.isActive}
              title={product?.isActive ? "Deactivate and save first to enable permanent delete." : undefined}
              className="h-10 rounded-xl px-6 text-[1rem] font-semibold"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
            <div className="flex items-center gap-2 sm:justify-end">
              {isBarcodeFeatureEnabled ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (printableProduct) {
                      onPrintLabel(printableProduct);
                    }
                  }}
                  disabled={saving || deleting || generatingBarcode || validatingBarcode || !printableProduct?.barcode}
                  title={printableProduct?.barcode ? "Preview and print label" : "Add/generate barcode before printing label."}
                  className="h-10 rounded-xl border-slate-300 bg-white px-6 text-[1rem] font-semibold"
                >
                  <Printer className="h-4 w-4" />
                  Print label
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving || deleting || generatingBarcode || validatingBarcode}
                className="h-10 rounded-xl border-slate-300 bg-white px-6 text-[1rem] font-semibold"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || deleting || generatingBarcode || validatingBarcode} className="h-10 rounded-xl px-6 text-[1rem] font-semibold">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PencilLine className="h-4 w-4" />}
                Save changes
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ProductManagementDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => Promise<void> | void;
};

export default function ProductManagementDialog({ open, onOpenChange, onChanged }: ProductManagementDialogProps) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CatalogProduct | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [labelDialogProducts, setLabelDialogProducts] = useState<CatalogProduct[]>([]);
  const [bulkGeneratingBarcodes, setBulkGeneratingBarcodes] = useState(false);
  const [lastBulkBarcodeResult, setLastBulkBarcodeResult] = useState<BulkGenerateMissingProductBarcodesResponse | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let alive = true;

    const loadProducts = async () => {
      setLoading(true);
      try {
        const items = await fetchProductCatalogItems(200, true);
        if (!alive) {
          return;
        }

        setProducts(items.sort((left, right) => left.name.localeCompare(right.name)));
        setSelectedProductIds(new Set());
      } catch (error) {
        if (!alive) {
          return;
        }

        console.error(error);
        toast.error("Failed to load products.");
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };

    void loadProducts();
    return () => {
      alive = false;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return products;
    }

    return products.filter((product) =>
      [product.name, product.sku, product.barcode || "", product.categoryName || ""]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [products, search]);

  const handleEdit = (product: CatalogProduct) => {
    setSelectedProduct(product);
    setEditorOpen(true);
  };

  const handleSaved = async () => {
    const items = await fetchProductCatalogItems(200, true);
    setProducts(items.sort((left, right) => left.name.localeCompare(right.name)));
    setSelectedProductIds(new Set());
    await onChanged?.();
  };

  const handleDeleteRequest = (product: CatalogProduct) => {
    setDeleteTarget(product);
  };

  const handleSinglePrint = (product: CatalogProduct) => {
    setLabelDialogProducts([product]);
    setLabelDialogOpen(true);
  };

  const handleBulkPrint = () => {
    const selected = products.filter((product) => selectedProductIds.has(product.id));
    if (selected.length === 0) {
      toast.error("Select at least one product to print labels.");
      return;
    }

    setLabelDialogProducts(selected);
    setLabelDialogOpen(true);
  };

  const selectedCountInFiltered = filtered.reduce(
    (count, product) => (selectedProductIds.has(product.id) ? count + 1 : count),
    0
  );
  const allFilteredSelected = filtered.length > 0 && selectedCountInFiltered === filtered.length;
  const hasPartiallySelectedFiltered = selectedCountInFiltered > 0 && selectedCountInFiltered < filtered.length;

  const toggleAllFiltered = (checked: boolean) => {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (checked) {
        filtered.forEach((product) => next.add(product.id));
      } else {
        filtered.forEach((product) => next.delete(product.id));
      }
      return next;
    });
  };

  const toggleSingleSelection = (productId: string, checked: boolean) => {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(productId);
      } else {
        next.delete(productId);
      }
      return next;
    });
  };

  const handleGenerateMissingBarcodes = async () => {
    if (bulkGeneratingBarcodes) {
      return;
    }

    setBulkGeneratingBarcodes(true);
    try {
      const dryRun = await bulkGenerateMissingProductBarcodes({
        take: 200,
        include_inactive: true,
        dry_run: true,
      });

      if (dryRun.would_generate <= 0) {
        setLastBulkBarcodeResult(dryRun);
        toast.info("No products with missing barcodes were found.");
        return;
      }

      const shouldApply = window.confirm(
        `Found ${dryRun.would_generate} product(s) without barcodes. Generate now?`
      );
      if (!shouldApply) {
        setLastBulkBarcodeResult(dryRun);
        return;
      }

      const applied = await bulkGenerateMissingProductBarcodes({
        take: 200,
        include_inactive: true,
        dry_run: false,
      });

      setLastBulkBarcodeResult(applied);
      await handleSaved();
      toast.success(
        `Barcodes generated: ${applied.generated}, skipped existing: ${applied.skipped_existing}, failed: ${applied.failed}.`
      );
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to bulk generate barcodes.");
    } finally {
      setBulkGeneratingBarcodes(false);
    }
  };

  const handleExportBulkBarcodeResult = () => {
    if (!lastBulkBarcodeResult) {
      return;
    }

    const headers = ["product_id", "name", "status", "barcode", "message"];
    const lines = [
      headers.join(","),
      ...lastBulkBarcodeResult.items.map((item) =>
        [
          item.product_id,
          item.name,
          item.status,
          item.barcode || "",
          item.message || "",
        ]
          .map((value) => {
            const normalized = String(value ?? "");
            return `"${normalized.replaceAll('"', '""')}"`;
          })
          .join(",")
      ),
    ];

    const csvContent = lines.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `barcode-bulk-result-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    setDeletingProductId(deleteTarget.id);
    try {
      await deleteProduct(deleteTarget.id);
      toast.success(`"${deleteTarget.name}" deactivated.`);
      await handleSaved();
      setDeleteTarget(null);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to deactivate product.");
    } finally {
      setDeletingProductId(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent hideClose className="h-[92vh] max-h-[92vh] max-w-6xl overflow-hidden border-border/70 bg-background p-0 shadow-2xl">
          <div className="border-b border-border/70 bg-pos-header px-6 py-5 text-pos-header-foreground">
            <div className="flex items-start justify-between gap-4">
              <DialogHeader className="space-y-2 text-left">
                <DialogTitle className="text-xl font-semibold">Product Management</DialogTitle>
                <DialogDescription className="text-pos-header-foreground/70">
                  Edit prices, deactivate products, and keep the catalog aligned with the POS.
                </DialogDescription>
              </DialogHeader>

              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 border-pos-header-foreground/30 bg-transparent text-pos-header-foreground hover:bg-pos-header-foreground/10 hover:text-pos-header-foreground"
                >
                  Cancel
                </Button>
              </DialogClose>
            </div>
          </div>

          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-scroll px-6 py-5">
            <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative w-full md:max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by name, SKU, barcode, or category"
                    className="pl-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="w-fit">
                    {filtered.length} products
                  </Badge>
                  <Badge variant="outline" className="w-fit">
                    {selectedProductIds.size} selected
                  </Badge>
                  {isBarcodeFeatureEnabled ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9"
                        onClick={() => void handleGenerateMissingBarcodes()}
                        disabled={loading || bulkGeneratingBarcodes}
                        title="Generate barcodes for products missing one"
                      >
                        {bulkGeneratingBarcodes ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Generate Missing
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9"
                        onClick={handleBulkPrint}
                        disabled={selectedProductIds.size === 0}
                        title={selectedProductIds.size === 0 ? "Select products first." : "Preview and print selected labels"}
                      >
                        <Printer className="h-4 w-4" />
                        Print Selected
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              {isBarcodeFeatureEnabled && lastBulkBarcodeResult ? (
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <p className="text-sm text-muted-foreground">
                      Last barcode batch: scanned {lastBulkBarcodeResult.scanned}, generated {lastBulkBarcodeResult.generated},
                      skipped {lastBulkBarcodeResult.skipped_existing}, failed {lastBulkBarcodeResult.failed}
                      {lastBulkBarcodeResult.dry_run ? " (dry run)" : ""}
                    </p>
                    <Button type="button" variant="outline" className="h-8 w-fit" onClick={handleExportBulkBarcodeResult}>
                      Export CSV
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="overflow-hidden rounded-2xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[46px]">
                        <Checkbox
                          checked={allFilteredSelected ? true : hasPartiallySelectedFiltered ? "indeterminate" : false}
                          onCheckedChange={(checked) => toggleAllFiltered(Boolean(checked))}
                          aria-label="Select all filtered products"
                        />
                      </TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="hidden md:table-cell">Category</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                          Loading products...
                        </TableCell>
                      </TableRow>
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                          No products found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedProductIds.has(product.id)}
                              onCheckedChange={(checked) => toggleSingleSelection(product.id, Boolean(checked))}
                              aria-label={`Select ${product.name}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <ProductThumbnail imageUrl={product.image} name={product.name} />
                              <div className="space-y-1">
                                <div className="font-medium">{product.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {product.sku}
                                  {product.barcode ? ` | ${product.barcode}` : ""}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">{product.categoryName || "No category"}</TableCell>
                          <TableCell className="text-right">Rs. {product.unitPrice.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{product.stockQuantity.toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant={product.isActive ? "default" : "secondary"}>
                              {product.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {isBarcodeFeatureEnabled ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSinglePrint(product)}
                                  disabled={!product.barcode}
                                  title={product.barcode ? "Preview and print label" : "Product has no barcode"}
                                >
                                  <Printer className="h-4 w-4" />
                                  Print
                                </Button>
                              ) : null}
                              <Button variant="ghost" size="sm" onClick={() => handleEdit(product)}>
                                <PencilLine className="h-4 w-4" />
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDeleteRequest(product)}
                                disabled={deletingProductId === product.id}
                              >
                                {deletingProductId === product.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                                Deactivate
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ProductEditorDialog
        open={editorOpen}
        product={selectedProduct}
        onOpenChange={setEditorOpen}
        onSaved={handleSaved}
        onPrintLabel={handleSinglePrint}
      />

      {isBarcodeFeatureEnabled ? (
        <BarcodeLabelPrintDialog
          open={labelDialogOpen}
          onOpenChange={setLabelDialogOpen}
          products={labelDialogProducts}
        />
      ) : null}

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(openState) => {
          if (!openState && !deletingProductId) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate product?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `Deactivate "${deleteTarget.name}"? It will be hidden from active sales.`
                : "This will hide the product from active sales."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingProductId)}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={Boolean(deletingProductId)}
            >
              {deletingProductId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Deactivate
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
