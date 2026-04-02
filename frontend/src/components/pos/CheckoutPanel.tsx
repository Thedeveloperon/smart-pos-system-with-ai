import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Banknote,
  CreditCard,
  QrCode,
  CheckCircle2,
  PauseCircle,
  XCircle,
  Phone,
} from "lucide-react";
import CashReceivedDialog from "./cash-session/CashReceivedDialog";
import CashChangeDialog from "./cash-session/CashChangeDialog";
import { isQuickSaleEnabled } from "@/lib/posPreferences";
import { playSaleCompleteSound, primeConfirmationSound } from "@/lib/sound";
import type { CartItem, PaymentMethod } from "./types";
import type { CashDrawerState, DenominationCount } from "./cash-session/types";
import { POS_SHORTCUT_INLINE_HINT, POS_SHORTCUT_LABELS } from "./shortcuts";

interface CheckoutPanelProps {
  items: CartItem[];
  cashDrawer?: CashDrawerState | null;
  onCompleteSale: (
    paymentMethod: PaymentMethod,
    cashReceived: number,
    customerMobile: string,
    cashReceivedCounts?: DenominationCount[],
    cashChangeCounts?: DenominationCount[]
  ) => void;
  onHoldBill: () => void;
  onCancelSale: () => void;
  showShortcutHints?: boolean;
}

export interface CheckoutShortcutResult {
  ok: boolean;
  reason?: string;
}

export interface CheckoutPanelHandle {
  openCashWorkflow: () => void;
  tryCompleteSale: () => CheckoutShortcutResult;
}

