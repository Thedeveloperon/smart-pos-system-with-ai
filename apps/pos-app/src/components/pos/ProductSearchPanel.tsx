import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Check, ChevronsUpDown, Keyboard, Package, Plus, ScanBarcode, Search } from "lucide-react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { NotFoundException } from "@zxing/library";
import { ApiError, lookupSerial } from "@/lib/api";
import ProductCard from "./ProductCard";
import type { Product, SelectedSerial } from "./types";
import { POS_SHORTCUT_INLINE_HINT, POS_SHORTCUT_LABELS } from "./shortcuts";

const SCANNER_BURST_INTERVAL_MS = 45;
const SCANNER_ENTER_GRACE_MS = 120;
const SCANNER_BURST_MIN_CHARS = 6;
const CAMERA_SCAN_DUPLICATE_COOLDOWN_MS = 1300;
const SERIAL_LOOKUP_DEBOUNCE_MS = 220;
const normalizeBarcode = (value: string) => value.trim().toLowerCase();
const isBarcodeFeatureEnabled = import.meta.env.VITE_BARCODE_FEATURE_ENABLED !== "false";
const DEFAULT_CATEGORY = "Uncategorized";
const DEFAULT_BRAND = "Unbranded";

type StockFilter = "all" | "in" | "out" | "low";
type SortOption = "name_asc" | "name_desc" | "price_asc" | "price_desc" | "stock_asc" | "stock_desc";

const resolveCategoryName = (product: Product) => {
  const raw = product.categoryName ?? product.category;
  if (!raw || !raw.trim()) {
    return DEFAULT_CATEGORY;
  }

  return raw.trim();
};

const resolveBrandName = (product: Product) => {
  const raw = product.brandName;
  if (!raw || !raw.trim()) {
    return DEFAULT_BRAND;
  }

  return raw.trim();
};

interface ProductSearchPanelProps {
  products: Product[];
  onAddToCart: (product: Product, qty: number, selectedSerial?: SelectedSerial) => void;
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
    const [selectedCategory, setSelectedCategory] = useState("all");
    const [selectedBrand, setSelectedBrand] = useState("all");
    const [selectedProductId, setSelectedProductId] = useState("all");
    const [stockFilter, setStockFilter] = useState<StockFilter>("all");
    const [sortOption, setSortOption] = useState<SortOption>("name_asc");
    const [productFilterOpen, setProductFilterOpen] = useState(false);
    const [barcodeFeedback, setBarcodeFeedback] = useState<string | null>(null);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [cameraStarting, setCameraStarting] = useState(false);
    const [cameraFeedback, setCameraFeedback] = useState<string | null>(null);
    const [serialLookupProduct, setSerialLookupProduct] = useState<Product | null>(null);
    const [serialLookupFeedback, setSerialLookupFeedback] = useState<string | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const cameraVideoRef = useRef<HTMLVideoElement>(null);
    const scannerControlsRef = useRef<IScannerControls | null>(null);
    const lastCameraScanRef = useRef({ value: "", at: 0 });
    const scannerBurstRef = useRef({ charCount: 0, lastKeyAt: 0 });
    const lastAutoAddKeyRef = useRef<string | null>(null);
    const serialLookupRequestIdRef = useRef(0);

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

