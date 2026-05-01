import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Boxes,
  Package,
  Plus,
  Receipt,
  Settings,
  ShoppingCart,
} from "lucide-react";
import type { Product } from "@/components/pos/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchInventoryDashboardSummary, fetchProducts } from "@/lib/api";
import { cn } from "@/lib/utils";

type SaleItem = {
  product: Product;
  quantity: number;
};

type InventoryManagerView = "inventory" | "products" | "purchases" | "reports" | "manager";

type NavItem = {
  value: InventoryManagerView;
  label: string;
  icon: typeof Boxes;
};

const NAV_ITEMS: NavItem[] = [
  { value: "inventory", label: "Inventory", icon: Boxes },
  { value: "products", label: "Products", icon: Package },
  { value: "purchases", label: "Purchases", icon: ShoppingCart },
  { value: "reports", label: "Reports", icon: Receipt },
  { value: "manager", label: "Manager", icon: Settings },
];

const formatMoney = (value: number) =>
  `Rs. ${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function getReturnTarget() {
  if (typeof window === "undefined") {
    return "/";
  }

  const rawReturnTarget = new URLSearchParams(window.location.search).get("returnTo")?.trim();
  if (!rawReturnTarget) {
    return "/";
  }

  try {
    const targetUrl = new URL(rawReturnTarget, window.location.origin);
    if (targetUrl.origin !== window.location.origin) {
      return "/";
    }

    return `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}` || "/";
  } catch {
    return "/";
  }
}

function getInitialView(): InventoryManagerView {
  if (typeof window === "undefined") {
    return "inventory";
  }

  const rawView = new URLSearchParams(window.location.search).get("tab")?.trim().toLowerCase();
  if (rawView === "products" || rawView === "purchases" || rawView === "reports" || rawView === "manager") {
    return rawView;
  }

  return "inventory";
}

function syncViewToUrl(view: InventoryManagerView) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("tab", view);
  window.history.replaceState({}, "", url);
}

const InventoryManagerDashboard = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryAlertCount, setInventoryAlertCount] = useState(0);
  const [currentSale, setCurrentSale] = useState<SaleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [activeView, setActiveView] = useState<InventoryManagerView>(() => getInitialView());
  const returnTarget = useMemo(() => getReturnTarget(), []);

  const loadDashboard = async () => {
    setIsLoading(true);
    setLoadFailed(false);

    try {
      const [productItems, summary] = await Promise.all([
        fetchProducts(),
        fetchInventoryDashboardSummary().catch(() => null),
      ]);

      setProducts(productItems);
      setInventoryAlertCount(
        (summary?.expiry_alert_count ?? 0) + (summary?.open_warranty_claims ?? 0),
      );
    } catch (error) {
      console.error(error);
      setLoadFailed(true);
      toast.error("Failed to load the inventory manager dashboard.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  useEffect(() => {
    syncViewToUrl(activeView);
  }, [activeView]);

  const handleAddToSale = (product: Product) => {
    setCurrentSale((previous) => {
      const existingItem = previous.find((item) => item.product.id === product.id);
      if (!existingItem) {
        return [...previous, { product, quantity: 1 }];
      }

      return previous.map((item) =>
        item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
      );
    });
  };

  const renderView = () => {
    if (activeView === "inventory") {
      return (
        <InventoryWorkspace
          products={products}
          currentSale={currentSale}
          inventoryAlertCount={inventoryAlertCount}
          isLoading={isLoading}
          loadFailed={loadFailed}
          onRetry={() => void loadDashboard()}
          onAddToSale={handleAddToSale}
          onClearSale={() => setCurrentSale([])}
        />
      );
    }

    if (activeView === "products") {
      return (
        <ProductsWorkspace
          products={products}
          isLoading={isLoading}
          loadFailed={loadFailed}
          onRetry={() => void loadDashboard()}
          onAddToSale={handleAddToSale}
        />
      );
    }

    return <PlaceholderWorkspace view={activeView} />;
  };

  return (
    <div className="min-h-screen pos-shell">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-pos-header text-pos-header-foreground shadow-md">
        <div className="mx-auto flex min-h-14 max-w-7xl flex-col gap-3 px-4 py-2 lg:h-14 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:py-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.assign(returnTarget)}
              className="text-pos-header-foreground/80 hover:bg-white/10 hover:text-pos-header-foreground"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
            <div className="h-4 w-px bg-white/15" />
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="SmartPOS Lanka logo" className="h-8 w-auto object-contain" />
              <span className="font-semibold">Inventory Manager</span>
            </div>
          </div>

          <nav className="flex items-center gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/5 p-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.value;

              return (
                <Button
                  key={item.value}
                  type="button"
                  variant={isActive ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setActiveView(item.value)}
                  className={cn(
                    "min-w-fit shrink-0 gap-2 rounded-full px-3 text-pos-header-foreground/80 hover:bg-white/10 hover:text-pos-header-foreground",
                    isActive && "bg-white text-slate-950 hover:bg-white hover:text-slate-950",
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-sm">{item.label}</span>
                  {item.value === "inventory" && inventoryAlertCount > 0 ? (
                    <Badge className="ml-1 h-5 min-w-5 rounded-full bg-red-500 px-1.5 text-[10px] text-white">
                      {inventoryAlertCount > 99 ? "99+" : inventoryAlertCount}
                    </Badge>
                  ) : null}
                </Button>
              );
            })}
          </nav>
        </div>
      </header>

      {renderView()}
    </div>
  );
};

function InventoryWorkspace({
  products,
  currentSale,
  inventoryAlertCount,
  isLoading,
  loadFailed,
  onRetry,
  onAddToSale,
  onClearSale,
}: {
  products: Product[];
  currentSale: SaleItem[];
  inventoryAlertCount: number;
  isLoading: boolean;
  loadFailed: boolean;
  onRetry: () => void;
  onAddToSale: (product: Product) => void;
  onClearSale: () => void;
}) {
  const itemCount = currentSale.reduce((total, item) => total + item.quantity, 0);
  const total = currentSale.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(320px,0.9fr)]">
      <Card className="pos-surface-elevated overflow-hidden">
        <CardHeader className="border-b border-border/70 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-2xl">Inventory</CardTitle>
              <p className="text-sm text-muted-foreground">
                Browse stock and tap an item to add it to the current sale.
              </p>
            </div>
            {!isLoading && !loadFailed ? (
              <Badge variant="secondary" className="whitespace-nowrap">
                {products.length} item{products.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-32 rounded-2xl" />
              ))}
            </div>
          ) : loadFailed ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
              <Package className="h-10 w-10 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">Inventory could not be loaded.</p>
                <p className="text-sm text-muted-foreground">Retry to open the inventory dashboard again.</p>
              </div>
              <Button type="button" variant="outline" onClick={onRetry}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onAddToSale(product)}
                  className="rounded-2xl border border-border/70 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.sku}</p>
                    </div>
                    <Badge variant={product.stock <= 0 || product.isLowStock ? "destructive" : "secondary"}>
                      {product.stock} in stock
                    </Badge>
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <span className="text-lg font-bold text-primary">{formatMoney(product.price)}</span>
                    <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Add
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="current-sale-panel" className="pos-surface-elevated h-fit lg:sticky lg:top-20">
        <CardHeader className="border-b border-border/70 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-2xl">Current sale</CardTitle>
              <p className="text-sm text-muted-foreground">
                {itemCount > 0 ? `${itemCount} item${itemCount === 1 ? "" : "s"} added` : "No products added yet"}
              </p>
            </div>
            {inventoryAlertCount > 0 ? <Badge className="bg-primary text-primary-foreground">{inventoryAlertCount}</Badge> : null}
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {currentSale.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-muted/20 px-6 text-center text-muted-foreground">
              <Plus className="h-12 w-12 opacity-35" />
              <div className="space-y-1">
                <p className="text-base font-medium text-foreground">Tap a product to add it.</p>
                <p className="text-sm text-muted-foreground">Your running sale will appear here.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                {currentSale.map((item) => (
                  <div
                    key={item.product.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-white px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatMoney(item.product.price)} x {item.quantity}
                      </p>
                    </div>
                    <p className="whitespace-nowrap font-semibold text-foreground">
                      {formatMoney(item.product.price * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Total</span>
                  <span className="text-xl font-bold text-foreground">{formatMoney(total)}</span>
                </div>
              </div>

              <Button type="button" variant="outline" className="w-full" onClick={onClearSale}>
                Clear current sale
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function ProductsWorkspace({
  products,
  isLoading,
  loadFailed,
  onRetry,
  onAddToSale,
}: {
  products: Product[];
  isLoading: boolean;
  loadFailed: boolean;
  onRetry: () => void;
  onAddToSale: (product: Product) => void;
}) {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <Card className="pos-surface-elevated overflow-hidden">
        <CardHeader className="border-b border-border/70 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-2xl">Products</CardTitle>
              <p className="text-sm text-muted-foreground">
                Review the product catalog and quickly add stock items to the current sale.
              </p>
            </div>
            {!isLoading && !loadFailed ? (
              <Badge variant="secondary" className="whitespace-nowrap">
                {products.length} item{products.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-28 rounded-2xl" />
              ))}
            </div>
          ) : loadFailed ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
              <Package className="h-10 w-10 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">Products could not be loaded.</p>
                <p className="text-sm text-muted-foreground">Retry to refresh the product catalog.</p>
              </div>
              <Button type="button" variant="outline" onClick={onRetry}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onAddToSale(product)}
                  className="rounded-2xl border border-border/70 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.sku}</p>
                    </div>
                    <Badge variant={product.stock <= 0 || product.isLowStock ? "destructive" : "secondary"}>
                      {product.stock} in stock
                    </Badge>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-base font-bold text-primary">{formatMoney(product.price)}</span>
                    <div className="flex gap-1">
                      {product.is_serial_tracked ? <Badge variant="outline" className="text-[10px]">Serial</Badge> : null}
                      {product.is_batch_tracked ? <Badge variant="outline" className="text-[10px]">Batch</Badge> : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function PlaceholderWorkspace({ view }: { view: Exclude<InventoryManagerView, "inventory" | "products"> }) {
  const label = view[0].toUpperCase() + view.slice(1);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <Card className="pos-surface-elevated">
        <CardContent className="flex min-h-[420px] flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            {view === "purchases" ? (
              <ShoppingCart className="h-8 w-8" />
            ) : view === "reports" ? (
              <Receipt className="h-8 w-8" />
            ) : (
              <Settings className="h-8 w-8" />
            )}
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">{label}</h2>
            <p className="max-w-lg text-sm text-muted-foreground">
              This section is kept in the inventory manager shell so the top navigation stays fixed.
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

export default InventoryManagerDashboard;