const CheckoutPanel = forwardRef<CheckoutPanelHandle, CheckoutPanelProps>(
  ({
    items,
    cashDrawer,
    onCompleteSale,
    onHoldBill,
    onCancelSale,
    showShortcutHints = false,
  }, ref) => {
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
    const [cashReceived, setCashReceived] = useState("");
    const [customerMobile, setCustomerMobile] = useState("");
    const [cashReceivedCounts, setCashReceivedCounts] = useState<DenominationCount[]>([]);
    const [cashChangeCounts, setCashChangeCounts] = useState<DenominationCount[]>([]);
    const [showCashCountDialog, setShowCashCountDialog] = useState(false);
    const [showCashChangeDialog, setShowCashChangeDialog] = useState(false);
    const cashReceivedInputRef = useRef<HTMLInputElement>(null);

    const subtotal = items.reduce(
      (acc, i) => acc + i.product.price * i.quantity,
      0
    );
    const discount = 0;
    const grandTotal = subtotal - discount;
    const cashNum = parseFloat(cashReceived) || 0;
    const change = cashNum - grandTotal;
    const due = grandTotal - cashNum;
    const itemCount = items.reduce((acc, i) => acc + i.quantity, 0);
    const completeBlockReason =
      items.length === 0
        ? "add items to the cart"
        : paymentMethod === "cash" && cashNum < grandTotal
          ? "cash received is less than the grand total"
          : null;
    const canComplete = completeBlockReason === null;
    const availableChangeCounts = cashDrawer
      ? combineDenominationCounts(cashDrawer.counts, cashReceivedCounts)
      : cashReceivedCounts;

    const handleComplete = useCallback((nextCashChangeCounts = cashChangeCounts) => {
      onCompleteSale(paymentMethod, cashNum, customerMobile, cashReceivedCounts, nextCashChangeCounts);
      setCashReceived("");
      setCustomerMobile("");
      setCashReceivedCounts([]);
      setCashChangeCounts([]);
    }, [cashChangeCounts, cashNum, cashReceivedCounts, customerMobile, onCompleteSale, paymentMethod]);

    const openCashWorkflow = useCallback(() => {
      setPaymentMethod("cash");
      setCashReceived("");
      setCashReceivedCounts([]);
      setCashChangeCounts([]);
      setShowCashCountDialog(true);
      window.setTimeout(() => {
        cashReceivedInputRef.current?.focus();
        cashReceivedInputRef.current?.select();
      }, 0);
    }, []);

    const runCompleteSale = useCallback((nextCashChangeCounts?: DenominationCount[]) => {
      void playSaleCompleteSound();
      handleComplete(nextCashChangeCounts);
    }, [handleComplete]);

    const requestCompleteSale = useCallback(() => {
      if (completeBlockReason) {
        return { ok: false, reason: completeBlockReason } as const;
      }

      if (paymentMethod === "cash" && !isQuickSaleEnabled()) {
        setShowCashChangeDialog(true);
        return { ok: true } as const;
      }

      runCompleteSale();
      return { ok: true } as const;
    }, [completeBlockReason, paymentMethod, runCompleteSale]);

    useImperativeHandle(ref, () => ({
      openCashWorkflow: () => {
        openCashWorkflow();
      },
      tryCompleteSale: () => {
        return requestCompleteSale();
      },
    }), [openCashWorkflow, requestCompleteSale]);

    return (
      <div className="flex h-full min-h-0 flex-col bg-card">
        <div className="scrollbar-thin flex-1 min-h-0 overflow-y-auto">
          {/* Summary */}
          <div className="space-y-2 border-b border-border px-3 py-3">
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground">
                Items ({itemCount})
              </span>
              <span>Rs. {subtotal.toLocaleString()}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-xs sm:text-sm text-success">
                <span>Discount</span>
                <span>- Rs. {discount.toLocaleString()}</span>
              </div>
            )}
            <div className="h-px bg-border" />
            <div className="flex justify-between items-baseline">
              <span className="text-base font-bold sm:text-lg">Grand Total</span>
              <span className="text-xl font-extrabold text-primary sm:text-2xl">
                Rs. {grandTotal.toLocaleString()}
              </span>
            </div>
          </div>
 
          {/* Customer Mobile */}
          <div className="border-b border-border px-3 py-2">
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={customerMobile}
                onChange={(e) => setCustomerMobile(e.target.value)}
                placeholder="Customer mobile (optional)"
                className="h-9 rounded-xl pl-9 text-sm"
              />
            </div>
          </div>

          {/* Cash Input */}
          {paymentMethod === "cash" && (
            <div className="sticky top-0 z-10 space-y-2 border-b border-border bg-card/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/85">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Cash Received
                </p>
                <Input
                  ref={cashReceivedInputRef}
                  type="number"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  placeholder="0.00"
                  className="h-10 rounded-xl text-center text-lg font-bold"
                />
              </div>

              {/* Change / Due */}
              {cashNum > 0 && (
                <div
                  className={`rounded-xl px-3 py-2.5 text-center ${
                    change >= 0
                      ? "bg-accent text-accent-foreground"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wider">
                    {change >= 0 ? "Change" : "Due"}
                  </p>
                  <p className="text-xl font-extrabold sm:text-2xl">
                    Rs. {Math.abs(change >= 0 ? change : due).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Payment Method */}
          <div className="border-b border-border px-3 py-2">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Payment Method
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  {
                    key: "cash",
                    icon: Banknote,
                    label: showShortcutHints
                      ? `Cash (${POS_SHORTCUT_LABELS.openCashWorkflow})`
                      : "Cash",
                  },
                  { key: "card", icon: CreditCard, label: "Card" },
                  { key: "qr", icon: QrCode, label: "QR" },
                ] as const
              ).map(({ key, icon: Icon, label }) => (
                <Button
                  key={key}
                  variant={paymentMethod === key ? "default" : "pos-quick"}
                  className={`h-14 flex-col gap-1 rounded-xl text-sm font-semibold ${
                    paymentMethod === key ? "" : ""
                  }`}
                  onClick={() => {
                    if (key !== "cash") {
                      setPaymentMethod(key);
                      return;
                    }

                    if (isQuickSaleEnabled()) {
                      setPaymentMethod("cash");
                      setCashReceived(String(grandTotal));
                      setCashReceivedCounts([]);
                      setCashChangeCounts([]);
                      setShowCashCountDialog(false);
                      return;
                    }

                    openCashWorkflow();
                  }}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs sm:text-sm">{label}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="shrink-0 space-y-1.5 border-t border-border bg-background/95 px-3 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+0.35rem)]">
          {showShortcutHints && (
            <p className="px-1 text-[11px] text-muted-foreground">
              Shortcuts: {POS_SHORTCUT_INLINE_HINT}
            </p>
          )}
          <Button
            variant="pos-primary"
            className="h-11 w-full rounded-xl text-sm"
            disabled={!canComplete}
            onPointerDown={() => {
              void primeConfirmationSound();
            }}
            onClick={() => {
              requestCompleteSale();
            }}
          >
            <CheckCircle2 className="h-4 w-4" />
            Complete Sale{showShortcutHints ? ` (${POS_SHORTCUT_LABELS.completeSale})` : ""}
          </Button>

          <div className="grid grid-cols-2 gap-1.5">
            <Button
              variant="pos-outline"
              className="h-10 rounded-xl text-sm"
              onClick={onHoldBill}
              disabled={items.length === 0}
            >
              <PauseCircle className="h-4 w-4" />
              Hold{showShortcutHints ? ` (${POS_SHORTCUT_LABELS.holdBill})` : ""}
            </Button>
            <Button
              variant="pos-danger"
              className="h-10 rounded-xl text-sm"
              onClick={onCancelSale}
              disabled={items.length === 0}
            >
              <XCircle className="h-4 w-4" />
              Cancel
            </Button>
          </div>
        </div>

        <CashReceivedDialog
          open={showCashCountDialog}
          expectedCash={grandTotal}
          onClose={() => setShowCashCountDialog(false)}
          onTotalChange={(total) => setCashReceived(String(total))}
          onConfirm={(counts, total) => {
            setCashReceivedCounts(counts);
            setCashReceived(String(total));
            setShowCashCountDialog(false);
          }}
        />

        <CashChangeDialog
          open={showCashChangeDialog}
          changeAmount={change}
          availableCounts={availableChangeCounts}
          onClose={() => setShowCashChangeDialog(false)}
          onConfirm={(counts) => {
            setCashChangeCounts(counts);
            setShowCashChangeDialog(false);
            runCompleteSale(counts);
          }}
        />
      </div>
    );
  },
);

CheckoutPanel.displayName = "CheckoutPanel";

export default CheckoutPanel;

function combineDenominationCounts(
  left: DenominationCount[],
  right: DenominationCount[],
): DenominationCount[] {
  const totals = new Map<number, number>();

  for (const item of [...left, ...right]) {
    totals.set(item.denomination, (totals.get(item.denomination) ?? 0) + item.quantity);
  }

  return [...totals.entries()]
    .map(([denomination, quantity]) => ({ denomination, quantity }))
    .sort((first, second) => second.denomination - first.denomination);
}
