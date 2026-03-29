import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Shield, CheckCircle2, AlertTriangle } from "lucide-react";
import DenominationCounter from "./DenominationCounter";
import type { DenominationCount } from "./types";

interface OpeningCashDialogProps {
  open: boolean;
  cashierName: string;
  onConfirm: (counts: DenominationCount[], total: number) => void;
}

const OpeningCashDialog = ({ open, cashierName, onConfirm }: OpeningCashDialogProps) => {
  const [counts, setCounts] = useState<DenominationCount[]>([]);
  const [total, setTotal] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleCountChange = (newCounts: DenominationCount[], newTotal: number) => {
    setCounts(newCounts);
    setTotal(newTotal);
  };

  const handleProceed = () => {
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    onConfirm(counts, total);
    setShowConfirm(false);
  };

  if (showConfirm) {
    return (
      <Dialog open={open}>
        <DialogContent className="sm:max-w-md" onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              Confirm Opening Cash
            </DialogTitle>
            <DialogDescription>
              Please review and confirm the opening cash count.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-xl bg-accent p-4 text-center">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Opening Cash Amount
              </p>
              <p className="text-3xl font-extrabold text-primary tabular-nums">
                Rs. {total.toLocaleString()}
              </p>
            </div>

            <div className="rounded-xl bg-muted p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Cashier</span>
                <span className="font-medium">{cashierName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">{new Date().toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Time</span>
                <span className="font-medium">{new Date().toLocaleTimeString()}</span>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-warning-foreground">
                Once confirmed, the opening cash cannot be modified without manager approval. Please ensure the count is accurate.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowConfirm(false)} className="rounded-xl">
              Go Back
            </Button>
            <Button variant="pos-primary" onClick={handleConfirm} className="rounded-xl">
              <CheckCircle2 className="h-4 w-4" />
              Confirm & Start Shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Opening Cash Count
          </DialogTitle>
          <DialogDescription>
            Count all cash in the register before starting your shift. This is required to begin selling.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 -mx-6 px-6">
          <DenominationCounter onChange={handleCountChange} />
        </div>

        <DialogFooter className="pt-4 border-t border-border">
          <Button
            variant="pos-primary"
            size="lg"
            className="w-full rounded-xl"
            onClick={handleProceed}
          >
            <CheckCircle2 className="h-5 w-5" />
            Proceed — Rs. {total.toLocaleString()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OpeningCashDialog;
