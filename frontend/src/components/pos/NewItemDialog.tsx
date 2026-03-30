import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, PackagePlus } from "lucide-react";

import { createProduct, fetchCategories } from "@/lib/api";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type NewItemDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => Promise<void> | void;
};

type CategoryOption = {
  category_id: string;
  name: string;
  is_active: boolean;
};

const defaultForm = {
  name: "",
  sku: "",
  barcode: "",
  imageUrl: "",
  categoryId: "",
  unitPrice: "0",
  costPrice: "0",
  initialStockQuantity: "0",
  reorderLevel: "5",
  allowNegativeStock: true,
  isActive: true,
};

const NewItemDialog = ({ open, onOpenChange, onCreated }: NewItemDialogProps) => {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm(defaultForm);

    const loadCategories = async () => {
      setLoadingCategories(true);
      try {
        const items = await fetchCategories(false);
        setCategories(items);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load categories.");
      } finally {
        setLoadingCategories(false);
      }
    };

    void loadCategories();
  }, [open]);

  const categoryOptions = useMemo(
    () => categories.filter((category) => category.is_active),
    [categories]
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = form.name.trim();
    const unitPrice = Number(form.unitPrice);
    const costPrice = Number(form.costPrice);
    const initialStockQuantity = Number(form.initialStockQuantity);
    const reorderLevel = Number(form.reorderLevel);

    if (!name) {
      toast.error("Item name is required.");
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

    if (!Number.isFinite(initialStockQuantity) || initialStockQuantity < 0) {
      toast.error("Enter a valid starting stock quantity.");
      return;
    }

    if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
      toast.error("Enter a valid reorder level.");
      return;
    }

    setSubmitting(true);
    try {
      await createProduct({
        name,
        sku: form.sku.trim() || null,
        barcode: form.barcode.trim() || null,
        image_url: form.imageUrl.trim() || null,
        category_id: form.categoryId || null,
        unit_price: unitPrice,
        cost_price: costPrice,
        initial_stock_quantity: initialStockQuantity,
        reorder_level: reorderLevel,
        allow_negative_stock: form.allowNegativeStock,
        is_active: form.isActive,
      });

      toast.success("New item added.");
      onOpenChange(false);
      await onCreated?.();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to add item.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto border-border/70 bg-background p-0 shadow-2xl">
        <div className="border-b border-border/70 bg-pos-header text-pos-header-foreground px-6 py-5">
          <DialogHeader className="space-y-4 text-left sm:text-left">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/30">
                <PackagePlus className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <DialogTitle className="text-xl font-semibold tracking-tight">
                  Add New Item
                </DialogTitle>
                <DialogDescription className="max-w-2xl text-sm text-pos-header-foreground/70">
                  Create products in the same visual tone as the checkout flow. The item will appear
                  immediately in the POS catalog after saving.
                </DialogDescription>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-pos-header-foreground/80">
                Fast catalog setup
              </span>
              <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs text-primary-foreground/90">
                POS-ready styling
              </span>
            </div>
          </DialogHeader>
        </div>

        <form className="space-y-6 px-6 py-6" onSubmit={handleSubmit}>
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="name">Item name</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="e.g. Ceylon Tea 100g"
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sku">SKU</Label>
                  <Input
                    id="sku"
                    value={form.sku}
                    onChange={(event) => setForm((prev) => ({ ...prev, sku: event.target.value }))}
                    placeholder="Optional SKU"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="barcode">Barcode</Label>
                  <Input
                    id="barcode"
                    value={form.barcode}
                    onChange={(event) => setForm((prev) => ({ ...prev, barcode: event.target.value }))}
                    placeholder="Optional barcode"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="imageUrl">Item image URL</Label>
                  <Input
                    id="imageUrl"
                    type="url"
                    value={form.imageUrl}
                    onChange={(event) => setForm((prev) => ({ ...prev, imageUrl: event.target.value }))}
                    placeholder="https://..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste a web image URL to show the item photo in the catalog.
                  </p>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Category</Label>
                  <Select
                    value={form.categoryId}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, categoryId: value === "__none__" ? "" : value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={loadingCategories ? "Loading categories..." : "Select category (optional)"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No category</SelectItem>
                      {categoryOptions.map((category) => (
                        <SelectItem key={category.category_id} value={category.category_id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="unitPrice">Unit price</Label>
                  <Input
                    id="unitPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.unitPrice}
                    onChange={(event) => setForm((prev) => ({ ...prev, unitPrice: event.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="costPrice">Cost price</Label>
                  <Input
                    id="costPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.costPrice}
                    onChange={(event) => setForm((prev) => ({ ...prev, costPrice: event.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="initialStockQuantity">Initial stock</Label>
                  <Input
                    id="initialStockQuantity"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.initialStockQuantity}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, initialStockQuantity: event.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reorderLevel">Reorder level</Label>
                  <Input
                    id="reorderLevel"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.reorderLevel}
                    onChange={(event) => setForm((prev) => ({ ...prev, reorderLevel: event.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="border-b border-border bg-muted/40 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Live Preview
                  </p>
                </div>
                <div className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <PackagePlus className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold">
                        {form.name.trim() || "Item name"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {form.categoryId
                          ? categoryOptions.find((category) => category.category_id === form.categoryId)?.name ||
                            "Selected category"
                          : "No category selected"}
                      </p>
                    </div>
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
                      <span className="text-muted-foreground">Initial stock</span>
                      <span className="font-medium">{Number(form.initialStockQuantity || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reorder level</span>
                      <span className="font-medium">{Number(form.reorderLevel || 0).toLocaleString()}</span>
                    </div>
                  </div>

                  {form.imageUrl.trim() ? (
                    <div className="overflow-hidden rounded-xl border border-border bg-muted">
                      <img
                        src={form.imageUrl.trim()}
                        alt="Item preview"
                        className="h-44 w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="grid h-44 place-items-center rounded-xl border border-dashed border-border bg-muted/40 text-center">
                      <div className="space-y-1 px-6">
                        <p className="text-sm font-medium">Catalog visual preview</p>
                        <p className="text-xs text-muted-foreground">
                          Add an image URL to preview the product card here.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 rounded-2xl border border-border bg-muted/20 p-4 md:grid-cols-2">
                <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Allow negative stock</p>
                    <p className="text-xs text-muted-foreground">
                      Lets the sale continue even if stock goes below zero.
                    </p>
                  </div>
                  <Switch
                    checked={form.allowNegativeStock}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, allowNegativeStock: checked }))
                    }
                  />
                </label>

                <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Active item</p>
                    <p className="text-xs text-muted-foreground">
                      Hide inactive items from normal sales search.
                    </p>
                  </div>
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
                  />
                </label>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-border/70 pt-4 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NewItemDialog;
