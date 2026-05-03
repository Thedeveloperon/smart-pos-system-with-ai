import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Check, ChevronDown, Loader2, PencilLine, Plus, Power, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createSupplier,
  fetchBrands,
  fetchSuppliers,
  hardDeleteSupplier,
  type Brand,
  type Supplier,
  updateSupplier,
} from "@/lib/api";

type EditorState = {
  id?: string;
} | null;

type SupplierFormState = {
  name: string;
  phone: string;
  companyName: string;
  companyPhone: string;
  address: string;
  isActive: boolean;
  brandIds: string[];
};

type SupplierActionMode = "activate" | "deactivate" | "delete";

type SupplierActionState = {
  supplier: Supplier;
  mode: SupplierActionMode;
} | null;

type SupplierMode = "simple" | "extended";

const emptySupplierForm = (): SupplierFormState => ({
  name: "",
  phone: "",
  companyName: "",
  companyPhone: "",
  address: "",
  isActive: true,
  brandIds: [],
});

const toSupplierUpdatePayload = (supplier: Supplier, isActive = supplier.is_active) => ({
  name: supplier.name,
  phone: supplier.phone ?? "",
  company_name: supplier.company_name ?? "",
  company_phone: supplier.company_phone ?? "",
  address: supplier.address ?? "",
  is_active: isActive,
  brand_ids: supplier.brands.map((brand) => brand.brand_id),
});

