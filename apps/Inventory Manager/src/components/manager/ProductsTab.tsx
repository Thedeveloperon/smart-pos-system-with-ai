import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Loader2,
  Package,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ProductManagementDialog from "@/components/pos/ProductManagementDialog";
import {
  bulkGenerateMissingProductBarcodes,
  deleteProduct,
  fetchBrands,
  fetchCategories,
  fetchProducts,
  hardDeleteProduct,
  type Brand,
  type Category,
  type Product,
} from "@/lib/api";

const currencyFormatter = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  maximumFractionDigits: 2,
});

export default function ProductsTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogProduct, setDialogProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteMode, setDeleteMode] = useState<"soft" | "hard" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [barcodeBatchRunning, setBarcodeBatchRunning] = useState(false);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const [productItems, categoryItems, brandItems] = await Promise.all([
        fetchProducts(),
        fetchCategories(true),
        fetchBrands(true),
      ]);
      setProducts(productItems);
      setCategories(categoryItems);
      setBrands(brandItems);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load products.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesQuery =
        !query ||
        product.name.toLowerCase().includes(query) ||
        (product.sku || "").toLowerCase().includes(query) ||
        (product.barcode || "").toLowerCase().includes(query);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && (product.is_active ?? true)) ||
        (statusFilter === "inactive" && !product.is_active);
      const matchesCategory =
        categoryFilter === "all" || (product.category_id ?? "") === categoryFilter;
      const matchesBrand = brandFilter === "all" || (product.brand_id ?? "") === brandFilter;
      return matchesQuery && matchesStatus && matchesCategory && matchesBrand;
    });
  }, [products, search, statusFilter, categoryFilter, brandFilter]);

  const handleDelete = async (mode: "soft" | "hard") => {
    if (!deleteTarget) {
      return;
    }

    setDeleting(true);
    try {
      if (mode === "soft") {
        await deleteProduct(deleteTarget.id);
        toast.success("Product deactivated.");
      } else {
        await hardDeleteProduct(deleteTarget.id);
        toast.success("Product deleted.");
      }
      setDeleteTarget(null);
      setDeleteMode(null);
      await loadProducts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete product.");
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkGenerateBarcodes = async () => {
    setBarcodeBatchRunning(true);
    try {
      const result = await bulkGenerateMissingProductBarcodes({ dry_run: true });
      toast.success(
        result.would_generate > 0
          ? `Found ${result.would_generate} product(s) missing barcodes.`
          : "No products are missing barcodes.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to scan barcodes.");
    } finally {
      setBarcodeBatchRunning(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-lg">Products</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Create, edit, deactivate, and hard-delete products from the inventory catalog.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={loadProducts} disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Refresh
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBulkGenerateBarcodes}
                  disabled={barcodeBatchRunning}
                >
                  {barcodeBatchRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  Missing barcodes
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setDialogProduct(null);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add Product
                </Button>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-4">
              <div className="relative lg:col-span-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name, SKU, or barcode..."
                  className="pl-9"
                />
              </div>

              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="inactive">Inactive only</SelectItem>
                </SelectContent>
              </Select>

              <div className="grid gap-3 md:grid-cols-2">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.category_id} value={category.category_id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={brandFilter} onValueChange={setBrandFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Brand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All brands</SelectItem>
                    {brands.map((brand) => (
                      <SelectItem key={brand.brand_id} value={brand.brand_id}>
                        {brand.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="overflow-hidden rounded-xl border">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[28%]">Product</TableHead>
                    <TableHead className="hidden w-[12%] md:table-cell">Barcode</TableHead>
                    <TableHead className="hidden w-[13%] lg:table-cell">Category</TableHead>
                    <TableHead className="hidden w-[13%] lg:table-cell">Brand</TableHead>
                    <TableHead className="w-[11%] text-right">Unit price</TableHead>
                    <TableHead className="w-[11%] text-right">Discount</TableHead>
                    <TableHead className="w-[8%] text-right">Stock</TableHead>
                    <TableHead className="w-[8%]">Status</TableHead>
                    <TableHead className="w-[17%] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                        Loading products...
                      </TableCell>
                    </TableRow>
                  ) : filteredProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                        No products match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredProducts.map((product) => {
                      const isActive = product.is_active ?? true;
                      return (
                        <TableRow key={product.id}>
                          <TableCell className="max-w-0">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/50">
                                {product.image_url || product.image ? (
                                  <img
                                    src={product.image_url || product.image}
                                    alt={product.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <Package className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium leading-tight">{product.name}</div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {product.sku || "—"}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden truncate font-mono text-xs md:table-cell">
                            {product.barcode || "—"}
                          </TableCell>
                          <TableCell className="hidden truncate text-sm text-muted-foreground lg:table-cell">
                            {product.category_name || "—"}
                          </TableCell>
                          <TableCell className="hidden truncate text-sm text-muted-foreground lg:table-cell">
                            {product.brand_name || "—"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {currencyFormatter.format(product.unit_price ?? product.price ?? 0)}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {product.permanent_discount_percent != null
                              ? `${product.permanent_discount_percent}%`
                              : product.permanent_discount_fixed != null
                                ? currencyFormatter.format(product.permanent_discount_fixed)
                                : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span>
                                {(product.stock_quantity ?? product.stock ?? 0).toLocaleString()}
                              </span>
                              {product.is_low_stock ? (
                                <Badge variant="destructive" className="text-[10px]">
                                  Low
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={isActive ? "default" : "secondary"}>
                              {isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2 text-xs"
                                onClick={() => {
                                  setDialogProduct(product);
                                  setDialogOpen(true);
                                }}
                              >
                                <PencilLine className="h-4 w-4" />
                                Edit
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2 text-xs text-destructive hover:text-destructive"
                                onClick={() => {
                                  setDeleteTarget(product);
                                  setDeleteMode("soft");
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </Button>
                              {!isActive ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2 text-xs text-destructive"
                                  onClick={() => {
                                    setDeleteTarget(product);
                                    setDeleteMode("hard");
                                  }}
                                >
                                  Hard delete
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <ProductManagementDialog
        open={dialogOpen}
        product={dialogProduct}
        onOpenChange={setDialogOpen}
        onSaved={async () => {
          await loadProducts();
        }}
        onDeleted={async () => {
          await loadProducts();
        }}
      />

      <ConfirmationDialog
        open={Boolean(deleteTarget && deleteMode)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeleteTarget(null);
            setDeleteMode(null);
          }
        }}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteMode(null);
        }}
        onConfirm={() => {
          void handleDelete(deleteMode ?? "soft");
        }}
        title={deleteMode === "hard" ? "Hard delete product?" : "Deactivate product?"}
        description={
          deleteMode === "hard"
            ? deleteTarget
              ? `Permanently delete "${deleteTarget.name}"?`
              : "This permanently deletes the product."
            : deleteTarget
              ? `Deactivate "${deleteTarget.name}"? It will be hidden from active sales.`
              : "This will hide the product from active sales."
        }
        confirmLabel={deleteMode === "hard" ? "Delete" : "Deactivate"}
        confirmVariant={deleteMode === "hard" ? "destructive" : "default"}
        confirmDisabled={deleting}
        cancelDisabled={deleting}
        confirmContent={deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
      />
    </>
  );
}
