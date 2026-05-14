import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchSuppliers, type Supplier, type WarrantyClaim } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  claim: WarrantyClaim | null;
  onConfirm: (data: { supplier_name?: string; pickup_person_name?: string }) => void;
}

export function HandoverDialog({ open, onOpenChange, claim, onConfirm }: Props) {
  const [supplier, setSupplier] = useState("");
  const [pickupSupplierId, setPickupSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  const selectedPickupSupplier = useMemo(
    () => suppliers.find((item) => item.supplier_id === pickupSupplierId),
    [pickupSupplierId, suppliers],
  );

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setSupplier("");
    setPickupSupplierId("");
    setLoadingSuppliers(true);
    fetchSuppliers()
      .then((items) => {
        if (alive) {
          setSuppliers(items);
        }
      })
      .catch((error) => {
        if (alive) {
          setSuppliers([]);
          toast.error(error instanceof Error ? error.message : "Failed to load suppliers.");
        }
      })
      .finally(() => {
        if (alive) {
          setLoadingSuppliers(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [open]);

  const submit = () => {
    onConfirm({
      supplier_name: supplier || undefined,
      pickup_person_name: selectedPickupSupplier?.name || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Send to Repair
            {claim && (
              <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">
                {claim.serial_value}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <p className="text-xs text-muted-foreground">
            The handover date and time are recorded automatically when you confirm this step.
          </p>
          <div className="grid gap-1.5">
            <Label>Supplier / Repair Center</Label>
            <Input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="e.g. Samsung Service Center"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Picked Up By</Label>
            <Select
              value={pickupSupplierId}
              onValueChange={setPickupSupplierId}
              disabled={loadingSuppliers || suppliers.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loadingSuppliers
                      ? "Loading suppliers..."
                      : suppliers.length > 0
                        ? "Select supplier"
                        : "No suppliers available"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((item) => (
                  <SelectItem key={item.supplier_id} value={item.supplier_id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} className="bg-brand text-brand-foreground hover:bg-brand/90">
            Confirm Handover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
