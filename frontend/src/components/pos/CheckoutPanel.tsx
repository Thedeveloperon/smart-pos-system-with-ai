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
    <div className="flex flex-col h-full bg-card">
      {/* Summary */}
      <div className="p-4 space-y-3 border-b border-border">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            Items ({itemCount})
          </span>
          <span>Rs. {subtotal.toLocaleString()}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-sm text-success">
            <span>Discount</span>
            <span>- Rs. {discount.toLocaleString()}</span>
          </div>
        )}
        <div className="h-px bg-border" />
        <div className="flex justify-between items-baseline">
          <span className="text-lg font-bold">Grand Total</span>
          <span className="text-2xl font-extrabold text-primary">
            Rs. {grandTotal.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Customer Mobile */}
      <div className="px-4 py-3 border-b border-border">
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={customerMobile}
            onChange={(e) => setCustomerMobile(e.target.value)}
            placeholder="Customer mobile (optional)"
            className="pl-10 h-10 rounded-xl"
          />
        </div>
      </div>

      {/* Payment Method */}
      <div className="px-4 py-3 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
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
              className={`h-12 flex-col gap-0.5 rounded-xl ${
                paymentMethod === key ? "" : ""
              }`}
              onClick={() => (key === "cash" ? openCashCountDialog() : setPaymentMethod(key))}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[11px]">{label}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Cash Input */}
      {paymentMethod === "cash" && (
        <div className="px-4 py-3 border-b border-border space-y-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
              Cash Received
            </p>
            <Input
              type="number"
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
              placeholder="0.00"
              className="h-12 text-xl font-bold text-center rounded-xl"
            />
          </div>

          {/* Change / Due */}
          {cashNum > 0 && (
            <div
              className={`rounded-xl p-3 text-center ${
                change >= 0
                  ? "bg-accent text-accent-foreground"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              <p className="text-xs font-medium uppercase tracking-wider mb-0.5">
                {change >= 0 ? "Change" : "Due"}
              </p>
              <p className="text-2xl font-extrabold">
                Rs. {Math.abs(change >= 0 ? change : due).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="p-4 mt-auto space-y-2">
        <Button
          variant="pos-primary"
          size="xl"
          className="w-full rounded-xl"
          disabled={!canComplete}
          onClick={handleComplete}
        >
          <CheckCircle2 className="h-5 w-5" />
          Complete Sale
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="pos-outline"
            className="rounded-xl"
            onClick={onHoldBill}
            disabled={items.length === 0}
          >
            <PauseCircle className="h-4 w-4" />
            Hold
          </Button>
          <Button
            variant="pos-danger"
            className="rounded-xl"
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
