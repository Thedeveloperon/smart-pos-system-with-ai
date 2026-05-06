import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Plus, Printer, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  adjustStock,
  createProduct,
  deleteProduct,
  fetchBrands,
  fetchCategories,
  fetchProductBatches,
  fetchProductSuppliers,
  fetchSuppliers,
  generateAndAssignProductBarcode,
  generateProductBarcode,
  hardDeleteProduct,
  type Brand,
  type Category,
  type Product,
  type ProductBatch,
  type Supplier,
  validateProductBarcode,
  updateProduct,
} from "@/lib/api";

type Props = {
  open: boolean;
  product: Product | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (product: Product) => void;
  onDeleted?: (productId: string) => void;
};

type ProductFormState = {
  name: string;
  sku: string;
  barcode: string;
  imageUrl: string;
  categoryId: string;
  brandId: string;
  preferredSupplierId: string;
  unitPrice: string;
  costPrice: string;
  permanentDiscountPercent: string;
  permanentDiscountFixed: string;
  initialStockQuantity: string;
  reorderLevel: string;
  safetyStock: string;
  targetStockLevel: string;
  allowNegativeStock: boolean;
  serialTracked: boolean;
  warrantyMonths: string;
  batchTracked: boolean;
  expiryAlertDays: string;
  isActive: boolean;
};

const emptyFormState = (): ProductFormState => ({
  name: "",
  sku: "",
  barcode: "",
  imageUrl: "",
  categoryId: "",
  brandId: "",
  preferredSupplierId: "",
  unitPrice: "0",
  costPrice: "0",
  permanentDiscountPercent: "",
  permanentDiscountFixed: "",
  initialStockQuantity: "0",
  reorderLevel: "0",
  safetyStock: "0",
  targetStockLevel: "0",
  allowNegativeStock: false,
  serialTracked: false,
  warrantyMonths: "12",
  batchTracked: false,
  expiryAlertDays: "30",
  isActive: true,
});

const toNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toFormState = (product: Product): ProductFormState => ({
  name: product.name ?? "",
  sku: product.sku ?? "",
  barcode: product.barcode ?? "",
  imageUrl: product.image_url ?? product.image ?? "",
  categoryId: product.category_id ?? "",
  brandId: product.brand_id ?? "",
  preferredSupplierId:
    product.product_suppliers?.find((supplier) => supplier.is_preferred)?.supplier_id ?? "",
  unitPrice: String(product.unit_price ?? product.price ?? 0),
  costPrice: String(product.cost_price ?? product.price ?? 0),
  permanentDiscountPercent: product.permanent_discount_percent != null ? String(product.permanent_discount_percent) : "",
  permanentDiscountFixed: product.permanent_discount_fixed != null ? String(product.permanent_discount_fixed) : "",
  initialStockQuantity: String(
    product.initial_stock_quantity ?? product.stock_quantity ?? product.stock ?? 0,
  ),
  reorderLevel: String(product.reorder_level ?? 0),
  safetyStock: String(product.safety_stock ?? 0),
  targetStockLevel: String(product.target_stock_level ?? 0),
  allowNegativeStock: product.allow_negative_stock ?? false,
  serialTracked: product.is_serial_tracked ?? false,
  warrantyMonths: String(product.warranty_months ?? 12),
  batchTracked: product.is_batch_tracked ?? false,
  expiryAlertDays: String(product.expiry_alert_days ?? 30),
  isActive: product.is_active ?? true,
});

const EAN13_LEFT_A = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN13_LEFT_B = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const EAN13_RIGHT = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const EAN13_PARITY = ["AAAAAA", "AABABB", "AABBAB", "AABBBA", "ABAABB", "ABBAAB", "ABBBAA", "ABABAB", "ABABBA", "ABBABA"];

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function computeEan13CheckDigit(firstTwelveDigits: string): number {
  let sum = 0;
  for (let index = 0; index < firstTwelveDigits.length; index += 1) {
    const digit = Number(firstTwelveDigits[index]);
    sum += index % 2 === 0 ? digit : digit * 3;
  }

  return (10 - (sum % 10)) % 10;
}

