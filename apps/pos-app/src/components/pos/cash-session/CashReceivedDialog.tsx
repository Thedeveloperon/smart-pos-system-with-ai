import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Banknote, CheckCircle2 } from "lucide-react";
import { playCashCountSound, primeConfirmationSound } from "@/lib/sound";
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
      onTotalChange?.(0);
      setResetKey((value) => value + 1);
    }
  }, [open]);

  const handleCountChange = (newCounts: DenominationCount[], newTotal: number) => {
    setCounts(newCounts);
    setTotal(newTotal);
    onTotalChange?.(newTotal);
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
            <div className="min-h-0 flex-1 overflow-hidden">
              <DenominationCounter
                key={resetKey}
                onChange={handleCountChange}
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
              <p className="text-lg font-bold tabular-nums text-slate-800 sm:ml-auto sm:text-xl">
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
