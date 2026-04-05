import { useEffect, useMemo, useState } from "react";
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
import type { CashSession, DenominationCount } from "./types";

interface OpeningCashDialogProps {
  open: boolean;
  cashierName: string;
  initialCounts?: DenominationCount[];
  previousSession?: CashSession | null;
  onConfirm: (counts: DenominationCount[], total: number, cashierName: string) => Promise<void> | void;
}

const OpeningCashDialog = ({
  open,
  cashierName,
  initialCounts,
  previousSession,
  onConfirm,
}: OpeningCashDialogProps) => {
  const [counts, setCounts] = useState<DenominationCount[]>([]);
  const [total, setTotal] = useState(0);
  const [enteredCashierName, setEnteredCashierName] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [cashierNameError, setCashierNameError] = useState<string | null>(null);

  const previousClosingDifference = previousSession?.difference ?? null;
  const previousClosingTotal = previousSession?.closing?.total ?? previousSession?.opening.total ?? null;
  const previousExpectedCash = previousSession?.expectedCash ?? null;
  const derivedDifference =
    previousClosingDifference ??
    (previousClosingTotal !== null && previousExpectedCash !== null
      ? previousClosingTotal - previousExpectedCash
      : null);
  const hasPreviousShortage = derivedDifference !== null && derivedDifference < 0;
  const shortageAmount = hasPreviousShortage && derivedDifference !== null ? Math.abs(derivedDifference) : 0;

  const prefillingMessage = useMemo(() => {
    if (!previousSession) {
      return null;
    }

    if (hasPreviousShortage) {
      return `Prefilled from the previous closing cash count. That shift closed short by Rs. ${shortageAmount.toLocaleString()} against expected cash.`;
    }

    return "Prefilled from the previous closing cash count. You can edit the notes and coins before starting the new shift.";
  }, [hasPreviousShortage, previousSession, shortageAmount]);

  useEffect(() => {
    if (open) {
      setEnteredCashierName("");
      const startingCounts = initialCounts ?? [];
      const startingTotal = startingCounts.reduce(
        (sum, count) => sum + count.denomination * count.quantity,
        0,
      );
      setCounts(startingCounts);
      setTotal(startingTotal);
      setShowConfirm(false);
      setCashierNameError(null);
    }
  }, [open, initialCounts]);

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
              {previousSession ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Previous closing</span>
                    <span className="font-medium tabular-nums">
                      Rs. {previousClosingTotal?.toLocaleString() ?? "0"}
                    </span>
                  </div>
                  {previousExpectedCash !== null ? (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Expected cash</span>
                      <span className="font-medium tabular-nums">
                        Rs. {previousExpectedCash.toLocaleString()}
                      </span>
                    </div>
                  ) : null}
                  {derivedDifference !== null ? (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Variance</span>
                      <span
                        className={`font-medium tabular-nums ${
                          derivedDifference < 0 ? "text-destructive" : derivedDifference > 0 ? "text-warning" : "text-success"
                        }`}
                      >
                        {derivedDifference === 0
                          ? "Rs. 0"
                          : `${derivedDifference < 0 ? "-" : "+"}Rs. ${Math.abs(derivedDifference).toLocaleString()}`}
                      </span>
                    </div>
                  ) : null}
                </>
              ) : null}
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

            {prefillingMessage ? (
              <div
                className={`flex items-start gap-2 rounded-xl border p-3 ${
                  hasPreviousShortage
                    ? "border-amber-300 bg-amber-50"
                    : "border-primary/20 bg-primary/5"
                }`}
              >
                <AlertTriangle
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    hasPreviousShortage ? "text-amber-600" : "text-primary"
                  }`}
                />
                <p className={`text-xs ${hasPreviousShortage ? "text-amber-900" : "text-slate-700"}`}>
                  {prefillingMessage}
                </p>
              </div>
            ) : null}

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
          {prefillingMessage ? (
            <div
              className={`mb-4 flex items-start gap-2 rounded-xl border p-3 ${
                hasPreviousShortage
                  ? "border-amber-300 bg-amber-50"
                  : "border-primary/20 bg-primary/5"
              }`}
            >
              <AlertTriangle
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  hasPreviousShortage ? "text-amber-600" : "text-primary"
                }`}
              />
              <div className="min-w-0">
                <p className={`text-xs font-semibold uppercase tracking-wide ${hasPreviousShortage ? "text-amber-800" : "text-primary"}`}>
                  {hasPreviousShortage ? "Previous shift shortage" : "Prefilled from previous shift"}
                </p>
                <p className={`text-xs ${hasPreviousShortage ? "text-amber-900" : "text-slate-700"}`}>
                  {prefillingMessage}
                </p>
              </div>
            </div>
          ) : null}
          <DenominationCounter initialCounts={initialCounts} onChange={handleCountChange} />
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
