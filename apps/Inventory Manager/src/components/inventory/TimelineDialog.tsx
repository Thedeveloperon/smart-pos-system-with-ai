import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WarrantyTimeline } from "./WarrantyTimeline";
import { type WarrantyClaim } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  claim: WarrantyClaim | null;
}

export function TimelineDialog({ open, onOpenChange, claim }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-baseline gap-2">
            <span>Claim Timeline</span>
            {claim && (
              <span className="font-mono text-sm font-normal text-muted-foreground">
                {claim.serial_value}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        {claim && <WarrantyTimeline claim={claim} />}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
