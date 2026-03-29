import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus, Package } from "lucide-react";
import type { Product } from "./types";

interface ProductCardProps {
  product: Product;
  onAdd: (product: Product, qty: number) => void;
}

const ProductCard = ({ product, onAdd }: ProductCardProps) => {
  const [qty, setQty] = useState(1);
  const isLowStock = product.stock > 0 && product.stock <= 5;
  const isOutOfStock = product.stock === 0;

  return (
    <div
      className={`group bg-card rounded-md border border-border pos-shadow hover:pos-shadow-md transition-all duration-200 overflow-hidden flex flex-col ${
        isOutOfStock ? "opacity-60" : "cursor-pointer hover:-translate-y-0.5"
      }`}
      onClick={() => !isOutOfStock && onAdd(product, qty)}
    >
      {/* Image */}
      <div className="aspect-[5/4] bg-muted relative overflow-hidden">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="h-10 w-10 text-muted-foreground/40" />
          </div>
        )}

        {product.category && (
          <Badge
            variant="secondary"
            className="absolute top-1 left-1 text-[9px] px-1 py-0.5"
          >
            {product.category}
          </Badge>
        )}

        {isLowStock && (
          <Badge className="absolute top-1 right-1 text-[9px] px-1 py-0.5 bg-warning text-warning-foreground">
            Low: {product.stock}
          </Badge>
        )}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
            <span className="text-sm font-semibold text-destructive">Out of Stock</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2 flex flex-col gap-0.5 flex-1">
        <h3 className="text-[12px] font-semibold leading-tight line-clamp-2 text-foreground">
          {product.name}
        </h3>
        <p className="text-[9px] text-muted-foreground font-mono">
          {product.sku}
        </p>
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="text-[13px] font-bold text-primary">
            Rs. {product.price.toLocaleString()}
          </span>
          <span className="text-[9px] text-muted-foreground">
            Qty: {product.stock}
          </span>
        </div>

        {/* Qty + Add */}
        <div
          className="flex items-center gap-1 mt-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center border border-border rounded-md overflow-hidden h-7">
            <button
              className="h-7 w-6 flex items-center justify-center hover:bg-muted transition-colors"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-6 text-center text-[11px] font-medium">{qty}</span>
            <button
              className="h-7 w-6 flex items-center justify-center hover:bg-muted transition-colors"
              onClick={() => setQty((q) => Math.min(product.stock, q + 1))}
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <Button
            size="sm"
            variant="pos-primary"
            className="flex-1 h-7 text-[11px]"
            disabled={isOutOfStock}
            onClick={() => {
              onAdd(product, qty);
              setQty(1);
            }}
          >
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
