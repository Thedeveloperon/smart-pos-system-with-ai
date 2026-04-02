import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Banknote, Coins, Save } from "lucide-react";
import DenominationCounter from "./DenominationCounter";
import type { CashSession, DenominationCount } from "./types";

interface ManageDrawerDialogProps {
  open: boolean;
  session: CashSession | null;
  onClose: () => void;
  onSave: (counts: DenominationCount[], total: number) => Promise<void>;
}

const ManageDrawerDialog = ({ open, session, onClose, onSave }: ManageDrawerDialogProps) => {
  const [counts, setCounts] = useState<DenominationCount[]>([]);
  const [total, setTotal] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const currentCounts = session?.drawer.counts ?? session?.opening.counts ?? [];
    const currentTotal = session?.drawer.total ?? session?.opening.total ?? 0;
    setCounts(currentCounts);
    setTotal(currentTotal);
    setResetKey((value) => value + 1);
  }, [open, session]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await onSave(counts, total);
    } finally {
      setIsSaving(false);
    }
  };

  const openingCounts = session?.opening.counts ?? [];
  const expectedCash = (session?.opening.total ?? 0) + (session?.cashSalesTotal ?? 0);
  const cashBalance = total - expectedCash;
  const noteCount = counts
    .filter((count) => count.denomination > 10)
    .reduce((sum, count) => sum + count.quantity, 0);
  const coinCount = counts
    .filter((count) => count.denomination <= 10)
    .reduce((sum, count) => sum + count.quantity, 0);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,56rem)] flex-col overflow-hidden rounded-2xl border border-slate-300 bg-[#f7f8fa] p-0 shadow-xl sm:max-w-4xl">
        <DialogHeader className="border-b border-slate-300 bg-transparent px-6 py-4 pr-14">
          <DialogTitle className="flex items-center gap-3 text-[1.6rem] font-semibold tracking-tight text-slate-800">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Banknote className="h-5 w-5" />
            </span>
            Check Drawer
          </DialogTitle>
          <DialogDescription>
            Review the current drawer balance, then update the note and coin counts if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4 pr-4 scrollbar-thin">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Cash balance
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-primary">
                Rs. {total.toLocaleString()}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Expected cash
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-800">
                Rs. {expectedCash.toLocaleString()}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Notes available
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-800">
                {noteCount.toLocaleString()}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Coins available
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-800">
                {coinCount.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Last updated
            </p>
            <p className="mt-1 text-sm font-medium text-slate-700">
              {session?.drawer.updatedAt ? session.drawer.updatedAt.toLocaleString() : "Not updated yet"}
            </p>
            <p className={`mt-1 text-xs ${cashBalance >= 0 ? "text-emerald-600" : "text-destructive"}`}>
              Variance vs expected: Rs. {cashBalance.toLocaleString()}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-300 bg-white p-3">
            <DenominationCounter
              key={resetKey}
              initialCounts={counts.length > 0 ? counts : openingCounts}
              onChange={(nextCounts, nextTotal) => {
                setCounts(nextCounts);
                setTotal(nextTotal);
              }}
            />
          </div>
        </div>

        <DialogFooter className="border-t border-slate-300 bg-slate-100 px-6 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Coins className="h-4 w-4" />
              <span className="tabular-nums">Rs. {total.toLocaleString()}</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={onClose}
                className="h-10 rounded-xl border-slate-300 bg-white px-4 text-[0.95rem] font-semibold"
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                variant="pos-primary"
                onClick={() => {
                  void handleSave();
                }}
                className="h-10 rounded-xl border border-primary bg-primary px-4 text-[0.95rem] font-bold text-white"
                disabled={isSaving}
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Saving..." : "Save drawer"}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ManageDrawerDialog;