    const stopCameraStream = useCallback(() => {
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;

      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = null;
      }

      lastCameraScanRef.current = { value: "", at: 0 };
    }, []);

    const canUseCameraScanner = useCallback(() => {
      if (typeof navigator === "undefined") {
        return false;
      }

      return Boolean(navigator.mediaDevices?.getUserMedia);
    }, []);

    const processBarcodeValue = useCallback(
      (rawValue: string, scannerLike: boolean, keepSearchFocused: boolean) => {
        const trimmedValue = rawValue.trim();
        if (!trimmedValue) {
          return;
        }

        const normalizedBarcodeQuery = normalizeBarcode(trimmedValue);
        const matchedProduct = products.find((product) => {
          if (!product.barcode) {
            return false;
          }

          return normalizeBarcode(product.barcode) === normalizedBarcodeQuery;
        });

        if (matchedProduct) {
          onAddToCart(matchedProduct, 1);
          setSearchQuery("");
          setBarcodeFeedback(null);
        } else {
          setSearchQuery(trimmedValue);
          setBarcodeFeedback(
            scannerLike
              ? `No product matched scanned barcode "${trimmedValue}".`
              : `No product matched barcode "${trimmedValue}".`,
          );
        }

        resetScannerBurst();
        if (keepSearchFocused) {
          focusAndSelectSearch();
        }
      },
      [focusAndSelectSearch, onAddToCart, products, resetScannerBurst],
    );

    useImperativeHandle(
      ref,
      () => ({
        focusSearch: focusAndSelectSearch,
      }),
      [focusAndSelectSearch],
    );

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const categoryOptions = useMemo(
      () => Array.from(new Set(products.map(resolveCategoryName))).sort((left, right) => left.localeCompare(right)),
      [products],
    );
    const brandOptions = useMemo(
      () => Array.from(new Set(products.map(resolveBrandName))).sort((left, right) => left.localeCompare(right)),
      [products],
    );
    const productOptions = useMemo(
      () => [...products].sort((left, right) => left.name.localeCompare(right.name)),
      [products],
    );

    useEffect(() => {
      if (selectedCategory !== "all" && !categoryOptions.includes(selectedCategory)) {
        setSelectedCategory("all");
      }
    }, [categoryOptions, selectedCategory]);

    useEffect(() => {
      if (selectedBrand !== "all" && !brandOptions.includes(selectedBrand)) {
        setSelectedBrand("all");
      }
    }, [brandOptions, selectedBrand]);

    useEffect(() => {
      if (selectedProductId !== "all" && !products.some((product) => product.id === selectedProductId)) {
        setSelectedProductId("all");
      }
    }, [products, selectedProductId]);

    const filtered = useMemo(() => {
      let next = [...products];

      if (selectedCategory !== "all") {
        next = next.filter((product) => resolveCategoryName(product) === selectedCategory);
      }

      if (selectedBrand !== "all") {
        next = next.filter((product) => resolveBrandName(product) === selectedBrand);
      }

      if (selectedProductId !== "all") {
        next = next.filter((product) => product.id === selectedProductId);
      }

      if (stockFilter === "in") {
        next = next.filter((product) => product.stock > 0);
      } else if (stockFilter === "out") {
        next = next.filter((product) => product.stock <= 0);
      } else if (stockFilter === "low") {
        next = next.filter((product) => product.isLowStock === true);
      }

      if (normalizedQuery) {
        next = next.filter((product) =>
          [
            product.name,
            product.sku,
            product.barcode || "",
            resolveCategoryName(product),
            resolveBrandName(product),
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery),
        );
      }

      next.sort((left, right) => {
        switch (sortOption) {
          case "name_desc":
            return right.name.localeCompare(left.name);
          case "price_asc":
            return left.price - right.price;
          case "price_desc":
            return right.price - left.price;
          case "stock_asc":
            return left.stock - right.stock;
          case "stock_desc":
            return right.stock - left.stock;
          case "name_asc":
          default:
            return left.name.localeCompare(right.name);
        }
      });

      return next;
    }, [products, selectedCategory, selectedBrand, selectedProductId, stockFilter, normalizedQuery, sortOption]);

    const displayedProducts = useMemo(() => {
      if (!serialLookupProduct) {
        return filtered;
      }

      if (filtered.some((product) => product.id === serialLookupProduct.id)) {
        return filtered;
      }

      return [serialLookupProduct, ...filtered];
    }, [filtered, serialLookupProduct]);

    const selectedProductLabel = useMemo(() => {
      if (selectedProductId === "all") {
        return "All products";
      }

      return productOptions.find((product) => product.id === selectedProductId)?.name ?? "All products";
    }, [productOptions, selectedProductId]);

    const getSelectedSerial = useCallback(
      (product: Product): SelectedSerial | undefined =>
        product.matchedSerialId && product.matchedSerialValue
          ? {
              id: product.matchedSerialId,
              value: product.matchedSerialValue,
            }
          : undefined,
      [],
    );

    const clearFilters = useCallback(() => {
      setSearchQuery("");
      setSelectedCategory("all");
      setSelectedBrand("all");
      setSelectedProductId("all");
      setStockFilter("all");
      setSortOption("name_asc");
      setBarcodeFeedback(null);
      setSerialLookupProduct(null);
      setSerialLookupFeedback(null);
      focusAndSelectSearch();
    }, [focusAndSelectSearch]);

    const submitBarcodeQuery = useCallback(
      (scannerLike: boolean) => {
        processBarcodeValue(searchQuery, scannerLike, true);
      },
      [processBarcodeValue, searchQuery],
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

    const handleAddProduct = useCallback(
      (product: Product, _qty = 1) => {
        onAddToCart(product, 1, getSelectedSerial(product));
        setSearchQuery("");
        setSerialLookupProduct(null);
        setSerialLookupFeedback(null);
        window.setTimeout(() => {
          focusAndSelectSearch();
        }, 0);
      },
      [focusAndSelectSearch, getSelectedSerial, onAddToCart],
    );

    const handleSearchKeyDown = useCallback(
      (event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (searchMode === "barcode") {
          handleBarcodeInputKeyDown(event);
          return;
        }

        if (!expertMode) {
          return;
        }

        if (event.key !== "Enter") {
          return;
        }

        if (normalizedQuery.length === 0) {
          return;
        }

        const exactMatch = displayedProducts.find((product) => {
          const name = product.name.toLowerCase();
          const sku = product.sku.toLowerCase();
          const barcode = product.barcode?.toLowerCase();
          const serial = product.matchedSerialValue?.toLowerCase();
          return (
            name === normalizedQuery ||
            sku === normalizedQuery ||
            barcode === normalizedQuery ||
            serial === normalizedQuery
          );
        });

        const nextProduct = exactMatch ?? displayedProducts[0];
        if (!nextProduct) {
          return;
        }

        if (exactMatch) {
          const autoAddKey = `${exactMatch.id}:${normalizedQuery}`;
          if (lastAutoAddKeyRef.current === autoAddKey) {
            return;
          }

          lastAutoAddKeyRef.current = autoAddKey;
        }

        event.preventDefault();
        handleAddProduct(nextProduct);
      },
      [displayedProducts, expertMode, handleAddProduct, handleBarcodeInputKeyDown, normalizedQuery, searchMode],
    );

    const toggleSearchMode = useCallback(() => {
      if (!isBarcodeFeatureEnabled) {
        return;
      }

      if (searchMode === "barcode") {
        stopCameraStream();
        setCameraOpen(false);
        setCameraFeedback(null);
        setCameraStarting(false);
        setSearchMode("manual");
        setBarcodeFeedback(null);
        return;
      }

      setSearchQuery("");
      setSearchMode("barcode");
      setBarcodeFeedback(null);
      setCameraFeedback(null);
    }, [searchMode, stopCameraStream]);

    const toggleCameraScanner = useCallback(() => {
      if (cameraOpen) {
        stopCameraStream();
        setCameraOpen(false);
        setCameraStarting(false);
        setCameraFeedback("Camera scanner stopped.");
        return;
      }

      if (!canUseCameraScanner()) {
        setCameraFeedback("Camera barcode scan is unavailable in this browser. Use scanner input and Enter.");
        return;
      }

      setCameraFeedback(null);
      setBarcodeFeedback(null);
      setSearchQuery("");
      setCameraOpen(true);
    }, [cameraOpen, canUseCameraScanner, stopCameraStream]);

    useEffect(() => {
      if (searchMode !== "barcode") {
        return;
      }

      focusAndSelectSearch();
      resetScannerBurst();
      setBarcodeFeedback(null);
    }, [focusAndSelectSearch, resetScannerBurst, searchMode]);

    useEffect(() => {
      if (searchMode === "barcode") {
        return;
      }

      if (!cameraOpen) {
        return;
      }

      stopCameraStream();
      setCameraOpen(false);
      setCameraStarting(false);
    }, [cameraOpen, searchMode, stopCameraStream]);

    useEffect(() => {
      if (searchMode !== "barcode" || !cameraOpen || !isBarcodeFeatureEnabled) {
        return;
      }

      let disposed = false;

      const setupCamera = async () => {
        setCameraStarting(true);

        try {
          const reader = new BrowserMultiFormatReader();
          const video = cameraVideoRef.current;
          if (!video) {
            throw new Error("Could not open camera preview.");
          }

          const controls = await reader.decodeFromConstraints(
            {
              audio: false,
              video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
            },
            video,
            (result, error) => {
              if (disposed) {
                return;
              }

              if (result) {
                const detectedValue = result.getText().trim();
                if (detectedValue) {
                  const now = Date.now();
                  const last = lastCameraScanRef.current;
                  if (
                    last.value === detectedValue &&
                    now - last.at < CAMERA_SCAN_DUPLICATE_COOLDOWN_MS
                  ) {
                    return;
                  }

                  lastCameraScanRef.current = { value: detectedValue, at: now };
                  setCameraFeedback(`Detected barcode ${detectedValue}.`);
                  processBarcodeValue(detectedValue, true, false);
                }
              }

              if (error && !(error instanceof NotFoundException)) {
                setCameraFeedback("Camera scan is running, but barcode detection is unstable. Try better lighting.");
              }
            },
          );

          if (disposed) {
            controls.stop();
            return;
          }

          scannerControlsRef.current = controls;
          setCameraFeedback("Camera is active. Hold barcode in frame.");
        } catch (error) {
          if (disposed) {
            return;
          }

          const errorName = error instanceof DOMException ? error.name : "";
          if (errorName === "NotAllowedError") {
            setCameraFeedback("Camera permission was denied. Allow camera access and try again.");
          } else if (errorName === "NotFoundError") {
            setCameraFeedback("No camera device was found on this system.");
          } else if (errorName === "NotReadableError") {
            setCameraFeedback("Camera is currently in use by another app.");
          } else if (errorName === "SecurityError") {
            setCameraFeedback("Camera access requires a secure context (HTTPS).");
          } else {
            setCameraFeedback("Unable to start camera barcode scanning right now.");
          }

          setCameraOpen(false);
          stopCameraStream();
        } finally {
          if (!disposed) {
            setCameraStarting(false);
          }
        }
      };

      void setupCamera();

      return () => {
        disposed = true;
        stopCameraStream();
      };
    }, [cameraOpen, processBarcodeValue, searchMode, stopCameraStream]);

    useEffect(() => {
      if (!expertMode || searchMode !== "manual" || normalizedQuery.length === 0) {
        lastAutoAddKeyRef.current = null;
        return;
      }

      const exactMatch = displayedProducts.find((product) => {
        const name = product.name.toLowerCase();
        const sku = product.sku.toLowerCase();
        const barcode = product.barcode?.toLowerCase();
        const serial = product.matchedSerialValue?.toLowerCase();
        return (
          name === normalizedQuery ||
          sku === normalizedQuery ||
          barcode === normalizedQuery ||
          serial === normalizedQuery
        );
      });

      if (!exactMatch) {
        return;
      }

      const autoAddKey = `${exactMatch.id}:${normalizedQuery}`;
      if (lastAutoAddKeyRef.current === autoAddKey) {
        return;
      }

      lastAutoAddKeyRef.current = autoAddKey;
      handleAddProduct(exactMatch);
    }, [displayedProducts, expertMode, handleAddProduct, normalizedQuery, searchMode]);

    useEffect(() => {
      if (searchMode !== "manual") {
        serialLookupRequestIdRef.current += 1;
        setSerialLookupProduct(null);
        setSerialLookupFeedback(null);
        return;
      }

      const trimmedQuery = searchQuery.trim();
      const localExactMatch = products.some((product) => {
        const name = product.name.toLowerCase();
        const sku = product.sku.toLowerCase();
        const barcode = product.barcode?.toLowerCase();
        return name === normalizedQuery || sku === normalizedQuery || barcode === normalizedQuery;
      });

      if (trimmedQuery.length < 4 || localExactMatch || filtered.length > 0) {
        serialLookupRequestIdRef.current += 1;
        setSerialLookupProduct(null);
        setSerialLookupFeedback(null);
        return;
      }

      const requestId = serialLookupRequestIdRef.current + 1;
      serialLookupRequestIdRef.current = requestId;
      const timeoutId = window.setTimeout(() => {
        void lookupSerial(trimmedQuery)
          .then((result) => {
            if (serialLookupRequestIdRef.current !== requestId) {
              return;
            }

            if (result.status !== "Available") {
              setSerialLookupProduct(null);
              setSerialLookupFeedback(
                `Serial ${result.serial_value} is ${result.status.toLowerCase()} and cannot be added.`,
              );
              return;
            }

            setSerialLookupProduct({
              ...result.product,
              matchedSerialId: result.serial_id,
              matchedSerialValue: result.serial_value,
              matchedSerialStatus: result.status,
            });
            setSerialLookupFeedback(`Serial match: ${result.serial_value}`);
          })
          .catch((error: unknown) => {
            if (serialLookupRequestIdRef.current !== requestId) {
              return;
            }

            setSerialLookupProduct(null);
            if (error instanceof ApiError && error.status === 404) {
              setSerialLookupFeedback(null);
              return;
            }

            setSerialLookupFeedback("Serial lookup is unavailable right now.");
          });
      }, SERIAL_LOOKUP_DEBOUNCE_MS);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }, [filtered.length, normalizedQuery, products, searchMode, searchQuery]);

    return (
      <div className="flex flex-col h-full">
        <div className="p-3 border-b border-border bg-card pos-shadow-md sticky top-0 z-10">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  if (searchMode === "manual" && serialLookupProduct) {
                    setSerialLookupProduct(null);
                  }
                  if (searchMode === "manual" && serialLookupFeedback) {
                    setSerialLookupFeedback(null);
                  }
                  if (searchMode === "barcode" && barcodeFeedback) {
                    setBarcodeFeedback(null);
                  }
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder={
                  searchMode === "barcode"
                    ? "Scan or enter barcode..."
                    : "Search products by name, SKU, serial..."
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
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="h-9 rounded-xl text-xs">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categoryOptions.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedBrand} onValueChange={setSelectedBrand}>
              <SelectTrigger className="h-9 rounded-xl text-xs">
                <SelectValue placeholder="Brand" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brands</SelectItem>
                {brandOptions.map((brand) => (
                  <SelectItem key={brand} value={brand}>
                    {brand}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover open={productFilterOpen} onOpenChange={setProductFilterOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-9 justify-between rounded-xl text-xs font-normal xl:col-span-2">
                  <span className="truncate">{selectedProductLabel}</span>
                  <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[min(92vw,24rem)] p-0">
                <Command>
                  <CommandInput placeholder="Search product..." />
                  <CommandList>
                    <CommandEmpty>No product found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="all products"
                        onSelect={() => {
                          setSelectedProductId("all");
                          setProductFilterOpen(false);
                        }}
                      >
                        <Check className={`mr-2 h-4 w-4 ${selectedProductId === "all" ? "opacity-100" : "opacity-0"}`} />
                        All products
                      </CommandItem>
                      {productOptions.map((product) => (
                        <CommandItem
                          key={product.id}
                          value={`${product.name} ${product.sku} ${product.barcode || ""}`}
                          onSelect={() => {
                            setSelectedProductId(product.id);
                            setProductFilterOpen(false);
                          }}
                        >
                          <Check className={`mr-2 h-4 w-4 ${selectedProductId === product.id ? "opacity-100" : "opacity-0"}`} />
                          <span className="truncate">{product.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <Select value={stockFilter} onValueChange={(value) => setStockFilter(value as StockFilter)}>
              <SelectTrigger className="h-9 rounded-xl text-xs">
                <SelectValue placeholder="Stock status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stock</SelectItem>
                <SelectItem value="in">In stock</SelectItem>
                <SelectItem value="out">Out of stock</SelectItem>
                <SelectItem value="low">Low stock</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
                <SelectTrigger className="h-9 rounded-xl text-xs">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name_asc">Name A-Z</SelectItem>
                  <SelectItem value="name_desc">Name Z-A</SelectItem>
                  <SelectItem value="price_asc">Price Low-High</SelectItem>
                  <SelectItem value="price_desc">Price High-Low</SelectItem>
                  <SelectItem value="stock_asc">Stock Low-High</SelectItem>
                  <SelectItem value="stock_desc">Stock High-Low</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" className="h-9 rounded-xl text-xs" onClick={clearFilters}>
                Clear
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            <span>{displayedProducts.length} products</span>
            {searchQuery && (
              <button className="text-primary hover:underline" onClick={() => setSearchQuery("")}>
                Clear search
              </button>
            )}
            {showShortcutHints && <span className="ml-auto hidden lg:inline">Shortcuts: {POS_SHORTCUT_INLINE_HINT}</span>}
          </div>
          {searchMode === "manual" && serialLookupFeedback && (
            <p
              className={`mt-2 text-xs ${
                serialLookupProduct
                  ? "text-primary font-medium"
                  : serialLookupFeedback.startsWith("Serial ")
                    ? "text-destructive font-medium"
                    : "text-muted-foreground"
              }`}
              role="status"
              aria-live="polite"
            >
              {serialLookupFeedback}
            </p>
          )}
          {isBarcodeFeatureEnabled && searchMode === "barcode" && (
            <p
              className={`mt-2 text-xs ${barcodeFeedback ? "text-destructive font-medium" : "text-muted-foreground"}`}
              role="status"
              aria-live="polite"
            >
              {barcodeFeedback || "Barcode mode active: scan and press Enter to add item to cart."}
            </p>
          )}
          {isBarcodeFeatureEnabled && searchMode === "barcode" && (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={cameraOpen ? "default" : "outline"}
                  size="sm"
                  className="h-8 rounded-lg"
                  onClick={toggleCameraScanner}
                  disabled={cameraStarting}
                  aria-label={cameraOpen ? "Stop camera barcode scan" : "Start camera barcode scan"}
                  title="Use inbuilt camera for barcode scanning"
                >
                  <Camera className="mr-1.5 h-3.5 w-3.5" />
                  {cameraOpen ? "Stop camera" : "Scan with camera"}
                </Button>
                {cameraStarting && <span className="text-[11px] text-muted-foreground">Opening camera...</span>}
                {cameraFeedback && (
                  <span className="text-[11px] text-muted-foreground" role="status" aria-live="polite">
                    {cameraFeedback}
                  </span>
                )}
              </div>
              {cameraOpen && (
                <div className="overflow-hidden rounded-xl border border-border bg-black/90">
                  <video
                    ref={cameraVideoRef}
                    className="h-44 w-full object-cover sm:h-52"
                    muted
                    autoPlay
                    playsInline
                  />
                </div>
              )}
            </div>
          )}
          {expertMode && searchMode === "manual" && (
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
                  <p className="text-xs">Type a product name, SKU, serial number, or barcode to add items fast.</p>
                </div>
              </div>
            ) : displayedProducts.length === 0 ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 px-4 text-center text-muted-foreground">
                <Package className="h-10 w-10 opacity-40" />
                <p className="text-sm">No products found</p>
                <p className="text-xs">Check the spelling, serial number, or scan a barcode again.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {displayedProducts.slice(0, 24).map((product) => (
                  <button
                    key={product.matchedSerialId ?? product.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 text-left transition hover:-translate-y-px hover:border-primary/40 hover:shadow-sm"
                    onClick={() => handleAddProduct(product)}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{product.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground font-mono">
                        {product.matchedSerialValue ? `Serial ${product.matchedSerialValue}` : product.sku}
                      </p>
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
                {displayedProducts.length > 24 && <p className="px-1 text-xs text-muted-foreground">Showing first 24 matches.</p>}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-scroll scrollbar-thin p-2.5 pr-3">
            {displayedProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
                <Package className="h-12 w-12 opacity-40" />
                <p className="text-sm">No products found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
                {displayedProducts.map((product) => (
                  <ProductCard key={product.matchedSerialId ?? product.id} product={product} onAdd={handleAddProduct} />
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
