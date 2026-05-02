import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Package } from "lucide-react";
import { primeCartAddSound } from "@/lib/sound";
import type { Product } from "./types";

interface ProductCardProps {
  product: Product;
  onAdd: (product: Product, qty: number) => void;
  showAddButton?: boolean;
}

const ProductCard = ({ product, onAdd, showAddButton = true }: ProductCardProps) => {
  const isLowStock = product.stock > 0 && product.stock <= 5;
  const isOutOfStock = product.stock === 0;

  return (
    <div
      className={`group bg-card rounded-md border border-border pos-shadow hover:pos-shadow-md transition-all duration-200 overflow-hidden flex flex-col ${
        isOutOfStock ? "opacity-60" : "cursor-pointer hover:-translate-y-0.5"
      }`}
      onPointerDown={() => {
        void primeCartAddSound();
      }}
      onClick={() => !isOutOfStock && onAdd(product, 1)}
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

        {showAddButton && (
          <div className="mt-1" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="pos-primary"
              className="h-10 w-full rounded-xl text-sm font-semibold shadow-md"
              disabled={isOutOfStock}
              onPointerDown={() => {
                void primeCartAddSound();
              }}
              onClick={() => {
                onAdd(product, 1);
              }}
            >
              <Plus className="h-4 w-4" />
              <span>Add</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductCard;
