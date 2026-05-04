import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { toast } from "sonner";
import { Loader2, PencilLine, Plus, Power, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  createBrand,
  createCategory,
  fetchProductCatalogItems,
  fetchBrands,
  fetchCategories,
  hardDeleteCategory,
  hardDeleteBrand,
  type Brand,
  type Category,
  type Product,
  updateProduct,
  updateBrand,
  updateCategory,
} from "@/lib/api";

type EditorState = {
  kind: "category" | "brand";
  id?: string;
} | null;

type CategoryFormState = {
  name: string;
  description: string;
  isActive: boolean;
};

type BrandFormState = {
  name: string;
  code: string;
  description: string;
  isActive: boolean;
};

type BrandActionMode = "activate" | "deactivate" | "delete";

type BrandActionState = {
  brand: Brand;
  mode: BrandActionMode;
} | null;

type CategoryActionMode = "activate" | "deactivate" | "delete";

type CategoryActionState = {
  category: Category;
  mode: CategoryActionMode;
} | null;

const emptyCategoryForm = (): CategoryFormState => ({
  name: "",
  description: "",
  isActive: true,
});

const emptyBrandForm = (): BrandFormState => ({
  name: "",
  code: "",
  description: "",
  isActive: true,
});

const toBrandUpdatePayload = (brand: Brand, isActive = brand.is_active) => ({
  name: brand.name,
  code: brand.code ?? "",
  description: brand.description ?? "",
  is_active: isActive,
});

const toProductStatusUpdatePayload = (product: Product, isActive: boolean) => ({
  name: product.name,
  sku: product.sku || null,
  barcode: product.barcode || null,
  image_url: product.image_url ?? null,
  category_id: product.category_id ?? null,
  brand_id: product.brand_id ?? null,
  unit_price: product.unit_price ?? product.price ?? 0,
  cost_price: product.cost_price ?? product.price ?? product.unit_price ?? 0,
  initial_stock_quantity: product.initial_stock_quantity ?? product.stock_quantity ?? 0,
  reorder_level: product.reorder_level ?? 0,
  safety_stock: product.safety_stock ?? 0,
  target_stock_level: product.target_stock_level ?? 0,
  allow_negative_stock: product.allow_negative_stock ?? false,
  is_serial_tracked: product.is_serial_tracked ?? false,
  warranty_months: product.warranty_months ?? 0,
  is_batch_tracked: product.is_batch_tracked ?? false,
  expiry_alert_days: product.expiry_alert_days ?? 30,
  is_active: isActive,
  product_suppliers: product.product_suppliers,
});

