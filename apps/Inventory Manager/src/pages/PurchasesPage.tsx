import { ArrowLeft, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PurchaseOrdersTab from "@/components/purchases/PurchaseOrdersTab";
import SupplierBillsTab from "@/components/purchases/SupplierBillsTab";

type Props = { onBack: () => void };

export default function PurchasesPage({ onBack }: Props) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-slate-900 text-slate-50 shadow-md">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-slate-50 hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">Back</span>
          </Button>
          <ShoppingCart className="h-5 w-5" />
          <span className="font-semibold">Purchases</span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <Tabs defaultValue="orders">
          <TabsList className="mb-6">
            <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
            <TabsTrigger value="bills">Supplier Bills</TabsTrigger>
          </TabsList>
          <TabsContent value="orders">
            <PurchaseOrdersTab />
          </TabsContent>
          <TabsContent value="bills">
            <SupplierBillsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
