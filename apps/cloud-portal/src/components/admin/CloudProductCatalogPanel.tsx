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

type CatalogDraft = {
  product_code: string;
  product_name: string;
  product_type: string;
  description: string;
  price: string;
  currency: string;
  billing_mode: string;
  validity: string;
  default_quantity_or_credits: string;
};

const defaultDraft: CatalogDraft = {
  product_code: "",
  product_name: "",
  product_type: "ai_credit",
  description: "",
  price: "",
  currency: "USD",
  billing_mode: "one_time",
  validity: "",
  default_quantity_or_credits: "1",
};

function toSentence(value?: string | null) {
  return (value || "").replaceAll("_", " ").trim() || "-";
}

function formatAmount(value: number, currency: string) {
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function toRequestPayload(draft: CatalogDraft): CloudProductUpsertRequest {
  const price = Number(draft.price);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error("Price must be a valid number.");
  }

  const quantity = Number(draft.default_quantity_or_credits);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Default quantity/credits must be greater than zero.");
  }

  const productCode = draft.product_code.trim();
  if (!productCode) {
    throw new Error("Product code is required.");
  }

  const productName = draft.product_name.trim();
  if (!productName) {
    throw new Error("Product name is required.");
  }

  const productType = draft.product_type.trim().toLowerCase();
  if (productType !== "ai_credit" && productType !== "pos_subscription") {
    throw new Error("Product type must be ai_credit or pos_subscription.");
  }

  const billingMode = draft.billing_mode.trim().toLowerCase();
  if (!billingMode) {
    throw new Error("Billing mode is required.");
  }

  const currency = draft.currency.trim().toUpperCase();
  if (!currency) {
    throw new Error("Currency is required.");
  }

  const payload: CloudProductUpsertRequest = {
    product_code: productCode,
    product_name: productName,
    product_type: productType,
    description: draft.description.trim() || undefined,
    price,
    currency,
    billing_mode: billingMode,
    validity: draft.validity.trim() || undefined,
    default_quantity_or_credits: Math.trunc(quantity),
  };

  return payload;
}

const CloudProductCatalogPanel = () => {
  const [items, setItems] = useState<CloudProductRow[]>([]);
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [draft, setDraft] = useState<CatalogDraft>(defaultDraft);

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

  const resetDraft = useCallback(() => {
    setDraft(defaultDraft);
    setEditingCode(null);
  }, []);

  const startEdit = useCallback((item: CloudProductRow) => {
    setEditingCode(item.product_code);
    setDraft({
      product_code: item.product_code,
      product_name: item.product_name,
      product_type: item.product_type,
      description: item.description || "",
      price: String(item.price),
      currency: item.currency,
      billing_mode: item.billing_mode,
      validity: item.validity || "",
      default_quantity_or_credits: String(item.default_quantity_or_credits),
    });
  }, []);

  const handleSave = useCallback(async () => {
    let payload: CloudProductUpsertRequest;
    try {
      payload = toRequestPayload(draft);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Product data is invalid.");
      return;
    }

    setIsSaving(true);
    try {
      if (editingCode) {
        await updateAdminCloudProduct(editingCode, payload);
        toast.success("Product updated.");
      } else {
        await createAdminCloudProduct(payload);
        toast.success("Product created.");
      }
      resetDraft();
      await load();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to save product.");
    } finally {
      setIsSaving(false);
    }
  }, [draft, editingCode, load, resetDraft]);

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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void load();
            }}
            disabled={isLoading}
          >
            {isLoading ? "Refreshing..." : "Refresh"}
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

      <div className="grid gap-2 md:grid-cols-3">
        <Input
          value={draft.product_code}
          onChange={(event) => setDraft((current) => ({ ...current, product_code: event.target.value }))}
          placeholder="Product code"
          disabled={Boolean(editingCode)}
        />
        <Input
          value={draft.product_name}
          onChange={(event) => setDraft((current) => ({ ...current, product_name: event.target.value }))}
          placeholder="Product name"
        />
        <select
          className="field-shell h-10 text-sm"
          value={draft.product_type}
          onChange={(event) => setDraft((current) => ({ ...current, product_type: event.target.value }))}
        >
          <option value="ai_credit">AI Credit</option>
          <option value="pos_subscription">POS Subscription</option>
        </select>
        <Input
          value={draft.price}
          onChange={(event) => setDraft((current) => ({ ...current, price: event.target.value }))}
          placeholder="Price"
        />
        <Input
          value={draft.currency}
          onChange={(event) => setDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
          placeholder="Currency"
        />
        <Input
          value={draft.default_quantity_or_credits}
          onChange={(event) =>
            setDraft((current) => ({ ...current, default_quantity_or_credits: event.target.value }))
          }
          placeholder="Default quantity/credits"
        />
        <Input
          value={draft.billing_mode}
          onChange={(event) => setDraft((current) => ({ ...current, billing_mode: event.target.value }))}
          placeholder="Billing mode"
        />
        <Input
          value={draft.validity}
          onChange={(event) => setDraft((current) => ({ ...current, validity: event.target.value }))}
          placeholder="Validity (e.g. 30d, monthly)"
        />
        <Input
          value={draft.description}
          onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
          placeholder="Description"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? "Saving..." : editingCode ? "Update Product" : "Create Product"}
        </Button>
        {editingCode && (
          <Button type="button" variant="outline" onClick={resetDraft} disabled={isSaving}>
            Cancel Edit
          </Button>
        )}
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
                <StatusChip tone={item.active ? "success" : "warning"}>
                  {item.active ? "active" : "inactive"}
                </StatusChip>
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
                <Button type="button" size="sm" variant="outline" onClick={() => startEdit(item)} disabled={isSaving}>
                  Edit
                </Button>
                {item.active && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void handleDeactivate(item.product_code);
                    }}
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
    </SectionCard>
  );
};

export default CloudProductCatalogPanel;
