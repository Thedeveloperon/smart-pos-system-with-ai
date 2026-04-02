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
  initialCounts?: DenominationCount[];
  onConfirm: (counts: DenominationCount[], total: number, reason?: string) => Promise<void> | void;
}

type Step = "count" | "review" | "reason";

const ClosingCashDialog = ({
  open,
  onClose,
  cashierName,
  expectedCash,
  openingCash,
  cashSalesTotal,
  initialCounts,
  onConfirm,
}: ClosingCashDialogProps) => {
  const [step, setStep] = useState<Step>("count");
  const [counts, setCounts] = useState<DenominationCount[]>([]);
  const [total, setTotal] = useState(0);
  const [reason, setReason] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const startingCounts = initialCounts ?? [];
    const startingTotal = startingCounts.reduce(
      (sum, count) => sum + count.denomination * count.quantity,
      0,
    );

    setCounts(startingCounts);
    setTotal(startingTotal);
  }, [initialCounts, open]);

  const difference = total - expectedCash;
  const hasMismatch = Math.abs(difference) > 0;
  const isShortage = difference < 0;

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

  const handleConfirm = async () => {
    try {
      setIsConfirming(true);
      await onConfirm(counts, total, hasMismatch ? reason : undefined);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleCancel = () => {
    setStep("count");
    setReason("");
    onClose();
  };

  if (step === "reason") {
    return (
      <Dialog open={open} onOpenChange={() => handleCancel()}>
        <DialogContent className="w-[min(96vw,34rem)] rounded-2xl border border-slate-300 bg-[#f7f8fa] p-0 shadow-xl sm:max-w-2xl">
          <DialogHeader className="border-b border-slate-300 px-6 py-5 pr-14">
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Cash Difference Detected
            </DialogTitle>
            <DialogDescription>
              A reason is required before you can close the session.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-5">
            <div
              className={`rounded-xl p-4 text-center ${
                isShortage ? "bg-destructive/10" : "bg-warning/10"
              }`}
            >
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {isShortage ? "Cash Shortage" : "Cash Excess"}
              </p>
              <p className={`text-3xl font-extrabold tabular-nums ${isShortage ? "text-destructive" : "text-warning"}`}>
                {isShortage ? "-" : "+"} Rs. {Math.abs(difference).toLocaleString()}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                Reason for difference <span className="text-destructive">*</span>
              </label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="E.g., Manual correction, cash shortage, excess change given..."
                rows={3}
                className="rounded-xl resize-none"
              />
              {reason.trim().length === 0 && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <XCircle className="h-3 w-3" />
                  A reason is required to proceed
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-slate-300 bg-slate-100 px-6 py-3">
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
        <DialogContent className="w-[min(96vw,34rem)] rounded-2xl border border-slate-300 bg-[#f7f8fa] p-0 shadow-xl sm:max-w-2xl">
          <DialogHeader className="border-b border-slate-300 px-6 py-5 pr-14">
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Confirm Closing Cash
            </DialogTitle>
            <DialogDescription>
              Review and confirm to lock this cash session.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto px-6 py-5">
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
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Actual Counted
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-primary">
                Rs. {total.toLocaleString()}
              </p>
            </div>

            <div
              className={`rounded-xl p-3 text-center ${
                hasMismatch
                  ? isShortage
                    ? "border border-destructive/20 bg-destructive/10"
                    : "border border-warning/20 bg-warning/10"
                  : "border border-success/20 bg-success/10"
              }`}
            >
              <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider">
                {hasMismatch ? "Difference" : "Status"}
              </p>
              <p
                className={`text-lg font-bold ${
                  hasMismatch
                    ? isShortage
                      ? "text-destructive"
                      : "text-warning"
                    : "text-success"
                }`}
              >
                {hasMismatch
                  ? `${isShortage ? "-" : "+"} Rs. ${Math.abs(difference).toLocaleString()}`
                  : "Check Cash Balanced"}
              </p>
            </div>

            {hasMismatch && reason && (
              <div className="rounded-xl bg-muted p-3">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">Reason</p>
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
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-xs text-warning-foreground">
                Once confirmed, this session will be locked. Only a manager can reopen or modify it.
              </p>
            </div>
          </div>

          <DialogFooter className="w-full gap-2 border-t border-slate-300 bg-slate-100 px-6 py-3">
            <Button
              variant="outline"
              onClick={() => setStep(hasMismatch ? "reason" : "count")}
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
              disabled={isConfirming}
            >
              <Lock className="h-4 w-4" />
              {isConfirming ? "Locking Session..." : "Confirm & Lock Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={() => handleCancel()}>
      <DialogContent className="w-[min(96vw,56rem)] max-h-[92vh] overflow-hidden flex flex-col rounded-2xl border border-slate-300 bg-[#f7f8fa] p-0 shadow-xl sm:max-w-4xl">
        <DialogHeader className="border-b border-slate-300 px-6 py-4 pr-14">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <DialogTitle className="flex items-center gap-2 text-[1.9rem] font-semibold tracking-tight text-slate-800">
              <Shield className="h-5 w-5 text-primary shrink-0" />
              Closing Cash Count
            </DialogTitle>

            <div className="w-[15.5rem] self-start rounded-xl bg-white px-4 py-2 text-right shadow-sm ring-1 ring-slate-200 md:self-auto">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Expected Cash
              </p>
              <p className="mt-1 text-[1.45rem] font-bold leading-none tabular-nums text-primary">
                Rs. {expectedCash.toLocaleString()}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <DenominationCounter initialCounts={initialCounts} onChange={handleCountChange} />
        </div>

        {total > 0 && (
          <div
            className={`rounded-xl p-3 text-center ${
              Math.abs(total - expectedCash) === 0
                ? "bg-success/10"
                : total < expectedCash
                  ? "bg-destructive/10"
                  : "bg-warning/10"
            }`}
          >
            <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider">
              {total === expectedCash ? "Balanced" : total < expectedCash ? "Short" : "Excess"}
            </p>
            <p
              className={`text-lg font-bold tabular-nums ${
                total === expectedCash
                  ? "text-success"
                  : total < expectedCash
                    ? "text-destructive"
                    : "text-warning"
              }`}
            >
              {total === expectedCash
                ? "Check Rs. 0"
                : `${total < expectedCash ? "-" : "+"} Rs. ${Math.abs(total - expectedCash).toLocaleString()}`}
            </p>
          </div>
        )}

        <DialogFooter className="flex-row justify-start items-center border-t border-slate-300 bg-slate-100 gap-2 px-6 py-3 sm:justify-start sm:space-x-0">
          <Button variant="outline" onClick={handleCancel} className="h-10 rounded-xl px-5">
            Cancel
          </Button>
          <Button
            variant="pos-primary"
            className="h-10 rounded-xl px-5"
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

export default ClosingCashDialog;
