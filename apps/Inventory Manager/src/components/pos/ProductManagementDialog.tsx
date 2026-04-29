import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { updateProduct, type Product } from "@/lib/api";

type Props = {
  open: boolean;
  product: Product | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (product: Product) => void;
};

export default function ProductManagementDialog({
  open,
  product,
  onOpenChange,
  onSaved,
}: Props) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState(0);
  const [stock, setStock] = useState(0);
  const [allowNegative, setAllowNegative] = useState(false);
  const [serialTracked, setSerialTracked] = useState(false);
  const [warrantyMonths, setWarrantyMonths] = useState(12);
  const [batchTracked, setBatchTracked] = useState(false);
  const [expiryAlertDays, setExpiryAlertDays] = useState(30);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!product) return;
    setName(product.name);
    setSku(product.sku);
    setPrice(product.price);
    setStock(product.stock);
    setAllowNegative(product.allow_negative_stock ?? false);
    setSerialTracked(product.is_serial_tracked ?? false);
    setWarrantyMonths(product.warranty_months ?? 12);
    setBatchTracked(product.is_batch_tracked ?? false);
    setExpiryAlertDays(product.expiry_alert_days ?? 30);
  }, [product]);

  const save = async () => {
    if (!product) return;
    setSaving(true);
    try {
      const updated = await updateProduct(product.id, {
        name,
        sku,
        price,
        stock,
        allow_negative_stock: allowNegative,
        is_serial_tracked: serialTracked,
        warranty_months: serialTracked ? warrantyMonths : undefined,
        is_batch_tracked: batchTracked,
        expiry_alert_days: batchTracked ? expiryAlertDays : undefined,
      });
      onSaved?.(updated);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit product</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>SKU</Label>
              <Input value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label>Price</Label>
              <Input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="grid gap-1">
            <Label>Stock</Label>
            <Input
              type="number"
              value={stock}
              onChange={(e) => setStock(Number(e.target.value))}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">Allow negative stock</Label>
              <p className="text-xs text-muted-foreground">
                Sell below zero (back-orders).
              </p>
            </div>
            <Switch checked={allowNegative} onCheckedChange={setAllowNegative} />
          </div>

          <Separator />
          <div className="text-sm font-medium text-muted-foreground">Tracking</div>

          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Serial tracking</Label>
                <p className="text-xs text-muted-foreground">
                  Each unit has a unique serial number.
                </p>
              </div>
              <Switch checked={serialTracked} onCheckedChange={setSerialTracked} />
            </div>
            {serialTracked && (
              <div className="grid gap-1 pl-1">
                <Label className="text-xs">Warranty period (months)</Label>
                <Input
                  type="number"
                  min={0}
                  value={warrantyMonths}
                  onChange={(e) => setWarrantyMonths(Number(e.target.value))}
                />
              </div>
            )}
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Batch tracking</Label>
                <p className="text-xs text-muted-foreground">
                  Track lots with manufacture & expiry dates.
                </p>
              </div>
              <Switch checked={batchTracked} onCheckedChange={setBatchTracked} />
            </div>
            {batchTracked && (
              <div className="grid gap-1 pl-1">
                <Label className="text-xs">Expiry alert (days before)</Label>
                <Input
                  type="number"
                  min={0}
                  value={expiryAlertDays}
                  onChange={(e) => setExpiryAlertDays(Number(e.target.value))}
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
