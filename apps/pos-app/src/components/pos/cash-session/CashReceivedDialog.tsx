import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Banknote, CheckCircle2 } from "lucide-react";
import { playCashCountSound, primeConfirmationSound } from "@/lib/sound";
import DenominationCounter from "./DenominationCounter";
import type { DenominationCount } from "./types";
import {
  buildTopUpCounts,
  getDrawerChangeSuggestion,
  getExactChangeBreakdown,
  mergeDenominationCounts,
  type OptionalPayoutSuggestion,
} from "./changeBreakdown";

interface CashReceivedDialogProps {
  open: boolean;
  expectedCash: number;
  availableCounts?: DenominationCount[];
  onClose: () => void;
  onConfirm: (counts: DenominationCount[], total: number) => void;
  onTotalChange?: (total: number) => void;
}

const CashReceivedDialog = ({
  open,
  expectedCash,
  availableCounts = [],
  onClose,
  onConfirm,
  onTotalChange,
}: CashReceivedDialogProps) => {
  const [counts, setCounts] = useState<DenominationCount[]>([]);
  const [total, setTotal] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [flashTotal, setFlashTotal] = useState(false);
  const [flashDenominations, setFlashDenominations] = useState<number[]>([]);
  const [appliedSuggestion, setAppliedSuggestion] = useState<OptionalPayoutSuggestion | null>(null);
  const onTotalChangeRef = useRef(onTotalChange);
  const appliedSuggestionKeyRef = useRef<string | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const availableCountsKey = useMemo(
    () => availableCounts.map((count) => `${count.denomination}:${count.quantity}`).join("|"),
    [availableCounts],
  );
  const changeDue = Math.max(0, Math.round(total - expectedCash));
  const exactChangeBreakdown = useMemo(
    () => (changeDue > 0 ? getExactChangeBreakdown(changeDue, availableCounts) : null),
    [availableCounts, changeDue],
  );
  const drawerSuggestion = useMemo(
    () => (changeDue > 0 && !exactChangeBreakdown ? getDrawerChangeSuggestion(changeDue, availableCounts) : null),
    [availableCounts, changeDue, exactChangeBreakdown],
  );

  useEffect(() => {
    onTotalChangeRef.current = onTotalChange;
  }, [onTotalChange]);

  useEffect(() => {
    if (open) {
      setCounts([]);
      setTotal(0);
      onTotalChangeRef.current?.(0);
      setResetKey((value) => value + 1);
      setFlashTotal(false);
      setFlashDenominations([]);
      setAppliedSuggestion(null);
      appliedSuggestionKeyRef.current = null;
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open || !drawerSuggestion) {
      return;
    }

    const suggestionKey = `${availableCountsKey}:${changeDue}:${drawerSuggestion.payoutAmount}`;
    if (appliedSuggestionKeyRef.current === suggestionKey) {
      return;
    }

    appliedSuggestionKeyRef.current = suggestionKey;

    const topUpCounts = buildTopUpCounts(drawerSuggestion.requestAmount);
    const nextCounts = mergeDenominationCounts(counts, topUpCounts);
    const nextTotal = total + drawerSuggestion.requestAmount;

    setCounts(nextCounts);
    setTotal(nextTotal);
    onTotalChangeRef.current?.(nextTotal);
    setResetKey((value) => value + 1);
    setFlashDenominations(topUpCounts.filter((count) => count.quantity > 0).map((count) => count.denomination));
    setFlashTotal(true);
    setAppliedSuggestion(drawerSuggestion);

    if (flashTimerRef.current !== null) {
      window.clearTimeout(flashTimerRef.current);
    }

    flashTimerRef.current = window.setTimeout(() => {
      setFlashTotal(false);
      setFlashDenominations([]);
      flashTimerRef.current = null;
    }, 900);
  }, [availableCountsKey, changeDue, counts, drawerSuggestion, open, total]);

  const handleCountChange = (newCounts: DenominationCount[], newTotal: number) => {
    setCounts(newCounts);
    setTotal(newTotal);
    onTotalChangeRef.current?.(newTotal);
  };

  const handleProceed = () => {
    void playCashCountSound();
    onConfirm(counts, total);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,56rem)] flex-col overflow-hidden rounded-2xl border border-slate-300 bg-[#f7f8fa] p-0 shadow-xl sm:max-w-4xl">
        <div className="flex max-h-[96vh] min-h-0 flex-col">
          <DialogHeader className="border-b border-slate-300 bg-transparent px-6 py-4 pr-14">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <DialogTitle className="flex items-center gap-3 text-[1.6rem] font-semibold tracking-tight text-slate-800 sm:text-[1.75rem]">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Banknote className="h-5 w-5" />
                  </span>
                  Count Cash Received
                </DialogTitle>
              </div>

              <div className="w-[15.5rem] self-start rounded-xl bg-white px-4 py-2 text-right shadow-sm ring-1 ring-slate-200 md:self-auto">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Target
                </p>
                <p className="mt-1 text-[1.45rem] font-bold leading-none tabular-nums text-primary">
                  Rs. {expectedCash.toLocaleString()}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-4">
            {changeDue > 0 ? (
              <div
                className={`rounded-2xl border px-4 py-3 ${
                  exactChangeBreakdown
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-amber-300 bg-amber-50"
                }`}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      exactChangeBreakdown ? "text-emerald-600" : "text-amber-600"
                    }`}
                  />
                  <div className="min-w-0">
                    <p
                      className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                        exactChangeBreakdown ? "text-emerald-700" : "text-amber-800"
                      }`}
                    >
                      {exactChangeBreakdown ? "Change available" : "Insufficient change available"}
                    </p>
                    {exactChangeBreakdown ? (
                      <p className="mt-1 text-sm text-emerald-800">
                        The drawer can return the current balance with the available denominations.
                      </p>
                    ) : drawerSuggestion ? (
                      <p className="mt-1 text-sm text-amber-900">
                        Insufficient change available. Please request{" "}
                        <span className="font-semibold tabular-nums animate-pulse text-amber-700">
                          Rs. {drawerSuggestion.requestAmount.toLocaleString()}
                        </span>{" "}
                        from the customer and return{" "}
                        <span className="font-semibold tabular-nums animate-pulse text-amber-700">
                          Rs. {drawerSuggestion.payoutAmount.toLocaleString()}
                        </span>{" "}
                        instead.
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-red-700">
                        Insufficient change available in the drawer. Please choose another cash amount.
                      </p>
                    )}
                    {!exactChangeBreakdown && drawerSuggestion ? (
                      <p className="mt-1 text-xs text-amber-700">
                        The cash total has been updated automatically.
                      </p>
                    ) : null}
                    {appliedSuggestion ? (
                      <p className="mt-2 inline-flex rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 animate-pulse">
                        Auto-added Rs. {appliedSuggestion.requestAmount.toLocaleString()} to match Rs. {appliedSuggestion.payoutAmount.toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-hidden">
              <DenominationCounter
                key={resetKey}
                initialCounts={counts}
                onChange={handleCountChange}
                flashDenominations={flashDenominations}
              />
            </div>

          </div>
        </div>

        <div className="border-t border-slate-300 bg-slate-100 px-6 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <div className="px-0 py-0">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="h-10 rounded-xl border-slate-300 bg-white px-4 text-[0.95rem] font-semibold sm:w-28"
                >
                  Cancel
                </Button>
                <Button
                  variant="pos-primary"
                  size="xl"
                  className="h-10 flex-1 rounded-xl border border-primary bg-primary px-4 text-[0.95rem] font-bold text-white sm:flex-none sm:w-[16rem]"
                  onPointerDown={() => {
                    void primeConfirmationSound();
                  }}
                  onClick={handleProceed}
                >
                  <CheckCircle2 className="h-5 w-5" />
                  Proceed - Rs. {total.toLocaleString()}
                </Button>
              </div>
              <p
                className={`text-lg font-bold tabular-nums text-slate-800 sm:ml-auto sm:text-xl ${
                  flashTotal ? "animate-pulse text-amber-700" : ""
                }`}
              >
                Rs. {total.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CashReceivedDialog;
