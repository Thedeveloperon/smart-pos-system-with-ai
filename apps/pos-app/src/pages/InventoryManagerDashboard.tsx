import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const InventoryDashboardTab = lazy(() => import("@/components/inventory/InventoryDashboardTab"));
const StockMovementsTab = lazy(() => import("@/components/inventory/StockMovementsTab"));
const SerialNumbersTab = lazy(() => import("@/components/inventory/SerialNumbersTab"));
const BatchesTab = lazy(() => import("@/components/inventory/BatchesTab"));
const StocktakeTab = lazy(() => import("@/components/inventory/StocktakeTab"));
const WarrantyClaimsTab = lazy(() => import("@/components/inventory/WarrantyClaimsTab"));

type InventoryTab = "overview" | "movements" | "serials" | "batches" | "stocktake" | "claims";

const TAB_VALUES: InventoryTab[] = ["overview", "movements", "serials", "batches", "stocktake", "claims"];

const TabFallback = () => (
  <div className="space-y-3">
    <Skeleton className="h-32" />
    <Skeleton className="h-64" />
  </div>
);

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

function getInitialTab(): InventoryTab {
  if (typeof window === "undefined") {
    return "overview";
  }

  const rawTab = new URLSearchParams(window.location.search).get("tab")?.trim().toLowerCase();
  if (TAB_VALUES.includes(rawTab as InventoryTab)) {
    return rawTab as InventoryTab;
  }

  return "overview";
}

function syncTabToUrl(tab: InventoryTab) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("tab", tab);
  window.history.replaceState({}, "", url);
}

export default function InventoryManagerDashboard() {
  const [activeTab, setActiveTab] = useState<InventoryTab>(() => getInitialTab());
  const returnTarget = useMemo(() => getReturnTarget(), []);

  useEffect(() => {
    syncTabToUrl(activeTab);
  }, [activeTab]);

  return (
    <div className="min-h-screen pos-shell">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-pos-header text-pos-header-foreground shadow-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.assign(returnTarget)}
            className="text-pos-header-foreground/80 hover:bg-white/10 hover:text-pos-header-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Dashboard
          </Button>
          <div className="h-4 w-px bg-white/15" />
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <h1 className="text-base font-semibold">Inventory Management</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as InventoryTab)}>
          <div className="sticky top-14 z-40 mb-6 bg-background/95 pb-3 pt-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <TabsList className="grid h-12 w-full grid-cols-2 gap-1 border border-border/60 bg-secondary/60 p-1 md:grid-cols-6">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="movements">Movements</TabsTrigger>
              <TabsTrigger value="serials">Serials</TabsTrigger>
              <TabsTrigger value="batches">Batches</TabsTrigger>
              <TabsTrigger value="stocktake">Stocktake</TabsTrigger>
              <TabsTrigger value="claims">Claims</TabsTrigger>
            </TabsList>
          </div>

          <div className="mt-4">
            <TabsContent value="overview" className="mt-0">
              <Suspense fallback={<TabFallback />}>
                <InventoryDashboardTab />
              </Suspense>
            </TabsContent>
            <TabsContent value="movements" className="mt-0">
              <Suspense fallback={<TabFallback />}>
                <StockMovementsTab />
              </Suspense>
            </TabsContent>
            <TabsContent value="serials" className="mt-0">
              <Suspense fallback={<TabFallback />}>
                <SerialNumbersTab />
              </Suspense>
            </TabsContent>
            <TabsContent value="batches" className="mt-0">
              <Suspense fallback={<TabFallback />}>
                <BatchesTab />
              </Suspense>
            </TabsContent>
            <TabsContent value="stocktake" className="mt-0">
              <Suspense fallback={<TabFallback />}>
                <StocktakeTab />
              </Suspense>
            </TabsContent>
            <TabsContent value="claims" className="mt-0">
              <Suspense fallback={<TabFallback />}>
                <WarrantyClaimsTab />
              </Suspense>
            </TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
}
