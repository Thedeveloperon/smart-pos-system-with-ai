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
import { Textarea } from "@/components/ui/textarea";
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Lock,
} from "lucide-react";
import DenominationCounter from "./DenominationCounter";
import type { DenominationCount } from "./types";

interface ClosingCashDialogProps {
  open: boolean;
  onClose: () => void;
  cashierName: string;
  expectedCash: number;
  openingCash: number;
  cashSalesTotal: number;
  onConfirm: (counts: DenominationCount[], total: number, reason?: string) => void;
}

type Step = "count" | "review" | "reason";

const ClosingCashDialog = ({
  open,
  onClose,
  cashierName,
  expectedCash,
  openingCash,
  cashSalesTotal,
  onConfirm,
}: ClosingCashDialogProps) => {
  const [step, setStep] = useState<Step>("count");
  const [counts, setCounts] = useState<DenominationCount[]>([]);
  const [total, setTotal] = useState(0);
  const [reason, setReason] = useState("");

  const difference = total - expectedCash;
  const hasMismatch = Math.abs(difference) > 0;
  const isShortage = difference < 0;
  const isExcess = difference > 0;

  const handleCountChange = (newCounts: DenominationCount[], newTotal: number) => {
    setCounts(newCounts);
    setTotal(newTotal);
  };

  const handleProceed = () => {
    if (hasMismatch) {
      setStep("reason");
    } else {
      setStep("review");
    }
  };

  const handleReasonProceed = () => {
    if (!reason.trim()) return;
    setStep("review");
  };

  const handleConfirm = () => {
    onConfirm(counts, total, hasMismatch ? reason : undefined);
    setStep("count");
    setReason("");
  };

  const handleCancel = () => {
    setStep("count");
    setReason("");
    onClose();
  };

  if (step === "reason") {
    return (
      <Dialog open={open} onOpenChange={() => handleCancel()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Cash Difference Detected
            </DialogTitle>
            <DialogDescription>
              A reason is required before you can close the session.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className={`rounded-xl p-4 text-center ${
              isShortage ? "bg-destructive/10" : "bg-warning/10"
            }`}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1 text-muted-foreground">
                {isShortage ? "Cash Shortage" : "Cash Excess"}
              </p>
              <p className={`text-3xl font-extrabold tabular-nums ${
                isShortage ? "text-destructive" : "text-warning"
              }`}>
                {isShortage ? "-" : "+"} Rs. {Math.abs(difference).toLocaleString()}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                Reason for difference <span className="text-destructive">*</span>
              </label>
              <Textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="E.g., Manual correction, cash shortage, excess change given..."
                rows={3}
                className="rounded-xl resize-none"
              />
              {reason.trim().length === 0 && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <XCircle className="h-3 w-3" />
                  A reason is required to proceed
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setStep("count")} className="rounded-xl">
              Go Back
            </Button>
            <Button
              variant="pos-primary"
              onClick={handleReasonProceed}
              disabled={!reason.trim()}
              className="rounded-xl"
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (step === "review") {
    return (
      <Dialog open={open} onOpenChange={() => handleCancel()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Confirm Closing Cash
            </DialogTitle>
            <DialogDescription>
              Review and confirm to lock this cash session.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Summary */}
            <div className="space-y-2 rounded-xl bg-muted p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Opening Cash</span>
                <span className="font-medium tabular-nums">Rs. {openingCash.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Cash Sales</span>
                <span className="font-medium tabular-nums">Rs. {cashSalesTotal.toLocaleString()}</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between text-sm font-semibold">
                <span>Expected Cash</span>
                <span className="tabular-nums">Rs. {expectedCash.toLocaleString()}</span>
              </div>
            </div>

            <div className="rounded-xl bg-accent p-4 text-center">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Actual Counted
              </p>
              <p className="text-3xl font-extrabold text-primary tabular-nums">
                Rs. {total.toLocaleString()}
              </p>
            </div>

            {/* Difference */}
            <div className={`rounded-xl p-3 text-center ${
              hasMismatch
                ? isShortage
                  ? "bg-destructive/10 border border-destructive/20"
                  : "bg-warning/10 border border-warning/20"
                : "bg-success/10 border border-success/20"
            }`}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-0.5">
                {hasMismatch ? "Difference" : "Status"}
              </p>
              <p className={`text-lg font-bold ${
                hasMismatch
                  ? isShortage ? "text-destructive" : "text-warning"
                  : "text-success"
              }`}>
                {hasMismatch
                  ? `${isShortage ? "-" : "+"} Rs. ${Math.abs(difference).toLocaleString()}`
                  : "✓ Cash Balanced"}
              </p>
            </div>

            {hasMismatch && reason && (
              <div className="rounded-xl bg-muted p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-1">Reason</p>
                <p className="text-sm">{reason}</p>
              </div>
            )}

            <div className="rounded-xl bg-muted p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Cashier</span>
                <span className="font-medium">{cashierName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Date & Time</span>
                <span className="font-medium">{new Date().toLocaleString()}</span>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-warning-foreground">
                Once confirmed, this session will be locked. Only a manager can reopen or modify it.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setStep(hasMismatch ? "reason" : "count")} className="rounded-xl">
              Go Back
            </Button>
            <Button variant="pos-primary" onClick={handleConfirm} className="rounded-xl">
              <Lock className="h-4 w-4" />
              Confirm & Lock Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={() => handleCancel()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Closing Cash Count
          </DialogTitle>
          <DialogDescription>
            Count all cash in the register to close your shift.
          </DialogDescription>
        </DialogHeader>

        {/* Expected info */}
        <div className="rounded-xl bg-muted p-3 flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Expected Cash</span>
          <span className="text-lg font-bold tabular-nums">Rs. {expectedCash.toLocaleString()}</span>
        </div>

        <div className="flex-1 overflow-y-auto py-2 -mx-6 px-6">
          <DenominationCounter onChange={handleCountChange} />
        </div>

        {/* Live difference */}
        {total > 0 && (
          <div className={`rounded-xl p-3 text-center ${
            Math.abs(total - expectedCash) === 0
              ? "bg-success/10"
              : total < expectedCash
                ? "bg-destructive/10"
                : "bg-warning/10"
          }`}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-0.5">
              {total === expectedCash ? "Balanced" : total < expectedCash ? "Short" : "Excess"}
            </p>
            <p className={`text-lg font-bold tabular-nums ${
              total === expectedCash
                ? "text-success"
                : total < expectedCash
                  ? "text-destructive"
                  : "text-warning"
            }`}>
              {total === expectedCash
                ? "✓ Rs. 0"
                : `${total < expectedCash ? "-" : "+"} Rs. ${Math.abs(total - expectedCash).toLocaleString()}`}
            </p>
          </div>
        )}

        <DialogFooter className="pt-2 border-t border-border gap-2">
          <Button variant="outline" onClick={handleCancel} className="rounded-xl">
            Cancel
          </Button>
          <Button
            variant="pos-primary"
            size="lg"
            className="flex-1 rounded-xl"
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

export default ClosingCashDialog;
