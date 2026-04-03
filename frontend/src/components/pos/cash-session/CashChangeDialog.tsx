import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { Banknote, Coins, CheckCircle2 } from "lucide-react";
import { buildChangeBreakdown, splitChangeBreakdown } from "./changeBreakdown";
import DenominationCounter from "./DenominationCounter";
import type { DenominationCount } from "./types";

interface CashChangeDialogProps {
  open: boolean;
  changeAmount: number;
  availableCounts?: DenominationCount[];
  onClose: () => void;
  onConfirm: (counts: DenominationCount[]) => void;
}

const CashChangeDialog = ({
  open,
  changeAmount,
  availableCounts = [],
  onClose,
  onConfirm,
}: CashChangeDialogProps) => {
  const normalizedChange = Math.max(0, Math.round(changeAmount));
  const availableCountsKey = useMemo(
    () => availableCounts.map((count) => `${count.denomination}:${count.quantity}`).join("|"),
    [availableCounts],
  );
  const breakdown = useMemo(
    () => buildChangeBreakdown(normalizedChange, availableCounts),
    [availableCountsKey, normalizedChange],
  );
  const { notes, coins } = splitChangeBreakdown(breakdown);
  const allocatedChange = breakdown.reduce(
    (sum, count) => sum + count.denomination * count.quantity,
    0,
  );
  const hasBalanceToReturn = normalizedChange > 0;
  const isFullyCovered = hasBalanceToReturn && allocatedChange >= normalizedChange;
  const needsManualAdjustment = hasBalanceToReturn && !isFullyCovered;
  const [manualCounts, setManualCounts] = useState<DenominationCount[]>(breakdown);
  const [manualTotal, setManualTotal] = useState(allocatedChange);

  useEffect(() => {
    if (!open || !needsManualAdjustment) {
      return;
    }

    setManualCounts(breakdown);
    setManualTotal(allocatedChange);
  }, [allocatedChange, breakdown, needsManualAdjustment, open]);

  const selectedCounts = needsManualAdjustment ? manualCounts : breakdown;
  const selectedTotal = needsManualAdjustment ? manualTotal : allocatedChange;
  const canProceed = !hasBalanceToReturn || !needsManualAdjustment || manualTotal === normalizedChange;

  const renderEntry = (denomination: number, quantity: number) => (
    <div
      key={denomination}
      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
    >
      <div className="flex items-center gap-2">
        {denomination > 10 ? (
          <Banknote className="h-4 w-4 text-slate-500" />
        ) : (
          <Coins className="h-4 w-4 text-slate-500" />
        )}
        <span className="text-sm font-medium text-slate-700">Rs.{denomination.toLocaleString()}</span>
      </div>
      <span className="text-sm font-semibold tabular-nums text-slate-800">
        x {quantity}
      </span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[92vh] w-[min(96vw,52rem)] overflow-hidden rounded-2xl border border-slate-300 bg-[#f7f8fa] p-0 shadow-xl sm:max-w-3xl">
        <div className="flex max-h-[92vh] min-h-0 flex-col">
          <DialogHeader className="border-b border-slate-300 px-6 py-4 pr-14">
            <DialogTitle className="text-[1.5rem] font-semibold tracking-tight text-slate-800">
              Change breakdown
            </DialogTitle>
            <DialogDescription>
              Review the note and coin payout before completing the sale.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-4">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Balance to return
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-primary">
                Rs. {normalizedChange.toLocaleString()}
              </p>
              {isFullyCovered ? (
                <p className="mt-1 text-xs text-emerald-600">
                  This breakdown uses the available drawer notes and coins.
                </p>
              ) : needsManualAdjustment ? (
                <p className="mt-1 text-xs text-destructive">
                  The drawer does not currently have enough denominations for the full amount.
                  Adjust the notes and coins below to match the balance to return.
                </p>
              ) : null}
            </div>

            {needsManualAdjustment ? (
              <div className="min-h-0 flex-1 rounded-2xl border border-slate-300 bg-white p-3">
                <DenominationCounter
                  key={`${normalizedChange}-${availableCountsKey}`}
                  initialCounts={breakdown}
                  onChange={(counts, total) => {
                    setManualCounts(counts);
                    setManualTotal(total);
                  }}
                />
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <p className="font-medium text-slate-700">
                    Selected total: Rs. {selectedTotal.toLocaleString()}
                  </p>
                  <p
                    className={`mt-1 text-xs ${
                      manualTotal === normalizedChange ? "text-emerald-600" : "text-destructive"
                    }`}
                  >
                    {manualTotal === normalizedChange
                      ? "The selected notes and coins match the balance to return."
                      : "Adjust the counts until the selected total matches the balance to return."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
                <section className="flex min-h-0 flex-col rounded-2xl border border-slate-300 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-slate-500" />
                    <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-slate-600">
                      Notes
                    </h3>
                  </div>
                  <div className="grid flex-1 min-h-0 auto-rows-min gap-2 overflow-y-auto pr-1">
                    {notes.length > 0 ? (
                      notes.map((count) => renderEntry(count.denomination, count.quantity))
                    ) : (
                      <p className="text-sm text-muted-foreground">No notes required.</p>
                    )}
                  </div>
                </section>

                <section className="flex min-h-0 flex-col rounded-2xl border border-slate-300 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Coins className="h-4 w-4 text-slate-500" />
                    <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-slate-600">
                      Coins
                    </h3>
                  </div>
                  <div className="grid flex-1 min-h-0 auto-rows-min gap-2 overflow-y-auto pr-1">
                    {coins.length > 0 ? (
                      coins.map((count) => renderEntry(count.denomination, count.quantity))
                    ) : (
                      <p className="text-sm text-muted-foreground">No coins required.</p>
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-slate-300 bg-slate-100 px-6 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
            <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="outline"
                onClick={onClose}
                className="h-10 rounded-xl border-slate-300 bg-white px-4 text-[0.95rem] font-semibold sm:w-28"
              >
                Cancel
              </Button>
              <Button
                variant="pos-primary"
                onClick={() => onConfirm(selectedCounts)}
                disabled={!canProceed}
                className="h-10 rounded-xl border border-primary bg-primary px-4 text-[0.95rem] font-bold text-white sm:w-[18rem]"
              >
                <CheckCircle2 className="h-5 w-5" />
                Proceed - Rs. {normalizedChange.toLocaleString()}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CashChangeDialog;
