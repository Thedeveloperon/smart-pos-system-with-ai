"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createAdminCloudProduct,
  deactivateAdminCloudProduct,
  fetchAdminCloudProducts,
  updateAdminCloudProduct,
  type CloudProductRow,
  type CloudProductUpsertRequest,
} from "@/lib/adminApi";
import { SectionCard, StatusChip } from "@/components/portal/layout-primitives";
import CloudProductUpsertDialog from "./CloudProductUpsertDialog";

function toSentence(value?: string | null) {
  return (value || "").replaceAll("_", " ").trim() || "-";
}

function formatAmount(value: number, currency: string) {
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

const CloudProductCatalogPanel = () => {
  const [items, setItems] = useState<CloudProductRow[]>([]);
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<CloudProductRow | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetchAdminCloudProducts({
        search,
        includeInactive,
        take: 250,
      });
      setItems(Array.isArray(response.items) ? response.items : []);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to load product catalog.");
    } finally {
      setIsLoading(false);
    }
  }, [includeInactive, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = useMemo(() => items.filter((item) => item.active).length, [items]);

  const openCreateDialog = useCallback(() => {
    setSelectedProduct(null);
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((item: CloudProductRow) => {
    setSelectedProduct(item);
    setDialogOpen(true);
  }, []);

  const handleSubmit = useCallback(
    async (payload: CloudProductUpsertRequest, editingCode: string | null) => {
      setIsSaving(true);
      try {
        if (editingCode) {
          await updateAdminCloudProduct(editingCode, payload);
          toast.success("Product updated.");
        } else {
          await createAdminCloudProduct(payload);
          toast.success("Product created.");
        }

        setDialogOpen(false);
        setSelectedProduct(null);
        await load();
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to save product.");
      } finally {
        setIsSaving(false);
      }
    },
    [load],
  );

  const handleDeactivate = useCallback(
    async (productCode: string) => {
      setIsSaving(true);
      try {
        await deactivateAdminCloudProduct(productCode);
        toast.success("Product deactivated.");
        await load();
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to deactivate product.");
      } finally {
        setIsSaving(false);
      }
    },
    [load],
  );

  return (
    <SectionCard className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="portal-kicker">Catalog Management</p>
          <h2 className="text-base font-semibold">Product Catalog</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="info">Active {activeCount}</StatusChip>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={isLoading}>
            {isLoading ? "Refreshing..." : "Refresh"}
          </Button>
          <Button type="button" size="sm" onClick={openCreateDialog} disabled={isSaving}>
            + Add Product
          </Button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-[2fr,auto]">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by code/name/type"
        />
        <label className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => setIncludeInactive(event.target.checked)}
          />
          Include inactive
        </label>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No products found.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.product_code} className="rounded-xl border border-border/70 bg-surface-muted p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{item.product_name}</p>
                <span className="text-xs text-muted-foreground">{item.product_code}</span>
                <StatusChip tone={item.active ? "success" : "warning"}>{item.active ? "active" : "inactive"}</StatusChip>
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatAmount(item.price, item.currency)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {toSentence(item.product_type)} | {toSentence(item.billing_mode)} | default{" "}
                {item.default_quantity_or_credits}
              </p>
              {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => openEditDialog(item)} disabled={isSaving}>
                  Edit
                </Button>
                {item.active && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleDeactivate(item.product_code)}
                    disabled={isSaving}
                  >
                    Deactivate
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <CloudProductUpsertDialog
        open={dialogOpen}
        product={selectedProduct}
        isSaving={isSaving}
        onOpenChange={(nextOpen) => {
          setDialogOpen(nextOpen);
          if (!nextOpen) {
            setSelectedProduct(null);
          }
        }}
        onSubmit={handleSubmit}
      />
    </SectionCard>
  );
};

export default CloudProductCatalogPanel;
