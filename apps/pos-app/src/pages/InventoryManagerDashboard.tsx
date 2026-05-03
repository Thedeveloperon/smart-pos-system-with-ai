import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ManagerWorkspace from "@/components/manager/ManagerWorkspace";
import PurchasesWorkspace from "@/components/purchases/PurchasesWorkspace";
import ReportsPage from "@/components/reports/ReportsPage";
import InventoryProductsWorkspace from "@/components/pos/InventoryProductsWorkspace";

const InventoryDashboardTab = lazy(() => import("@/components/inventory/InventoryDashboardTab"));
const CustomersWorkspace = lazy(() => import("@/components/customers/CustomersWorkspace"));
const StockMovementsTab = lazy(() => import("@/components/inventory/StockMovementsTab"));
const SerialNumbersTab = lazy(() => import("@/components/inventory/SerialNumbersTab"));
const BatchesTab = lazy(() => import("@/components/inventory/BatchesTab"));
const StocktakeTab = lazy(() => import("@/components/inventory/StocktakeTab"));
const WarrantyClaimsTab = lazy(() => import("@/components/inventory/WarrantyClaimsTab"));

type ModuleTab = "inventory" | "products" | "customers" | "purchases" | "reports" | "manager";
type InventoryTab = "overview" | "movements" | "serials" | "batches" | "stocktake" | "claims";

const TAB_VALUES: ModuleTab[] = ["inventory", "products", "customers", "purchases", "reports", "manager"];

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

function getInitialTab(): ModuleTab {
  if (typeof window === "undefined") {
    return "products";
  }

  const rawTab = new URLSearchParams(window.location.search).get("tab")?.trim().toLowerCase();
  if (TAB_VALUES.includes(rawTab as ModuleTab)) {
    return rawTab as ModuleTab;
  }

  return "products";
}

function syncTabToUrl(tab: ModuleTab) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("tab", tab);
  window.history.replaceState({}, "", url);
}

export default function InventoryManagerDashboard() {
  const [activeTab, setActiveTab] = useState<ModuleTab>(() => getInitialTab());
  const returnTarget = useMemo(() => getReturnTarget(), []);

  useEffect(() => {
    syncTabToUrl(activeTab);
  }, [activeTab]);

  return (
    <div className="min-h-screen pos-shell">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-pos-header text-pos-header-foreground shadow-md">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
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

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ModuleTab)}>
              <TabsList className="inline-flex h-11 w-full gap-1 rounded-xl bg-white/10 p-1 text-pos-header-foreground shadow-inner md:w-auto">
                <TabsTrigger
                  value="products"
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-pos-header-foreground/80 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  Products
                </TabsTrigger>
                <TabsTrigger
                  value="customers"
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-pos-header-foreground/80 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  Customers
                </TabsTrigger>
                <TabsTrigger
                  value="inventory"
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-pos-header-foreground/80 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  Inventory
                </TabsTrigger>
                <TabsTrigger
                  value="purchases"
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-pos-header-foreground/80 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  Purchases
                </TabsTrigger>
                <TabsTrigger
                  value="reports"
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-pos-header-foreground/80 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  Reports
                </TabsTrigger>
                <TabsTrigger
                  value="manager"
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-pos-header-foreground/80 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  Manager
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ModuleTab)}>
          <TabsContent value="inventory" className="mt-0">
            <Tabs defaultValue="overview">
              <TabsList className="mb-6 grid w-full grid-cols-2 gap-1 border border-border/60 bg-secondary/60 md:w-auto md:grid-cols-6">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="movements">Movements</TabsTrigger>
                <TabsTrigger value="serials">Serials</TabsTrigger>
                <TabsTrigger value="batches">Batches</TabsTrigger>
                <TabsTrigger value="stocktake">Stocktake</TabsTrigger>
                <TabsTrigger value="claims">Claims</TabsTrigger>
              </TabsList>

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
            </Tabs>
          </TabsContent>
          <TabsContent value="products" className="mt-0">
            <InventoryProductsWorkspace />
          </TabsContent>
          <TabsContent value="customers" className="mt-0">
            <Suspense fallback={<TabFallback />}>
              <CustomersWorkspace />
            </Suspense>
          </TabsContent>
          <TabsContent value="purchases" className="mt-0">
            <PurchasesWorkspace />
          </TabsContent>
          <TabsContent value="reports" className="mt-0">
            <ReportsPage compact />
          </TabsContent>
          <TabsContent value="manager" className="mt-0">
            <ManagerWorkspace />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
