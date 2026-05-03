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
import { Textarea } from "@/components/ui/textarea";
import { type WarrantyClaim } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  claim: WarrantyClaim | null;
  onConfirm: (data: { received_back_date?: string; resolution_notes?: string }) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function ResolveDialog({ open, onOpenChange, claim, onConfirm }: Props) {
  const [receivedDate, setReceivedDate] = useState(today());
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setReceivedDate(today());
      setNotes("");
    }
  }, [open]);

  const submit = () => {
    onConfirm({
      received_back_date: receivedDate ? new Date(receivedDate).toISOString() : undefined,
      resolution_notes: notes || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Resolve Claim
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
            <Input
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Resolution Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What was repaired or replaced?"
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} className="bg-brand text-brand-foreground hover:bg-brand/90">
            Mark as Resolved
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
