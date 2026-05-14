import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fetchSerialNumbers, type SerialNumberRecord, type WarrantyClaim } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  claim: WarrantyClaim | null;
  onConfirm: (data: {
    replacement_serial_number_id: string;
    resolution_notes?: string;
  }) => void;
}

export function ReplaceDialog({ open, onOpenChange, claim, onConfirm }: Props) {
  const [serials, setSerials] = useState<SerialNumberRecord[]>([]);
  const [loadingSerials, setLoadingSerials] = useState(false);
  const [replacementSerialId, setReplacementSerialId] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open || !claim) return;

    let alive = true;
    setReplacementSerialId("");
    setNotes("");
    setLoadingSerials(true);

    fetchSerialNumbers(claim.product_id)
      .then((items) => {
        if (alive) {
          setSerials(items);
        }
      })
      .catch((error) => {
        if (alive) {
          setSerials([]);
          toast.error(
            error instanceof Error ? error.message : "Failed to load available serial numbers.",
          );
        }
      })
      .finally(() => {
        if (alive) {
          setLoadingSerials(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [claim, open]);

  const availableSerials = useMemo(
    () =>
      serials.filter(
        (serial) => serial.status === "Available" && serial.id !== claim?.serial_number_id,
      ),
    [claim?.serial_number_id, serials],
  );

  const canSubmit = replacementSerialId.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onConfirm({
      replacement_serial_number_id: replacementSerialId,
      resolution_notes: notes.trim() || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Direct Replacement
            {claim && (
              <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">
                {claim.serial_value}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <p className="text-xs text-muted-foreground">
            Select an available serial from shop stock. This resolves the claim immediately and
            deducts one unit from inventory.
          </p>
          <div className="grid gap-1.5">
            <Label>Replacement Serial</Label>
            <Select
              value={replacementSerialId}
              onValueChange={setReplacementSerialId}
              disabled={loadingSerials || availableSerials.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loadingSerials
                      ? "Loading serials..."
                      : availableSerials.length > 0
                        ? "Select available serial"
                        : "No available serials"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableSerials.map((serial) => (
                  <SelectItem key={serial.id} value={serial.id}>
                    {serial.serial_value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Replacement Notes</Label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional note for the direct replacement"
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!canSubmit}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            Confirm Replacement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
