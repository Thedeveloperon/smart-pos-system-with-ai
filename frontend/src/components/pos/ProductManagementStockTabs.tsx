import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  ShoppingCart,
  Star,
  Tag,
} from "lucide-react";
import {
  createCategory,
  fetchCategories,
  fetchLowStockReport,
  fetchProductCatalogItems,
  updateCategory,
  type CatalogProduct,
  type CreateCategoryRequest,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

type DemoProduct = {
  id: string;
  name: string;
  sku: string;
  brandId: string;
  brandName: string;
  unitPrice: number;
};

type DemoBrand = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
};

type DemoSupplier = {
  id: string;
  name: string;
  code: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  defaultLeadTimeDays: number;
  paymentTerms: string;
  notes: string;
  isActive: boolean;
};

type DemoProductSupplierLink = {
  id: string;
  supplierId: string;
  productId: string;
  productName: string;
  productSku: string;
  isPreferred: boolean;
  leadTimeDays: number;
  minOrderQty: number;
  packSize: number;
  lastPurchasePrice: number;
};

type DemoInventorySetting = {
  productId: string;
  productName: string;
  reorderLevel: number;
  safetyStock: number;
  targetStockLevel: number;
  allowNegativeStock: boolean;
};

type DemoShopStockSettings = {
  lowStockThreshold: number;
  safetyStock: number;
  leadTimeDays: number;
  targetDaysOfCover: number;
};

type DemoDraftOrderLine = {
  productId: string;
  productName: string;
  sku: string;
  qty: number;
  unitCost: number;
  total: number;
};

type DemoDraftOrder = {
  id: string;
  supplierId: string;
  supplierName: string;
  status: "Draft" | "Confirmed";
  lines: DemoDraftOrderLine[];
  notes: string;
  createdAt: string;
  totalAmount: number;
};

const demoProducts: DemoProduct[] = [
  { id: "p1", name: "Pepsi 330ml", sku: "PP-330", brandId: "pepsi", brandName: "Pepsi", unitPrice: 180 },
  { id: "p2", name: "Coca-Cola 330ml", sku: "CC-330", brandId: "cola", brandName: "Coca-Cola", unitPrice: 190 },
  { id: "p3", name: "Nestle KitKat 4-Finger", sku: "NS-KK-4F", brandId: "nestle", brandName: "Nestle", unitPrice: 260 },
  { id: "p4", name: "Lay's Sour Cream 150g", sku: "LY-SC-150", brandId: "lays", brandName: "Lay's", unitPrice: 240 },
  { id: "p5", name: "7UP 330ml", sku: "7U-330", brandId: "pepsi", brandName: "Pepsi", unitPrice: 175 },
  { id: "p6", name: "Lays Chips 150g", sku: "LY-CH-150", brandId: "lays", brandName: "Lay's", unitPrice: 245 },
];

const demoSuppliers: DemoSupplier[] = [
  {
    id: "s1",
    name: "Metro Beverages Ltd",
    code: "MBL",
    contactPerson: "Nalin Perera",
    phone: "+94 11 234 5678",
    email: "orders@metrobeverages.lk",
    address: "Colombo",
    defaultLeadTimeDays: 5,
    paymentTerms: "Net 30",
    notes: "Primary soft-drinks supplier.",
    isActive: true,
  },
  {
    id: "s2",
    name: "Snack World Distributors",
    code: "SWD",
    contactPerson: "Dilani Fernando",
    phone: "+94 11 555 2180",
    email: "sales@snackworld.lk",
    address: "Negombo",
    defaultLeadTimeDays: 4,
    paymentTerms: "Advance",
    notes: "Snack and confectionery deliveries.",
    isActive: true,
  },
  {
    id: "s3",
    name: "Island Wholesale Traders",
    code: "IWT",
    contactPerson: "Imran Khan",
    phone: "+94 11 778 1122",
    email: "hello@islandwholesale.lk",
    address: "Kandy",
    defaultLeadTimeDays: 7,
    paymentTerms: "Net 14",
    notes: "Backup stock for mixed items.",
    isActive: false,
  },
];

