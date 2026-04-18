"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PencilLine, Plus, PowerOff, RefreshCw, Search, Sparkles } from "lucide-react";
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

function toKey(value?: string | null) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
}

function toTitleCase(value?: string | null) {
  return toSentence(value)
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatPrice(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${currency}`;
  }
}

function resolveProductTypeLabel(productType: string) {
  const key = toKey(productType);
  if (key === "ai_credit") return "AI Credit";
  if (key === "pos_subscription") return "POS Subscription";
  return toTitleCase(productType);
}

function resolveBillingModeLabel(billingMode: string) {
  const key = toKey(billingMode);
  if (key === "one_time" || key === "one_off") return "One-time";
  if (key === "monthly") return "Monthly";
  if (key === "annual" || key === "yearly") return "Yearly";
  return toTitleCase(billingMode);
}

function resolveBillingModeCaption(billingMode: string) {
  const label = resolveBillingModeLabel(billingMode);
  return label === "-" ? "-" : label.toLowerCase();
}

function resolveDefaultQuantityLabel(item: CloudProductRow) {
  const isAiCredit = toKey(item.product_type) === "ai_credit";
  const quantity = Number(item.default_quantity_or_credits) || 0;
  const unit = isAiCredit ? "credits" : "units";
  return `Default: ${quantity.toLocaleString()} ${unit}`;
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
    <SectionCard className="mx-auto w-full max-w-5xl space-y-4 border-0 bg-transparent px-0 py-0 shadow-none md:px-0 md:py-0">
      <section className="space-y-4 rounded-2xl border border-[#d9e1ea] bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="portal-kicker text-[#61728d]">Catalog Management</p>
            <h2 className="text-xl font-semibold tracking-tight text-slate-950 md:text-2xl">Product Catalog</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone="success" className="border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
              Active {activeCount}
            </StatusChip>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 rounded-lg border-[#d0d9e8] bg-white px-4 text-slate-900 hover:bg-slate-50"
              onClick={() => void load()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              {isLoading ? "Refreshing..." : "Refresh"}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-10 rounded-lg bg-emerald-500 px-4 text-white hover:bg-emerald-600"
              onClick={openCreateDialog}
              disabled={isSaving}
            >
              <Plus className="h-4 w-4" />
              Add Product
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, SKU, or type..."
              className="h-10 rounded-lg border-[#d0d9e8] bg-white pl-10 text-sm text-slate-900 placeholder:text-slate-500"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 md:justify-self-end">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(event) => setIncludeInactive(event.target.checked)}
              className="h-4 w-4 rounded border-[#becbde] accent-slate-900"
            />
            Include inactive
          </label>
        </div>
      </section>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#cfd9e7] bg-white px-4 py-8 text-center text-sm text-muted-foreground">
          No products found.
        </p>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <article
              key={item.product_code}
              className={`overflow-hidden rounded-2xl border border-[#d6dfea] bg-white shadow-sm ${
                item.active ? "border-l-[5px] border-l-emerald-500" : "border-l-[5px] border-l-slate-300"
              }`}
            >
              <div className="flex flex-col gap-4 px-4 py-4 md:flex-row md:items-start md:justify-between md:gap-5 md:px-5">
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      item.active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <p className="text-lg font-semibold tracking-tight text-slate-950 md:text-xl">{item.product_name}</p>
                      <StatusChip
                        tone={item.active ? "success" : "warning"}
                        className={
                          item.active
                            ? "border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] uppercase tracking-[0.07em] text-emerald-700"
                            : "border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] uppercase tracking-[0.07em] text-amber-700"
                        }
                      >
                        {item.active ? "active" : "inactive"}
                      </StatusChip>
                    </div>
                    <p className="text-sm text-slate-500">{item.product_code}</p>

                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center rounded-full border border-[#dbe4ef] bg-[#f4f8fc] px-3 py-1 text-xs font-medium text-slate-700">
                        {resolveProductTypeLabel(item.product_type)}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-[#dbe4ef] bg-white px-3 py-1 text-xs font-medium text-slate-700">
                        {resolveBillingModeLabel(item.billing_mode)}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-[#dbe4ef] bg-white px-3 py-1 text-xs font-medium text-slate-700">
                        {resolveDefaultQuantityLabel(item)}
                      </span>
                    </div>

                    {item.description && (
                      <p className="max-w-3xl text-sm text-slate-600">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="shrink-0 text-left md:min-w-[140px] md:text-right">
                  <p className="text-2xl font-semibold leading-none tracking-tight text-slate-950 md:text-4xl">
                    {formatPrice(item.price, item.currency)}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">{resolveBillingModeCaption(item.billing_mode)}</p>
                </div>
              </div>

              <div className="border-t border-[#d6dfea] px-4 py-4 md:px-5">
                <div className="flex flex-wrap justify-end gap-2.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-10 rounded-lg border-[#d0d9e8] bg-white px-4 text-slate-900 hover:bg-slate-50"
                    onClick={() => openEditDialog(item)}
                    disabled={isSaving}
                  >
                    <PencilLine className="h-4 w-4" />
                    Edit
                  </Button>
                  {item.active && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-10 rounded-lg px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => void handleDeactivate(item.product_code)}
                      disabled={isSaving}
                    >
                      <PowerOff className="h-4 w-4" />
                      Deactivate
                    </Button>
                  )}
                </div>
              </div>
            </article>
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