export default function CatalogueTab() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<EditorState>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm());
  const [brandForm, setBrandForm] = useState<BrandFormState>(emptyBrandForm());
  const [actionState, setActionState] = useState<BrandActionState>(null);
  const [categoryActionState, setCategoryActionState] = useState<CategoryActionState>(null);
  const [actionPending, setActionPending] = useState(false);
  const [categoryActionPending, setCategoryActionPending] = useState(false);
  const [productActionProductId, setProductActionProductId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [categoryItems, brandItems, productItems] = await Promise.all([
        fetchCategories(true),
        fetchBrands(true),
        fetchProductCatalogItems(200, true),
      ]);
      setCategories(categoryItems);
      setBrands(brandItems);
      setProducts(productItems);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load catalogue data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const openEditor = (kind: "category" | "brand", id?: string) => {
    setEditor({ kind, id });
    if (kind === "category") {
      const item = categories.find((entry) => entry.category_id === id);
      setCategoryForm(
        item
          ? { name: item.name, description: item.description || "", isActive: item.is_active }
          : emptyCategoryForm(),
      );
    } else {
      const item = brands.find((entry) => entry.brand_id === id);
      setBrandForm(
        item
          ? { name: item.name, code: item.code || "", description: item.description || "", isActive: item.is_active }
          : emptyBrandForm(),
      );
    }
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditor(null);
  };

  const handleSave = async () => {
    if (!editor) {
      return;
    }

    setSaving(true);
    try {
      if (editor.kind === "category") {
        if (!categoryForm.name.trim()) {
          throw new Error("Category name is required.");
        }
        if (editor.id) {
          await updateCategory(editor.id, {
            name: categoryForm.name.trim(),
            description: categoryForm.description.trim(),
            is_active: categoryForm.isActive,
          });
        } else {
          await createCategory({
            name: categoryForm.name.trim(),
            description: categoryForm.description.trim(),
            is_active: categoryForm.isActive,
          });
        }
      } else {
        if (!brandForm.name.trim()) {
          throw new Error("Brand name is required.");
        }
        if (editor.id) {
          await updateBrand(editor.id, {
            name: brandForm.name.trim(),
            code: brandForm.code.trim(),
            description: brandForm.description.trim(),
            is_active: brandForm.isActive,
          });
        } else {
          await createBrand({
            name: brandForm.name.trim(),
            code: brandForm.code.trim(),
            description: brandForm.description.trim(),
            is_active: brandForm.isActive,
          });
        }
      }

      toast.success("Catalogue item saved.");
      closeEditor();
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save catalogue item.");
    } finally {
      setSaving(false);
    }
  };

  const handleBrandAction = async () => {
    if (!actionState) {
      return;
    }

    setActionPending(true);
    try {
      if (actionState.mode === "activate") {
        await updateBrand(
          actionState.brand.brand_id,
          toBrandUpdatePayload(actionState.brand, true),
        );
        toast.success("Brand activated.");
      } else if (actionState.mode === "deactivate") {
        await updateBrand(
          actionState.brand.brand_id,
          toBrandUpdatePayload(actionState.brand, false),
        );
        toast.success("Brand deactivated.");
      } else {
        await hardDeleteBrand(actionState.brand.brand_id);
        toast.success("Brand deleted.");
      }

      setActionState(null);
      await loadData();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : actionState.mode === "delete"
            ? "Failed to delete brand."
            : "Failed to update brand.",
      );
    } finally {
      setActionPending(false);
    }
  };

  const handleCategoryAction = async () => {
    if (!categoryActionState) {
      return;
    }

    setCategoryActionPending(true);
    try {
      if (categoryActionState.mode === "activate") {
        await updateCategory(categoryActionState.category.category_id, {
          name: categoryActionState.category.name,
          description: categoryActionState.category.description ?? undefined,
          is_active: true,
        });
        toast.success("Category activated.");
      } else if (categoryActionState.mode === "deactivate") {
        await updateCategory(categoryActionState.category.category_id, {
          name: categoryActionState.category.name,
          description: categoryActionState.category.description ?? undefined,
          is_active: false,
        });
        toast.success("Category deactivated.");
      } else {
        await hardDeleteCategory(categoryActionState.category.category_id);
        toast.success("Category deleted.");
      }

      setCategoryActionState(null);
      await loadData();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : categoryActionState.mode === "delete"
            ? "Failed to delete category."
            : "Failed to update category.",
      );
    } finally {
      setCategoryActionPending(false);
    }
  };

  const handleProductStatusToggle = async (product: Product, isActive: boolean) => {
    setProductActionProductId(product.id);
    try {
      await updateProduct(product.id, toProductStatusUpdatePayload(product, isActive));
      toast.success(isActive ? "Product activated." : "Product deactivated.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update product.");
    } finally {
      setProductActionProductId(null);
    }
  };

  const productsByBrand = products.reduce<Record<string, Product[]>>((accumulator, product) => {
    if (!product.brand_id) {
      return accumulator;
    }

    if (!accumulator[product.brand_id]) {
      accumulator[product.brand_id] = [];
    }

    accumulator[product.brand_id].push(product);
    return accumulator;
  }, {});

  return (
    <>
      <Card>
        <CardHeader className="space-y-3">
          <div>
            <CardTitle className="text-lg">Categories and brands</CardTitle>
            <p className="text-sm text-muted-foreground">
              Manage the product reference data used by the product form.
            </p>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="categories" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="categories">Categories</TabsTrigger>
              <TabsTrigger value="brands">Brands</TabsTrigger>
            </TabsList>

            <TabsContent value="categories" className="space-y-4">
              <SectionHeader
                title="Categories"
                description="Create and update category records used by products."
                onAdd={() => openEditor("category")}
              />
              <SectionTable
                loading={loading}
                emptyText="No categories found."
                columns={["Name", "Description", "Products", "Status", "Actions"]}
                rows={categories.map((item) => ({
                  key: item.category_id,
                  cells: [
                    item.name,
                    item.description || "—",
                    String(item.product_count),
                    <Badge key="badge" variant={item.is_active ? "default" : "secondary"}>
                      {item.is_active ? "Active" : "Inactive"}
                    </Badge>,
                    <div key="action" className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditor("category", item.category_id)}
                      >
                        <PencilLine className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setCategoryActionState({
                            category: item,
                            mode: item.is_active ? "deactivate" : "activate",
                          })
                        }
                      >
                        <Power className="h-4 w-4" />
                        {item.is_active ? "Deactivate" : "Activate"}
                      </Button>
                      <span title={item.delete_block_reason ?? undefined}>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          disabled={!item.can_delete}
                          onClick={() =>
                            setCategoryActionState({
                              category: item,
                              mode: "delete",
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </span>
                    </div>,
                  ],
                }))}
              />
            </TabsContent>

            <TabsContent value="brands" className="space-y-4">
              <SectionHeader
                title="Brands"
                description="Manage brand codes and descriptions."
                onAdd={() => openEditor("brand")}
              />
              <SectionTable
                loading={loading}
                emptyText="No brands found."
                columns={["Name", "Code", "Description", "Product list", "Status", "Actions"]}
                rows={brands.map((item) => ({
                  key: item.brand_id,
                  cells: [
                    <div key="brand-name" className="space-y-1">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.product_count === 1 ? "1 linked product" : `${item.product_count} linked products`}
                      </div>
                    </div>,
                    item.code || "—",
                    item.description || "—",
                    <BrandProductList
                      key="products"
                      products={productsByBrand[item.brand_id] ?? []}
                      totalProducts={item.product_count}
                      pendingProductId={productActionProductId}
                      onToggleStatus={(product, isActive) => void handleProductStatusToggle(product, isActive)}
                    />,
                    <Badge key="badge" variant={item.is_active ? "default" : "secondary"}>
                      {item.is_active ? "Active" : "Inactive"}
                    </Badge>,
                    <div key="action" className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditor("brand", item.brand_id)}
                      >
                        <PencilLine className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setActionState({
                            brand: item,
                            mode: item.is_active ? "deactivate" : "activate",
                          })
                        }
                      >
                        <Power className="h-4 w-4" />
                        {item.is_active ? "Deactivate" : "Activate"}
                      </Button>
                      <span title={item.delete_block_reason ?? undefined}>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          disabled={!item.can_delete}
                          onClick={() =>
                            setActionState({
                              brand: item,
                              mode: "delete",
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </span>
                    </div>,
                  ],
                }))}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <EditorDialog
        open={editorOpen}
        editor={editor}
        categoryForm={categoryForm}
        setCategoryForm={setCategoryForm}
        brandForm={brandForm}
        setBrandForm={setBrandForm}
        saving={saving}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeEditor();
          }
        }}
        onSave={() => void handleSave()}
      />

      <ConfirmationDialog
        open={Boolean(actionState)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !actionPending) {
            setActionState(null);
          }
        }}
        onCancel={() => {
          if (!actionPending) {
            setActionState(null);
          }
        }}
        onConfirm={() => void handleBrandAction()}
        title={
          actionState?.mode === "delete"
            ? "Delete brand?"
            : actionState?.mode === "activate"
              ? "Activate brand?"
              : "Deactivate brand?"
        }
        description={
          actionState?.mode === "delete"
            ? actionState?.brand
              ? `Permanently delete "${actionState.brand.name}"? This cannot be undone.`
              : "Permanently delete this brand?"
            : actionState?.mode === "activate"
              ? actionState?.brand
                ? `Activate "${actionState.brand.name}"? It will appear in active product selectors again.`
                : "Activate this brand?"
              : actionState?.brand
                ? `Deactivate "${actionState.brand.name}"? It will stay on historical products but be hidden from active selectors.`
                : "Deactivate this brand?"
        }
        confirmLabel={
          actionState?.mode === "delete"
            ? "Delete"
            : actionState?.mode === "activate"
              ? "Activate"
              : "Deactivate"
        }
        confirmVariant={actionState?.mode === "delete" ? "destructive" : "default"}
        confirmDisabled={actionPending}
        cancelDisabled={actionPending}
        confirmContent={actionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
      />

      <ConfirmationDialog
        open={Boolean(categoryActionState)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !categoryActionPending) {
            setCategoryActionState(null);
          }
        }}
        onCancel={() => {
          if (!categoryActionPending) {
            setCategoryActionState(null);
          }
        }}
        onConfirm={() => void handleCategoryAction()}
        title={
          categoryActionState?.mode === "delete"
            ? "Delete category?"
            : categoryActionState?.mode === "activate"
              ? "Activate category?"
              : "Deactivate category?"
        }
        description={
          categoryActionState?.mode === "delete"
            ? categoryActionState?.category
              ? `Permanently delete "${categoryActionState.category.name}"? This cannot be undone.`
              : "Permanently delete this category?"
            : categoryActionState?.mode === "activate"
              ? categoryActionState?.category
                ? `Activate "${categoryActionState.category.name}"? It will appear in active product selectors again.`
                : "Activate this category?"
              : categoryActionState?.category
                ? `Deactivate "${categoryActionState.category.name}"? It will stay on historical products but be hidden from active selectors.`
                : "Deactivate this category?"
        }
        confirmLabel={
          categoryActionState?.mode === "delete"
            ? "Delete"
            : categoryActionState?.mode === "activate"
              ? "Activate"
              : "Deactivate"
        }
        confirmVariant={categoryActionState?.mode === "delete" ? "destructive" : "default"}
        confirmDisabled={categoryActionPending}
        cancelDisabled={categoryActionPending}
        confirmContent={
          categoryActionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined
        }
      />
    </>
  );
}

