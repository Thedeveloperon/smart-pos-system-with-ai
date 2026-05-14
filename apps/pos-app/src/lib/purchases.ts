import { API_BASE_URL, ApiError, requestJson } from "@/lib/api";

export type Product = {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  is_serial_tracked?: boolean;
  warranty_months?: number;
  is_batch_tracked?: boolean;
  expiry_alert_days?: number;
  allow_negative_stock?: boolean;
};

export type Supplier = {
  id: string;
  name: string;
  contact_email?: string;
};

export type PurchaseOrderStatus = "Draft" | "Sent" | "PartiallyReceived" | "Received" | "Cancelled";

export type PurchaseOrderLine = {
  id: string;
  product_id: string;
  product_name: string;
  quantity_ordered: number;
  quantity_received: number;
  quantity_pending: number;
  unit_cost_estimate: number;
};

export type PurchaseBillSummary = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  source_type: "manual" | "ocr_import" | "po_receipt";
  grand_total: number;
  supplier_id?: string;
  supplier_name?: string;
  purchase_order_id?: string | null;
  purchase_order_number?: string | null;
  created_at: string;
};

export type PurchaseOrder = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  po_number: string;
  po_date: string;
  expected_delivery_date: string | null;
  status: PurchaseOrderStatus;
  currency: string;
  subtotal_estimate: number;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  lines: PurchaseOrderLine[];
  bills: PurchaseBillSummary[];
};

export type PurchaseBillItem = {
  id: string;
  product_id: string;
  product_name: string;
  supplier_item_name: string | null;
  quantity: number;
  unit_cost: number;
  line_total: number;
};

export type PurchaseBillDetail = {
  id: string;
  purchase_order_id: string | null;
  purchase_order_number: string | null;
  supplier_id: string;
  supplier_name: string;
  invoice_number: string;
  invoice_date: string;
  currency: string;
  subtotal: number;
  tax_total: number;
  grand_total: number;
  source_type: string;
  notes: string | null;
  created_at: string;
  items: PurchaseBillItem[];
};

export type OcrDraftLine = {
  line_number: number;
  raw_name: string;
  matched_product_id: string;
  matched_product_name: string;
  quantity: number;
  unit_cost: number;
  match_status: "matched" | "needs_review" | "unmatched";
  confidence: number | null;
};

export type PurchaseOcrDraftResponse = {
  draft_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  invoice_number: string;
  invoice_date: string;
  tax_total: number;
  grand_total: number;
  lines: OcrDraftLine[];
};

function buildQuery(params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "" && value !== "all") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function fetchPurchaseOrders(
  params: {
    status?: string;
    supplier_id?: string;
    from_date?: string;
    to_date?: string;
  } = {},
): Promise<PurchaseOrder[]> {
  return requestJson<PurchaseOrder[]>(
    `/api/purchase-orders${buildQuery(params as Record<string, string | undefined>)}`,
  );
}

export async function createPurchaseOrder(body: {
  supplier_id: string;
  po_number: string;
  po_date?: string;
  expected_delivery_date?: string;
  notes?: string;
  lines: { product_id: string; quantity_ordered: number; unit_cost_estimate: number }[];
}): Promise<PurchaseOrder> {
  return requestJson<PurchaseOrder>("/api/purchase-orders", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder> {
  return requestJson<PurchaseOrder>(`/api/purchase-orders/${id}`);
}

export async function updatePurchaseOrder(
  id: string,
  body: {
    supplier_id?: string;
    po_number?: string;
    expected_delivery_date?: string;
    notes?: string;
    lines?: { product_id: string; quantity_ordered: number; unit_cost_estimate: number }[];
  },
): Promise<PurchaseOrder> {
  return requestJson<PurchaseOrder>(`/api/purchase-orders/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function sendPurchaseOrder(id: string): Promise<PurchaseOrder> {
  return requestJson<PurchaseOrder>(`/api/purchase-orders/${id}/send`, {
    method: "POST",
  });
}

export async function cancelPurchaseOrder(id: string): Promise<PurchaseOrder> {
  return requestJson<PurchaseOrder>(`/api/purchase-orders/${id}/cancel`, {
    method: "POST",
  });
}

export async function reversePurchaseOrder(id: string): Promise<PurchaseOrder> {
  return requestJson<PurchaseOrder>(`/api/purchase-orders/${id}/reverse`, {
    method: "POST",
  });
}

export async function receivePurchaseOrder(
  id: string,
  body: {
    invoice_number: string;
    invoice_date: string;
    notes?: string;
    update_cost_price: boolean;
    lines: {
      product_id: string;
      quantity_received: number;
      unit_cost: number;
      batch_number?: string;
      expiry_date?: string;
      manufacture_date?: string;
      serials?: string[];
    }[];
  },
): Promise<PurchaseOrder> {
  return requestJson<PurchaseOrder>(`/api/purchase-orders/${id}/receive`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchPurchaseBills(
  params: {
    supplier_id?: string;
    po_id?: string;
    from_date?: string;
    to_date?: string;
  } = {},
): Promise<PurchaseBillSummary[]> {
  return requestJson<PurchaseBillSummary[]>(
    `/api/purchases/bills${buildQuery(params as Record<string, string | undefined>)}`,
  );
}

export async function getPurchaseBill(id: string): Promise<PurchaseBillDetail> {
  return requestJson<PurchaseBillDetail>(`/api/purchases/bills/${id}`);
}

export async function createManualBill(body: {
  supplier_id: string;
  invoice_number: string;
  invoice_date: string;
  purchase_order_id?: string;
  update_cost_price: boolean;
  notes?: string;
  items: {
    product_id: string;
    quantity: number;
    unit_cost: number;
    batch_number?: string;
    expiry_date?: string;
    manufacture_date?: string;
  }[];
}): Promise<PurchaseBillDetail> {
  return requestJson<PurchaseBillDetail>("/api/purchases/bills/manual", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function createPurchaseOcrDraft(
  file: File,
  supplierHint?: string,
): Promise<PurchaseOcrDraftResponse> {
  const form = new FormData();
  form.append("file", file);
  if (supplierHint) {
    form.append("supplier_hint", supplierHint);
  }

  const response = await fetch(`${API_BASE_URL}/api/purchases/imports/ocr-draft`, {
    method: "POST",
    body: form,
    credentials: "include",
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = (await response.json()) as { message?: string };
      message = payload.message || message;
    } catch {
      // Ignore non-JSON error payloads.
    }
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as PurchaseOcrDraftResponse;
}

export async function confirmPurchaseImport(body: {
  import_request_id: string;
  draft_id: string;
  supplier_id: string;
  invoice_number: string;
  invoice_date: string;
  tax_total: number;
  grand_total: number;
  approval_reason?: string;
  update_cost_price: boolean;
  items: {
    line_number: number;
    product_id: string;
    quantity: number;
    unit_cost: number;
    line_total: number;
  }[];
}): Promise<PurchaseBillDetail> {
  return requestJson<PurchaseBillDetail>("/api/purchases/imports/confirm", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
