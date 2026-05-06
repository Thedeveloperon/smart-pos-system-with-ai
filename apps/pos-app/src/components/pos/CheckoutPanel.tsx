import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Banknote, CreditCard, QrCode, CheckCircle2, PauseCircle, XCircle, Plus, Wallet } from "lucide-react";
import CashReceivedDialog from "./cash-session/CashReceivedDialog";
import CashChangeDialog from "./cash-session/CashChangeDialog";
import { isQuickSaleEnabled } from "@/lib/posPreferences";
import { playSaleCompleteSound, primeConfirmationSound } from "@/lib/sound";
import type { CartDiscount, CartItem, PaymentMethod } from "./types";
import type { CashDrawerState, DenominationCount } from "./cash-session/types";
import { POS_SHORTCUT_INLINE_HINT, POS_SHORTCUT_LABELS } from "./shortcuts";
import { computeCartTotals } from "@/lib/cartMath";
import {
  createCustomer,
  fetchCustomerDirectoryLookup,
  fetchCustomerPriceTiers,
  type CreateCustomerRequest,
  type CustomerLookupItem,
} from "@/lib/api";
import CustomerCreateDialog from "@/components/customers/CustomerCreateDialog";
import CustomerSearchInput from "@/components/customers/CustomerSearchInput";

