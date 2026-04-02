import { ShoppingCart } from "lucide-react";
import CartItemRow from "./CartItemRow";
import type { CartItem } from "./types";

interface CartPanelProps {
  items: CartItem[];
  onUpdateQty: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
}

const CartPanel = ({ items, onUpdateQty, onRemove }: CartPanelProps) => {
  const itemCount = items.reduce((acc, i) => acc + i.quantity, 0);
  const grandTotal = items.reduce((acc, item) => acc + item.product.price * item.quantity, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-base">Cart</h2>
          {itemCount > 0 && (
            <span className="text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5 font-semibold">
              {itemCount}
            </span>
          )}
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Grand Total
          </p>
          <p className="text-xl font-extrabold text-primary">
            Rs. {grandTotal.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <ShoppingCart className="h-10 w-10 opacity-30" />
            <p className="text-sm">Cart is empty</p>
            <p className="text-xs">Add products to get started</p>
          </div>
        ) : (
          items.map((item) => (
            <CartItemRow
              key={item.product.id}
              item={item}
              onUpdateQty={onUpdateQty}
              onRemove={onRemove}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default CartPanel;
