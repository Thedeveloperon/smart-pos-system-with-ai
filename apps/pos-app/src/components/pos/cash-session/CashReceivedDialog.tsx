import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Banknote, CheckCircle2 } from "lucide-react";
import { playCashCountSound, primeConfirmationSound } from "@/lib/sound";
import DenominationCounter from "./DenominationCounter";
import type { DenominationCount } from "./types";
import {
  getExactChangeBreakdown,
  getDrawerChangeNotice,
  buildTopUpCounts,
  mergeDenominationCounts,
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
  const [suggestionMessage, setSuggestionMessage] = useState<string | null>(null);
  const [flashDenominations, setFlashDenominations] = useState<number[]>([]);
  const onTotalChangeRef = useRef(onTotalChange);
  const hasAppliedSuggestionRef = useRef(false);
  const changeDue = Math.max(0, Math.round(total - expectedCash));
  const exactChangeBreakdown = useMemo(
    () => (changeDue > 0 ? getExactChangeBreakdown(changeDue, availableCounts) : null),
    [availableCounts, changeDue],
  );
  const drawerNotice = useMemo(
    () => (changeDue > 0 && !exactChangeBreakdown ? getDrawerChangeNotice(changeDue, availableCounts) : null),
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
      setSuggestionMessage(null);
      setFlashDenominations([]);
      hasAppliedSuggestionRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !drawerNotice?.suggestion || hasAppliedSuggestionRef.current) {
      return;
    }

    const topUpCounts = buildTopUpCounts(drawerNotice.suggestion.requestAmount);
    const nextCounts = mergeDenominationCounts(counts, topUpCounts);
    const nextTotal = total + drawerNotice.suggestion.requestAmount;
    const flashedDenominations = topUpCounts
      .filter((count) => count.quantity > 0)
      .map((count) => count.denomination);

    setCounts(nextCounts);
    setTotal(nextTotal);
    onTotalChangeRef.current?.(nextTotal);
    setResetKey((value) => value + 1);
    setSuggestionMessage(drawerNotice.message);
    setFlashDenominations(flashedDenominations);
    hasAppliedSuggestionRef.current = true;
  }, [changeDue, counts, drawerNotice, open, total]);

  const handleCountChange = (newCounts: DenominationCount[], newTotal: number) => {
    setCounts(newCounts);
    setTotal(newTotal);
    onTotalChangeRef.current?.(newTotal);
    setSuggestionMessage(null);
    setFlashDenominations([]);
  };

  const handleProceed = () => {
    void playCashCountSound();
    onConfirm(counts, total);
  };

  const canReturnSelectedBalance = changeDue > 0 && !!exactChangeBreakdown;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="flex max-h-[94vh] w-[min(98vw,80rem)] flex-col overflow-hidden rounded-[2rem] border border-emerald-100 bg-[#fbfefb] p-0 shadow-2xl sm:max-w-6xl">
        <div className="flex max-h-[96vh] min-h-0 flex-col">
          <DialogHeader className="border-b border-emerald-100 bg-transparent px-6 py-5 pr-14 md:px-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <DialogTitle className="flex items-center gap-4 text-[1.85rem] font-semibold tracking-tight text-slate-900 sm:text-[2.1rem]">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-primary ring-1 ring-emerald-100">
                    <Banknote className="h-6 w-6" />
                  </span>
                  Count Cash Received
                </DialogTitle>
                <DialogDescription className="mt-2 pl-16 text-base text-slate-500">
                  Count the cash received from the customer.
                </DialogDescription>
              </div>

              <div className="w-full max-w-[16rem] self-start rounded-2xl border border-emerald-100 bg-[#f7fdf9] px-5 py-4 text-right shadow-sm md:self-auto">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Target
                </p>
                <p className="mt-2 text-[1.9rem] font-bold leading-none tabular-nums text-primary">
                  Rs. {expectedCash.toLocaleString()}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 md:px-8">
            {changeDue > 0 ? (
              <div
                className={`rounded-2xl border px-4 py-3 shadow-sm ${
                  canReturnSelectedBalance
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-amber-200 bg-amber-50"
                }`}
              >
                <div className="flex items-start gap-2">
                  {canReturnSelectedBalance ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  )}
                  <div className="min-w-0">
                    <p
                      className={`text-xs font-semibold uppercase tracking-[0.22em] ${
                        canReturnSelectedBalance ? "text-emerald-700" : "text-amber-800"
                      }`}
                    >
                      {canReturnSelectedBalance ? "Change available" : "Insufficient change available"}
                    </p>
                    {suggestionMessage ? (
                      <p className="mt-1 text-sm text-amber-900">{suggestionMessage}</p>
                    ) : canReturnSelectedBalance ? (
                      <p className="mt-1 text-sm text-emerald-800">
                        The drawer can return the current balance with the available denominations.
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-red-700">
                        Insufficient change available in the drawer. Please choose another cash amount.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-4">
              <DenominationCounter
                key={resetKey}
                initialCounts={counts}
                onChange={handleCountChange}
                flashDenominations={flashDenominations}
                variant="visual"
              />
            </div>

          </div>
        </div>

        <div className="border-t border-emerald-100 bg-white/90 px-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+0.9rem)] md:px-8">
          <div className="px-0 py-0">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="h-12 rounded-2xl border-slate-200 bg-white px-6 text-[0.95rem] font-semibold sm:w-32"
                >
                  Cancel
                </Button>
                <Button
                  variant="pos-primary"
                  size="xl"
                  className="h-12 flex-1 rounded-2xl border border-primary bg-primary px-5 text-[1rem] font-bold text-white sm:flex-none sm:min-w-[20rem]"
                  onPointerDown={() => {
                    void primeConfirmationSound();
                  }}
                  onClick={handleProceed}
                >
                  <CheckCircle2 className="h-5 w-5" />
                  Proceed - Rs. {total.toLocaleString()}
                </Button>
              </div>
              <div className="w-full rounded-2xl border border-emerald-100 bg-[#f7fdf9] px-5 py-3 text-right shadow-sm xl:max-w-[17rem]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Grand total
                </p>
                <p className="mt-2 text-[1.9rem] font-bold leading-none tabular-nums text-primary">
                  Rs. {total.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CashReceivedDialog;