function buildEan13Pattern(barcode: string): string | null {
  const digits = barcode.trim().replace(/\s+/g, "");
  if (!/^\d{13}$/.test(digits)) {
    return null;
  }

  const expectedCheckDigit = computeEan13CheckDigit(digits.slice(0, 12));
  if (expectedCheckDigit !== Number(digits[12])) {
    return null;
  }

  const firstDigit = Number(digits[0]);
  const parityPattern = EAN13_PARITY[firstDigit];
  if (!parityPattern) {
    return null;
  }

  const leftEncoded = digits
    .slice(1, 7)
    .split("")
    .map((char, index) => {
      const digit = Number(char);
      return parityPattern[index] === "A" ? EAN13_LEFT_A[digit] : EAN13_LEFT_B[digit];
    })
    .join("");
  const rightEncoded = digits
    .slice(7)
    .split("")
    .map((char) => EAN13_RIGHT[Number(char)])
    .join("");

  return `101${leftEncoded}01010${rightEncoded}101`;
}

function buildBarcodeSvgMarkup(barcode: string): string {
  const pattern = buildEan13Pattern(barcode);
  if (!pattern) {
    return `<div style="height:72px;display:flex;align-items:center;justify-content:center;border:1px dashed #cbd5e1;color:#475569;font-size:12px;">${escapeHtml(
      barcode,
    )}</div>`;
  }

  const moduleWidth = 2;
  const width = pattern.length * moduleWidth;
  const normalBarHeight = 58;
  const guardBarHeight = 66;
  const bars: string[] = [];

  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern[index] !== "1") {
      continue;
    }

    const isGuard = index < 3 || (index >= 45 && index <= 49) || index >= 92;
    const height = isGuard ? guardBarHeight : normalBarHeight;
    bars.push(`<rect x="${index * moduleWidth}" y="0" width="${moduleWidth}" height="${height}" fill="#0f172a" />`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${guardBarHeight}" width="100%" height="66" preserveAspectRatio="none">${bars.join(
    "",
  )}</svg>`;
}

function buildBarcodePrintHtml(product: Product): string {
  const name = escapeHtml(product.name || "Item");
  const sku = escapeHtml(product.sku || "-");
  const barcode = escapeHtml(product.barcode || "-");
  const barcodeSvg = buildBarcodeSvgMarkup(product.barcode || "");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Barcode Label</title>
    <style>
      @page {
        size: 58mm 40mm;
        margin: 2mm;
      }
      body {
        margin: 0;
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        color: #0f172a;
      }
      .label {
        box-sizing: border-box;
        width: 54mm;
        min-height: 34mm;
        border: 1px solid #cbd5e1;
        border-radius: 3mm;
        padding: 2mm;
      }
      .name {
        font-size: 11px;
        font-weight: 700;
        line-height: 1.25;
        margin-bottom: 1mm;
        max-height: 7mm;
        overflow: hidden;
      }
      .meta {
        font-size: 10px;
        color: #475569;
        margin-bottom: 1.5mm;
      }
      .barcode-wrap {
        width: 100%;
        margin-bottom: 1mm;
      }
      .barcode-text {
        text-align: center;
        letter-spacing: 0.08em;
        font-size: 11px;
        font-weight: 600;
      }
      .note {
        margin-top: 4mm;
        font-size: 10px;
        color: #64748b;
      }
    </style>
  </head>
  <body>
    <main class="label">
      <div class="name">${name}</div>
      <div class="meta">SKU: ${sku}</div>
      <div class="barcode-wrap">${barcodeSvg}</div>
      <div class="barcode-text">${barcode}</div>
    </main>
    <div class="note">Use the print dialog to send this label to your barcode printer.</div>
    <script>
      window.onload = function () { window.print(); };
    </script>
  </body>
</html>`;
}