function SectionHeader({
  title,
  description,
  onAdd,
}: {
  title: string;
  description: string;
  onAdd: () => void;
}) {
  const singularTitle = title === "Categories" ? "Category" : "Brand";
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Button type="button" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        Add {singularTitle}
      </Button>
    </div>
  );
}

function BrandProductList({
  products,
  totalProducts,
  pendingProductId,
  onToggleStatus,
}: {
  products: Product[];
  totalProducts: number;
  pendingProductId: string | null;
  onToggleStatus: (product: Product, isActive: boolean) => void;
}) {
  if (products.length === 0) {
    return <span className="text-sm text-muted-foreground">No products linked to this brand.</span>;
  }

  return (
    <div className="min-w-[18rem] space-y-2">
      {products.length !== totalProducts ? (
        <p className="text-xs text-muted-foreground">
          Showing {products.length} of {totalProducts} linked products.
        </p>
      ) : null}
      {products.map((product) => {
        const isPending = pendingProductId === product.id;
        const nextIsActive = !product.is_active;
        return (
          <div
            key={product.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/10 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{product.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {[product.sku || null, product.barcode || null].filter(Boolean).join(" • ") || "No SKU or barcode"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={product.is_active ? "default" : "secondary"}>
                {product.is_active ? "Active" : "Inactive"}
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending}
                aria-label={`${nextIsActive ? "Activate" : "Deactivate"} ${product.name}`}
                onClick={() => onToggleStatus(product, nextIsActive)}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                {nextIsActive ? "Activate" : "Deactivate"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SectionTable({
  loading,
  emptyText,
  columns,
  rows,
}: {
  loading: boolean;
  emptyText: string;
  columns: string[];
  rows: Array<{ key: string; cells: ReactNode[] }>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">
                Loading...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.key} className="border-t">
                {row.cells.map((cell, index) => (
                  <td key={index} className="px-4 py-3 text-sm align-top">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function EditorDialog({
  open,
  editor,
  categoryForm,
  setCategoryForm,
  brandForm,
  setBrandForm,
  saving,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  editor: EditorState;
  categoryForm: CategoryFormState;
  setCategoryForm: Dispatch<SetStateAction<CategoryFormState>>;
  brandForm: BrandFormState;
  setBrandForm: Dispatch<SetStateAction<BrandFormState>>;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editor?.id ? "Edit" : "Add"} {editor?.kind || "item"}
          </DialogTitle>
          <DialogDescription>Keep reference records up to date for product setup.</DialogDescription>
        </DialogHeader>

        {editor?.kind === "category" ? (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Name</Label>
              <Input value={categoryForm.name} onChange={(event) => setCategoryForm((prev) => ({ ...prev, name: event.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Description</Label>
              <Textarea
                value={categoryForm.description}
                onChange={(event) => setCategoryForm((prev) => ({ ...prev, description: event.target.value }))}
                rows={4}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="text-sm font-medium">Active</Label>
                <p className="text-xs text-muted-foreground">Inactive categories stay in history but are hidden in selectors.</p>
              </div>
              <Switch
                checked={categoryForm.isActive}
                onCheckedChange={(checked) => setCategoryForm((prev) => ({ ...prev, isActive: checked }))}
              />
            </div>
          </div>
        ) : null}

        {editor?.kind === "brand" ? (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Name</Label>
              <Input value={brandForm.name} onChange={(event) => setBrandForm((prev) => ({ ...prev, name: event.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Code</Label>
              <Input value={brandForm.code} onChange={(event) => setBrandForm((prev) => ({ ...prev, code: event.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Description</Label>
              <Textarea
                value={brandForm.description}
                onChange={(event) => setBrandForm((prev) => ({ ...prev, description: event.target.value }))}
                rows={4}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="text-sm font-medium">Active</Label>
                <p className="text-xs text-muted-foreground">Inactive brands remain available for historical products.</p>
              </div>
              <Switch
                checked={brandForm.isActive}
                onCheckedChange={(checked) => setBrandForm((prev) => ({ ...prev, isActive: checked }))}
              />
            </div>
          </div>
        ) : null}

        <Separator />

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
