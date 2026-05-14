import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type WarrantyClaim } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  claim: WarrantyClaim | null;
  onConfirm: (data: { resolution_notes?: string }) => void;
}

export function RejectDialog({ open, onOpenChange, claim, onConfirm }: Props) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const submit = () => {
    onConfirm({ resolution_notes: reason.trim() || "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Reject Claim
            {claim && (
              <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">
                {claim.serial_value}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label>Reason</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this claim being rejected?"
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            className="bg-status-rejected text-brand-foreground hover:bg-status-rejected/90"
          >
            Reject Claim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