function snapshotProduct(
  product: Product | null,
  form: ProductFormState,
  stockQuantity: number,
): Product {
  return {
    id: product?.id ?? "__draft__",
    name: form.name.trim(),
    sku: form.sku.trim(),
    barcode: form.barcode.trim() || undefined,
    image_url: form.imageUrl.trim() || undefined,
    image: form.imageUrl.trim() || undefined,
    category_id: form.categoryId || null,
    brand_id: form.brandId || null,
    price: toNumber(form.unitPrice),
    unit_price: toNumber(form.unitPrice),
    cost_price: toNumber(form.costPrice),
    permanent_discount_percent: form.permanentDiscountPercent === "" ? null : toNumber(form.permanentDiscountPercent),
    permanent_discount_fixed: form.permanentDiscountFixed === "" ? null : toNumber(form.permanentDiscountFixed),
    stock: stockQuantity,
    stock_quantity: stockQuantity,
    initial_stock_quantity: product?.initial_stock_quantity ?? stockQuantity,
    reorder_level: toNumber(form.reorderLevel),
    safety_stock: toNumber(form.safetyStock),
    target_stock_level: toNumber(form.targetStockLevel),
    allow_negative_stock: form.allowNegativeStock,
    is_serial_tracked: form.serialTracked,
    warranty_months: form.serialTracked ? toNumber(form.warrantyMonths) : 0,
    is_batch_tracked: form.batchTracked,
    expiry_alert_days: form.batchTracked ? toNumber(form.expiryAlertDays) : 0,
    is_active: form.isActive,
    created_at: product?.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export default function ProductManagementDialog({
  open,
  product,
  onOpenChange,
  onSaved,
  onDeleted,
}: Props) {
  const [form, setForm] = useState<ProductFormState>(emptyFormState());
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [barcodeWorking, setBarcodeWorking] = useState(false);
  const [barcodeFeedback, setBarcodeFeedback] = useState<string>("");
  const [barcodeTone, setBarcodeTone] = useState<"neutral" | "success" | "error">("neutral");
  const [currentStock, setCurrentStock] = useState(0);
  const [deleteMode, setDeleteMode] = useState<"soft" | "hard" | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustQuantity, setAdjustQuantity] = useState("0");
  const [adjustReason, setAdjustReason] = useState("manual_adjustment");
  const [adjustBatchId, setAdjustBatchId] = useState("");

  const isEditing = Boolean(product);
  const title = useMemo(() => (isEditing ? "Edit product" : "Add product"), [isEditing]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm(product ? toFormState(product) : emptyFormState());
    setCurrentStock(product?.stock_quantity ?? product?.stock ?? 0);
    setBarcodeFeedback("");
    setBarcodeTone("neutral");
    setDeleteMode(null);
    setAdjustQuantity("0");
    setAdjustReason("manual_adjustment");
    setAdjustBatchId("");

    let alive = true;
    setLoadingLookups(true);
    void Promise.all([fetchCategories(true), fetchBrands(true), fetchSuppliers(true)])
      .then(([categoryItems, brandItems, supplierItems]) => {
        if (!alive) {
          return;
        }

        setCategories(categoryItems);
        setBrands(brandItems);
        setSuppliers(supplierItems);
      })
      .catch(() => {
        if (!alive) {
          return;
        }

        toast.error("Failed to load product reference data.");
      })
      .finally(() => {
        if (alive) {
          setLoadingLookups(false);
        }
      });

    if (product?.id && product.is_batch_tracked) {
      setLoadingBatches(true);
      void fetchProductBatches(product.id)
        .then((items) => {
          if (alive) {
            setBatches(items);
          }
        })
        .catch((error) => {
          if (alive) {
            setBatches([]);
            toast.error(error instanceof Error ? error.message : "Failed to load product batches.");
          }
        })
        .finally(() => {
          if (alive) {
            setLoadingBatches(false);
          }
        });
    } else {
      setBatches([]);
      setLoadingBatches(false);
    }

    if (product?.id && !product.product_suppliers?.length) {
      void fetchProductSuppliers(product.id)
        .then((items) => {
          if (!alive) {
            return;
          }

          const preferred = items.find((item) => item.is_preferred)?.supplier_id ?? "";
          if (preferred) {
            setForm((prev) => ({ ...prev, preferredSupplierId: preferred }));
          }
        })
        .catch((error) => {
          if (alive) {
            toast.error(
              error instanceof Error ? error.message : "Failed to load product suppliers.",
            );
          }
        });
    }

    return () => {
      alive = false;
    };
  }, [open, product]);

  const updateField = <K extends keyof ProductFormState>(field: K, value: ProductFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const validateBarcode = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setBarcodeFeedback("");
      setBarcodeTone("neutral");
      return;
    }

    try {
      const result = await validateProductBarcode({
        barcode: trimmed,
        exclude_product_id: product?.id ?? null,
      });
      setBarcodeTone(
        result.is_valid && !result.exists ? "success" : result.exists ? "error" : "neutral",
      );
      setBarcodeFeedback(
        result.message || (result.exists ? "Barcode already exists." : "Barcode looks valid."),
      );
    } catch (error) {
      setBarcodeTone("error");
      setBarcodeFeedback(error instanceof Error ? error.message : "Failed to validate barcode.");
    }
  };

  const handleGenerateBarcode = async () => {
    setBarcodeWorking(true);
    try {
      if (product?.id) {
        const updated = await generateAndAssignProductBarcode(product.id, { force_replace: true });
        setForm((prev) => ({ ...prev, barcode: updated.barcode || "" }));
        setCurrentStock(updated.stock_quantity ?? updated.stock ?? currentStock);
        onSaved?.(updated);
        toast.success("Barcode generated and assigned.");
      } else {
        const generated = await generateProductBarcode({
          name: form.name.trim(),
          sku: form.sku.trim(),
        });
        setForm((prev) => ({ ...prev, barcode: generated.barcode }));
        toast.success("Barcode generated.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate barcode.");
    } finally {
      setBarcodeWorking(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Product name is required.");
      return;
    }

    const permanentDiscountPercent = form.permanentDiscountPercent === "" ? null : toNumber(form.permanentDiscountPercent);
    const permanentDiscountFixed = form.permanentDiscountFixed === "" ? null : toNumber(form.permanentDiscountFixed);
    if (permanentDiscountPercent != null && permanentDiscountFixed != null) {
      toast.error("Use either permanent discount percent or fixed amount.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim() || undefined,
        barcode: form.barcode.trim() || undefined,
        image_url: form.imageUrl.trim() || undefined,
        category_id: form.categoryId || undefined,
        brand_id: form.brandId || undefined,
        unit_price: toNumber(form.unitPrice),
        cost_price: toNumber(form.costPrice),
        permanent_discount_percent: permanentDiscountPercent,
        permanent_discount_fixed: permanentDiscountFixed,
        initial_stock_quantity: isEditing ? undefined : toNumber(form.initialStockQuantity),
        reorder_level: toNumber(form.reorderLevel),
        safety_stock: toNumber(form.safetyStock),
        target_stock_level: toNumber(form.targetStockLevel),
        allow_negative_stock: form.allowNegativeStock,
        is_serial_tracked: form.serialTracked,
        warranty_months: form.serialTracked ? toNumber(form.warrantyMonths) : 0,
        is_batch_tracked: form.batchTracked,
        expiry_alert_days: form.batchTracked ? toNumber(form.expiryAlertDays) : 30,
        is_active: form.isActive,
        product_suppliers: form.preferredSupplierId
          ? [{ supplier_id: form.preferredSupplierId, is_preferred: true }]
          : [],
      };

      const saved = product?.id
        ? await updateProduct(product.id, payload)
        : await createProduct(payload);
      onSaved?.(saved);
      toast.success(isEditing ? "Product updated." : "Product created.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save product.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (mode: "soft" | "hard") => {
    if (!product?.id) {
      return;
    }

    setDeleting(true);
    try {
      if (mode === "soft") {
        await deleteProduct(product.id);
        toast.success("Product deactivated.");
      } else {
        await hardDeleteProduct(product.id);
        toast.success("Product permanently deleted.");
      }
      onDeleted?.(product.id);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete product.");
    } finally {
      setDeleting(false);
      setDeleteMode(null);
    }
  };

  const handleAdjustStock = async () => {
    if (!product?.id) {
      return;
    }

    const delta = toNumber(adjustQuantity);
    if (delta === 0) {
      toast.error("Enter a non-zero quantity adjustment.");
      return;
    }

    if (product.is_batch_tracked && !adjustBatchId) {
      toast.error("Select a batch for batch-tracked stock adjustments.");
      return;
    }

    setSaving(true);
    try {
      await adjustStock(
        product.id,
        delta,
        adjustReason.trim() || "manual_adjustment",
        adjustBatchId || null,
      );
      const nextStock = currentStock + delta;
      setCurrentStock(nextStock);
      onSaved?.(snapshotProduct(product, form, nextStock));
      toast.success("Stock adjusted.");
      setAdjustOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to adjust stock.");
    } finally {
      setSaving(false);
    }
  };

  const statusLabel = form.isActive ? "Active" : "Inactive";
  const selectedCategory = categories.find((item) => item.category_id === form.categoryId);
  const selectedBrand = brands.find((item) => item.brand_id === form.brandId);
  const selectedSupplier = suppliers.find((item) => item.supplier_id === form.preferredSupplierId);
  const printableProduct = product ? snapshotProduct(product, form, currentStock) : null;
  const currentBarcode = form.barcode.trim();

  const handlePrintBarcode = () => {
    if (!printableProduct) {
      return;
    }

    if (!currentBarcode) {
      toast.error("Add or generate a barcode before printing.");
      return;
    }

    const popup = window.open("", "_blank", "width=900,height=700");
    if (!popup) {
      toast.error("Popup blocked. Allow popups to print the barcode label.");
      return;
    }

    popup.document.write(buildBarcodePrintHtml(printableProduct));
    popup.document.close();
    toast.success("Opened barcode label for printing.");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Manage product details, pricing, catalog references, barcode, and inventory tracking.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1.5 md:col-span-2">
                <Label htmlFor="product-name">Product name</Label>
                <Input
                  id="product-name"
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  placeholder="e.g. Jasmine Rice 5kg"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="product-sku">SKU</Label>
                <Input
                  id="product-sku"
                  value={form.sku}
                  onChange={(event) => updateField("sku", event.target.value)}
                  placeholder="Optional SKU"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="product-barcode">Barcode</Label>
                <div className="flex gap-2">
                  <Input
                    id="product-barcode"
                    value={form.barcode}
                    onChange={(event) => updateField("barcode", event.target.value)}
                    onBlur={() => void validateBarcode(form.barcode)}
                    placeholder="EAN-13 or internal barcode"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleGenerateBarcode()}
                    disabled={barcodeWorking}
                  >
                    {barcodeWorking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Generate
                  </Button>
                </div>
                {barcodeFeedback ? (
                  <p
                    className={`text-xs ${
                      barcodeTone === "success"
                        ? "text-emerald-600"
                        : barcodeTone === "error"
                          ? "text-rose-600"
                          : "text-muted-foreground"
                    }`}
                  >
                    {barcodeFeedback}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-1.5 md:col-span-2">
                <Label htmlFor="product-image">Image URL</Label>
                <Input
                  id="product-image"
                  value={form.imageUrl}
                  onChange={(event) => updateField("imageUrl", event.target.value)}
                  placeholder="https://..."
                />
                {form.imageUrl ? (
                  <div className="mt-2 flex items-center gap-3 rounded-lg border p-3">
                    <img
                      src={form.imageUrl}
                      alt={form.name || "Product preview"}
                      className="h-14 w-14 rounded-md object-cover"
                    />
                    <div className="text-sm text-muted-foreground">Image preview</div>
                  </div>
                ) : null}
              </div>
            </div>

            <Separator />

            <div className="grid gap-3 md:grid-cols-3">
              <div className="grid gap-1.5">
                <Label>Category</Label>
                <Select
                  value={form.categoryId}
                  onValueChange={(value) =>
                    updateField("categoryId", value === "__none__" ? "" : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingLookups ? "Loading..." : "Select category"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No category</SelectItem>
                    {categories.map((item) => (
                      <SelectItem key={item.category_id} value={item.category_id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedCategory ? (
                  <p className="text-xs text-muted-foreground">
                    {selectedCategory.description || " "}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-1.5">
                <Label>Brand</Label>
                <Select
                  value={form.brandId}
                  onValueChange={(value) =>
                    updateField("brandId", value === "__none__" ? "" : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingLookups ? "Loading..." : "Select brand"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No brand</SelectItem>
                    {brands.map((item) => (
                      <SelectItem key={item.brand_id} value={item.brand_id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedBrand ? (
                  <p className="text-xs text-muted-foreground">{selectedBrand.code || " "}</p>
                ) : null}
              </div>

              <div className="grid gap-1.5">
                <Label>Preferred supplier</Label>
                <Select
                  value={form.preferredSupplierId}
                  onValueChange={(value) =>
                    updateField("preferredSupplierId", value === "__none__" ? "" : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingLookups ? "Loading..." : "Select supplier"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No supplier</SelectItem>
                    {suppliers.map((item) => (
                      <SelectItem key={item.supplier_id} value={item.supplier_id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedSupplier ? (
                  <p className="text-xs text-muted-foreground">
                    {selectedSupplier.name || " "}
                  </p>
                ) : null}
              </div>
            </div>

            <Separator />

            <div className="grid gap-3 md:grid-cols-5">
              <div className="grid gap-1.5">
                <Label htmlFor="unit-price">Unit price</Label>
                <Input
                  id="unit-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.unitPrice}
                  onChange={(event) => updateField("unitPrice", event.target.value)}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="cost-price">Cost price</Label>
                <Input
                  id="cost-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.costPrice}
                  onChange={(event) => updateField("costPrice", event.target.value)}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="permanent-discount-percent">Permanent discount %</Label>
                <Input
                  id="permanent-discount-percent"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={form.permanentDiscountPercent}
                  onChange={(event) => {
                    updateField("permanentDiscountPercent", event.target.value);
                    if (event.target.value !== "") {
                      updateField("permanentDiscountFixed", "");
                    }
                  }}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="permanent-discount-fixed">Permanent discount Rs.</Label>
                <Input
                  id="permanent-discount-fixed"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.permanentDiscountFixed}
                  onChange={(event) => {
                    updateField("permanentDiscountFixed", event.target.value);
                    if (event.target.value !== "") {
                      updateField("permanentDiscountPercent", "");
                    }
                  }}
                />
              </div>

              {isEditing ? (
                <div className="grid gap-1.5">
                  <Label>Current stock</Label>
                  <div className="flex h-10 items-center justify-between rounded-md border px-3 text-sm">
                    <span>{currentStock.toLocaleString()}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setAdjustOpen(true)}
                    >
                      <Plus className="h-4 w-4" />
                      Adjust
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-1.5">
                  <Label htmlFor="initial-stock">Initial stock quantity</Label>
                  <Input
                    id="initial-stock"
                    type="number"
                    min={0}
                    step="1"
                    value={form.initialStockQuantity}
                    onChange={(event) => updateField("initialStockQuantity", event.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="reorder-level">Reorder level</Label>
                <Input
                  id="reorder-level"
                  type="number"
                  min={0}
                  step="1"
                  value={form.reorderLevel}
                  onChange={(event) => updateField("reorderLevel", event.target.value)}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="safety-stock">Safety stock</Label>
                <Input
                  id="safety-stock"
                  type="number"
                  min={0}
                  step="1"
                  value={form.safetyStock}
                  onChange={(event) => updateField("safetyStock", event.target.value)}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="target-stock">Target stock level</Label>
                <Input
                  id="target-stock"
                  type="number"
                  min={0}
                  step="1"
                  value={form.targetStockLevel}
                  onChange={(event) => updateField("targetStockLevel", event.target.value)}
                />
              </div>
            </div>

            <Separator />

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label className="text-sm font-medium">Allow negative stock</Label>
                    <p className="text-xs text-muted-foreground">
                      Let stock go below zero when required.
                    </p>
                  </div>
                  <Switch
                    checked={form.allowNegativeStock}
                    onCheckedChange={(checked) => updateField("allowNegativeStock", checked)}
                  />
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label className="text-sm font-medium">Active product</Label>
                    <p className="text-xs text-muted-foreground">Visible in the catalog and POS.</p>
                  </div>
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(checked) => updateField("isActive", checked)}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label className="text-sm font-medium">Serial tracking</Label>
                    <p className="text-xs text-muted-foreground">
                      Track a unique serial number per unit.
                    </p>
                  </div>
                  <Switch
                    checked={form.serialTracked}
                    onCheckedChange={(checked) => updateField("serialTracked", checked)}
                  />
                </div>
                {form.serialTracked ? (
                  <div className="grid gap-1.5">
                    <Label htmlFor="warranty-months">Warranty months</Label>
                    <Input
                      id="warranty-months"
                      type="number"
                      min={0}
                      step="1"
                      value={form.warrantyMonths}
                      onChange={(event) => updateField("warrantyMonths", event.target.value)}
                    />
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label className="text-sm font-medium">Batch tracking</Label>
                    <p className="text-xs text-muted-foreground">
                      Track purchase batches and expiry dates.
                    </p>
                  </div>
                  <Switch
                    checked={form.batchTracked}
                    onCheckedChange={(checked) => updateField("batchTracked", checked)}
                  />
                </div>
                {form.batchTracked ? (
                  <div className="grid gap-1.5">
                    <Label htmlFor="expiry-alert-days">Expiry alert days</Label>
                    <Input
                      id="expiry-alert-days"
                      type="number"
                      min={0}
                      step="1"
                      value={form.expiryAlertDays}
                      onChange={(event) => updateField("expiryAlertDays", event.target.value)}
                    />
                  </div>
                ) : null}
              </div>
            </div>

            {form.batchTracked && isEditing ? (
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Batch inventory</p>
                    <p className="text-xs text-muted-foreground">
                      Use a batch when adjusting stock for this product.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAdjustOpen(true)}
                    disabled={loadingBatches}
                  >
                    {loadingBatches ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                    View batches
                  </Button>
                </div>
                {batches.length > 0 ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {batches.map((batch) => (
                      <div key={batch.id} className="rounded-md border bg-background p-3 text-xs">
                        <div className="font-medium">{batch.batch_number}</div>
                        <div className="text-muted-foreground">
                          Remaining: {batch.remaining_quantity} | Cost: {batch.cost_price}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Status</p>
                  <p className="text-xs text-muted-foreground">
                    Current product state in the catalog.
                  </p>
                </div>
                <span className="text-sm font-semibold">{statusLabel}</span>
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {isEditing ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => setDeleteMode("soft")}
                    disabled={saving || deleting}
                  >
                    {deleting && deleteMode === "soft" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Deactivate
                  </Button>
                  {!form.isActive ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => setDeleteMode("hard")}
                      disabled={saving || deleting}
                    >
                      {deleting && deleteMode === "hard" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Hard delete
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleGenerateBarcode()}
                    disabled={barcodeWorking}
                  >
                    {barcodeWorking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Regenerate barcode
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePrintBarcode}
                    disabled={!currentBarcode}
                  >
                    <Printer className="h-4 w-4" />
                    Print barcode
                  </Button>
                </>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={saving || deleting}
              >
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isEditing ? "Save changes" : "Create product"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adjust stock</DialogTitle>
            <DialogDescription>
              Apply a manual inventory correction for this product.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="adjust-quantity">Quantity change</Label>
              <Input
                id="adjust-quantity"
                type="number"
                step="1"
                value={adjustQuantity}
                onChange={(event) => setAdjustQuantity(event.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="adjust-reason">Reason</Label>
              <Textarea
                id="adjust-reason"
                value={adjustReason}
                onChange={(event) => setAdjustReason(event.target.value)}
                rows={3}
              />
            </div>

            {product?.is_batch_tracked ? (
              <div className="grid gap-1.5">
                <Label>Batch</Label>
                <Select
                  value={adjustBatchId}
                  onValueChange={(value) => setAdjustBatchId(value === "__none__" ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={loadingBatches ? "Loading batches..." : "Select batch"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select batch</SelectItem>
                    {batches.map((batch) => (
                      <SelectItem key={batch.id} value={batch.id}>
                        {batch.batch_number} ({batch.remaining_quantity})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAdjustOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleAdjustStock()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Apply adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={deleteMode !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeleteMode(null);
          }
        }}
        onCancel={() => setDeleteMode(null)}
        onConfirm={() => void handleDelete(deleteMode ?? "soft")}
        title={deleteMode === "hard" ? "Hard delete product?" : "Deactivate product?"}
        description={
          deleteMode === "hard"
            ? "This permanently removes the inactive product from the catalog."
            : "This will deactivate the product so it is hidden from active sales."
        }
        confirmLabel={deleteMode === "hard" ? "Delete" : "Deactivate"}
        confirmVariant={deleteMode === "hard" ? "destructive" : "default"}
        confirmDisabled={deleting}
        cancelDisabled={deleting}
        confirmContent={deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
      />
    </>
  );
}
