import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ScanBarcode, Keyboard, Package } from "lucide-react";
import ProductCard from "./ProductCard";
import type { Product } from "./types";
import { POS_SHORTCUT_INLINE_HINT, POS_SHORTCUT_LABELS } from "./shortcuts";

interface ProductSearchPanelProps {
  products: Product[];
  onAddToCart: (product: Product, qty: number) => void;
  showShortcutHints?: boolean;
}

export interface ProductSearchPanelHandle {
  focusSearch: () => void;
}

const ProductSearchPanel = forwardRef<ProductSearchPanelHandle, ProductSearchPanelProps>(
  ({ products, onAddToCart, showShortcutHints = false }, ref) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [searchMode, setSearchMode] = useState<"manual" | "barcode">("manual");
    const searchInputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      focusSearch: () => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      },
    }), []);

    const filtered = products.filter((p) => {
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
      );
    });

    return (
      <div className="flex flex-col h-full">
        {/* Search Bar */}
        <div className="p-3 border-b border-border bg-card pos-shadow-md sticky top-0 z-10">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  searchMode === "barcode"
                    ? "Scan or enter barcode..."
                    : "Search products by name, SKU..."
                }
                className="pl-10 h-11 text-base rounded-xl border-border bg-background"
                autoFocus
                title={showShortcutHints ? `Focus Search (${POS_SHORTCUT_LABELS.focusSearch})` : undefined}
              />
            </div>
            <Button
              variant={searchMode === "barcode" ? "default" : "outline"}
              size="icon"
              className="h-11 w-11 shrink-0 rounded-xl"
              onClick={() =>
                setSearchMode((m) => (m === "barcode" ? "manual" : "barcode"))
              }
              title={searchMode === "barcode" ? "Barcode mode" : "Manual mode"}
            >
              {searchMode === "barcode" ? (
                <ScanBarcode className="h-5 w-5" />
              ) : (
                <Keyboard className="h-5 w-5" />
              )}
            </Button>
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            <span>{filtered.length} products</span>
            {searchQuery && (
              <button
                className="text-primary hover:underline"
                onClick={() => setSearchQuery("")}
              >
                Clear search
              </button>
            )}
            {showShortcutHints && (
              <span className="ml-auto hidden lg:inline">
                Shortcuts: {POS_SHORTCUT_INLINE_HINT}
              </span>
            )}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-scroll scrollbar-thin p-2.5 pr-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
              <Package className="h-12 w-12 opacity-40" />
              <p className="text-sm">No products found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
              {filtered.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAdd={onAddToCart}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  },
);

ProductSearchPanel.displayName = "ProductSearchPanel";

export default ProductSearchPanel;
