import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ScanBarcode, Keyboard, Package } from "lucide-react";
import ProductCard from "./ProductCard";
import type { Product } from "./types";
import { POS_SHORTCUT_INLINE_HINT, POS_SHORTCUT_LABELS } from "./shortcuts";

const SCANNER_BURST_INTERVAL_MS = 45;
const SCANNER_ENTER_GRACE_MS = 120;
const SCANNER_BURST_MIN_CHARS = 6;
const normalizeBarcode = (value: string) => value.trim().toLowerCase();
const isBarcodeFeatureEnabled = import.meta.env.VITE_BARCODE_FEATURE_ENABLED !== "false";

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
    const [barcodeFeedback, setBarcodeFeedback] = useState<string | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const scannerBurstRef = useRef({ charCount: 0, lastKeyAt: 0 });

    const focusAndSelectSearch = useCallback(() => {
      const input = searchInputRef.current;
      if (!input) {
        return;
      }

      input.focus();
      input.select();
    }, []);

    const resetScannerBurst = useCallback(() => {
      scannerBurstRef.current = { charCount: 0, lastKeyAt: 0 };
    }, []);

    const submitBarcodeQuery = useCallback(
      (scannerLike: boolean) => {
        const rawQuery = searchQuery.trim();
        if (!rawQuery) {
          return;
        }

        const normalizedQuery = normalizeBarcode(rawQuery);
        const matchedProduct = products.find((product) => {
          if (!product.barcode) {
            return false;
          }

          return normalizeBarcode(product.barcode) === normalizedQuery;
        });

        if (matchedProduct) {
          onAddToCart(matchedProduct, 1);
          setSearchQuery("");
          setBarcodeFeedback(null);
        } else {
          setBarcodeFeedback(
            scannerLike
              ? `No product matched scanned barcode "${rawQuery}".`
              : `No product matched barcode "${rawQuery}".`,
          );
        }

        resetScannerBurst();
        focusAndSelectSearch();
      },
      [focusAndSelectSearch, onAddToCart, products, resetScannerBurst, searchQuery],
    );

    const handleBarcodeInputKeyDown = useCallback(
      (event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (!isBarcodeFeatureEnabled || searchMode !== "barcode") {
          return;
        }

        const now = Date.now();

        if (event.key === "Enter") {
          event.preventDefault();

          const scannerLike =
            scannerBurstRef.current.charCount >= SCANNER_BURST_MIN_CHARS &&
            now - scannerBurstRef.current.lastKeyAt <= SCANNER_ENTER_GRACE_MS;

          submitBarcodeQuery(scannerLike);
          return;
        }

        if (event.key === "Backspace" || event.key === "Delete") {
          resetScannerBurst();
          return;
        }

        if (event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) {
          return;
        }

        const isBurst = now - scannerBurstRef.current.lastKeyAt <= SCANNER_BURST_INTERVAL_MS;
        scannerBurstRef.current = {
          charCount: isBurst ? scannerBurstRef.current.charCount + 1 : 1,
          lastKeyAt: now,
        };
      },
      [resetScannerBurst, searchMode, submitBarcodeQuery],
    );

    const toggleSearchMode = useCallback(() => {
      if (!isBarcodeFeatureEnabled) {
        return;
      }

      if (searchMode === "barcode") {
        setSearchMode("manual");
        setBarcodeFeedback(null);
        return;
      }

      setSearchQuery("");
      setSearchMode("barcode");
      setBarcodeFeedback(null);
    }, [searchMode]);

    useEffect(() => {
      if (searchMode !== "barcode") {
        return;
      }

      focusAndSelectSearch();
      resetScannerBurst();
      setBarcodeFeedback(null);
    }, [focusAndSelectSearch, resetScannerBurst, searchMode]);

    useImperativeHandle(ref, () => ({
      focusSearch: focusAndSelectSearch,
    }), [focusAndSelectSearch]);

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
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  if (searchMode === "barcode" && barcodeFeedback) {
                    setBarcodeFeedback(null);
                  }
                }}
                onKeyDown={handleBarcodeInputKeyDown}
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
            {isBarcodeFeatureEnabled ? (
              <Button
                variant={searchMode === "barcode" ? "default" : "outline"}
                size="icon"
                className="h-11 w-11 shrink-0 rounded-xl"
                onClick={toggleSearchMode}
                aria-label={searchMode === "barcode" ? "Switch to manual mode" : "Switch to barcode mode"}
                title={searchMode === "barcode" ? "Barcode mode" : "Manual mode"}
              >
                {searchMode === "barcode" ? (
                  <ScanBarcode className="h-5 w-5" />
                ) : (
                  <Keyboard className="h-5 w-5" />
                )}
              </Button>
            ) : null}
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
          {isBarcodeFeatureEnabled && searchMode === "barcode" && (
            <p
              className={`mt-2 text-xs ${barcodeFeedback ? "text-destructive font-medium" : "text-muted-foreground"}`}
              role="status"
              aria-live="polite"
            >
              {barcodeFeedback || "Barcode mode active: scan and press Enter to add item to cart."}
            </p>
          )}
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
