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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-primary" />
            Add New Item
          </DialogTitle>
          <DialogDescription>
            Create a new product for the POS catalog. This saves directly to the backend.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit}>
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
              {form.imageUrl.trim() && (
                <div className="mt-2 overflow-hidden rounded-lg border border-border bg-muted">
                  <img
                    src={form.imageUrl.trim()}
                    alt="Item preview"
                    className="h-40 w-full object-cover"
                  />
                </div>
              )}
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

          <div className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4 md:grid-cols-2">
            <label className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background px-4 py-3">
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

            <label className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background px-4 py-3">
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

          <DialogFooter className="gap-2 sm:gap-0">
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
