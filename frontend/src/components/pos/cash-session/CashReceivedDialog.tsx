import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Banknote, CheckCircle2, Shield } from "lucide-react";
import DenominationCounter from "./DenominationCounter";
import type { DenominationCount } from "./types";

interface CashReceivedDialogProps {
  open: boolean;
  expectedCash: number;
  onClose: () => void;
  onConfirm: (counts: DenominationCount[], total: number) => void;
  onTotalChange?: (total: number) => void;
}

const CashReceivedDialog = ({ open, expectedCash, onClose, onConfirm, onTotalChange }: CashReceivedDialogProps) => {
  const [counts, setCounts] = useState<DenominationCount[]>([]);
  const [total, setTotal] = useState(0);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    if (open) {
      setCounts([]);
      setTotal(0);
      setResetKey((value) => value + 1);
    }
  }, [open]);

  const handleCountChange = (newCounts: DenominationCount[], newTotal: number) => {
    setCounts(newCounts);
    setTotal(newTotal);
    onTotalChange?.(newTotal);
  };

  const handleProceed = () => {
    onConfirm(counts, total);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            Count Cash Received
          </DialogTitle>
          <DialogDescription>
            Count the cash given by the customer. The amount will fill the cash received field automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl bg-muted p-3 flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Expected Cash</span>
          <span className="text-lg font-bold tabular-nums">Rs. {expectedCash.toLocaleString()}</span>
        </div>

        <div className="flex-1 overflow-y-auto py-2 -mx-6 px-6">
          <DenominationCounter key={resetKey} onChange={handleCountChange} />
        </div>

        <div className="rounded-xl bg-accent p-3 text-center">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Cash Received
          </p>
          <p className="text-3xl font-extrabold text-primary tabular-nums">
            Rs. {total.toLocaleString()}
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            This amount is copied into the checkout field. You can still adjust it manually after closing this popup.
          </p>
        </div>

        <DialogFooter className="pt-2 border-t border-border gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl">
            Cancel
          </Button>
          <Button variant="pos-primary" size="lg" className="flex-1 rounded-xl" onClick={handleProceed}>
            <CheckCircle2 className="h-5 w-5" />
            Proceed — Rs. {total.toLocaleString()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CashReceivedDialog;
