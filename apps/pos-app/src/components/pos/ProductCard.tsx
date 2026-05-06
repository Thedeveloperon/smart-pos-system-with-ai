import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, Wrench } from "lucide-react";
import { primeCartAddSound } from "@/lib/sound";
import type { Product } from "./types";

interface ProductCardProps {
  product: Product;
  onAdd: (product: Product, qty: number) => void;
  showAddButton?: boolean;
  interactive?: boolean;
}

const ProductCard = ({ product, onAdd, showAddButton = true, interactive = true }: ProductCardProps) => {
  const tracksStock = product.tracksStock ?? !product.isService;
  const isLowStock = tracksStock && product.stock > 0 && product.stock <= 5;
  const isOutOfStock = tracksStock && product.stock === 0;
  const cardStateClass = isOutOfStock ? "opacity-60" : interactive ? "cursor-pointer hover:-translate-y-0.5 hover:pos-shadow-md" : "";
  const imageStateClass = interactive ? "group-hover:scale-105" : "";

  return (
    <div
      className={`group bg-card rounded-md border border-border pos-shadow transition-all duration-200 overflow-hidden flex flex-col ${cardStateClass}`}
      onPointerDown={() => {
        if (interactive) {
          void primeCartAddSound();
        }
      }}
      onClick={() => {
        if (interactive && !isOutOfStock) {
          onAdd(product, 1);
        }
      }}
    >
      <div className="aspect-[5/4] bg-muted relative overflow-hidden">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className={`h-full w-full object-cover transition-transform duration-300 ${imageStateClass}`}
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
        {product.isBundle && (
          <Badge className="absolute bottom-1 left-1 text-[9px] px-1 py-0.5 bg-primary/90 text-primary-foreground">
            Bundle
          </Badge>
        )}
        {product.isService && (
          <Badge className="absolute bottom-1 left-1 text-[9px] px-1 py-0.5 bg-emerald-700 text-white">
            Service
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

      <div className="p-2 flex flex-col gap-0.5 flex-1">
        <h3 className="text-[12px] font-semibold leading-tight line-clamp-2 text-foreground">
          {product.name}
        </h3>
        <p className="text-[9px] text-muted-foreground font-mono">
          {product.sku}
        </p>
        {product.hasPackOption && !product.isBundle && !product.isService && (
          <p className="text-[9px] text-primary/80">
            Pack: Rs. {(product.packPrice ?? 0).toLocaleString()} {product.packLabel ? `· ${product.packLabel}` : ""}
          </p>
        )}
        {product.isService && product.serviceDurationMinutes && product.serviceDurationMinutes > 0 && (
          <p className="text-[9px] text-emerald-700">
            Duration: {product.serviceDurationMinutes} min
          </p>
        )}
        {product.matchedSerialValue && (
          <p className="text-[9px] font-mono text-primary/80">
            Serial {product.matchedSerialValue}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="text-[13px] font-bold text-primary">
            Rs. {product.price.toLocaleString()}
          </span>
          {tracksStock ? (
            <span className="text-[9px] text-muted-foreground">
              Qty: {product.stock}
            </span>
          ) : (
            <span className="text-[9px] text-muted-foreground">
              Non-inventory
            </span>
          )}
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
              {product.isService ? <Wrench className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              <span>Add</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductCard;
