import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProductsTab from "@/components/manager/ProductsTab";
import CatalogueTab from "@/components/manager/CatalogueTab";
import SuppliersTab from "@/components/manager/SuppliersTab";

export default function ManagerWorkspace() {
  const [activeTab, setActiveTab] = useState<"products" | "catalogue" | "suppliers">("products");

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="space-y-4">
      <TabsList className="grid w-full grid-cols-3 border border-border/60 bg-secondary/60 md:w-fit">
        <TabsTrigger value="products">Products</TabsTrigger>
        <TabsTrigger value="catalogue">Categories & Brands</TabsTrigger>
        <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
      </TabsList>

      <TabsContent value="products" className="mt-0">
        <ProductsTab onNavigate={(tab) => setActiveTab(tab)} />
      </TabsContent>

      <TabsContent value="catalogue" className="mt-0">
        <CatalogueTab />
      </TabsContent>

      <TabsContent value="suppliers" className="mt-0">
        <SuppliersTab />
      </TabsContent>
    </Tabs>
  );
}
