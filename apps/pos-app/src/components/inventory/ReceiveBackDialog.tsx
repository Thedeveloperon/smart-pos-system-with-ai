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
  onConfirm: (data: { received_back_person_name?: string }) => void;
}

export function ReceiveBackDialog({ open, onOpenChange, claim, onConfirm }: Props) {
  const [receivedBy, setReceivedBy] = useState("");

  useEffect(() => {
    if (open) {
      setReceivedBy("");
    }
  }, [open]);

  const submit = () => {
    onConfirm({
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
          <p className="text-xs text-muted-foreground">
            The receive-back date and time are recorded automatically when you save this step.
          </p>
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
