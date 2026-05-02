import { Button } from "@/components/ui/button";
import { AlertTriangle, Plus, Minus, Trash2 } from "lucide-react";
import type { CartItem } from "./types";

interface CartItemRowProps {
  item: CartItem;
  onUpdateQty: (lineId: string, qty: number) => void;
  onRemove: (lineId: string) => void;
}

const CartItemRow = ({ item, onUpdateQty, onRemove }: CartItemRowProps) => {
  const lineId = item.lineId ?? item.selectedSerial?.id ?? item.product.id;
  const hasSelectedSerial = Boolean(item.selectedSerial?.id);
  const lineTotal = item.product.price * item.quantity;
  const stock = item.product.stock ?? 0;
  const exceedsStock = stock >= 0 && item.quantity > stock;
  const remainingStock = Math.max(0, stock - item.quantity);

  return (
    <div
      className={`group animate-fade-in rounded-lg border bg-card p-3 transition-colors ${
        exceedsStock ? "border-destructive/40 bg-destructive/5" : "border-border hover:border-primary/20"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.product.name}</p>
          {item.selectedSerial?.value && (
            <p className="mt-1 truncate font-mono text-[11px] text-primary/80">
              Serial {item.selectedSerial.value}
            </p>
          )}
          {exceedsStock && (
            <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-destructive" role="status" aria-live="polite">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>
                Stock warning: only {stock.toLocaleString()} available, cart has {item.quantity.toLocaleString()}.
              </span>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onRemove(lineId)}
          className="h-7 w-7 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        {hasSelectedSerial ? (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] font-medium text-primary">
            Serial-selected item
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdateQty(lineId, Math.max(0, item.quantity - 1))}
              className="h-10 w-10 shrink-0 rounded-xl border border-border bg-background p-0 text-lg font-semibold shadow-sm"
            >
              <Minus className="h-5 w-5" />
            </Button>
            <span className="min-w-8 px-2 text-center text-base font-semibold tabular-nums">{item.quantity}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdateQty(lineId, item.quantity + 1)}
              className={`h-10 w-10 shrink-0 rounded-xl border bg-background p-0 text-lg font-semibold shadow-sm ${
                exceedsStock ? "border-destructive/40 text-destructive hover:bg-destructive/10" : "border-border"
              }`}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        )}

        <div className="text-right">
          <p className="text-sm font-semibold">Rs. {lineTotal.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Rs. {item.product.price.toLocaleString()} x {item.quantity}</p>
          {exceedsStock && (
            <p className="text-[11px] font-medium text-destructive">
              Exceeds stock by {Math.max(0, item.quantity - stock).toLocaleString()}.
            </p>
          )}
          {!exceedsStock && stock > 0 && remainingStock <= 5 && (
            <p className="text-[11px] font-medium text-amber-600">
              Only {remainingStock.toLocaleString()} left in stock.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CartItemRow;
