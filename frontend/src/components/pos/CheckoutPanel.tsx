import { useState } from "react";
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
import type { CartItem, PaymentMethod } from "./types";

interface CheckoutPanelProps {
  items: CartItem[];
  onCompleteSale: (
    paymentMethod: PaymentMethod,
    cashReceived: number,
    customerMobile: string
  ) => void;
  onHoldBill: () => void;
  onCancelSale: () => void;
}

const CheckoutPanel = ({
  items,
  onCompleteSale,
  onHoldBill,
  onCancelSale,
}: CheckoutPanelProps) => {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [showCashCountDialog, setShowCashCountDialog] = useState(false);

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
  const canComplete =
    items.length > 0 &&
    (paymentMethod !== "cash" || cashNum >= grandTotal);

  const handleComplete = () => {
    onCompleteSale(paymentMethod, cashNum, customerMobile);
    setCashReceived("");
    setCustomerMobile("");
  };

  const openCashCountDialog = () => {
    setPaymentMethod("cash");
    setShowCashCountDialog(true);
  };

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

      {/* Payment Method */}
      <div className="border-b border-border px-3 py-2">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Payment Method
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { key: "cash", icon: Banknote, label: "Cash" },
              { key: "card", icon: CreditCard, label: "Card" },
              { key: "qr", icon: QrCode, label: "QR" },
            ] as const
          ).map(({ key, icon: Icon, label }) => (
            <Button
              key={key}
              variant={paymentMethod === key ? "default" : "pos-quick"}
              className={`h-11 flex-col gap-0.5 rounded-xl text-xs ${
                paymentMethod === key ? "" : ""
              }`}
              onClick={() => (key === "cash" ? openCashCountDialog() : setPaymentMethod(key))}
            >
              <Icon className="h-4 w-4" />
              <span className="text-[10px] sm:text-[11px]">{label}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Cash Input */}
      {paymentMethod === "cash" && (
        <div className="space-y-2 border-b border-border px-3 py-2">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cash Received
            </p>
            <Input
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
      </div>

      {/* Actions */}
      <div className="shrink-0 space-y-2 border-t border-border bg-background/95 p-3 pb-[env(safe-area-inset-bottom)]">
        <Button
          variant="pos-primary"
          className="h-11 w-full rounded-xl text-sm"
          disabled={!canComplete}
          onClick={handleComplete}
        >
          <CheckCircle2 className="h-4 w-4" />
          Complete Sale
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="pos-outline"
            className="h-10 rounded-xl text-sm"
            onClick={onHoldBill}
            disabled={items.length === 0}
          >
            <PauseCircle className="h-4 w-4" />
            Hold
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
        onConfirm={(_, total) => {
          setCashReceived(String(total));
          setShowCashCountDialog(false);
        }}
      />
    </div>
  );
};

export default CheckoutPanel;
