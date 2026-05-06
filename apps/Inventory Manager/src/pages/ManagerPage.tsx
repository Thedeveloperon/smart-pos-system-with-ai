import { ArrowLeft, Settings, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProductsTab from "@/components/manager/ProductsTab";
import CatalogueTab from "@/components/manager/CatalogueTab";
import SuppliersTab from "@/components/manager/SuppliersTab";
import ServicesTab from "@/components/manager/ServicesTab";
import PromotionsTab from "@/components/manager/PromotionsTab";

type Props = { onBack: () => void };

export default function ManagerPage({ onBack }: Props) {
  return (
    <div className="min-h-screen pos-shell">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-pos-header text-pos-header-foreground shadow-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-pos-header-foreground/80 hover:bg-white/10 hover:text-pos-header-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <div className="h-4 w-px bg-white/15" />
          <Store className="h-5 w-5 text-primary" />
          <div>
            <div className="text-sm font-semibold leading-none">Manager</div>
            <div className="text-xs text-pos-header-foreground/70">Products and catalogue administration</div>
          </div>
          <div className="ml-auto flex items-center gap-2 text-pos-header-foreground/70">
            <Settings className="h-4 w-4" />
            <span className="text-xs uppercase tracking-[0.2em]">Inventory Manager</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Tabs defaultValue="products" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5 border border-border/60 bg-secondary/60 md:w-fit">
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="catalogue">Categories & Brands</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
            <TabsTrigger value="promotions">Promotions</TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="mt-0">
            <ProductsTab />
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

          <TabsContent value="promotions" className="mt-0">
            <PromotionsTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
