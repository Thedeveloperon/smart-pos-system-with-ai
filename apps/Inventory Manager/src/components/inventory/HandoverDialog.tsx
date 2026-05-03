import { useEffect, useState } from "react";
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
import { type WarrantyClaim } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  claim: WarrantyClaim | null;
  onConfirm: (data: {
    supplier_name?: string;
    handover_date?: string;
    pickup_person_name?: string;
  }) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function HandoverDialog({ open, onOpenChange, claim, onConfirm }: Props) {
  const [supplier, setSupplier] = useState("");
  const [handoverDate, setHandoverDate] = useState(today());
  const [pickupPerson, setPickupPerson] = useState("");

  useEffect(() => {
    if (open) {
      setSupplier("");
      setHandoverDate(today());
      setPickupPerson("");
    }
  }, [open]);

  const submit = () => {
    onConfirm({
      supplier_name: supplier || undefined,
      handover_date: handoverDate ? new Date(handoverDate).toISOString() : undefined,
      pickup_person_name: pickupPerson || undefined,
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
          <div className="grid gap-1.5">
            <Label>Supplier / Repair Center</Label>
            <Input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="e.g. Samsung Service Center"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Handover Date</Label>
            <Input
              type="date"
              value={handoverDate}
              onChange={(e) => setHandoverDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Picked Up By</Label>
            <Input
              value={pickupPerson}
              onChange={(e) => setPickupPerson(e.target.value)}
              placeholder="e.g. Ruwan Perera"
            />
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