const demoSupplierLinks: DemoProductSupplierLink[] = [
  {
    id: "l1",
    supplierId: "s1",
    productId: "p1",
    productName: "Pepsi 330ml",
    productSku: "PP-330",
    isPreferred: true,
    leadTimeDays: 5,
    minOrderQty: 12,
    packSize: 24,
    lastPurchasePrice: 145,
  },
  {
    id: "l2",
    supplierId: "s1",
    productId: "p2",
    productName: "Coca-Cola 330ml",
    productSku: "CC-330",
    isPreferred: true,
    leadTimeDays: 5,
    minOrderQty: 12,
    packSize: 24,
    lastPurchasePrice: 150,
  },
  {
    id: "l3",
    supplierId: "s2",
    productId: "p3",
    productName: "Nestle KitKat 4-Finger",
    productSku: "NS-KK-4F",
    isPreferred: true,
    leadTimeDays: 4,
    minOrderQty: 6,
    packSize: 12,
    lastPurchasePrice: 215,
  },
  {
    id: "l4",
    supplierId: "s2",
    productId: "p4",
    productName: "Lay's Sour Cream 150g",
    productSku: "LY-SC-150",
    isPreferred: true,
    leadTimeDays: 4,
    minOrderQty: 8,
    packSize: 16,
    lastPurchasePrice: 195,
  },
  {
    id: "l5",
    supplierId: "s1",
    productId: "p5",
    productName: "7UP 330ml",
    productSku: "7U-330",
    isPreferred: false,
    leadTimeDays: 6,
    minOrderQty: 12,
    packSize: 24,
    lastPurchasePrice: 143,
  },
];

const demoInventorySettings: DemoInventorySetting[] = [
  { productId: "p1", productName: "Pepsi 330ml", reorderLevel: 32, safetyStock: 8, targetStockLevel: 45, allowNegativeStock: false },
  { productId: "p2", productName: "Coca-Cola 330ml", reorderLevel: 32, safetyStock: 8, targetStockLevel: 45, allowNegativeStock: false },
  { productId: "p3", productName: "Nestle KitKat 4-Finger", reorderLevel: 26, safetyStock: 6, targetStockLevel: 36, allowNegativeStock: false },
  { productId: "p4", productName: "Lay's Sour Cream 150g", reorderLevel: 20, safetyStock: 5, targetStockLevel: 28, allowNegativeStock: false },
  { productId: "p5", productName: "7UP 330ml", reorderLevel: 26, safetyStock: 6, targetStockLevel: 36, allowNegativeStock: false },
  { productId: "p6", productName: "Lays Chips 150g", reorderLevel: 20, safetyStock: 5, targetStockLevel: 28, allowNegativeStock: false },
];

const demoStockSettings: DemoShopStockSettings = {
  lowStockThreshold: 8,
  safetyStock: 5,
  leadTimeDays: 5,
  targetDaysOfCover: 14,
};

const demoDraftOrders: DemoDraftOrder[] = [];

function statusBadgeTone(active: boolean) {
  return active ? "default" : "secondary";
}

function deficitTone(deficit: number, reorderLevel: number) {
  const ratio = reorderLevel <= 0 ? 1 : deficit / reorderLevel;
  if (ratio > 0.7) {
    return "bg-destructive text-destructive-foreground";
  }
  if (ratio > 0.3) {
    return "bg-amber-500 text-white";
  }
  return "bg-emerald-600 text-white";
}

type LowStockReportRow = {
  product_id: string;
  product_name: string;
  sku: string | null;
  barcode: string | null;
  quantity_on_hand: number;
  reorder_level: number;
  alert_level: number;
  deficit: number;
};

