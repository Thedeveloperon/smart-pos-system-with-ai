import { lazy, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Package } from "lucide-react";

const InventoryDashboardTab = lazy(() => import("@/components/inventory/InventoryDashboardTab"));
const StockMovementsTab = lazy(() => import("@/components/inventory/StockMovementsTab"));
const SerialNumbersTab = lazy(() => import("@/components/inventory/SerialNumbersTab"));
const BatchesTab = lazy(() => import("@/components/inventory/BatchesTab"));
const StocktakeTab = lazy(() => import("@/components/inventory/StocktakeTab"));
const WarrantyClaimsTab = lazy(() => import("@/components/inventory/WarrantyClaimsTab"));

const Fallback = () => (
  <div className="space-y-3">
    <Skeleton className="h-32" />
    <Skeleton className="h-64" />
  </div>
);

type Props = { onBack: () => void };

export default function InventoryPage({ onBack }: Props) {
  return (
    <div className="min-h-screen pos-shell">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-pos-header text-pos-header-foreground shadow-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-pos-header-foreground/80 hover:text-pos-header-foreground hover:bg-white/10"
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
        <Tabs defaultValue="overview">
          <TabsList className="mb-6 grid w-full grid-cols-3 gap-1 border border-border/60 bg-secondary/60 md:w-auto md:grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="movements">Movements</TabsTrigger>
            <TabsTrigger value="serials">Serials</TabsTrigger>
            <TabsTrigger value="batches">Batches</TabsTrigger>
            <TabsTrigger value="stocktake">Stocktake</TabsTrigger>
            <TabsTrigger value="claims">Claims</TabsTrigger>
          </TabsList>

          <div className="mt-4">
            <TabsContent value="overview">
              <Suspense fallback={<Fallback />}>
                <InventoryDashboardTab />
              </Suspense>
            </TabsContent>
            <TabsContent value="movements">
              <Suspense fallback={<Fallback />}>
                <StockMovementsTab />
              </Suspense>
            </TabsContent>
            <TabsContent value="serials">
              <Suspense fallback={<Fallback />}>
                <SerialNumbersTab />
              </Suspense>
            </TabsContent>
            <TabsContent value="batches">
              <Suspense fallback={<Fallback />}>
                <BatchesTab />
              </Suspense>
            </TabsContent>
            <TabsContent value="stocktake">
              <Suspense fallback={<Fallback />}>
                <StocktakeTab />
              </Suspense>
            </TabsContent>
            <TabsContent value="claims">
              <Suspense fallback={<Fallback />}>
                <WarrantyClaimsTab />
              </Suspense>
            </TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
}
