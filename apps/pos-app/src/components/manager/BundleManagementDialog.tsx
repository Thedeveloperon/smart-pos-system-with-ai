import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createBundle, fetchProducts, type Bundle, type BundleItemRequest, updateBundle } from "@/lib/api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bundle?: Bundle | null;
  onSaved: (bundle: Bundle) => void;
};

type EditableItem = {
  product_id?: string | null;
  item_name: string;
  quantity: string;
  notes: string;
};

const newItem = (): EditableItem => ({
  product_id: null,
  item_name: "",
  quantity: "1",
  notes: "",
});

export default function BundleManagementDialog({ open, onOpenChange, bundle, onSaved }: Props) {
  const isEditing = Boolean(bundle);
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [initialStock, setInitialStock] = useState("0");
  const [items, setItems] = useState<EditableItem[]>([newItem()]);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setName(bundle?.name ?? "");
    setBarcode(bundle?.barcode ?? "");
    setDescription(bundle?.description ?? "");
    setPrice(String(bundle?.price ?? 0));
    setIsActive(bundle?.is_active ?? true);
    setInitialStock("0");
    setItems(
      bundle?.items?.length
        ? bundle.items.map((item) => ({
            product_id: item.product_id ?? null,
            item_name: item.item_name,
            quantity: String(item.quantity),
            notes: item.notes ?? "",
          }))
        : [newItem()],
    );

    void fetchProducts(undefined, 200)
      .then((rows) => setProducts(rows.map((row) => ({ id: row.id, name: row.name }))))
      .catch(() => setProducts([]));
  }, [bundle, open]);

  const updateItem = (index: number, patch: Partial<EditableItem>) => {
    setItems((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Bundle name is required.");
      return;
    }

    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      toast.error("Bundle price must be greater than 0.");
      return;
    }

    const mappedItems: BundleItemRequest[] = items
      .map((item) => ({
        product_id: item.product_id || null,
        item_name: item.item_name.trim(),
        quantity: Number(item.quantity),
        notes: item.notes.trim() || null,
      }))
      .filter((item) => item.item_name && Number.isFinite(item.quantity) && item.quantity > 0);

    setSaving(true);
    try {
      const saved = isEditing && bundle
        ? await updateBundle(bundle.id, {
            name: name.trim(),
            barcode: barcode.trim() || null,
            description: description.trim() || null,
            price: parsedPrice,
            is_active: isActive,
            items: mappedItems,
          })
        : await createBundle({
            name: name.trim(),
            barcode: barcode.trim() || null,
            description: description.trim() || null,
            price: parsedPrice,
            is_active: isActive,
            initial_stock: Number(initialStock) || 0,
            items: mappedItems,
          });

      onSaved(saved);
      onOpenChange(false);
      toast.success(isEditing ? "Bundle updated." : "Bundle created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save bundle.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit bundle" : "Create bundle"}</DialogTitle>
          <DialogDescription>
            Configure a sellable bundle and the component items used for assemble and break operations.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Barcode</Label>
            <Input value={barcode} onChange={(event) => setBarcode(event.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Bundle price</Label>
            <Input type="number" step="0.01" min={0} value={price} onChange={(event) => setPrice(event.target.value)} />
          </div>
          {!isEditing && (
            <div className="grid gap-1.5">
              <Label>Initial stock</Label>
              <Input type="number" step="1" min={0} value={initialStock} onChange={(event) => setInitialStock(event.target.value)} />
            </div>
          )}
          <div className="md:col-span-2 grid gap-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <div className="md:col-span-2 flex items-center justify-between rounded border p-3">
            <div>
              <Label className="text-sm font-medium">Active bundle</Label>
              <p className="text-xs text-muted-foreground">Inactive bundles are hidden from checkout search.</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Bundle items</Label>
            <Button type="button" size="sm" variant="outline" onClick={() => setItems((prev) => [...prev, newItem()])}>
              Add item
            </Button>
          </div>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {items.map((item, index) => (
              <div key={`${index}-${item.item_name}`} className="grid gap-2 rounded border p-2 md:grid-cols-4">
                <Input
                  value={item.item_name}
                  onChange={(event) => updateItem(index, { item_name: event.target.value })}
                  placeholder="Item name"
                />
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={item.product_id ?? ""}
                  onChange={(event) => updateItem(index, { product_id: event.target.value || null })}
                >
                  <option value="">Free text item</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  min={0}
                  step="0.001"
                  value={item.quantity}
                  onChange={(event) => updateItem(index, { quantity: event.target.value })}
                  placeholder="Qty"
                />
                <div className="flex gap-2">
                  <Input
                    value={item.notes}
                    onChange={(event) => updateItem(index, { notes: event.target.value })}
                    placeholder="Notes"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving..." : isEditing ? "Update bundle" : "Create bundle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
