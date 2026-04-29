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
import { Textarea } from "@/components/ui/textarea";
import {
  createSupplier,
  fetchSuppliers,
  type Supplier,
  updateSupplier,
} from "@/lib/api";

type EditorState = {
  id?: string;
} | null;

type SupplierFormState = {
  name: string;
  code: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  isActive: boolean;
};

const emptySupplierForm = (): SupplierFormState => ({
  name: "",
  code: "",
  contact_name: "",
  phone: "",
  email: "",
  address: "",
  isActive: true,
});

export default function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<EditorState>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [supplierForm, setSupplierForm] = useState<SupplierFormState>(emptySupplierForm());

  const loadData = async () => {
    setLoading(true);
    try {
      setSuppliers(await fetchSuppliers(true));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load suppliers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const openEditor = (id?: string) => {
    setEditor({ id });
    const item = suppliers.find((entry) => entry.supplier_id === id);
    setSupplierForm(
      item
        ? {
            name: item.name,
            code: item.code || "",
            contact_name: item.contact_name || "",
            phone: item.phone || "",
            email: item.email || "",
            address: item.address || "",
            isActive: item.is_active,
          }
        : emptySupplierForm(),
    );
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditor(null);
  };

  const handleSave = async () => {
    if (!supplierForm.name.trim()) {
      toast.error("Supplier name is required.");
      return;
    }

    setSaving(true);
    try {
      if (editor?.id) {
        await updateSupplier(editor.id, {
          name: supplierForm.name.trim(),
          code: supplierForm.code.trim(),
          contact_name: supplierForm.contact_name.trim(),
          phone: supplierForm.phone.trim(),
          email: supplierForm.email.trim(),
          address: supplierForm.address.trim(),
          is_active: supplierForm.isActive,
        });
      } else {
        await createSupplier({
          name: supplierForm.name.trim(),
          code: supplierForm.code.trim(),
          contact_name: supplierForm.contact_name.trim(),
          phone: supplierForm.phone.trim(),
          email: supplierForm.email.trim(),
          address: supplierForm.address.trim(),
          is_active: supplierForm.isActive,
        });
      }

      toast.success("Supplier saved.");
      closeEditor();
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save supplier.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="space-y-3">
          <div>
            <CardTitle className="text-lg">Suppliers</CardTitle>
            <p className="text-sm text-muted-foreground">
              Maintain supplier contact details and activity status.
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border bg-muted/20 p-4">
            <div>
              <p className="font-medium">Supplier directory</p>
              <p className="text-sm text-muted-foreground">
                Use the active switch to hide suppliers without deleting historical links.
              </p>
            </div>
            <Button type="button" onClick={() => openEditor()}>
              <Plus className="h-4 w-4" />
              Add Supplier
            </Button>
          </div>

          <Table
            loading={loading}
            emptyText="No suppliers found."
            rows={suppliers.map((item) => ({
              key: item.supplier_id,
              cells: [
                item.name,
                item.code || "—",
                item.contact_name || "—",
                item.phone || "—",
                item.email || "—",
                String(item.linked_product_count),
                <Badge key="badge" variant={item.is_active ? "default" : "secondary"}>
                  {item.is_active ? "Active" : "Inactive"}
                </Badge>,
                <Button key="action" type="button" size="sm" variant="ghost" onClick={() => openEditor(item.supplier_id)}>
                  <PencilLine className="h-4 w-4" />
                  Edit
                </Button>,
              ],
            }))}
          />
        </CardContent>
      </Card>

      <SupplierEditorDialog
        open={editorOpen}
        supplierForm={supplierForm}
        setSupplierForm={setSupplierForm}
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

function Table({
  loading,
  emptyText,
  rows,
}: {
  loading: boolean;
  emptyText: string;
  rows: Array<{ key: string; cells: ReactNode[] }>;
}) {
  const columns = ["Name", "Code", "Contact", "Phone", "Email", "Products", "Status", "Actions"];
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

function SupplierEditorDialog({
  open,
  supplierForm,
  setSupplierForm,
  saving,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  supplierForm: SupplierFormState;
  setSupplierForm: Dispatch<SetStateAction<SupplierFormState>>;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{supplierForm.name ? "Edit supplier" : "Add supplier"}</DialogTitle>
          <DialogDescription>Keep supplier records current for product setup and purchasing.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Name</Label>
            <Input value={supplierForm.name} onChange={(event) => setSupplierForm((prev) => ({ ...prev, name: event.target.value }))} />
          </div>
          <div className="grid gap-1.5 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Code</Label>
              <Input value={supplierForm.code} onChange={(event) => setSupplierForm((prev) => ({ ...prev, code: event.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Contact person</Label>
              <Input
                value={supplierForm.contact_name}
                onChange={(event) => setSupplierForm((prev) => ({ ...prev, contact_name: event.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-1.5 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Phone</Label>
              <Input value={supplierForm.phone} onChange={(event) => setSupplierForm((prev) => ({ ...prev, phone: event.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Email</Label>
              <Input value={supplierForm.email} onChange={(event) => setSupplierForm((prev) => ({ ...prev, email: event.target.value }))} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Address</Label>
            <Textarea
              value={supplierForm.address}
              onChange={(event) => setSupplierForm((prev) => ({ ...prev, address: event.target.value }))}
              rows={4}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="text-sm font-medium">Active</Label>
              <p className="text-xs text-muted-foreground">Inactive suppliers stay in history but are hidden in selectors.</p>
            </div>
            <Switch
              checked={supplierForm.isActive}
              onCheckedChange={(checked) => setSupplierForm((prev) => ({ ...prev, isActive: checked }))}
            />
          </div>
        </div>

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
