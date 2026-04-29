import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { toast } from "sonner";
import { Loader2, Plus, PencilLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  fetchBrands,
  fetchCategories,
  type Brand,
  type Category,
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

export default function CatalogueTab() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<EditorState>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm());
  const [brandForm, setBrandForm] = useState<BrandFormState>(emptyBrandForm());

  const loadData = async () => {
    setLoading(true);
    try {
      const [categoryItems, brandItems] = await Promise.all([fetchCategories(true), fetchBrands(true)]);
      setCategories(categoryItems);
      setBrands(brandItems);
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
          await createCategory(categoryForm.name.trim(), categoryForm.description.trim(), categoryForm.isActive);
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
                    <Button key="action" type="button" size="sm" variant="ghost" onClick={() => openEditor("category", item.category_id)}>
                      <PencilLine className="h-4 w-4" />
                      Edit
                    </Button>,
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
                columns={["Name", "Code", "Description", "Products", "Status", "Actions"]}
                rows={brands.map((item) => ({
                  key: item.brand_id,
                  cells: [
                    item.name,
                    item.code || "—",
                    item.description || "—",
                    String(item.product_count),
                    <Badge key="badge" variant={item.is_active ? "default" : "secondary"}>
                      {item.is_active ? "Active" : "Inactive"}
                    </Badge>,
                    <Button key="action" type="button" size="sm" variant="ghost" onClick={() => openEditor("brand", item.brand_id)}>
                      <PencilLine className="h-4 w-4" />
                      Edit
                    </Button>,
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
