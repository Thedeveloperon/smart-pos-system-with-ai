import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Banknote, CheckCircle2 } from "lucide-react";
import DenominationCounter from "./DenominationCounter";
import type { DenominationCount } from "./types";

interface CashReceivedDialogProps {
  open: boolean;
  expectedCash: number;
  onClose: () => void;
  onConfirm: (counts: DenominationCount[], total: number) => void;
  onTotalChange?: (total: number) => void;
}

const CashReceivedDialog = ({
  open,
  expectedCash,
  onClose,
  onConfirm,
  onTotalChange,
}: CashReceivedDialogProps) => {
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
      <DialogContent className="flex max-h-[96vh] w-[min(98vw,80rem)] flex-col overflow-hidden rounded-3xl border-border/70 p-0 shadow-2xl sm:max-w-none md:w-[min(96vw,84rem)]">
        <div className="flex max-h-[96vh] min-h-0 flex-col bg-gradient-to-b from-slate-50 via-white to-slate-100">
          <DialogHeader className="border-b border-border/60 bg-background/95 px-4 py-4 pr-16 backdrop-blur-sm sm:px-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <DialogTitle className="flex items-center gap-3 text-xl font-bold tracking-tight sm:text-2xl">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
                    <Banknote className="h-5 w-5" />
                  </span>
                  Count Cash Received
                </DialogTitle>
                <DialogDescription className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Count the cash given by the customer. The amount will fill the cash received field automatically.
                </DialogDescription>
              </div>

              <div className="self-start rounded-2xl bg-muted px-4 py-3 text-right shadow-inner md:self-auto">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Target
                </p>
                <p className="mt-1 text-2xl font-black tabular-nums text-foreground sm:text-[2rem]">
                  Rs. {expectedCash.toLocaleString()}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 py-4 sm:px-6 sm:py-5">
            <div className="min-h-0 flex-1 overflow-hidden">
              <DenominationCounter key={resetKey} onChange={handleCountChange} />
            </div>

          </div>
        </div>

        <div className="border-t border-border/70 bg-background/95 px-4 py-2.5 backdrop-blur-sm pb-[env(safe-area-inset-bottom)] sm:px-6">
          <div className="flex flex-col gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700/80">
                  Ready to proceed
                </p>
                <p className="mt-0.5 text-[11px] text-emerald-900/70">
                  The cashier field will receive the counted total.
                </p>
              </div>
              <p className="text-xl font-black tabular-nums text-emerald-600 sm:text-2xl">
                Rs. {total.toLocaleString()}
              </p>
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <Button
                variant="outline"
                onClick={onClose}
                className="h-11 rounded-2xl border-border/80 bg-background px-4 text-sm font-semibold shadow-sm sm:w-28"
              >
                Cancel
              </Button>
              <Button
                variant="pos-primary"
                size="xl"
                className="h-11 flex-1 rounded-2xl border border-emerald-300 bg-emerald-600 px-4 text-sm font-bold text-white shadow-[0_12px_28px_rgba(16,185,129,0.35)] transition-all hover:bg-emerald-500 hover:shadow-[0_14px_32px_rgba(16,185,129,0.42)] focus-visible:ring-emerald-400 sm:flex-none sm:w-[16rem]"
                onClick={handleProceed}
              >
                <CheckCircle2 className="h-5 w-5" />
                Proceed - Rs. {total.toLocaleString()}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CashReceivedDialog;