interface CheckoutPanelProps {
  items: CartItem[];
  cashDrawer?: CashDrawerState | null;
  allowCustomPayout?: boolean;
  holdBlockReason?: string | null;
  cartDiscount: CartDiscount;
  onCartDiscountChange: (discount: CartDiscount) => void;
  onCompleteSale: (
    paymentMethod: PaymentMethod,
    cashReceived: number,
    customerId: string | undefined,
    cartDiscount: CartDiscount,
    cashReceivedCounts?: DenominationCount[],
    cashChangeCounts?: DenominationCount[],
    customPayoutUsed?: boolean,
    cashShortAmount?: number
  ) => void;
  onHoldBill: (cartDiscount: CartDiscount) => void;
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
    allowCustomPayout = false,
    holdBlockReason = null,
    cartDiscount,
    onCartDiscountChange,
    onCompleteSale,
    onHoldBill,
    onCancelSale,
    showShortcutHints = false,
  }, ref) => {
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
    const [cashReceived, setCashReceived] = useState("");
    const [customerQuery, setCustomerQuery] = useState("Default Customer");
    const [defaultCustomer, setDefaultCustomer] = useState<CustomerLookupItem | null>(null);
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerLookupItem | null>(null);
    const [customerDirectory, setCustomerDirectory] = useState<CustomerLookupItem[]>([]);
    const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
    const [showCreateCustomerDialog, setShowCreateCustomerDialog] = useState(false);
    const [customerTiers, setCustomerTiers] = useState<Awaited<ReturnType<typeof fetchCustomerPriceTiers>>>([]);
    const [cashReceivedCounts, setCashReceivedCounts] = useState<DenominationCount[]>([]);
    const [cashChangeCounts, setCashChangeCounts] = useState<DenominationCount[]>([]);
    const [showCashCountDialog, setShowCashCountDialog] = useState(false);
    const [showCashChangeDialog, setShowCashChangeDialog] = useState(false);
    const cashReceivedInputRef = useRef<HTMLInputElement>(null);

    const customerDiscountPercent = (selectedCustomer?.fixedDiscountPercent ?? selectedCustomer?.priceTierDiscountPercent ?? 0);
    const totals = useMemo(
      () => computeCartTotals(items, cartDiscount, customerDiscountPercent),
      [items, cartDiscount, customerDiscountPercent],
    );
    const grandTotal = totals.grandTotal;
    const cashNum = parseFloat(cashReceived) || 0;
    const change = cashNum - grandTotal;
    const due = grandTotal - cashNum;
    const availableChangeCounts = cashDrawer
      ? combineDenominationCounts(cashDrawer.counts, cashReceivedCounts)
      : cashReceivedCounts;
    const customerDisplay = selectedCustomer ?? defaultCustomer;
    const isDefaultCustomerSelected =
      customerDisplay != null &&
      defaultCustomer != null &&
      customerDisplay.id === defaultCustomer.id;
    const customerOutstandingBalance = customerDisplay?.outstandingBalance ?? 0;
    const customerCreditLimit = customerDisplay?.creditLimit ?? 0;
    const availableCredit = Math.max(0, customerCreditLimit - customerOutstandingBalance);
    const creditBalanceAfterSale = customerOutstandingBalance + grandTotal;
    const requiresCreditCustomer = paymentMethod === "credit" && (customerDisplay == null || isDefaultCustomerSelected);
    const exceedsAvailableCredit =
      paymentMethod === "credit" &&
      !requiresCreditCustomer &&
      creditBalanceAfterSale > customerCreditLimit;
    const customerOptions = useMemo(() => {
      const query = customerQuery.trim().toLowerCase();
      if (!query) {
        return customerDirectory;
      }

      return customerDirectory.filter((item) =>
        [item.name, item.code, item.phone ?? "", item.email ?? ""].some((field) => field.toLowerCase().includes(query))
      );
    }, [customerDirectory, customerQuery]);
    const completeBlockReason =
      items.length === 0
        ? "add items to the cart"
        : requiresCreditCustomer
          ? "select a customer for credit sales"
          : exceedsAvailableCredit
            ? "selected customer does not have enough available credit"
        : paymentMethod === "cash" && cashNum < grandTotal
          ? "cash received is less than the grand total"
          : null;
    const canComplete = completeBlockReason === null;

    useEffect(() => {
      let cancelled = false;

      const loadDefaultCustomer = async () => {
        try {
          const [directory, tiers] = await Promise.all([
            fetchCustomerDirectoryLookup(),
            fetchCustomerPriceTiers(),
          ]);

          if (cancelled) {
            return;
          }

          const nextDefault = directory.find((item) => item.name.toLowerCase() === "default customer")
            ?? directory[0]
            ?? null;

          setCustomerTiers(tiers);
          setCustomerDirectory(directory);
          setDefaultCustomer(nextDefault);
          setSelectedCustomer(nextDefault);
          setCustomerQuery(nextDefault?.name ?? "Default Customer");
        } catch (error) {
          console.error(error);
        }
      };

      void loadDefaultCustomer();

      return () => {
        cancelled = true;
      };
    }, []);

    const handleComplete = useCallback((nextCashChangeCounts = cashChangeCounts, customPayoutUsed = false, cashShortAmount = 0) => {
      onCompleteSale(
        paymentMethod,
        cashNum,
        customerDisplay?.id,
        cartDiscount,
        cashReceivedCounts,
        nextCashChangeCounts,
        customPayoutUsed,
        cashShortAmount
      );
      setCashReceived("");
      if (defaultCustomer) {
        setSelectedCustomer(defaultCustomer);
        setCustomerQuery(defaultCustomer.name);
      } else {
        setSelectedCustomer(null);
        setCustomerQuery("Default Customer");
      }
      setCustomerDropdownOpen(false);
      setCashReceivedCounts([]);
      setCashChangeCounts([]);
    }, [cartDiscount, cashChangeCounts, cashNum, cashReceivedCounts, customerDisplay?.id, defaultCustomer, onCompleteSale, paymentMethod]);

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

    const runCompleteSale = useCallback((nextCashChangeCounts?: DenominationCount[], customPayoutUsed = false, cashShortAmount = 0) => {
      void playSaleCompleteSound();
      handleComplete(nextCashChangeCounts, customPayoutUsed, cashShortAmount);
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

    const handleCreateCustomer = useCallback(async (request: CreateCustomerRequest) => {
      const created = await createCustomer(request);
      setCustomerDirectory((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setSelectedCustomer(created);
      setCustomerQuery(created.name);
      setCustomerDropdownOpen(false);
    }, []);

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
          {/* Customer Search */}
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <CustomerSearchInput
                value={customerQuery}
                onChange={(value) => {
                  setCustomerQuery(value);
                  setCustomerDropdownOpen(true);
                }}
                onFocus={() => setCustomerDropdownOpen(true)}
                placeholder="Search name, code, phone, email..."
                wrapperClassName="relative min-w-0 flex-1"
                className="h-9 rounded-xl pl-9 pr-9 text-sm"
              >
                {customerDropdownOpen && (
                  <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-20 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg">
                    {customerQuery.trim() === "" ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        Start typing to search customers.
                      </div>
                    ) : customerOptions.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        No matching customers.
                      </div>
                    ) : (
                      customerOptions.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setSelectedCustomer(item);
                            setCustomerQuery(item.name);
                            setCustomerDropdownOpen(false);
                          }}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{item.name}</div>
                            <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                              <span className="font-mono">{item.code}</span>
                              {item.phone ? <span>{item.phone}</span> : null}
                              {item.email ? <span className="truncate">{item.email}</span> : null}
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            Select
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </CustomerSearchInput>
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-xl gap-1.5"
                onClick={() => setShowCreateCustomerDialog(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Selected customer</span>
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs">
                <span className="font-medium">{customerDisplay?.name ?? "Default Customer"}</span>
                {customerDisplay?.phone ? <span className="text-muted-foreground">{customerDisplay.phone}</span> : null}
              </div>
            </div>
            {paymentMethod === "credit" && (
              <div className="mt-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs">
                {requiresCreditCustomer ? (
                  <p className="text-muted-foreground">Select a customer with a credit profile to complete this sale on credit.</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>Limit: <strong>Rs. {customerCreditLimit.toLocaleString()}</strong></span>
                    <span>Outstanding: <strong>Rs. {customerOutstandingBalance.toLocaleString()}</strong></span>
                    <span className={exceedsAvailableCredit ? "text-destructive" : "text-foreground"}>
                      Available: <strong>Rs. {availableCredit.toLocaleString()}</strong>
                    </span>
                    <span className={exceedsAvailableCredit ? "text-destructive" : "text-muted-foreground"}>
                      After sale: <strong>Rs. {creditBalanceAfterSale.toLocaleString()}</strong>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Payment Method */}
          <div className="border-b border-border px-3 py-2">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Payment Method
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  {
                    key: "cash",
                    icon: Banknote,
                    label: showShortcutHints
                      ? `Cash (${POS_SHORTCUT_LABELS.openCashWorkflow})`
                      : "Cash",
                  },
                  { key: "credit", icon: Wallet, label: "Credit" },
                  { key: "card", icon: CreditCard, label: "Card" },
                  { key: "qr", icon: QrCode, label: "QR" },
                ] as const
              ).map(({ key, icon: Icon, label }) => (
                <Button
                  key={key}
                  variant={paymentMethod === key ? "default" : "pos-quick"}
                  className={`h-11 flex-row gap-1.5 rounded-xl px-2 text-[11px] font-semibold sm:text-xs ${
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
                  <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                  <span className="truncate whitespace-nowrap">{label}</span>
                </Button>
              ))}
            </div>
          </div>

          <div className="border-b border-border px-3 py-2">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cashier Transaction Discount
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={cartDiscount.cashierTransactionDiscountPercent ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  onCartDiscountChange({
                    cashierTransactionDiscountPercent: value === "" ? 0 : Number(value),
                    cashierTransactionDiscountFixed: null,
                  });
                }}
                placeholder="%"
                className="h-9"
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                value={cartDiscount.cashierTransactionDiscountFixed ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  onCartDiscountChange({
                    cashierTransactionDiscountPercent: 0,
                    cashierTransactionDiscountFixed: value === "" ? null : Number(value),
                  });
                }}
                placeholder="Rs."
                className="h-9"
              />
            </div>
            <div className="mt-2 rounded-lg border bg-muted/20 p-2 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>Rs. {totals.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Line discounts</span>
                <span>- Rs. {totals.lineDiscountTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Customer discount</span>
                <span>- Rs. {totals.customerTransactionDiscountAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Cashier txn discount</span>
                <span>- Rs. {totals.cashierTransactionDiscountAmount.toLocaleString()}</span>
              </div>
              <div className="mt-1 flex justify-between border-t pt-1 font-semibold text-foreground">
                <span>Grand total</span>
                <span>Rs. {grandTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Cash Input - pinned above actions so it's always visible without scrolling */}
        {paymentMethod === "cash" && (
          <div className="shrink-0 space-y-1.5 border-t border-border px-3 py-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Cash Received
              </p>
              <Input
                ref={cashReceivedInputRef}
                type="number"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                placeholder="0.00"
                className="h-9 rounded-xl text-center text-base font-bold"
              />
            </div>

            {cashNum > 0 && (
              <div
                className={`rounded-xl px-3 py-2 text-center ${
                  change >= 0
                    ? "bg-accent text-accent-foreground"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wider">
                  {change >= 0 ? "Change" : "Due"}
                </p>
                <p className="text-lg font-extrabold sm:text-xl">
                  Rs. {Math.abs(change >= 0 ? change : due).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="shrink-0 space-y-1.5 border-t border-border bg-background/95 px-3 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+0.35rem)]">
          {showShortcutHints && (
            <p className="px-1 text-[11px] text-muted-foreground">
              Shortcuts: {POS_SHORTCUT_INLINE_HINT}
            </p>
          )}
          <Button
            variant="pos-primary"
            className="h-11 w-full rounded-xl px-4 text-sm justify-center"
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
              className="h-10 w-full rounded-xl px-4 text-sm justify-center"
              onClick={() => onHoldBill(cartDiscount)}
              disabled={items.length === 0 || holdBlockReason != null}
              title={holdBlockReason ?? undefined}
            >
              <PauseCircle className="h-4 w-4" />
              Hold{showShortcutHints ? ` (${POS_SHORTCUT_LABELS.holdBill})` : ""}
            </Button>
            <Button
              variant="pos-danger"
              className="h-10 w-full rounded-xl px-4 text-sm justify-center"
              onClick={onCancelSale}
              disabled={items.length === 0}
            >
              <XCircle className="h-4 w-4" />
              Cancel
            </Button>
          </div>
        </div>

        <CustomerCreateDialog
          open={showCreateCustomerDialog}
          onOpenChange={setShowCreateCustomerDialog}
          tiers={customerTiers}
          onCreate={handleCreateCustomer}
        />

        <CashReceivedDialog
          open={showCashCountDialog}
          expectedCash={grandTotal}
          availableCounts={cashDrawer?.counts ?? []}
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
          allowCustomPayout={allowCustomPayout}
          onClose={() => setShowCashChangeDialog(false)}
          onConfirm={(counts, customPayoutUsed, cashShortAmount) => {
            setCashChangeCounts(counts);
            setShowCashChangeDialog(false);
            runCompleteSale(counts, customPayoutUsed, cashShortAmount);
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
