import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PurchaseOrdersTab from "@/components/purchases/PurchaseOrdersTab";
import SupplierBillsTab from "@/components/purchases/SupplierBillsTab";

export default function PurchasesWorkspace() {
  return (
    <Tabs defaultValue="orders" className="space-y-4">
      <TabsList className="grid w-full grid-cols-2 border border-border/60 bg-secondary/60 md:w-fit">
        <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
        <TabsTrigger value="bills">Supplier Bills</TabsTrigger>
      </TabsList>

      <TabsContent value="orders" className="mt-0">
        <PurchaseOrdersTab />
      </TabsContent>

      <TabsContent value="bills" className="mt-0">
        <SupplierBillsTab />
      </TabsContent>
    </Tabs>
  );
}
