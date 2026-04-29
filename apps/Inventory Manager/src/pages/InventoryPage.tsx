import { lazy, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";

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
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Dashboard
          </Button>
          <h1 className="text-2xl font-bold">Inventory Management</h1>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full md:w-auto">
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
    </div>
  );
}
