import { Button } from "@/components/ui/button";
import { Plus, Minus, Trash2 } from "lucide-react";
import type { CartItem } from "./types";

interface CartItemRowProps {
  item: CartItem;
  onUpdateQty: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
}

const CartItemRow = ({ item, onUpdateQty, onRemove }: CartItemRowProps) => {
  const lineTotal = item.product.price * item.quantity;

  return (
    <div className="group animate-fade-in rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/20">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{item.product.name}</p>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onRemove(item.product.id)}
          className="h-7 w-7 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onUpdateQty(item.product.id, Math.max(0, item.quantity - 1))}
            className="h-10 w-10 shrink-0 rounded-xl border border-border bg-background p-0 text-lg font-semibold shadow-sm"
          >
            <Minus className="h-5 w-5" />
          </Button>
          <span className="min-w-8 px-2 text-center text-base font-semibold tabular-nums">{item.quantity}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onUpdateQty(item.product.id, item.quantity + 1)}
            className="h-10 w-10 shrink-0 rounded-xl border border-border bg-background p-0 text-lg font-semibold shadow-sm"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>

        <div className="text-right">
          <p className="text-sm font-semibold">Rs. {lineTotal.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Rs. {item.product.price.toLocaleString()} x {item.quantity}</p>
        </div>
      </div>
    </div>
  );
};

export default CartItemRow;
