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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, CheckCircle2, AlertTriangle } from "lucide-react";
import DenominationCounter from "./DenominationCounter";
import type { DenominationCount } from "./types";

interface OpeningCashDialogProps {
  open: boolean;
  cashierName: string;
  onConfirm: (counts: DenominationCount[], total: number, cashierName: string) => Promise<void> | void;
}

const OpeningCashDialog = ({ open, cashierName, onConfirm }: OpeningCashDialogProps) => {
  const [counts, setCounts] = useState<DenominationCount[]>([]);
  const [total, setTotal] = useState(0);
  const [enteredCashierName, setEnteredCashierName] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [cashierNameError, setCashierNameError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEnteredCashierName("");
      setCounts([]);
      setTotal(0);
      setShowConfirm(false);
      setCashierNameError(null);
    }
  }, [open]);

  const handleCountChange = (newCounts: DenominationCount[], newTotal: number) => {
    setCounts(newCounts);
    setTotal(newTotal);
  };

  const handleProceed = () => {
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    const normalizedCashierName = enteredCashierName.trim();
    if (!normalizedCashierName) {
      setCashierNameError("Cashier name is required.");
      return;
    }

    try {
      setIsConfirming(true);
      await onConfirm(counts, total, normalizedCashierName);
    } finally {
      setIsConfirming(false);
    }
  };

  if (showConfirm) {
    return (
      <Dialog open={open}>
        <DialogContent
          className="w-[min(96vw,42rem)] max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border border-slate-300 bg-[#f7f8fa] p-0 shadow-xl sm:max-w-3xl"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="border-b border-slate-300 px-6 py-5 pr-14">
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              Confirm Opening Cash
            </DialogTitle>
            <DialogDescription>
              Please review and confirm the opening cash count.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto px-6 py-5">
            <div className="rounded-xl bg-accent p-4 text-center">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Opening Cash Amount
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-primary">
                Rs. {total.toLocaleString()}
              </p>
            </div>

            <div className="rounded-xl bg-muted p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Cashier</span>
                <span className="font-medium">{cashierName}</span>
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <Label htmlFor="shift-cashier-name" className="text-muted-foreground text-sm">
                  Cashier name for this shift <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="shift-cashier-name"
                  value={enteredCashierName}
                  onChange={(event) => {
                    setEnteredCashierName(event.target.value);
                    if (cashierNameError) {
                      setCashierNameError(null);
                    }
                  }}
                  placeholder="Enter cashier name"
                  className="rounded-xl"
                />
                {cashierNameError ? <p className="text-xs text-destructive">{cashierNameError}</p> : null}
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
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-xs text-warning-foreground">
                Once confirmed, the opening cash cannot be modified without manager approval. Please ensure the count is accurate.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-slate-300 bg-slate-100 px-6 py-3">
            <Button
              variant="outline"
              onClick={() => setShowConfirm(false)}
              className="rounded-xl"
              disabled={isConfirming}
            >
              Go Back
            </Button>
            <Button
              variant="pos-primary"
              onClick={() => {
                void handleConfirm();
              }}
              className="rounded-xl"
              disabled={isConfirming || !enteredCashierName.trim()}
            >
              <CheckCircle2 className="h-4 w-4" />
              {isConfirming ? "Starting Shift..." : "Confirm & Start Shift"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className="w-[min(96vw,56rem)] max-h-[92vh] overflow-hidden flex flex-col rounded-2xl border border-slate-300 bg-[#f7f8fa] p-0 shadow-xl sm:max-w-4xl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="border-b border-slate-300 px-6 py-5 pr-14">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="flex items-center gap-2 text-[1.9rem] font-semibold tracking-tight text-slate-800">
                <Shield className="h-5 w-5 text-primary" />
                Opening Cash Count
              </DialogTitle>
            </div>
            <p className="text-[2rem] font-bold leading-none tabular-nums text-primary">
              Rs. {total.toLocaleString()}
            </p>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <DenominationCounter onChange={handleCountChange} />
        </div>

        <DialogFooter className="justify-start border-t border-slate-300 bg-slate-100 px-6 py-3 sm:justify-start sm:space-x-0">
            <Button
              variant="pos-primary"
              size="lg"
              className="w-full rounded-xl sm:w-[17rem]"
              onClick={handleProceed}
            disabled={isConfirming}
          >
            <CheckCircle2 className="h-5 w-5" />
            Proceed - Rs. {total.toLocaleString()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OpeningCashDialog;