export function ProductLowStockTab() {
  const [brandFilter, setBrandFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [threshold, setThreshold] = useState(5);
  const [take, setTake] = useState(20);
  const [loading, setLoading] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [items, setItems] = useState<LowStockReportRow[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);

  const supplierOptions = useMemo(
    () =>
      demoSuppliers.map((supplier) => ({
        id: supplier.id,
        name: supplier.name,
      })),
    []
  );

  const resolveSupplierName = (productName: string) => {
    const normalized = productName.toLowerCase();
    if (normalized.includes("pepsi") || normalized.includes("coca-cola") || normalized.includes("7up")) {
      return "Metro Beverages Ltd";
    }
    if (normalized.includes("kitkat") || normalized.includes("lay") || normalized.includes("snack")) {
      return "Snack World Distributors";
    }
    return "Island Wholesale Traders";
  };

  const load = async () => {
    setLoading(true);
    try {
      const [report, catalog] = await Promise.all([
        fetchLowStockReport(take, threshold),
        fetchProductCatalogItems(200, true),
      ]);
      setGeneratedAt(report.generated_at);
      setItems(report.items);
      setProducts(catalog);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to load low stock items.");
    } finally {
      setLoading(false);
    }
  };

  const rows = useMemo(() => {
    const catalogById = new Map(products.map((product) => [product.id, product]));

    return items
      .map((item) => {
        const product = catalogById.get(item.product_id);
        const brandName = product?.categoryName || "No brand";
        const supplierName = resolveSupplierName(item.product_name);

        return {
          id: item.product_id,
          productName: item.product_name,
          brandName,
          sku: item.sku || "-",
          current: Number(item.quantity_on_hand),
          reorderLevel: Math.round(Number(item.reorder_level) * threshold),
          deficit: Math.max(0, Math.round(Number(item.reorder_level) * threshold) - Number(item.quantity_on_hand)),
          preferredSupplier: supplierName,
        };
      })
      .filter((row) => row.deficit > 0)
      .filter((row) => brandFilter === "all" || row.brandName === brandFilter)
      .filter((row) => supplierFilter === "all" || row.preferredSupplier === supplierFilter)
      .sort((left, right) => right.deficit - left.deficit);
  }, [brandFilter, items, products, supplierFilter, threshold]);

  const brandGroups = useMemo(() => {
    const grouped = new Map<string, typeof rows>();
    rows.forEach((row) => {
      const next = grouped.get(row.brandName) ?? [];
      next.push(row);
      grouped.set(row.brandName, next);
    });

    return Array.from(grouped.entries()).map(([brandName, groupRows]) => ({
      brandName,
      rows: groupRows,
      deficit: groupRows.reduce((sum, row) => sum + row.deficit, 0),
    }));
  }, [rows]);

  const supplierGroups = useMemo(() => {
    const grouped = new Map<string, typeof rows>();
    rows.forEach((row) => {
      const next = grouped.get(row.preferredSupplier) ?? [];
      next.push(row);
      grouped.set(row.preferredSupplier, next);
    });

    return Array.from(grouped.entries()).map(([supplierName, groupRows]) => ({
      supplierName,
      rows: groupRows,
      deficit: groupRows.reduce((sum, row) => sum + row.deficit, 0),
    }));
  }, [rows]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold, take]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-48">
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Brand</Label>
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Brands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {Array.from(new Set(products.map((product) => product.categoryName || "No brand"))).map((brandName) => (
                  <SelectItem key={brandName} value={brandName}>
                    {brandName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-48">
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Supplier</Label>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Suppliers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                {supplierOptions.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.name}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-80">
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Threshold Multiplier: {threshold.toFixed(1)}x
            </Label>
            <Slider value={[threshold]} min={0.5} max={2} step={0.1} onValueChange={(value) => setThreshold(value[0] ?? 1)} />
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            {rows.length} items below threshold
          </div>

          <div className="ml-auto">
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="byShop" className="space-y-4">
        <TabsList className="rounded-2xl bg-muted p-1">
          <TabsTrigger value="byShop" className="rounded-xl px-4 py-2">
            By Shop
          </TabsTrigger>
          <TabsTrigger value="byBrand" className="rounded-xl px-4 py-2">
            By Brand
          </TabsTrigger>
          <TabsTrigger value="bySupplier" className="rounded-xl px-4 py-2">
            By Supplier
          </TabsTrigger>
        </TabsList>

        <TabsContent value="byShop" className="mt-0">
          <div className="rounded-2xl border border-border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Reorder Lvl</TableHead>
                  <TableHead className="text-right">Deficit</TableHead>
                  <TableHead>Preferred Supplier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.productName}</TableCell>
                    <TableCell>{row.brandName}</TableCell>
                    <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                    <TableCell className="text-right">{row.current}</TableCell>
                    <TableCell className="text-right">{row.reorderLevel}</TableCell>
                    <TableCell className="text-right">
                      <Badge className={deficitTone(row.deficit, row.reorderLevel)}>{row.deficit}</Badge>
                    </TableCell>
                    <TableCell>{row.preferredSupplier}</TableCell>
                  </TableRow>
                ))}
                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      <Package className="mx-auto mb-2 h-8 w-8" />
                      No low stock items were returned.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="byBrand" className="mt-0 space-y-3">
          {brandGroups.map((group) => (
            <Card key={group.brandName}>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">{group.brandName}</CardTitle>
                  <Badge variant="destructive">Deficit: {group.deficit}</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                      <TableHead className="text-right">Reorder Lvl</TableHead>
                      <TableHead className="text-right">Deficit</TableHead>
                      <TableHead>Preferred Supplier</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.productName}</TableCell>
                        <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                        <TableCell className="text-right">{row.current}</TableCell>
                        <TableCell className="text-right">{row.reorderLevel}</TableCell>
                        <TableCell className="text-right">
                          <Badge className={deficitTone(row.deficit, row.reorderLevel)}>{row.deficit}</Badge>
                        </TableCell>
                        <TableCell>{row.preferredSupplier}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
          {brandGroups.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">No brand groups match the current filters.</CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="bySupplier" className="mt-0 space-y-3">
          {supplierGroups.map((group) => (
            <Card key={group.supplierName}>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">{group.supplierName}</CardTitle>
                  <Badge variant="destructive">Deficit: {group.deficit}</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                      <TableHead className="text-right">Reorder Lvl</TableHead>
                      <TableHead className="text-right">Deficit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.productName}</TableCell>
                        <TableCell>{row.brandName}</TableCell>
                        <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                        <TableCell className="text-right">{row.current}</TableCell>
                        <TableCell className="text-right">{row.reorderLevel}</TableCell>
                        <TableCell className="text-right">
                          <Badge className={deficitTone(row.deficit, row.reorderLevel)}>{row.deficit}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
          {supplierGroups.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">No supplier groups match the current filters.</CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <div className="text-xs text-muted-foreground">
        {generatedAt ? `Updated ${new Date(generatedAt).toLocaleString()}` : "Waiting for report data."}
      </div>
    </div>
  );
}

type CategoryRow = {
  category_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  product_count: number;
  created_at: string;
  updated_at: string | null;
};

export function ProductBrandsTab() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryRow | null>(null);
  const [form, setForm] = useState<CreateCategoryRequest>({
    name: "",
    description: "",
    is_active: true,
  });

  const load = async () => {
    setLoading(true);
    try {
      const [categoryItems, productItems] = await Promise.all([
        fetchCategories(true),
        fetchProductCatalogItems(200, true),
      ]);

      setCategories(
        categoryItems.map((item) => ({
          category_id: item.category_id,
          name: item.name,
          description: item.description ?? null,
          is_active: item.is_active,
          product_count: item.product_count,
          created_at: item.created_at,
          updated_at: item.updated_at ?? null,
        }))
      );
      setProducts(productItems);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to load brands.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openAdd = () => {
    setEditingCategory(null);
    setForm({ name: "", description: "", is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (category: CategoryRow) => {
    setEditingCategory(category);
    setForm({
      name: category.name,
      description: category.description ?? "",
      is_active: category.is_active,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Category name is required.");
      return;
    }

    try {
      if (editingCategory) {
        await updateCategory(editingCategory.category_id, form);
        toast.success("Category updated.");
      } else {
        await createCategory(form);
        toast.success("Category created.");
      }

      setDialogOpen(false);
      await load();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to save category.");
    }
  };

  const selectedCategory = categories.find((category) => category.category_id === selectedCategoryId) ?? null;
  const selectedProducts = selectedCategoryId
    ? products.filter((product) => product.categoryId === selectedCategoryId)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-base font-semibold">Categories as Brands</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            The existing backend exposes categories, so this tab uses them with the brand-style UI from the generated frontend.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add Brand
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Products</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => {
              const expanded = selectedCategoryId === category.category_id;
              return (
                <Fragment key={category.category_id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => setSelectedCategoryId(expanded ? null : category.category_id)}
                  >
                    <TableCell>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell className="text-muted-foreground">{category.description || "No description"}</TableCell>
                    <TableCell className="text-right">{category.product_count}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeTone(category.is_active)}>
                        {category.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEdit(category);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expanded && (
                    <TableRow key={`${category.category_id}-expanded`}>
                      <TableCell colSpan={6} className="bg-muted/20 p-4">
                        <Card>
                          <CardHeader className="py-3">
                            <CardTitle className="text-base">Products under {selectedCategory?.name}</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-0">
                            {selectedProducts.length > 0 ? (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead>SKU</TableHead>
                                    <TableHead className="text-right">Price</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {selectedProducts.map((product) => (
                                    <TableRow key={product.id}>
                                      <TableCell>{product.name}</TableCell>
                                      <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                                      <TableCell className="text-right">Rs. {product.unitPrice.toLocaleString()}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            ) : (
                              <p className="py-4 text-center text-sm text-muted-foreground">No products in this brand yet.</p>
                            )}
                          </CardContent>
                        </Card>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
            {!loading && categories.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No categories found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Edit Brand" : "Add Brand"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description ?? ""} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            </div>
            <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/20 px-4 py-3">
              <div>
                <p className="text-sm font-medium leading-none">Active</p>
                <p className="mt-1 text-xs text-muted-foreground">Inactive brands are hidden from new item selection.</p>
              </div>
              <Switch checked={form.is_active ?? true} onCheckedChange={(checked) => setForm((current) => ({ ...current, is_active: checked }))} />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ProductSuppliersTab() {
  const [suppliers, setSuppliers] = useState(demoSuppliers);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<DemoSupplier | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<DemoSupplier | null>(null);
  const [form, setForm] = useState<Omit<DemoSupplier, "id">>({
    name: "",
    code: "",
    contactPerson: "",
    phone: "",
    email: "",
    address: "",
    defaultLeadTimeDays: 5,
    paymentTerms: "Net 30",
    notes: "",
    isActive: true,
  });

  const openAdd = () => {
    setEditingSupplier(null);
    setForm({
      name: "",
      code: "",
      contactPerson: "",
      phone: "",
      email: "",
      address: "",
      defaultLeadTimeDays: 5,
      paymentTerms: "Net 30",
      notes: "",
      isActive: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (supplier: DemoSupplier) => {
    setEditingSupplier(supplier);
    const { id, ...rest } = supplier;
    setForm(rest);
    setDialogOpen(true);
  };

  const save = () => {
    if (!form.name.trim()) {
      toast.error("Supplier name is required.");
      return;
    }

    if (editingSupplier) {
      setSuppliers((current) => current.map((supplier) => (supplier.id === editingSupplier.id ? { ...supplier, ...form } : supplier)));
    } else {
      setSuppliers((current) => [...current, { id: `supplier-${Date.now()}`, ...form }]);
    }
    setDialogOpen(false);
  };

  const linkedProducts = useMemo(() => {
    if (!selectedSupplier) {
      return [];
    }

    return demoSupplierLinks.filter((link) => link.supplierId === selectedSupplier.id);
  }, [selectedSupplier]);

  if (selectedSupplier) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelectedSupplier(null)}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Suppliers
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{selectedSupplier.name}</CardTitle>
              <Badge variant={statusBadgeTone(selectedSupplier.isActive)}>
                {selectedSupplier.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <CardDescription>Supplier profile and linked products from the generated frontend workflow.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              <div><span className="font-medium">Contact:</span> {selectedSupplier.contactPerson}</div>
              <div><span className="font-medium">Phone:</span> {selectedSupplier.phone}</div>
              <div><span className="font-medium">Email:</span> {selectedSupplier.email}</div>
              <div><span className="font-medium">Lead Time:</span> {selectedSupplier.defaultLeadTimeDays} days</div>
              <div><span className="font-medium">Payment:</span> {selectedSupplier.paymentTerms}</div>
              <div><span className="font-medium">Code:</span> {selectedSupplier.code}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Linked Products ({linkedProducts.length})</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Supplier SKU</TableHead>
                  <TableHead>Preferred</TableHead>
                  <TableHead className="text-right">Lead Time</TableHead>
                  <TableHead className="text-right">Min Order</TableHead>
                  <TableHead className="text-right">Pack Size</TableHead>
                  <TableHead className="text-right">Last Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linkedProducts.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell className="font-medium">{link.productName}</TableCell>
                    <TableCell className="font-mono text-xs">{link.productSku}</TableCell>
                    <TableCell>{link.isPreferred ? <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> : "-"}</TableCell>
                    <TableCell className="text-right">{link.leadTimeDays}d</TableCell>
                    <TableCell className="text-right">{link.minOrderQty}</TableCell>
                    <TableCell className="text-right">{link.packSize}</TableCell>
                    <TableCell className="text-right">Rs. {link.lastPurchasePrice.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Suppliers</h3>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add Supplier
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">Products</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((supplier) => {
              const productCount = demoSupplierLinks.filter((link) => link.supplierId === supplier.id).length;
              return (
                <TableRow key={supplier.id} className="cursor-pointer" onClick={() => setSelectedSupplier(supplier)}>
                  <TableCell className="font-medium">{supplier.name}</TableCell>
                  <TableCell className="font-mono text-xs">{supplier.code}</TableCell>
                  <TableCell>{supplier.contactPerson}</TableCell>
                  <TableCell>{supplier.phone}</TableCell>
                  <TableCell className="text-right">{productCount}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeTone(supplier.isActive)}>
                      {supplier.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEdit(supplier);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSupplier ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Code</Label>
              <Input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Contact Person</Label>
              <Input value={form.contactPerson} onChange={(event) => setForm((current) => ({ ...current, contactPerson: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Email</Label>
              <Input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Lead Time (days)</Label>
              <Input
                type="number"
                value={form.defaultLeadTimeDays}
                onChange={(event) => setForm((current) => ({ ...current, defaultLeadTimeDays: Number(event.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Terms</Label>
              <Input value={form.paymentTerms} onChange={(event) => setForm((current) => ({ ...current, paymentTerms: event.target.value }))} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            </div>
            <label className="col-span-2 flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/20 px-4 py-3">
              <span className="text-sm font-medium">Active supplier</span>
              <Switch checked={form.isActive} onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))} />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ProductReorderTab() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<DemoDraftOrder[]>(demoDraftOrders);
  const [reviewDraft, setReviewDraft] = useState<DemoDraftOrder | null>(null);
  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  const [draftNotes, setDraftNotes] = useState("");

  const suggestions = useMemo(() => {
    return demoInventorySettings
      .map((item) => {
        const product = demoProducts.find((product) => product.id === item.productId)!;
        const link = demoSupplierLinks.find((link) => link.productId === item.productId && link.isPreferred);
        const supplier = demoSuppliers.find((supplier) => supplier.id === link?.supplierId);
        return {
          id: item.productId,
          product,
          supplierId: link?.supplierId || "",
          supplierName: supplier?.name || "Unassigned",
          currentStock: Math.max(0, item.reorderLevel - 4),
          reorderLevel: item.reorderLevel,
          suggestedQty: item.targetStockLevel - Math.max(0, item.reorderLevel - 4),
          lastCost: link?.lastPurchasePrice || 0,
          leadTimeDays: link?.leadTimeDays || 0,
        };
      })
      .filter((item) => item.currentStock < item.reorderLevel)
      .sort((a, b) => (b.reorderLevel - b.currentStock) - (a.reorderLevel - a.currentStock));
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === suggestions.length) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(new Set(suggestions.map((suggestion) => suggestion.id)));
  };

  const createDraft = () => {
    const selected = suggestions.filter((suggestion) => selectedIds.has(suggestion.id));
    if (selected.length === 0) {
      toast.error("Select at least one product.");
      return;
    }

    const grouped = new Map<string, typeof selected>();
    selected.forEach((item) => {
      const current = grouped.get(item.supplierId) ?? [];
      current.push(item);
      grouped.set(item.supplierId, current);
    });

    const nextDrafts = Array.from(grouped.entries()).map(([supplierId, items]) => {
      const lines = items.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        sku: item.product.sku,
        qty: item.suggestedQty,
        unitCost: item.lastCost,
        total: item.suggestedQty * item.lastCost,
      }));

      return {
        id: `draft-${Date.now()}-${supplierId}`,
        supplierId,
        supplierName: items[0]?.supplierName || "Unassigned",
        status: "Draft" as const,
        lines,
        notes: "",
        createdAt: new Date().toISOString().slice(0, 10),
        totalAmount: lines.reduce((sum, line) => sum + line.total, 0),
      };
    });

    setDrafts((current) => [...current, ...nextDrafts]);
    setSelectedIds(new Set());
  };

  const confirmDraft = (draftId: string) => {
    setDrafts((current) => current.map((draft) => (draft.id === draftId ? { ...draft, status: "Confirmed" as const } : draft)));
    setReviewDraft(null);
  };

  const openReview = (draft: DemoDraftOrder) => {
    setReviewDraft(draft);
    setDraftNotes(draft.notes);
    setDraftDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="suggestions">
        <TabsList>
          <TabsTrigger value="suggestions">
            <ShoppingCart className="mr-1 h-4 w-4" />
            Suggestions ({suggestions.length})
          </TabsTrigger>
          <TabsTrigger value="drafts">
            <FileText className="mr-1 h-4 w-4" />
            Drafts ({drafts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="suggestions" className="space-y-3">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-primary/5 p-3">
              <span className="text-sm font-medium">{selectedIds.size} items selected</span>
              <Button size="sm" onClick={createDraft}>Create Draft Order</Button>
            </div>
          )}
          <div className="rounded-2xl border border-border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={selectedIds.size === suggestions.length && suggestions.length > 0} onCheckedChange={toggleAll} />
                  </TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Suggested Qty</TableHead>
                  <TableHead className="text-right">Last Cost</TableHead>
                  <TableHead className="text-right">Est. Total</TableHead>
                  <TableHead className="text-right">Lead Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suggestions.map((suggestion) => (
                  <TableRow key={suggestion.id}>
                    <TableCell>
                      <Checkbox checked={selectedIds.has(suggestion.id)} onCheckedChange={() => toggleSelect(suggestion.id)} />
                    </TableCell>
                    <TableCell className="font-medium">{suggestion.product.name}</TableCell>
                    <TableCell>{suggestion.product.brandName}</TableCell>
                    <TableCell>{suggestion.supplierName}</TableCell>
                    <TableCell className="text-right">{suggestion.currentStock}</TableCell>
                    <TableCell className="text-right font-medium">{suggestion.suggestedQty}</TableCell>
                    <TableCell className="text-right">Rs. {suggestion.lastCost.toLocaleString()}</TableCell>
                    <TableCell className="text-right">Rs. {(suggestion.suggestedQty * suggestion.lastCost).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{suggestion.leadTimeDays}d</TableCell>
                  </TableRow>
                ))}
                {suggestions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                      All demo items are above threshold.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="drafts" className="space-y-3">
          <div className="grid gap-3">
            {drafts.map((draft) => (
              <Card key={draft.id}>
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{draft.supplierName}</CardTitle>
                      <CardDescription>{draft.lines.length} items - Created {draft.createdAt}</CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-semibold">Rs. {draft.totalAmount.toLocaleString()}</span>
                      <Badge variant={draft.status === "Confirmed" ? "default" : "secondary"}>
                        {draft.status === "Confirmed" && <Check className="mr-1 h-3 w-3" />}
                        {draft.status}
                      </Badge>
                      <Button size="sm" variant="outline" onClick={() => openReview(draft)}>Review</Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
            {drafts.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No draft orders yet. Select items from Suggestions to create one.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={draftDialogOpen} onOpenChange={setDraftDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Draft Purchase Order - {reviewDraft?.supplierName}</DialogTitle>
          </DialogHeader>
          {reviewDraft && (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewDraft.lines.map((line) => (
                    <TableRow key={line.productId}>
                      <TableCell>{line.productName}</TableCell>
                      <TableCell className="font-mono text-xs">{line.sku}</TableCell>
                      <TableCell className="text-right">{line.qty}</TableCell>
                      <TableCell className="text-right">Rs. {line.unitCost.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-medium">Rs. {line.total.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={4} className="text-right font-semibold">Total</TableCell>
                    <TableCell className="text-right font-bold">Rs. {reviewDraft.totalAmount.toLocaleString()}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={draftNotes} onChange={(event) => setDraftNotes(event.target.value)} placeholder="Add notes..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraftDialogOpen(false)}>
              Close
            </Button>
            {reviewDraft?.status === "Draft" && (
              <Button
                onClick={() => {
                  confirmDraft(reviewDraft.id);
                  setDraftDialogOpen(false);
                }}
              >
                <Check className="mr-1 h-4 w-4" />
                Confirm Order
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ProductSettingsTab() {
  const [settings, setSettings] = useState(demoStockSettings);
  const [inventory, setInventory] = useState(demoInventorySettings);

  const saveDefaults = () => {
    toast.success("Default thresholds saved locally.");
  };

  const saveSettings = () => {
    toast.success("Inventory settings saved locally.");
  };

  const updateInventory = (productId: string, field: keyof DemoInventorySetting, value: number | boolean) => {
    setInventory((current) => current.map((item) => (item.productId === productId ? { ...item, [field]: value } : item)));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Default Thresholds</CardTitle>
          <CardDescription>These defaults match the generated stock manager workflow and stay local to this dialog.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Low Stock Threshold</Label>
              <Input type="number" value={settings.lowStockThreshold} onChange={(event) => setSettings((current) => ({ ...current, lowStockThreshold: Number(event.target.value) || 0 }))} />
            </div>
            <div className="space-y-2">
              <Label>Safety Stock</Label>
              <Input type="number" value={settings.safetyStock} onChange={(event) => setSettings((current) => ({ ...current, safetyStock: Number(event.target.value) || 0 }))} />
            </div>
            <div className="space-y-2">
              <Label>Lead Time (days)</Label>
              <Input type="number" value={settings.leadTimeDays} onChange={(event) => setSettings((current) => ({ ...current, leadTimeDays: Number(event.target.value) || 0 }))} />
            </div>
            <div className="space-y-2">
              <Label>Target Days of Cover</Label>
              <Input type="number" value={settings.targetDaysOfCover} onChange={(event) => setSettings((current) => ({ ...current, targetDaysOfCover: Number(event.target.value) || 0 }))} />
            </div>
          </div>
          <Button className="mt-4" size="sm" onClick={saveDefaults}>
            <Save className="mr-1 h-4 w-4" />
            Save Defaults
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-Product Inventory Settings</CardTitle>
          <CardDescription>Adjust reorder, safety, and target levels for individual products.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Reorder Level</TableHead>
                  <TableHead className="text-right">Safety Stock</TableHead>
                  <TableHead className="text-right">Target Level</TableHead>
                  <TableHead className="text-center">Allow Negative</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory.map((item) => (
                  <TableRow key={item.productId}>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        className="ml-auto w-24 text-right"
                        value={item.reorderLevel}
                        onChange={(event) => updateInventory(item.productId, "reorderLevel", Number(event.target.value) || 0)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        className="ml-auto w-24 text-right"
                        value={item.safetyStock}
                        onChange={(event) => updateInventory(item.productId, "safetyStock", Number(event.target.value) || 0)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        className="ml-auto w-24 text-right"
                        value={item.targetStockLevel}
                        onChange={(event) => updateInventory(item.productId, "targetStockLevel", Number(event.target.value) || 0)}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={item.allowNegativeStock}
                        onCheckedChange={(checked) => updateInventory(item.productId, "allowNegativeStock", checked)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button className="mt-4" size="sm" onClick={saveSettings}>
            <Save className="mr-1 h-4 w-4" />
            Save Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
