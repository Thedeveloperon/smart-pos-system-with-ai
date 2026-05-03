import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type WarrantyClaim } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  claim: WarrantyClaim | null;
  onConfirm: (data: { received_back_date?: string; received_back_person_name?: string }) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function ReceiveBackDialog({ open, onOpenChange, claim, onConfirm }: Props) {
  const [receivedDate, setReceivedDate] = useState(today());
  const [receivedBy, setReceivedBy] = useState("");

  useEffect(() => {
    if (open) {
      setReceivedDate(today());
      setReceivedBy("");
    }
  }, [open]);

  const submit = () => {
    onConfirm({
      received_back_date: receivedDate ? new Date(receivedDate).toISOString() : undefined,
      received_back_person_name: receivedBy.trim() || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Receive Back
            {claim && (
              <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">
                {claim.serial_value}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Received Back Date</Label>
            <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Received By</Label>
            <Input
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
              placeholder="e.g. Nimal Perera"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} className="bg-brand text-brand-foreground hover:bg-brand/90">
            Save Receive Back
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
