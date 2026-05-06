import { useState } from "react";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ShopImportWizard from "@/components/import/ShopImportWizard";
import ProductsTab from "@/components/manager/ProductsTab";
import CatalogueTab from "@/components/manager/CatalogueTab";
import SuppliersTab from "@/components/manager/SuppliersTab";
import BundlesTab from "@/components/manager/BundlesTab";
import ServicesTab from "@/components/manager/ServicesTab";

export default function ManagerWorkspace() {
  const [activeTab, setActiveTab] = useState<"products" | "bundles" | "services" | "catalogue" | "suppliers">("products");
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" variant="outline" className="gap-2" onClick={() => setWizardOpen(true)}>
          <UploadCloud className="h-4 w-4" />
          Import Shop Data
        </Button>
      </div>
      <ShopImportWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 border border-border/60 bg-secondary/60 md:w-fit">
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="bundles">Bundles</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="catalogue">Categories & Brands</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-0">
          <ProductsTab onNavigate={(tab) => setActiveTab(tab)} />
        </TabsContent>

        <TabsContent value="bundles" className="mt-0">
          <BundlesTab />
        </TabsContent>

        <TabsContent value="services" className="mt-0">
          <ServicesTab />
        </TabsContent>

        <TabsContent value="catalogue" className="mt-0">
          <CatalogueTab />
        </TabsContent>

        <TabsContent value="suppliers" className="mt-0">
          <SuppliersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
