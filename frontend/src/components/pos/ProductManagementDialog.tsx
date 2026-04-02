import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, PencilLine, Search, Trash2 } from "lucide-react";
import type { CatalogProduct, UpdateProductRequest } from "@/lib/api";
import {
  deleteProduct,
  fetchCategories,
  fetchProductCatalogItems,
  updateProduct,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

type ProductEditorDialogProps = {
  open: boolean;
  product: CatalogProduct | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void> | void;
};

function ProductEditorDialog({ open, product, onOpenChange, onSaved }: ProductEditorDialogProps) {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<ProductFormState>(emptyFormState());

  useEffect(() => {
    if (!open) {
      return;
    }

    if (product) {
      setForm(buildFormState(product));
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

    const confirmed = window.confirm(
      `Deactivate "${product.name}"? It will be hidden from sales but remain in history.`
    );
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    try {
      await deleteProduct(product.id);
      toast.success("Product deactivated.");
      await onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to deactivate product.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="h-[92vh] max-h-[92vh] max-w-4xl overflow-hidden border-border/70 bg-background p-0 shadow-2xl">
        <div className="border-b border-border/70 bg-pos-header px-6 py-5 text-pos-header-foreground">
          <div className="relative pr-28">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
                <PencilLine className="h-5 w-5 text-primary" />
                Manage Product
              </DialogTitle>
              <DialogDescription className="text-pos-header-foreground/70">
                Edit price, stock settings, and active status. Deleting a product will deactivate it.
              </DialogDescription>
            </DialogHeader>
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                className="absolute right-0 top-0 z-10 border-pos-header-foreground/30 bg-transparent text-pos-header-foreground hover:bg-pos-header-foreground/10 hover:text-pos-header-foreground"
              >
                Cancel
              </Button>
            </DialogClose>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="manage-name">Product name</Label>
                  <Input
                    id="manage-name"
                    value={form.name}
                    onChange={(event) => updateField("name", event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manage-sku">SKU</Label>
                  <Input
                    id="manage-sku"
                    value={form.sku}
                    onChange={(event) => updateField("sku", event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manage-barcode">Barcode</Label>
                  <Input
                    id="manage-barcode"
                    value={form.barcode}
                    onChange={(event) => updateField("barcode", event.target.value)}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="manage-image">Image URL</Label>
                  <Input
                    id="manage-image"
                    value={form.imageUrl}
                    onChange={(event) => updateField("imageUrl", event.target.value)}
                    placeholder="https://..."
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Category</Label>
                  <Select
                    value={form.categoryId || "__none__"}
                    onValueChange={(value) => updateField("categoryId", value === "__none__" ? "" : value)}
                  >
                    <SelectTrigger>
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
                  <Label htmlFor="manage-unit-price">Unit price</Label>
                  <Input
                    id="manage-unit-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.unitPrice}
                    onChange={(event) => updateField("unitPrice", event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manage-cost-price">Cost price</Label>
                  <Input
                    id="manage-cost-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.costPrice}
                    onChange={(event) => updateField("costPrice", event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manage-reorder">Reorder level</Label>
                  <Input
                    id="manage-reorder"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.reorderLevel}
                    onChange={(event) => updateField("reorderLevel", event.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="border-b border-border bg-muted/40 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Current State
                  </p>
                </div>
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-base font-semibold">{product?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {product?.sku || "No SKU"} {product?.barcode ? `| ${product.barcode}` : ""}
                      </p>
                    </div>
                    <Badge variant={product?.isActive ? "default" : "secondary"}>
                      {product?.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>

                  <div className="grid gap-2 rounded-xl border border-border bg-background p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Unit price</span>
                      <span className="font-medium">Rs. {Number(form.unitPrice || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cost price</span>
                      <span className="font-medium">Rs. {Number(form.costPrice || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Stock</span>
                      <span className="font-medium">{product?.stockQuantity.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="grid gap-4 rounded-2xl border border-border bg-muted/20 p-4">
                    <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">Allow negative stock</p>
                        <p className="text-xs text-muted-foreground">Lets sales continue below zero stock.</p>
                      </div>
                      <Switch
                        checked={form.allowNegativeStock}
                        onCheckedChange={(checked) => updateField("allowNegativeStock", checked)}
                      />
                    </label>

                    <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">Active product</p>
                        <p className="text-xs text-muted-foreground">Inactive products are hidden from sales.</p>
                      </div>
                      <Switch
                        checked={form.isActive}
                        onCheckedChange={(checked) => updateField("isActive", checked)}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Delete safety</p>
                    <p className="text-sm text-amber-900/80">
                      Deleting a product only deactivates it so sales history stays intact.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 border-t border-border/70 px-6 py-4 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={saving || deleting || !product}
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Deactivate
          </Button>
          <div className="flex gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving || deleting}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving || deleting}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PencilLine className="h-4 w-4" />}
              Save changes
            </Button>
          </div>
        </DialogFooter>
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
    await onChanged?.();
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
                <Badge variant="secondary" className="w-fit">
                  {filtered.length} products
                </Badge>
              </div>

              <div className="overflow-hidden rounded-2xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
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
                        <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                          Loading products...
                        </TableCell>
                      </TableRow>
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                          No products found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{product.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {product.sku}
                                {product.barcode ? ` | ${product.barcode}` : ""}
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
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(product)}>
                              <PencilLine className="h-4 w-4" />
                              Edit
                            </Button>
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
      />
    </>
  );
}
