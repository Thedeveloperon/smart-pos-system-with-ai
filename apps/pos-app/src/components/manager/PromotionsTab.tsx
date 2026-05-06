import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, PencilLine, Plus, Power, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  createPromotion,
  deactivatePromotion,
  fetchCategories,
  fetchProductCatalogItems,
  fetchPromotions,
  updatePromotion,
  type Category,
  type Product,
  type Promotion,
  type PromotionScope,
  type PromotionValueType,
} from "@/lib/api";

type FormState = {
  name: string;
  description: string;
  scope: PromotionScope;
  categoryId: string;
  productId: string;
  valueType: PromotionValueType;
  value: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

type PromotionStatusFilter = "all" | "active" | "expired";
type PromotionScopeFilter = "all-scopes" | "all" | "category" | "product";

const nowLocal = () => new Date().toISOString().slice(0, 16);
const afterOneWeekLocal = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);

const emptyForm = (): FormState => ({
  name: "",
  description: "",
  scope: "all",
  categoryId: "",
  productId: "",
  valueType: "percent",
  value: "0",
  startsAt: nowLocal(),
  endsAt: afterOneWeekLocal(),
  isActive: true,
});

function toForm(item: Promotion): FormState {
  return {
    name: item.name,
    description: item.description ?? "",
    scope: item.scope,
    categoryId: item.category_id ?? "",
    productId: item.product_id ?? "",
    valueType: item.value_type,
    value: String(item.value ?? 0),
    startsAt: new Date(item.starts_at_utc).toISOString().slice(0, 16),
    endsAt: new Date(item.ends_at_utc).toISOString().slice(0, 16),
    isActive: item.is_active,
  };
}

function isPromotionActiveNow(item: Promotion, now: Date): boolean {
  if (!item.is_active) {
    return false;
  }

  const startsAt = new Date(item.starts_at_utc);
  const endsAt = new Date(item.ends_at_utc);
  return startsAt.getTime() <= now.getTime() && endsAt.getTime() >= now.getTime();
}

