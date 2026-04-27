import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Tag,
} from "lucide-react";
import {
  createBrand,
  createSupplier,
  fetchBrands,
  fetchLowStockReport,
  fetchProductCatalogItems,
  fetchShopStockSettings,
  fetchSuppliers,
  updateBrand,
  updateProduct,
  updateShopStockSettings,
  updateSupplier,
  type CatalogProduct,
  type BrandRecord,
  type CreateBrandRequest,
  type CreateSupplierRequest,
  type ShopStockSettingsRecord,
  type SupplierRecord,
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
  type LowStockRow = {
    productId: string;
    productName: string;
    sku: string;
    brandName: string;
    supplierName: string;
    quantityOnHand: number;
    reorderLevel: number;
    safetyStock: number;
    targetStockLevel: number;
    alertLevel: number;
    deficit: number;
  };

  const [brandFilter, setBrandFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [threshold, setThreshold] = useState(5);
  const [take, setTake] = useState(20);
  const [loading, setLoading] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [items, setItems] = useState<LowStockRow[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [report, settings] = await Promise.all([
        fetchLowStockReport(take, threshold),
        fetchShopStockSettings(),
      ]);
      setThreshold(settings.defaultLowStockThreshold || threshold);
      setGeneratedAt(report.generated_at);
      setItems(
        report.items.map((item) => ({
          productId: item.product_id,
          productName: item.product_name,
          sku: item.sku || "-",
          brandName: item.brand_name || "No brand",
          supplierName: item.preferred_supplier_name || "Unassigned",
          quantityOnHand: Number(item.quantity_on_hand),
          reorderLevel: Number(item.reorder_level),
          safetyStock: Number(item.safety_stock),
          targetStockLevel: Number(item.target_stock_level),
          alertLevel: Number(item.alert_level),
          deficit: Number(item.deficit),
        }))
      );
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to load low stock items.");
    } finally {
      setLoading(false);
    }
  };

  const rows = useMemo(() => {
    return items
      .filter((row) => row.deficit > 0)
      .filter((row) => brandFilter === "all" || row.brandName === brandFilter)
      .filter((row) => supplierFilter === "all" || row.supplierName === supplierFilter)
      .sort((left, right) => right.deficit - left.deficit);
  }, [brandFilter, items, supplierFilter]);

  const brandOptions = useMemo(
    () => ["all", ...new Set(items.map((item) => item.brandName))],
    [items]
  );
  const supplierOptions = useMemo(
    () => ["all", ...new Set(items.map((item) => item.supplierName))],
    [items]
  );

  const brandGroups = useMemo(() => {
    const grouped = new Map<string, LowStockRow[]>();
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
    const grouped = new Map<string, LowStockRow[]>();
    rows.forEach((row) => {
      const next = grouped.get(row.supplierName) ?? [];
      next.push(row);
      grouped.set(row.supplierName, next);
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
                {brandOptions.map((brandName) => (
                  <SelectItem key={brandName} value={brandName}>
                    {brandName === "all" ? "All Brands" : brandName}
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
                {supplierOptions.map((supplierName) => (
                  <SelectItem key={supplierName} value={supplierName}>
                    {supplierName === "all" ? "All Suppliers" : supplierName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-80">
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Threshold: {threshold.toFixed(1)}
            </Label>
            <Slider value={[threshold]} min={0.5} max={10} step={0.5} onValueChange={(value) => setThreshold(value[0] ?? 5)} />
          </div>

          <div className="w-28">
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Take</Label>
            <Input type="number" min={1} max={100} value={take} onChange={(event) => setTake(Number(event.target.value) || 20)} />
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
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Reorder Lvl</TableHead>
                  <TableHead className="text-right">Safety</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Deficit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.productId}>
                    <TableCell className="font-medium">{row.productName}</TableCell>
                    <TableCell>{row.brandName}</TableCell>
                    <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                    <TableCell>{row.supplierName}</TableCell>
                    <TableCell className="text-right">{row.quantityOnHand}</TableCell>
                    <TableCell className="text-right">{row.reorderLevel}</TableCell>
                    <TableCell className="text-right">{row.safetyStock}</TableCell>
                    <TableCell className="text-right">{row.targetStockLevel}</TableCell>
                    <TableCell className="text-right">
                      <Badge className={deficitTone(row.deficit, row.reorderLevel)}>{row.deficit}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
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
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                      <TableHead className="text-right">Reorder Lvl</TableHead>
                      <TableHead className="text-right">Deficit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.rows.map((row) => (
                      <TableRow key={row.productId}>
                        <TableCell className="font-medium">{row.productName}</TableCell>
                        <TableCell>{row.supplierName}</TableCell>
                        <TableCell className="text-right">{row.quantityOnHand}</TableCell>
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
                      <TableHead className="text-right">Current</TableHead>
                      <TableHead className="text-right">Reorder Lvl</TableHead>
                      <TableHead className="text-right">Deficit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.rows.map((row) => (
                      <TableRow key={row.productId}>
                        <TableCell className="font-medium">{row.productName}</TableCell>
                        <TableCell>{row.brandName}</TableCell>
                        <TableCell className="text-right">{row.quantityOnHand}</TableCell>
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

export function ProductBrandsTab() {
  const [brands, setBrands] = useState<BrandRecord[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<BrandRecord | null>(null);
  const [form, setForm] = useState<CreateBrandRequest>({
    name: "",
    code: "",
    description: "",
    is_active: true,
  });

  const load = async () => {
    setLoading(true);
    try {
      const [brandItems, productItems] = await Promise.allSettled([
        fetchBrands(true),
        fetchProductCatalogItems(200, true),
      ]);

      if (brandItems.status === "fulfilled") {
        setBrands(brandItems.value);
      } else {
        console.error(brandItems.reason);
        toast.error(brandItems.reason instanceof Error ? brandItems.reason.message : "Failed to load brands.");
      }

      if (productItems.status === "fulfilled") {
        setProducts(productItems.value);
      } else {
        console.error(productItems.reason);
        toast.error(
          productItems.reason instanceof Error ? productItems.reason.message : "Failed to load products for brand counts."
        );
      }
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
    setEditingBrand(null);
    setForm({ name: "", code: "", description: "", isActive: true });
    setDialogOpen(true);
  };

  const openEdit = (brand: BrandRecord) => {
    setEditingBrand(brand);
    setForm({
      name: brand.name,
      code: brand.code ?? "",
      description: brand.description ?? "",
      isActive: brand.isActive,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Brand name is required.");
      return;
    }

    try {
      if (editingBrand) {
        await updateBrand(editingBrand.id, form);
        toast.success("Brand updated.");
      } else {
        await createBrand(form);
        toast.success("Brand created.");
      }

      setDialogOpen(false);
      await load();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to save brand.");
    }
  };

  const selectedBrand = brands.find((brand) => brand.id === selectedBrandId) ?? null;
  const selectedProducts = selectedBrandId
    ? products.filter((product) => product.brandId === selectedBrandId)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-base font-semibold">Brands</h3>
          </div>
          <p className="text-sm text-muted-foreground">Saved brands from the database.</p>
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
              <TableHead>Code</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Products</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {brands.map((brand) => {
              const expanded = selectedBrandId === brand.id;
              return (
                <Fragment key={brand.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => setSelectedBrandId(expanded ? null : brand.id)}
                  >
                    <TableCell>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                    <TableCell className="font-medium">{brand.name}</TableCell>
                    <TableCell className="font-mono text-xs">{brand.code || "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{brand.description || "No description"}</TableCell>
                    <TableCell className="text-right">{brand.productCount}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeTone(brand.isActive)}>
                        {brand.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEdit(brand);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expanded && (
                    <TableRow key={`${brand.id}-expanded`}>
                      <TableCell colSpan={7} className="bg-muted/20 p-4">
                        <Card>
                          <CardHeader className="py-3">
                            <CardTitle className="text-base">Products under {selectedBrand?.name}</CardTitle>
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
            {!loading && brands.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No brands found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingBrand ? "Edit Brand" : "Add Brand"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="brand-name">Name</Label>
              <Input id="brand-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand-code">Code</Label>
              <Input id="brand-code" value={form.code ?? ""} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand-description">Description</Label>
              <Textarea id="brand-description" value={form.description ?? ""} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            </div>
            <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/20 px-4 py-3">
              <div>
                <p className="text-sm font-medium leading-none">Active</p>
                <p className="mt-1 text-xs text-muted-foreground">Inactive brands are hidden from new item selection.</p>
              </div>
              <Switch checked={form.isActive ?? true} onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))} />
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
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRecord | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierRecord | null>(null);
  const [form, setForm] = useState<CreateSupplierRequest>({
    name: "",
    code: "",
    contactPerson: "",
    phone: "",
    email: "",
    address: "",
    isActive: true,
  });

  const loadSuppliers = async (preserveSelectedSupplierId?: string | null) => {
    setLoading(true);
    try {
      const items = await fetchSuppliers(true);
      setSuppliers(items);
      if (preserveSelectedSupplierId) {
        setSelectedSupplier(items.find((supplier) => supplier.id === preserveSelectedSupplierId) ?? null);
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to load suppliers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSuppliers();
  }, []);

  const openAdd = () => {
    setEditingSupplier(null);
    setForm({
      name: "",
      code: "",
      contactPerson: "",
      phone: "",
      email: "",
      address: "",
      isActive: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (supplier: SupplierRecord) => {
    setEditingSupplier(supplier);
    const { id, linkedProductCount, createdAt, updatedAt, ...rest } = supplier;
    setForm(rest);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Supplier name is required.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        isActive: form.isActive ?? true,
      };
      editingSupplier
        ? await updateSupplier(editingSupplier.id, payload)
        : await createSupplier(payload);

      setDialogOpen(false);
      const preserveSelectedSupplierId = editingSupplier && selectedSupplier?.id === editingSupplier.id ? editingSupplier.id : null;
      await loadSuppliers(preserveSelectedSupplierId);
      toast.success(editingSupplier ? "Supplier updated." : "Supplier created.");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to save supplier.");
    } finally {
      setSaving(false);
    }
  };

  if (selectedSupplier) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelectedSupplier(null)}>
          <ChevronLeft className="mr-1 h-4 w-4" />
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
            <CardDescription>Saved supplier profile from the backend.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              <div><span className="font-medium">Code:</span> {selectedSupplier.code || "-"}</div>
              <div><span className="font-medium">Contact:</span> {selectedSupplier.contactPerson || "-"}</div>
              <div><span className="font-medium">Phone:</span> {selectedSupplier.phone || "-"}</div>
              <div><span className="font-medium">Email:</span> {selectedSupplier.email || "-"}</div>
              <div className="md:col-span-2"><span className="font-medium">Address:</span> {selectedSupplier.address || "-"}</div>
              <div><span className="font-medium">Linked products:</span> {selectedSupplier.linkedProductCount}</div>
            </div>
          </CardContent>
          <CardContent className="pt-0">
            <Button
              variant="outline"
              onClick={() => {
                openEdit(selectedSupplier);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit Supplier
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Suppliers</h3>
        <Button onClick={openAdd} disabled={loading}>
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
            {suppliers.map((supplier) => (
              <TableRow key={supplier.id} className="cursor-pointer" onClick={() => setSelectedSupplier(supplier)}>
                <TableCell className="font-medium">{supplier.name}</TableCell>
                <TableCell className="font-mono text-xs">{supplier.code || "-"}</TableCell>
                <TableCell>{supplier.contactPerson || "-"}</TableCell>
                <TableCell>{supplier.phone || "-"}</TableCell>
                <TableCell className="text-right">{supplier.linkedProductCount}</TableCell>
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
            ))}
            {!loading && suppliers.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No suppliers found.
                </TableCell>
              </TableRow>
            )}
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
              <Label htmlFor="supplier-name">Name</Label>
              <Input id="supplier-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-code">Code</Label>
              <Input id="supplier-code" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-contact-person">Contact Person</Label>
              <Input
                id="supplier-contact-person"
                value={form.contactPerson}
                onChange={(event) => setForm((current) => ({ ...current, contactPerson: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-phone">Phone</Label>
              <Input id="supplier-phone" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label htmlFor="supplier-email">Email</Label>
              <Input id="supplier-email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label htmlFor="supplier-address">Address</Label>
              <Input
                id="supplier-address"
                value={form.address}
                onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
              />
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
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ProductReorderTab() {
  type ReorderSuggestion = {
    productId: string;
    productName: string;
    brandName: string;
    supplierName: string;
    sku: string;
    currentStock: number;
    reorderLevel: number;
    deficit: number;
    estimatedValue: number;
  };

  const [loading, setLoading] = useState(false);
  const [threshold, setThreshold] = useState(5);
  const [take, setTake] = useState(20);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [reportResult, catalogResult, settingsResult] = await Promise.allSettled([
        fetchLowStockReport(take, threshold),
        fetchProductCatalogItems(200, true),
        fetchShopStockSettings(),
      ]);

      if (settingsResult.status === "fulfilled") {
        setThreshold(settingsResult.value.defaultLowStockThreshold || threshold);
      }

      if (reportResult.status !== "fulfilled") {
        throw reportResult.reason;
      }

      const report = reportResult.value;
      setGeneratedAt(report.generated_at);

      const catalogById = new Map(
        catalogResult.status === "fulfilled" ? catalogResult.value.map((product) => [product.id, product]) : []
      );
      setSuggestions(
        report.items
          .map((item) => {
            const product = catalogById.get(item.product_id);
            return {
              productId: item.product_id,
              productName: item.product_name,
              brandName: item.brand_name || product?.brandName || "No brand",
              supplierName: item.preferred_supplier_name || "Unassigned",
              sku: item.sku || product?.sku || "-",
              currentStock: Number(item.quantity_on_hand),
              reorderLevel: Number(item.reorder_level),
              deficit: Number(item.deficit),
              estimatedValue: Number(item.deficit) * Number(product?.costPrice ?? 0),
            };
          })
          .filter((item) => item.deficit > 0)
          .sort((a, b) => b.deficit - a.deficit)
      );
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to load reorder suggestions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold, take]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-80">
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Threshold</Label>
            <Slider value={[threshold]} min={0.5} max={10} step={0.5} onValueChange={(value) => setThreshold(value[0] ?? 5)} />
          </div>
          <div className="w-28">
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Take</Label>
            <Input type="number" min={1} max={100} value={take} onChange={(event) => setTake(Number(event.target.value) || 20)} />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            {suggestions.length} reorder suggestions
          </div>
          <div className="ml-auto">
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">Reorder Lvl</TableHead>
              <TableHead className="text-right">Deficit</TableHead>
              <TableHead className="text-right">Est. Reorder Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suggestions.map((suggestion) => (
              <TableRow key={suggestion.productId}>
                <TableCell className="font-medium">{suggestion.productName}</TableCell>
                <TableCell>{suggestion.brandName}</TableCell>
                <TableCell>{suggestion.supplierName}</TableCell>
                <TableCell className="font-mono text-xs">{suggestion.sku}</TableCell>
                <TableCell className="text-right">{suggestion.currentStock}</TableCell>
                <TableCell className="text-right">{suggestion.reorderLevel}</TableCell>
                <TableCell className="text-right">
                  <Badge className={deficitTone(suggestion.deficit, suggestion.reorderLevel)}>{suggestion.deficit}</Badge>
                </TableCell>
                <TableCell className="text-right">Rs. {suggestion.estimatedValue.toLocaleString()}</TableCell>
              </TableRow>
            ))}
            {!loading && suggestions.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No reorder suggestions are currently stored in the database.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-xs text-muted-foreground">
        {generatedAt ? `Updated ${new Date(generatedAt).toLocaleString()}` : "Waiting for report data."}
      </div>
    </div>
  );
}

export function ProductSettingsTab() {
  const [settings, setSettings] = useState<ShopStockSettingsRecord | null>(null);
  const [draft, setDraft] = useState({
    defaultLowStockThreshold: "",
    thresholdMultiplier: "",
    defaultSafetyStock: "",
    defaultLeadTimeDays: "",
    defaultTargetDaysOfCover: "",
  });
  const [inventory, setInventory] = useState<CatalogProduct[]>([]);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [savingInventory, setSavingInventory] = useState(false);
  const draftDirtyRef = useRef(false);
  const settingsRequestTokenRef = useRef(0);

  const applySettings = (settingsResponse: ShopStockSettingsRecord) => {
    setSettings(settingsResponse);
    setDraft({
      defaultLowStockThreshold: String(settingsResponse.defaultLowStockThreshold ?? 0),
      thresholdMultiplier: String(settingsResponse.thresholdMultiplier ?? 1),
      defaultSafetyStock: String(settingsResponse.defaultSafetyStock ?? 0),
      defaultLeadTimeDays: String(settingsResponse.defaultLeadTimeDays ?? 0),
      defaultTargetDaysOfCover: String(settingsResponse.defaultTargetDaysOfCover ?? 0),
    });
    draftDirtyRef.current = false;
  };

  const loadSettings = async () => {
    const requestToken = ++settingsRequestTokenRef.current;
    setLoadingSettings(true);
    try {
      const settingsResponse = await fetchShopStockSettings();
      if (requestToken !== settingsRequestTokenRef.current) {
        return;
      }
      if (!draftDirtyRef.current) {
        applySettings(settingsResponse);
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to load stock settings.");
    } finally {
      setLoadingSettings(false);
    }
  };

  const loadInventory = async () => {
    setLoadingInventory(true);
    try {
      const products = await fetchProductCatalogItems(200, true);
      setInventory(products);
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to load inventory settings."
      );
    } finally {
      setLoadingInventory(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadSettings(), loadInventory()]);
  }, []);

  const updateInventory = (productId: string, field: keyof CatalogProduct, value: number | boolean) => {
    setInventory((current) => current.map((item) => (item.id === productId ? { ...item, [field]: value } : item)));
  };

  const saveDefaults = async () => {
    if (!settings) {
      return;
    }

    const defaultLowStockThreshold = Number(draft.defaultLowStockThreshold);
    const thresholdMultiplier = Number(draft.thresholdMultiplier);
    const defaultSafetyStock = Number(draft.defaultSafetyStock);
    const defaultLeadTimeDays = Number(draft.defaultLeadTimeDays);
    const defaultTargetDaysOfCover = Number(draft.defaultTargetDaysOfCover);

    if (!Number.isFinite(defaultLowStockThreshold) || defaultLowStockThreshold < 0) {
      toast.error("Enter a valid low stock threshold.");
      return;
    }

    if (!Number.isFinite(thresholdMultiplier) || thresholdMultiplier <= 0) {
      toast.error("Enter a valid threshold multiplier greater than zero.");
      return;
    }

    if (!Number.isFinite(defaultSafetyStock) || defaultSafetyStock < 0) {
      toast.error("Enter a valid safety stock value.");
      return;
    }

    if (!Number.isFinite(defaultLeadTimeDays) || defaultLeadTimeDays <= 0) {
      toast.error("Enter a valid lead time in days.");
      return;
    }

    if (!Number.isFinite(defaultTargetDaysOfCover) || defaultTargetDaysOfCover < 0) {
      toast.error("Enter a valid target days of cover value.");
      return;
    }

    const saveToken = ++settingsRequestTokenRef.current;
    setSavingDefaults(true);
    try {
      const updated = await updateShopStockSettings({
        defaultLowStockThreshold,
        thresholdMultiplier,
        defaultSafetyStock,
        defaultLeadTimeDays,
        defaultTargetDaysOfCover,
      });
      if (saveToken === settingsRequestTokenRef.current) {
        applySettings(updated);
      }
      await loadSettings();
      toast.success("Stock defaults saved.");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to save stock defaults.");
    } finally {
      setSavingDefaults(false);
    }
  };

  const saveSettings = async () => {
    setSavingInventory(true);
    try {
      await Promise.all(
        inventory.map((item) =>
          updateProduct(item.id, {
            name: item.name,
            sku: item.sku || null,
            barcode: item.barcode || null,
            image_url: item.imageUrl || null,
            category_id: item.categoryId || null,
            brand_id: item.brandId || null,
            unit_price: item.unitPrice,
            cost_price: item.costPrice,
            initial_stock_quantity: item.initialStockQuantity ?? item.stockQuantity,
            reorder_level: item.reorderLevel,
            safety_stock: item.safetyStock,
            target_stock_level: item.targetStockLevel,
            allow_negative_stock: item.allowNegativeStock,
            is_active: item.isActive,
          })
        )
      );
      toast.success("Inventory settings saved.");
      await loadInventory();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to save inventory settings.");
    } finally {
      setSavingInventory(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Stock Defaults</CardTitle>
          <CardDescription>These values are loaded from the database and saved back to the shop stock settings record.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="stock-low-threshold">Low Stock Threshold</Label>
              <Input
                id="stock-low-threshold"
                type="number"
                value={draft.defaultLowStockThreshold}
                onChange={(event) => {
                  draftDirtyRef.current = true;
                  setDraft((current) => ({ ...current, defaultLowStockThreshold: event.target.value }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stock-threshold-multiplier">Threshold Multiplier</Label>
              <Input
                id="stock-threshold-multiplier"
                type="number"
                step="0.1"
                value={draft.thresholdMultiplier}
                onChange={(event) => {
                  draftDirtyRef.current = true;
                  setDraft((current) => ({ ...current, thresholdMultiplier: event.target.value }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stock-safety">Safety Stock</Label>
              <Input
                id="stock-safety"
                type="number"
                value={draft.defaultSafetyStock}
                onChange={(event) => {
                  draftDirtyRef.current = true;
                  setDraft((current) => ({ ...current, defaultSafetyStock: event.target.value }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stock-lead">Lead Time (days)</Label>
              <Input
                id="stock-lead"
                type="number"
                value={draft.defaultLeadTimeDays}
                onChange={(event) => {
                  draftDirtyRef.current = true;
                  setDraft((current) => ({ ...current, defaultLeadTimeDays: event.target.value }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stock-cover">Target Days of Cover</Label>
              <Input
                id="stock-cover"
                type="number"
                value={draft.defaultTargetDaysOfCover}
                onChange={(event) => {
                  draftDirtyRef.current = true;
                  setDraft((current) => ({ ...current, defaultTargetDaysOfCover: event.target.value }));
                }}
              />
            </div>
          </div>
          <Button
            className="mt-4"
            size="sm"
            type="button"
            onClick={() => void saveDefaults()}
            disabled={savingDefaults || loadingSettings || !settings}
          >
            <Save className="mr-1 h-4 w-4" />
            {savingDefaults ? "Saving..." : "Save Defaults"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-Product Inventory Settings</CardTitle>
          <CardDescription>These values are saved directly to the product records in the database.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead className="text-right">Reorder Level</TableHead>
                  <TableHead className="text-right">Safety Stock</TableHead>
                  <TableHead className="text-right">Target Level</TableHead>
                  <TableHead className="text-center">Allow Negative</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.brandName || "No brand"}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        className="ml-auto w-24 text-right"
                        value={item.reorderLevel}
                        onChange={(event) => updateInventory(item.id, "reorderLevel", Number(event.target.value) || 0)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        className="ml-auto w-24 text-right"
                        value={item.safetyStock}
                        onChange={(event) => updateInventory(item.id, "safetyStock", Number(event.target.value) || 0)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        className="ml-auto w-24 text-right"
                        value={item.targetStockLevel}
                        onChange={(event) => updateInventory(item.id, "targetStockLevel", Number(event.target.value) || 0)}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={item.allowNegativeStock}
                        onCheckedChange={(checked) => updateInventory(item.id, "allowNegativeStock", checked)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {!loadingInventory && inventory.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No inventory records found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <Button
            className="mt-4"
            size="sm"
            type="button"
            onClick={() => void saveSettings()}
            disabled={savingInventory || loadingInventory || inventory.length === 0}
          >
            <Save className="mr-1 h-4 w-4" />
            {savingInventory ? "Saving..." : "Save Settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
