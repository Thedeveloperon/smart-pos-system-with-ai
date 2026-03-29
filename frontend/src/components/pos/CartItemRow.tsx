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
    <div className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border group hover:border-primary/20 transition-colors animate-fade-in">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.product.name}</p>
        <p className="text-xs text-muted-foreground">
          Rs. {item.product.price.toLocaleString()} × {item.quantity}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() =>
            onUpdateQty(item.product.id, Math.max(0, item.quantity - 1))
          }
          className="h-7 w-7"
        >
          <Minus className="h-3 w-3" />
        </Button>
        <span className="w-7 text-center text-sm font-semibold">
          {item.quantity}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onUpdateQty(item.product.id, item.quantity + 1)}
          className="h-7 w-7"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      <span className="text-sm font-semibold w-20 text-right">
        Rs. {lineTotal.toLocaleString()}
      </span>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onRemove(item.product.id)}
        className="text-muted-foreground hover:text-destructive h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};

export default CartItemRow;