export default function PromotionsTab() {
  const [items, setItems] = useState<Promotion[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [statusFilter, setStatusFilter] = useState<PromotionStatusFilter>("all");
  const [scopeFilter, setScopeFilter] = useState<PromotionScopeFilter>("all-scopes");
  const [pendingDeactivate, setPendingDeactivate] = useState<Promotion | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [promotions, categoryItems, productItems] = await Promise.all([
        fetchPromotions(),
        fetchCategories(true),
        fetchProductCatalogItems(300, true),
      ]);
      setItems(promotions);
      setCategories(categoryItems);
      setProducts(productItems);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load promotions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const categoryNameById = useMemo(
    () => new Map(categories.map((item) => [item.category_id, item.name])),
    [categories],
  );
  const productNameById = useMemo(
    () => new Map(products.map((item) => [item.id, item.name])),
    [products],
  );
  const filteredItems = useMemo(() => {
    const now = new Date();
    return items.filter((item) => {
      if (scopeFilter !== "all-scopes" && item.scope !== scopeFilter) {
        return false;
      }

      if (statusFilter === "all") {
        return true;
      }

      if (statusFilter === "active") {
        return isPromotionActiveNow(item, now);
      }

      return !item.is_active || new Date(item.ends_at_utc).getTime() < now.getTime();
    });
  }, [items, scopeFilter, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (item: Promotion) => {
    setEditing(item);
    setForm(toForm(item));
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Promotion name is required.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        scope: form.scope,
        category_id: form.scope === "category" ? form.categoryId || null : null,
        product_id: form.scope === "product" ? form.productId || null : null,
        value_type: form.valueType,
        value: Number(form.value) || 0,
        starts_at_utc: new Date(form.startsAt).toISOString(),
        ends_at_utc: new Date(form.endsAt).toISOString(),
        is_active: form.isActive,
      } as const;

      if (editing) {
        await updatePromotion(editing.id, payload);
        toast.success("Promotion updated.");
      } else {
        await createPromotion(payload);
        toast.success("Promotion created.");
      }

      setOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save promotion.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (item: Promotion) => {
    setDeactivating(true);
    try {
      await deactivatePromotion(item.id);
      toast.success("Promotion deactivated.");
      setPendingDeactivate(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to deactivate promotion.");
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Promotions</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add Promotion
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as PromotionStatusFilter)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Scope</Label>
              <Select
                value={scopeFilter}
                onValueChange={(value) => setScopeFilter(value as PromotionScopeFilter)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-scopes">All</SelectItem>
                  <SelectItem value="all">All Products</SelectItem>
                  <SelectItem value="category">Category</SelectItem>
                  <SelectItem value="product">Product</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="p-3">Name</th>
                  <th className="p-3">Scope</th>
                  <th className="p-3">Value</th>
                  <th className="p-3">Window (UTC)</th>
                  <th className="p-3">Active</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="p-4 text-muted-foreground" colSpan={6}>Loading promotions...</td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td className="p-4 text-muted-foreground" colSpan={6}>No promotions found for selected filters.</td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="p-3">
                        <div className="font-medium">{item.name}</div>
                        {item.description ? <div className="text-xs text-muted-foreground">{item.description}</div> : null}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {item.scope === "all"
                          ? "All"
                          : item.scope === "category"
                            ? `Category: ${categoryNameById.get(item.category_id || "") ?? "Unknown"}`
                            : `Product: ${productNameById.get(item.product_id || "") ?? "Unknown"}`}
                      </td>
                      <td className="p-3">{item.value_type === "percent" ? `${item.value}%` : `Rs. ${item.value.toLocaleString()}`}</td>
                      <td className="p-3 text-xs text-muted-foreground">
                        <div>{new Date(item.starts_at_utc).toISOString()}</div>
                        <div>{new Date(item.ends_at_utc).toISOString()}</div>
                      </td>
                      <td className="p-3">{item.is_active ? "Yes" : "No"}</td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(item)}
                            aria-label={`Edit promotion ${item.name}`}
                          >
                            <PencilLine className="h-4 w-4" />
                          </Button>
                          {item.is_active ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPendingDeactivate(item)}
                              aria-label={`Deactivate promotion ${item.name}`}
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit promotion" : "Create promotion"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
            </div>

            <div className="grid gap-1.5">
              <Label>Description</Label>
              <Input value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Scope</Label>
                <Select value={form.scope} onValueChange={(value) => setForm((prev) => ({ ...prev, scope: value as PromotionScope }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="category">Category</SelectItem>
                    <SelectItem value="product">Product</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Value type</Label>
                <Select value={form.valueType} onValueChange={(value) => setForm((prev) => ({ ...prev, valueType: value as PromotionValueType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percent</SelectItem>
                    <SelectItem value="fixed">Fixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.scope === "category" && (
              <div className="grid gap-1.5">
                <Label>Category</Label>
                <Select value={form.categoryId || "__none__"} onValueChange={(value) => setForm((prev) => ({ ...prev, categoryId: value === "__none__" ? "" : value }))}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select category</SelectItem>
                    {categories.map((item) => (
                      <SelectItem key={item.category_id} value={item.category_id}>{item.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.scope === "product" && (
              <div className="grid gap-1.5">
                <Label>Product</Label>
                <Select value={form.productId || "__none__"} onValueChange={(value) => setForm((prev) => ({ ...prev, productId: value === "__none__" ? "" : value }))}>
                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select product</SelectItem>
                    {products.map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Value</Label>
                <Input type="number" min={0} step="0.01" value={form.value} onChange={(event) => setForm((prev) => ({ ...prev, value: event.target.value }))} />
              </div>
              <div className="flex items-end gap-2 rounded-md border px-3 py-2">
                <Switch checked={form.isActive} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))} />
                <span className="text-sm">Active</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Starts at (UTC)</Label>
                <Input type="datetime-local" value={form.startsAt} onChange={(event) => setForm((prev) => ({ ...prev, startsAt: event.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Ends at (UTC)</Label>
                <Input type="datetime-local" value={form.endsAt} onChange={(event) => setForm((prev) => ({ ...prev, endsAt: event.target.value }))} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={pendingDeactivate !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPendingDeactivate(null);
          }
        }}
        onCancel={() => setPendingDeactivate(null)}
        onConfirm={() => {
          if (pendingDeactivate) {
            void handleDeactivate(pendingDeactivate);
          }
        }}
        title="Deactivate promotion?"
        description={
          pendingDeactivate
            ? `Deactivate "${pendingDeactivate.name}" now? This takes effect immediately in checkout pricing.`
            : undefined
        }
        confirmLabel="Deactivate"
        confirmVariant="destructive"
        confirmDisabled={deactivating}
        cancelDisabled={deactivating}
        confirmContent={deactivating ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
      />
    </>
  );
}