export default function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<EditorState>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<SupplierMode>("simple");
  const [saving, setSaving] = useState(false);
  const [supplierForm, setSupplierForm] = useState<SupplierFormState>(emptySupplierForm());
  const [brandOptions, setBrandOptions] = useState<Brand[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [actionState, setActionState] = useState<SupplierActionState>(null);
  const [actionPending, setActionPending] = useState(false);

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

  const loadBrands = async () => {
    setLoadingBrands(true);
    try {
      setBrandOptions(await fetchBrands(true));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load brands.");
    } finally {
      setLoadingBrands(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!editorOpen) {
      return;
    }

    setEditorMode("simple");
    void loadBrands();
  }, [editorOpen]);

  const openEditor = (id?: string) => {
    setEditor({ id });
    const item = suppliers.find((entry) => entry.supplier_id === id);
    setSupplierForm(
      item
        ? {
            name: item.name,
            phone: item.phone || "",
            companyName: item.company_name || "",
            companyPhone: item.company_phone || "",
            address: item.address || "",
            isActive: item.is_active,
            brandIds: item.brands.map((brand) => brand.brand_id),
          }
        : emptySupplierForm(),
    );
    setEditorMode("simple");
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditor(null);
    setEditorMode("simple");
  };

  const handleSave = async () => {
    if (!supplierForm.name.trim()) {
      toast.error("Sales rep name is required.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: supplierForm.name.trim(),
        phone: supplierForm.phone.trim(),
        company_name: editorMode === "extended" ? supplierForm.companyName.trim() : "",
        company_phone: editorMode === "extended" ? supplierForm.companyPhone.trim() : "",
        address: editorMode === "extended" ? supplierForm.address.trim() : "",
        is_active: supplierForm.isActive,
        brand_ids: supplierForm.brandIds,
      };

      if (editor?.id) {
        await updateSupplier(editor.id, payload);
      } else {
        await createSupplier(payload);
      }

      toast.success("Sales rep saved.");
      closeEditor();
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save sales rep.");
    } finally {
      setSaving(false);
    }
  };

  const handleSupplierAction = async () => {
    if (!actionState) {
      return;
    }

    setActionPending(true);
    try {
      if (actionState.mode === "activate") {
        await updateSupplier(actionState.supplier.supplier_id, toSupplierUpdatePayload(actionState.supplier, true));
        toast.success("Sales rep activated.");
      } else if (actionState.mode === "deactivate") {
        await updateSupplier(actionState.supplier.supplier_id, toSupplierUpdatePayload(actionState.supplier, false));
        toast.success("Sales rep deactivated.");
      } else {
        await hardDeleteSupplier(actionState.supplier.supplier_id);
        toast.success("Sales rep deleted.");
      }

      setActionState(null);
      await loadData();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : actionState.mode === "delete"
            ? "Failed to delete sales rep."
            : "Failed to update sales rep.",
      );
    } finally {
      setActionPending(false);
    }
  };

  const selectedBrandNames = useMemo(() => {
    const lookup = new Map(brandOptions.map((brand) => [brand.brand_id, brand.name]));
    return supplierForm.brandIds.map((brandId) => lookup.get(brandId)).filter((name): name is string => Boolean(name));
  }, [brandOptions, supplierForm.brandIds]);

  return (
    <>
      <Card>
        <CardHeader className="space-y-3">
          <div>
            <CardTitle className="text-lg">Sales Reps</CardTitle>
            <p className="text-sm text-muted-foreground">
              Maintain sales rep contacts, optional company details, and brand coverage.
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border bg-muted/20 p-4">
            <div>
              <p className="font-medium">Sales rep directory</p>
              <p className="text-sm text-muted-foreground">
                Use the active switch to hide sales reps without deleting historical links.
              </p>
            </div>
            <Button type="button" onClick={() => openEditor()}>
              <Plus className="h-4 w-4" />
              Add Sales Rep
            </Button>
          </div>

          <Table
            loading={loading}
            emptyText="No sales reps found."
            rows={suppliers.map((item) => ({
              key: item.supplier_id,
              cells: [
                <div key="name" className="space-y-1">
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.company_name || "No company details"}
                  </div>
                </div>,
                item.phone || "—",
                item.brands.length > 0 ? (
                  <div key="brands" className="flex flex-wrap gap-1.5">
                    {item.brands.map((brand) => (
                      <Badge key={brand.brand_id} variant="outline" className="rounded-full">
                        {brand.name}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  "—"
                ),
                String(item.linked_product_count),
                <Badge key="badge" variant={item.is_active ? "default" : "secondary"}>
                  {item.is_active ? "Active" : "Inactive"}
                </Badge>,
                <div key="action" className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => openEditor(item.supplier_id)}
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
                        supplier: item,
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
                          supplier: item,
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
        </CardContent>
      </Card>

      <SupplierEditorDialog
        open={editorOpen}
        supplierForm={supplierForm}
        setSupplierForm={setSupplierForm}
        mode={editorMode}
        setMode={setEditorMode}
        brands={brandOptions}
        loadingBrands={loadingBrands}
        saving={saving}
        selectedBrandNames={selectedBrandNames}
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
        onConfirm={() => void handleSupplierAction()}
        title={
          actionState?.mode === "delete"
            ? "Delete sales rep?"
            : actionState?.mode === "activate"
              ? "Activate sales rep?"
              : "Deactivate sales rep?"
        }
        description={
          actionState?.mode === "delete"
            ? actionState?.supplier
              ? `Permanently delete "${actionState.supplier.name}"? This cannot be undone.`
              : "Permanently delete this sales rep?"
            : actionState?.mode === "activate"
              ? actionState?.supplier
                ? `Activate "${actionState.supplier.name}"? It will appear in active sales rep selectors again.`
                : "Activate this sales rep?"
              : actionState?.supplier
                ? `Deactivate "${actionState.supplier.name}"? It will stay in history but be hidden from active selectors.`
                : "Deactivate this sales rep?"
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
  const columns = ["Sales Rep", "Phone", "Brands", "Products", "Status", "Actions"];
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
  mode,
  setMode,
  brands,
  loadingBrands,
  saving,
  selectedBrandNames,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  supplierForm: SupplierFormState;
  setSupplierForm: Dispatch<SetStateAction<SupplierFormState>>;
  mode: SupplierMode;
  setMode: Dispatch<SetStateAction<SupplierMode>>;
  brands: Brand[];
  loadingBrands: boolean;
  saving: boolean;
  selectedBrandNames: string[];
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{supplierForm.name ? "Edit sales rep" : "Add sales rep"}</DialogTitle>
          <DialogDescription>
            Capture the sales rep first, then add optional company details and brand coverage.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={mode === "simple" ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setMode("simple")}
          >
            Simple Mode
          </Button>
          <Button
            type="button"
            variant={mode === "extended" ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setMode("extended")}
          >
            Extended Mode
          </Button>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Sales Rep Name</Label>
            <Input
              value={supplierForm.name}
              onChange={(event) => setSupplierForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </div>

          {mode === "simple" ? (
            <>
              <div className="grid gap-1.5">
                <Label>Phone Number</Label>
                <Input
                  value={supplierForm.phone}
                  onChange={(event) =>
                    setSupplierForm((prev) => ({ ...prev, phone: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Brands</Label>
                <BrandMultiSelect
                  brands={brands}
                  loading={loadingBrands}
                  selectedBrandIds={supplierForm.brandIds}
                  selectedBrandNames={selectedBrandNames}
                  onChange={(brandIds) => setSupplierForm((prev) => ({ ...prev, brandIds }))}
                />
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Sales Rep Phone</Label>
                  <Input
                    value={supplierForm.phone}
                    onChange={(event) =>
                      setSupplierForm((prev) => ({ ...prev, phone: event.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Company Name</Label>
                  <Input
                    value={supplierForm.companyName}
                    onChange={(event) =>
                      setSupplierForm((prev) => ({ ...prev, companyName: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Company Phone</Label>
                  <Input
                    value={supplierForm.companyPhone}
                    onChange={(event) =>
                      setSupplierForm((prev) => ({ ...prev, companyPhone: event.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Brands</Label>
                  <BrandMultiSelect
                    brands={brands}
                    loading={loadingBrands}
                    selectedBrandIds={supplierForm.brandIds}
                    selectedBrandNames={selectedBrandNames}
                    onChange={(brandIds) => setSupplierForm((prev) => ({ ...prev, brandIds }))}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Company Address</Label>
                <Textarea
                  value={supplierForm.address}
                  onChange={(event) =>
                    setSupplierForm((prev) => ({ ...prev, address: event.target.value }))
                  }
                  rows={4}
                />
              </div>
            </>
          )}

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="text-sm font-medium">Active</Label>
              <p className="text-xs text-muted-foreground">
                Inactive sales reps stay in history but are hidden in selectors.
              </p>
            </div>
            <Switch
              checked={supplierForm.isActive}
              onCheckedChange={(checked) =>
                setSupplierForm((prev) => ({ ...prev, isActive: checked }))
              }
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

function BrandMultiSelect({
  brands,
  loading,
  selectedBrandIds,
  selectedBrandNames,
  onChange,
}: {
  brands: Brand[];
  loading: boolean;
  selectedBrandIds: string[];
  selectedBrandNames: string[];
  onChange: (brandIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const brandLookup = useMemo(() => new Map(brands.map((brand) => [brand.brand_id, brand])), [brands]);

  const toggleBrand = (brandId: string) => {
    if (selectedBrandIds.includes(brandId)) {
      onChange(selectedBrandIds.filter((currentId) => currentId !== brandId));
      return;
    }

    onChange([...selectedBrandIds, brandId]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm shadow-sm outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <div className="flex flex-1 flex-wrap gap-1.5">
            {selectedBrandNames.length > 0 ? (
              selectedBrandNames.map((brandName, index) => {
                const brandId = selectedBrandIds[index];
                return (
                  <Badge key={`${brandId}-${brandName}`} variant="secondary" className="gap-1 rounded-full">
                    <span>{brandName}</span>
                    <button
                      type="button"
                      className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleBrand(brandId);
                      }}
                      aria-label={`Remove ${brandName}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })
            ) : (
              <span className="text-muted-foreground">Select one or more brands</span>
            )}
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Search brands..." />
          <CommandList>
            <CommandEmpty>{loading ? "Loading brands..." : "No brands found."}</CommandEmpty>
            <CommandGroup>
              {brands.map((brand) => {
                const selected = selectedBrandIds.includes(brand.brand_id);
                return (
                  <CommandItem
                    key={brand.brand_id}
                    value={brand.name}
                    onSelect={() => toggleBrand(brand.brand_id)}
                  >
                    <Check className={`mr-2 h-4 w-4 ${selected ? "opacity-100" : "opacity-0"}`} />
                    <div className="flex flex-1 items-center justify-between gap-2">
                      <span>{brand.name}</span>
                      {brand.code ? <span className="text-xs text-muted-foreground">{brand.code}</span> : null}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
