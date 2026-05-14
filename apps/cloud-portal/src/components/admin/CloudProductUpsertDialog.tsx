"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CloudProductRow, CloudProductUpsertRequest } from "@/lib/adminApi";

type CatalogDraft = {
  product_code: string;
  product_name: string;
  product_type: string;
  description: string;
  price: string;
  discount_percentage: string;
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
  discount_percentage: "0",
  currency: "USD",
  billing_mode: "one_time",
  validity: "",
  default_quantity_or_credits: "1",
};

function toRequestPayload(draft: CatalogDraft): CloudProductUpsertRequest {
  const price = Number(draft.price);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error("Price must be a valid number.");
  }

  const discountPercentage = Number(draft.discount_percentage);
  if (!Number.isFinite(discountPercentage) || discountPercentage < 0 || discountPercentage > 100) {
    throw new Error("Discount percentage must be a number between 0 and 100.");
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

  return {
    product_code: productCode,
    product_name: productName,
    product_type: productType,
    description: draft.description.trim() || undefined,
    price,
    discount_percentage: discountPercentage,
    currency,
    billing_mode: billingMode,
    validity: draft.validity.trim() || undefined,
    default_quantity_or_credits: Math.trunc(quantity),
  };
}

type CloudProductUpsertDialogProps = {
  open: boolean;
  product: CloudProductRow | null;
  isSaving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CloudProductUpsertRequest, editingCode: string | null) => Promise<void>;
};

const CloudProductUpsertDialog = ({
  open,
  product,
  isSaving = false,
  onOpenChange,
  onSubmit,
}: CloudProductUpsertDialogProps) => {
  const editingCode = product?.product_code ?? null;
  const [draft, setDraft] = useState<CatalogDraft>(defaultDraft);

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft(
      product
        ? {
            product_code: product.product_code,
            product_name: product.product_name,
            product_type: product.product_type,
            description: product.description || "",
            price: String(product.price),
            discount_percentage: String(product.discount_percentage ?? 0),
            currency: product.currency,
            billing_mode: product.billing_mode,
            validity: product.validity || "",
            default_quantity_or_credits: String(product.default_quantity_or_credits),
          }
        : defaultDraft,
    );
  }, [open, product]);

  const title = useMemo(() => (editingCode ? "Edit Product" : "Add Product"), [editingCode]);
  const description = useMemo(
    () =>
      editingCode
        ? "Update the catalog entry for this product."
        : "Create a new catalog entry for POS subscriptions or AI credit packs.",
    [editingCode],
  );

  const handleSubmit = async () => {
    let payload: CloudProductUpsertRequest;
    try {
      payload = toRequestPayload(draft);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Product data is invalid.");
      return;
    }

    await onSubmit(payload, editingCode);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Product code</label>
            <Input
              value={draft.product_code}
              onChange={(event) => setDraft((current) => ({ ...current, product_code: event.target.value }))}
              placeholder="product_code"
              disabled={Boolean(editingCode)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Product name</label>
            <Input
              value={draft.product_name}
              onChange={(event) => setDraft((current) => ({ ...current, product_name: event.target.value }))}
              placeholder="Product name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Product type</label>
            <select
              className="field-shell h-10 w-full text-sm"
              value={draft.product_type}
              onChange={(event) => setDraft((current) => ({ ...current, product_type: event.target.value }))}
            >
              <option value="ai_credit">AI Credit</option>
              <option value="pos_subscription">POS Subscription</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Currency</label>
            <Input
              value={draft.currency}
              onChange={(event) =>
                setDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))
              }
              placeholder="USD"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Price</label>
            <Input
              value={draft.price}
              onChange={(event) => setDraft((current) => ({ ...current, price: event.target.value }))}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Discount percentage</label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={draft.discount_percentage}
              onChange={(event) =>
                setDraft((current) => ({ ...current, discount_percentage: event.target.value }))
              }
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Default quantity / credits</label>
            <Input
              value={draft.default_quantity_or_credits}
              onChange={(event) =>
                setDraft((current) => ({ ...current, default_quantity_or_credits: event.target.value }))
              }
              placeholder="1"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Billing mode</label>
            <Input
              value={draft.billing_mode}
              onChange={(event) => setDraft((current) => ({ ...current, billing_mode: event.target.value }))}
              placeholder="one_time"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Validity</label>
            <Input
              value={draft.validity}
              onChange={(event) => setDraft((current) => ({ ...current, validity: event.target.value }))}
              placeholder="e.g. 30d, monthly"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">Description</label>
            <textarea
              value={draft.description}
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              placeholder="Description"
              className="field-shell min-h-24 w-full resize-y rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              void handleSubmit();
            }}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : editingCode ? "Update Product" : "Create Product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CloudProductUpsertDialog;
