import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ScanBarcode, Keyboard, Package, Plus } from "lucide-react";
import ProductCard from "./ProductCard";
import type { Product } from "./types";
import { POS_SHORTCUT_INLINE_HINT, POS_SHORTCUT_LABELS } from "./shortcuts";

interface ProductSearchPanelProps {
  products: Product[];
  onAddToCart: (product: Product, qty: number) => void;
  showShortcutHints?: boolean;
  expertMode?: boolean;
}

export interface ProductSearchPanelHandle {
  focusSearch: () => void;
}

const ProductSearchPanel = forwardRef<ProductSearchPanelHandle, ProductSearchPanelProps>(
  ({ products, onAddToCart, showShortcutHints = false, expertMode = false }, ref) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [searchMode, setSearchMode] = useState<"manual" | "barcode">("manual");
    const searchInputRef = useRef<HTMLInputElement>(null);
    const lastAutoAddKeyRef = useRef<string | null>(null);

    useImperativeHandle(ref, () => ({
      focusSearch: () => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      },
    }), []);

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filtered = products.filter((p) => {
      const q = normalizedQuery;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
      );
    });
    useEffect(() => {
      if (!expertMode || normalizedQuery.length === 0) {
        lastAutoAddKeyRef.current = null;
        return;
      }

      const exactMatch = filtered.find((product) => {
        const name = product.name.toLowerCase();
        const sku = product.sku.toLowerCase();
        const barcode = product.barcode?.toLowerCase();
        return name === normalizedQuery || sku === normalizedQuery || barcode === normalizedQuery;
      });

      if (!exactMatch) {
        return;
      }

      const autoAddKey = `${exactMatch.id}:${normalizedQuery}`;
      if (lastAutoAddKeyRef.current === autoAddKey) {
        return;
      }

      lastAutoAddKeyRef.current = autoAddKey;
      onAddToCart(exactMatch, 1);
      setSearchQuery("");
      window.setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 0);
    }, [expertMode, filtered, normalizedQuery, onAddToCart]);

    const handleAddProduct = (product: Product) => {
      onAddToCart(product, 1);
      setSearchQuery("");
      window.setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 0);
    };

    const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") {
        return;
      }

      if (normalizedQuery.length === 0) {
        return;
      }

      const nextProduct = filtered[0];
      if (!nextProduct) {
        return;
      }

      event.preventDefault();
      handleAddProduct(nextProduct);
    };

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
                onKeyDown={handleSearchKeyDown}
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
          {expertMode && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Expert mode: exact matches add automatically. Press Enter to add the first result.
            </p>
          )}
        </div>

        {expertMode ? (
          <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
            {normalizedQuery.length === 0 ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 px-4 text-center text-muted-foreground">
                <Search className="h-10 w-10 opacity-50" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Search-first billing</p>
                  <p className="text-xs">
                    Type a product name, SKU, or barcode to filter results and add items fast.
                  </p>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 px-4 text-center text-muted-foreground">
                <Package className="h-10 w-10 opacity-40" />
                <p className="text-sm">No products found</p>
                <p className="text-xs">Check the spelling or scan a barcode again.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.slice(0, 24).map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 text-left transition hover:-translate-y-px hover:border-primary/40 hover:shadow-sm"
                    onClick={() => handleAddProduct(product)}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{product.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground font-mono">{product.sku}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-right">
                      <div>
                        <p className="text-sm font-bold text-primary">Rs. {product.price.toLocaleString()}</p>
                        <p className="text-[11px] text-muted-foreground">Stock {product.stock}</p>
                      </div>
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Plus className="h-4 w-4" />
                      </span>
                    </div>
                  </button>
                ))}
                {filtered.length > 24 && (
                  <p className="px-1 text-xs text-muted-foreground">
                    Showing first 24 matches.
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
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
        )}
      </div>
    );
  },
);

ProductSearchPanel.displayName = "ProductSearchPanel";

export default ProductSearchPanel;
