import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, Coins, CheckCircle2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  buildChangeBreakdown,
  getDenominationShortages,
  getOptionalPayoutSuggestion,
  splitChangeBreakdown,
} from "./changeBreakdown";
import DenominationCounter from "./DenominationCounter";
import { SRI_LANKAN_DENOMINATIONS, type DenominationCount } from "./types";

interface CashChangeDialogProps {
  open: boolean;
  changeAmount: number;
  availableCounts?: DenominationCount[];
  allowCustomPayout?: boolean;
  onClose: () => void;
  onConfirm: (counts: DenominationCount[], customPayoutUsed: boolean, cashShortAmount: number) => void;
}

const CASH_DRAWER_SHORTAGE_MESSAGE =
  "Cash drawer does not have enough denominations for this transaction.";

const DENOMINATION_BY_VALUE = new Map(
  SRI_LANKAN_DENOMINATIONS.map((denomination) => [denomination.value, denomination]),
);

const CashChangeDialog = ({
  open,
  changeAmount,
  availableCounts = [],
  allowCustomPayout = false,
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
  const notesTotal = notes.reduce(
    (sum, count) => sum + count.denomination * count.quantity,
    0,
  );
  const coinsTotal = coins.reduce(
    (sum, count) => sum + count.denomination * count.quantity,
    0,
  );
  const allocatedChange = breakdown.reduce(
    (sum, count) => sum + count.denomination * count.quantity,
    0,
  );
  const hasBalanceToReturn = normalizedChange > 0;
  const isFullyCovered = hasBalanceToReturn && allocatedChange >= normalizedChange;
  const needsManualAdjustment = hasBalanceToReturn && !isFullyCovered;
  const [isCustomPayoutEnabled, setIsCustomPayoutEnabled] = useState(false);
  const [manualCounts, setManualCounts] = useState<DenominationCount[]>(breakdown);
  const [manualTotal, setManualTotal] = useState(allocatedChange);

  useEffect(() => {
    if (!open) {
      return;
    }

    setIsCustomPayoutEnabled(false);
    setManualCounts(breakdown);
    setManualTotal(allocatedChange);
  }, [allocatedChange, breakdown, open]);

  const isCustomMode = allowCustomPayout && isCustomPayoutEnabled;
  const showEditableCounter = needsManualAdjustment || isCustomMode;
  const selectedCounts = showEditableCounter ? manualCounts : breakdown;
  const selectedTotal = showEditableCounter ? manualTotal : allocatedChange;
  const selectedShortages = useMemo(
    () => getDenominationShortages(selectedCounts, availableCounts),
    [availableCountsKey, selectedCounts],
  );
  const optionalPayoutSuggestion = useMemo(
    () => getOptionalPayoutSuggestion(normalizedChange),
    [normalizedChange],
  );
  const hasDenominationShortage = selectedShortages.length > 0;
  const shortageDenominations = useMemo(
    () => selectedShortages.map((item) => item.denomination),
    [selectedShortages],
  );
  const isExactMatch = selectedTotal === normalizedChange;
  const canProceed = !hasBalanceToReturn || !showEditableCounter || isCustomMode || isExactMatch;

  const renderEntry = (denomination: number, quantity: number) => {
    const denominationMeta = DENOMINATION_BY_VALUE.get(denomination);
    const itemTotal = denomination * quantity;

    return (
      <div
        key={denomination}
        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
      >
        <div className="flex min-w-0 items-center gap-3">
          {denominationMeta ? (
            <div
              className={cn(
                "flex shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-white shadow-sm",
                denominationMeta.kind === "note"
                  ? "h-14 w-20 rounded-2xl p-1.5"
                  : "h-14 w-14 rounded-full p-1.5",
              )}
            >
              <img
                src={denominationMeta.imagePath}
                alt={`Sri Lankan Rs. ${denominationMeta.label} ${denominationMeta.kind}`}
                className={cn(
                  "object-contain",
                  denominationMeta.kind === "note" ? "h-full w-full" : "h-12 w-12",
                )}
              />
            </div>
          ) : denomination > 10 ? (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-primary ring-1 ring-emerald-100">
              <Banknote className="h-5 w-5" />
            </span>
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-primary ring-1 ring-emerald-100">
              <Coins className="h-5 w-5" />
            </span>
          )}

          <div className="min-w-0">
            <p className="text-base font-semibold leading-none tracking-tight text-slate-900">
              Rs.{denominationMeta?.label ?? denomination.toLocaleString()}
            </p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {denominationMeta?.kind ?? (denomination > 10 ? "note" : "coin")}
            </p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <span className="inline-flex min-w-[3.25rem] items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-sm font-semibold tabular-nums text-primary">
            x {quantity}
          </span>
          <p className="mt-2 text-sm font-semibold tabular-nums text-slate-700">
            Rs. {itemTotal.toLocaleString()}
          </p>
        </div>
      </div>
    );
  };

  const renderBreakdownSection = (
    title: string,
    items: DenominationCount[],
    total: number,
    Icon: typeof Banknote,
    emptyMessage: string,
  ) => (
    <section className="flex min-h-0 flex-col rounded-[1.75rem] border border-slate-200 bg-white/90 p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-primary ring-1 ring-emerald-100">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
              {title}
            </h3>
            <p className="text-xs text-slate-500">Sri Lankan denominations</p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-sm font-semibold text-slate-600">{items.length} items</p>
          <p className="text-xs tabular-nums text-slate-500">Rs. {total.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {items.length > 0 ? (
          items.map((count) => renderEntry(count.denomination, count.quantity))
        ) : (
          <div className="flex min-h-[10rem] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 text-center text-sm text-slate-500">
            {emptyMessage}
          </div>
        )}
      </div>
    </section>
  );

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="flex max-h-[94vh] w-[min(98vw,74rem)] flex-col overflow-hidden rounded-[2rem] border border-emerald-100 bg-[#fbfefb] p-0 shadow-2xl sm:max-w-5xl">
        <div className="flex max-h-[96vh] min-h-0 flex-col">
          <DialogHeader className="border-b border-emerald-100 bg-transparent px-6 py-5 pr-14 md:px-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <DialogTitle className="flex items-center gap-4 text-[1.85rem] font-semibold tracking-tight text-slate-900 sm:text-[2.1rem]">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-primary ring-1 ring-emerald-100">
                    <Coins className="h-6 w-6" />
                  </span>
                  Change breakdown
                </DialogTitle>
                <DialogDescription className="mt-2 pl-16 text-base text-slate-500">
                  Review the note and coin payout before completing the sale.
                </DialogDescription>
              </div>

              {allowCustomPayout && hasBalanceToReturn && (
                <div className="flex items-center gap-3 self-start rounded-2xl border border-emerald-100 bg-white/90 px-4 py-2 shadow-sm md:self-auto">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600">
                    Custom Payout
                  </span>
                  <Switch
                    checked={isCustomPayoutEnabled}
                    onCheckedChange={setIsCustomPayoutEnabled}
                    aria-label="Enable custom payout"
                  />
                </div>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 md:px-8">
            <div
              className={cn(
                "rounded-[1.75rem] border px-5 py-4 shadow-sm",
                hasDenominationShortage
                  ? "border-red-200 bg-red-50"
                  : isFullyCovered
                    ? "border-emerald-200 bg-emerald-50"
                    : needsManualAdjustment
                      ? "border-amber-200 bg-amber-50"
                      : "border-emerald-100 bg-[#f7fdf9]",
              )}
            >
              <div className="flex items-start gap-3">
                {hasDenominationShortage ? (
                  <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-red-600" />
                ) : isFullyCovered ? (
                  <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-600" />
                ) : needsManualAdjustment ? (
                  <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-amber-600" />
                ) : (
                  <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-primary" />
                )}

                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                    Balance to return
                  </p>
                  <p
                    className={cn(
                      "mt-2 text-[2rem] font-bold leading-none tabular-nums",
                      hasDenominationShortage
                        ? "text-red-600"
                        : isFullyCovered
                          ? "text-primary"
                          : needsManualAdjustment
                            ? "text-amber-700"
                            : "text-primary",
                    )}
                  >
                    Rs. {normalizedChange.toLocaleString()}
                  </p>
                  {hasDenominationShortage ? (
                    <p className="mt-3 text-sm font-medium text-red-700">
                      {CASH_DRAWER_SHORTAGE_MESSAGE}
                    </p>
                  ) : isFullyCovered ? (
                    <p className="mt-3 text-sm text-emerald-800">
                      This breakdown uses the available drawer notes and coins.
                    </p>
                  ) : needsManualAdjustment ? (
                    <p className="mt-3 text-sm text-amber-900">
                      The drawer does not currently have enough denominations for the full amount.
                      Adjust the notes and coins below to match the balance to return.
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-slate-600">
                      No payout is required for this sale.
                    </p>
                  )}
                  {optionalPayoutSuggestion ? (
                    <p className="mt-2 text-sm font-medium text-slate-600">
                      Optional suggestion: ask the customer for Rs. {optionalPayoutSuggestion.requestAmount.toLocaleString()} more and
                      return Rs. {optionalPayoutSuggestion.payoutAmount.toLocaleString()}.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {showEditableCounter ? (
              <div className="mt-4">
                <DenominationCounter
                  key={`${normalizedChange}-${availableCountsKey}`}
                  initialCounts={breakdown}
                  warningDenominations={shortageDenominations}
                  onChange={(counts, total) => {
                    setManualCounts(counts);
                    setManualTotal(total);
                  }}
                  variant="visual"
                />
                <div
                  className={cn(
                    "mt-3 rounded-2xl border px-4 py-3 text-sm shadow-sm",
                    hasDenominationShortage
                      ? "border-red-200 bg-red-50"
                      : "border-slate-200 bg-white/90",
                  )}
                >
                  <p className={cn("font-medium", hasDenominationShortage ? "text-red-700" : "text-slate-700")}>
                    Selected total: Rs. {selectedTotal.toLocaleString()}
                  </p>
                  {hasDenominationShortage ? (
                    <p className="mt-1 text-xs font-medium text-red-700">
                      {CASH_DRAWER_SHORTAGE_MESSAGE}
                    </p>
                  ) : (
                    <p
                      className={cn(
                        "mt-1 text-xs",
                        isCustomMode
                          ? (manualTotal === normalizedChange ? "text-emerald-600" : "text-amber-600")
                          : (manualTotal === normalizedChange ? "text-emerald-600" : "text-destructive"),
                      )}
                    >
                      {isCustomMode
                        ? (manualTotal === normalizedChange
                          ? "The selected notes and coins match the balance to return."
                          : "Custom payout override is enabled. You can proceed with this payout set.")
                        : (manualTotal === normalizedChange
                          ? "The selected notes and coins match the balance to return."
                          : "Adjust the counts until the selected total matches the balance to return.")}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4 grid min-h-0 gap-4 lg:grid-cols-2">
                {renderBreakdownSection("Notes", notes, notesTotal, Banknote, "No notes required.")}
                {renderBreakdownSection("Coins", coins, coinsTotal, Coins, "No coins required.")}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-emerald-100 bg-white/90 px-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+0.9rem)] md:px-8">
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
                onClick={() => onConfirm(
                  selectedCounts,
                  isCustomMode,
                  isCustomMode ? (normalizedChange - selectedTotal) : 0,
                )}
                disabled={!canProceed}
                className="h-12 flex-1 rounded-2xl border border-primary bg-primary px-5 text-[1rem] font-bold text-white sm:flex-none sm:min-w-[20rem]"
              >
                <CheckCircle2 className="h-5 w-5" />
                Proceed - Rs. {normalizedChange.toLocaleString()}
              </Button>
            </div>
            <div className="w-full rounded-2xl border border-emerald-100 bg-[#f7fdf9] px-5 py-3 text-right shadow-sm xl:max-w-[17rem]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Selected payout
              </p>
              <p className="mt-2 text-[1.9rem] font-bold leading-none tabular-nums text-primary">
                Rs. {selectedTotal.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CashChangeDialog;
