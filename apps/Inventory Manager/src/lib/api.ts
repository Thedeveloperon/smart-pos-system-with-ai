// ============================================================================
// POS Inventory Management - API layer
// ----------------------------------------------------------------------------
// This module talks to the backend API directly. It does not keep any local
// in-memory mock store or seeded sample data.
// ============================================================================

export type Product = {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  barcode?: string;
  image_url?: string;
  category_id?: string | null;
  brand_id?: string | null;
  allow_negative_stock?: boolean;
  is_serial_tracked?: boolean;
  warranty_months?: number;
  is_batch_tracked?: boolean;
  expiry_alert_days?: number;
  is_active?: boolean;
};

export type StockMovement = {
  id: string;
  product_id: string;
  product_name: string;
  movement_type:
    | "Sale"
    | "Purchase"
    | "Adjustment"
    | "Refund"
    | "ExpiryWriteOff"
    | "StocktakeReconciliation"
    | "Transfer";
  quantity_before: number;
  quantity_change: number;
  quantity_after: number;
  reference_type: string;
  reference_id?: string;
  batch_id?: string;
  serial_number?: string;
  reason?: string;
  created_by_user_id?: string;
  created_at: string;
};

export type StockMovementPage = {
  items: StockMovement[];
  total: number;
  page: number;
  take: number;
};

export type SerialNumberRecord = {
  id: string;
  product_id: string;
  serial_value: string;
  status: "Available" | "Sold" | "Returned" | "Defective" | "UnderWarranty";
  sale_id?: string;
  refund_id?: string;
  warranty_expiry_date?: string;
  created_at: string;
  updated_at?: string;
};

export type SerialLookupResult = {
  serial_value: string;
  product_id: string;
  product_name: string;
  status: string;
  sale_date?: string;
  warranty_expiry_date?: string;
};

export type ProductBatch = {
  id: string;
  product_id: string;
  supplier_id?: string;
  purchase_bill_id?: string;
  batch_number: string;
  manufacture_date?: string;
  expiry_date?: string;
  initial_quantity: number;
  remaining_quantity: number;
  cost_price: number;
  received_at: string;
};

export type ExpiringBatch = {
  batch_id: string;
  product_id: string;
  product_name: string;
  batch_number: string;
  expiry_date: string;
  remaining_quantity: number;
  days_until_expiry: number;
};

export type StocktakeSession = {
  id: string;
  store_id: string;
  status: "Draft" | "InProgress" | "Completed";
  started_at: string;
  completed_at?: string;
  created_by_user_id?: string;
  item_count: number;
  variance_count: number;
};

export type StocktakeItem = {
  id: string;
  session_id: string;
  product_id: string;
  product_name: string;
  system_quantity: number;
  counted_quantity?: number;
  variance_quantity?: number;
  notes?: string;
};

export type WarrantyClaim = {
  id: string;
  serial_number_id: string;
  serial_value: string;
  product_name: string;
  claim_date: string;
  status: "Open" | "InRepair" | "Resolved" | "Rejected";
  resolution_notes?: string;
  created_at: string;
};

export type InventoryDashboard = {
  low_stock_count: number;
  expiry_alert_count: number;
  open_stocktake_sessions: number;
  open_warranty_claims: number;
  expiry_alerts: ExpiringBatch[];
};

type BackendProductCatalogItem = {
  product_id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  image_url?: string | null;
  category_id?: string | null;
  brand_id?: string | null;
  unit_price: number;
  stock_quantity: number;
  allow_negative_stock?: boolean;
  is_serial_tracked?: boolean;
  warranty_months?: number;
  is_batch_tracked?: boolean;
  expiry_alert_days?: number;
  is_active?: boolean;
};

type BackendStockMovementPage = {
  items: Array<{
    id: string;
    product_id: string;
    product_name: string;
    movement_type: StockMovement["movement_type"];
    quantity_before: number;
    quantity_change: number;
    quantity_after: number;
    reference_type: string;
    reference_id?: string | null;
    batch_id?: string | null;
    serial_number?: string | null;
    reason?: string | null;
    created_by_user_id?: string | null;
    created_at: string;
  }>;
  total: number;
  page: number;
  take: number;
};

type BackendSerialLookupResult = {
  serial_value: string;
  product_id: string;
  product_name: string;
  status: string;
  sale_date?: string | null;
  warranty_expiry_date?: string | null;
};

type BackendProductBatch = {
  id: string;
  product_id: string;
  supplier_id?: string | null;
  purchase_bill_id?: string | null;
  batch_number: string;
  manufacture_date?: string | null;
  expiry_date?: string | null;
  initial_quantity: number;
  remaining_quantity: number;
  cost_price: number;
  received_at: string;
};

type BackendStocktakeSession = {
  id: string;
  store_id: string;
  status: StocktakeSession["status"];
  started_at: string;
  completed_at?: string | null;
  created_by_user_id?: string | null;
  item_count: number;
  variance_count: number;
};

type BackendStocktakeItem = {
  id: string;
  session_id: string;
  product_id: string;
  product_name: string;
  system_quantity: number;
  counted_quantity?: number | null;
  variance_quantity?: number | null;
  notes?: string | null;
};

type BackendWarrantyClaim = {
  id: string;
  serial_number_id: string;
  serial_value: string;
  product_name: string;
  claim_date: string;
  status: WarrantyClaim["status"];
  resolution_notes?: string | null;
  created_at: string;
};

type BackendInventoryDashboard = {
  low_stock_count: number;
  expiry_alert_count: number;
  open_stocktake_sessions: number;
  open_warranty_claims: number;
  expiry_alerts: Array<{
    batch_id: string;
    product_id: string;
    product_name: string;
    batch_number: string;
    expiry_date: string;
    remaining_quantity: number;
    days_until_expiry: number;
  }>;
};

function getDefaultApiBaseUrl() {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (import.meta.env.DEV && (host === "127.0.0.1" || host === "localhost")) {
      return `http://${host}:5102`;
    }

    return window.location.origin;
  }

  return "http://localhost:5102";
}

const DEFAULT_API_BASE_URL = getDefaultApiBaseUrl();
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(
  /\/$/,
  "",
);

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
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

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function safeRequestJson<T>(path: string, fallback: T, init?: RequestInit): Promise<T> {
  try {
    return await requestJson<T>(path, init);
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 404 || error.status === 405 || error.status === 501)
    ) {
      return fallback;
    }

    throw error;
  }
}

function buildQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      return;
    }

    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function mapProduct(item: BackendProductCatalogItem): Product {
  return {
    id: item.product_id,
    name: item.name,
    sku: item.sku ?? "",
    barcode: item.barcode ?? undefined,
    image_url: item.image_url ?? undefined,
    category_id: item.category_id ?? undefined,
    brand_id: item.brand_id ?? undefined,
    price: item.unit_price,
    stock: item.stock_quantity,
    allow_negative_stock: item.allow_negative_stock,
    is_serial_tracked: item.is_serial_tracked,
    warranty_months: item.warranty_months,
    is_batch_tracked: item.is_batch_tracked,
    expiry_alert_days: item.expiry_alert_days,
    is_active: item.is_active,
  };
}

function mapMovement(item: BackendStockMovementPage["items"][number]): StockMovement {
  return {
    id: item.id,
    product_id: item.product_id,
    product_name: item.product_name,
    movement_type: item.movement_type,
    quantity_before: item.quantity_before,
    quantity_change: item.quantity_change,
    quantity_after: item.quantity_after,
    reference_type: item.reference_type,
    reference_id: item.reference_id ?? undefined,
    batch_id: item.batch_id ?? undefined,
    serial_number: item.serial_number ?? undefined,
    reason: item.reason ?? undefined,
    created_by_user_id: item.created_by_user_id ?? undefined,
    created_at: item.created_at,
  };
}

function mapBatch(item: BackendProductBatch): ProductBatch {
  return {
    id: item.id,
    product_id: item.product_id,
    supplier_id: item.supplier_id ?? undefined,
    purchase_bill_id: item.purchase_bill_id ?? undefined,
    batch_number: item.batch_number,
    manufacture_date: item.manufacture_date ?? undefined,
    expiry_date: item.expiry_date ?? undefined,
    initial_quantity: item.initial_quantity,
    remaining_quantity: item.remaining_quantity,
    cost_price: item.cost_price,
    received_at: item.received_at,
  };
}

function mapStocktakeSession(item: BackendStocktakeSession): StocktakeSession {
  return {
    id: item.id,
    store_id: item.store_id,
    status: item.status,
    started_at: item.started_at,
    completed_at: item.completed_at ?? undefined,
    created_by_user_id: item.created_by_user_id ?? undefined,
    item_count: item.item_count,
    variance_count: item.variance_count,
  };
}

function mapStocktakeItem(item: BackendStocktakeItem): StocktakeItem {
  return {
    id: item.id,
    session_id: item.session_id,
    product_id: item.product_id,
    product_name: item.product_name,
    system_quantity: item.system_quantity,
    counted_quantity: item.counted_quantity ?? undefined,
    variance_quantity: item.variance_quantity ?? undefined,
    notes: item.notes ?? undefined,
  };
}

function mapWarrantyClaim(item: BackendWarrantyClaim): WarrantyClaim {
  return {
    id: item.id,
    serial_number_id: item.serial_number_id,
    serial_value: item.serial_value,
    product_name: item.product_name,
    claim_date: item.claim_date,
    status: item.status,
    resolution_notes: item.resolution_notes ?? undefined,
    created_at: item.created_at,
  };
}

function mapDashboard(item: BackendInventoryDashboard): InventoryDashboard {
  return {
    low_stock_count: item.low_stock_count,
    expiry_alert_count: item.expiry_alert_count,
    open_stocktake_sessions: item.open_stocktake_sessions,
    open_warranty_claims: item.open_warranty_claims,
    expiry_alerts: item.expiry_alerts,
  };
}

// ---------- Products ----------

export async function fetchProducts(): Promise<Product[]> {
  const response = await safeRequestJson<{ items: BackendProductCatalogItem[] }>(
    "/api/products/catalog?include_inactive=true&take=200",
    { items: [] },
  );
  return response.items.map(mapProduct);
}

export async function updateProduct(id: string, data: Partial<Product>): Promise<Product> {
  const payload = {
    name: data.name ?? "",
    sku: data.sku || null,
    barcode: data.barcode || null,
    image_url: data.image_url || null,
    unit_price: data.price ?? 0,
    cost_price: data.price ?? 0,
    initial_stock_quantity: data.stock ?? 0,
    reorder_level: 0,
    safety_stock: 0,
    target_stock_level: 0,
    allow_negative_stock: data.allow_negative_stock ?? false,
    is_serial_tracked: data.is_serial_tracked ?? false,
    warranty_months: data.is_serial_tracked ? (data.warranty_months ?? 0) : 0,
    is_batch_tracked: data.is_batch_tracked ?? false,
    expiry_alert_days: data.is_batch_tracked ? (data.expiry_alert_days ?? 30) : 30,
    is_active: data.is_active ?? true,
  };

  const response = await requestJson<BackendProductCatalogItem>(`/api/products/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  return mapProduct(response);
}

export async function createProduct(data: Omit<Product, "id">): Promise<Product> {
  const response = await requestJson<BackendProductCatalogItem>("/api/products", {
    method: "POST",
    body: JSON.stringify({
      name: data.name,
      sku: data.sku || null,
      barcode: data.barcode || null,
      image_url: data.image_url || null,
      unit_price: data.price,
      cost_price: data.price,
      initial_stock_quantity: data.stock,
      reorder_level: 0,
      safety_stock: 0,
      target_stock_level: 0,
      allow_negative_stock: data.allow_negative_stock ?? false,
      is_serial_tracked: data.is_serial_tracked ?? false,
      warranty_months: data.is_serial_tracked ? (data.warranty_months ?? 0) : 0,
      is_batch_tracked: data.is_batch_tracked ?? false,
      expiry_alert_days: data.is_batch_tracked ? (data.expiry_alert_days ?? 30) : 30,
      is_active: data.is_active ?? true,
    }),
  });

  return mapProduct(response);
}

// ---------- Dashboard ----------

export async function fetchInventoryDashboard(): Promise<InventoryDashboard> {
  const [products, dashboard, expiringBatches, sessions, claims] = await Promise.allSettled([
    fetchProducts(),
    requestJson<BackendInventoryDashboard>("/api/inventory/dashboard"),
    fetchExpiringBatches(30),
    fetchStocktakeSessions(),
    fetchWarrantyClaims(),
  ]);

  const productItems = products.status === "fulfilled" ? products.value : [];
  const lowStockCount = productItems.filter((p) => (p.stock ?? 0) < 10).length;
  const expiryAlerts =
    dashboard.status === "fulfilled"
      ? mapDashboard(dashboard.value).expiry_alerts
      : expiringBatches.status === "fulfilled"
        ? expiringBatches.value
        : [];

  return {
    low_stock_count: lowStockCount,
    expiry_alert_count: expiryAlerts.length,
    open_stocktake_sessions:
      sessions.status === "fulfilled"
        ? sessions.value.filter((session) => session.status !== "Completed").length
        : 0,
    open_warranty_claims:
      claims.status === "fulfilled"
        ? claims.value.filter((claim) => claim.status === "Open" || claim.status === "InRepair")
            .length
        : 0,
    expiry_alerts,
  };
}

// ---------- Stock Movements ----------

export async function fetchStockMovements(
  params: {
    product_id?: string;
    movement_type?: string;
    from_date?: string;
    to_date?: string;
    page?: number;
    take?: number;
  } = {},
): Promise<StockMovementPage> {
  const query = buildQuery({
    product_id: params.product_id,
    movement_type: params.movement_type,
    from_date: params.from_date,
    to_date: params.to_date,
    page: params.page ?? 1,
    take: params.take ?? 20,
  });
  const response = await safeRequestJson<BackendStockMovementPage>(
    `/api/inventory/movements${query}`,
    {
      items: [],
      total: 0,
      page: params.page ?? 1,
      take: params.take ?? 20,
    },
  );
  return {
    items: response.items.map(mapMovement),
    total: response.total,
    page: response.page,
    take: response.take,
  };
}

// ---------- Serial Numbers ----------

export async function fetchSerialNumbers(productId: string): Promise<SerialNumberRecord[]> {
  const response = await safeRequestJson<{ items: SerialNumberRecord[] }>(
    `/api/products/${productId}/serials`,
    { items: [] },
  );
  return response.items;
}

export async function addSerialNumbers(
  productId: string,
  serialValues: string[],
): Promise<SerialNumberRecord[]> {
  const response = await requestJson<{ items: SerialNumberRecord[] }>(
    `/api/products/${productId}/serials`,
    {
      method: "POST",
      body: JSON.stringify(serialValues),
    },
  );
  return response.items;
}

export async function updateSerialNumber(
  productId: string,
  serialId: string,
  data: { status: SerialNumberRecord["status"] },
): Promise<SerialNumberRecord> {
  return await requestJson<SerialNumberRecord>(`/api/products/${productId}/serials/${serialId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function lookupSerial(serialValue: string): Promise<SerialLookupResult> {
  const response = await requestJson<BackendSerialLookupResult>(
    `/api/serials/lookup${buildQuery({ serial: serialValue })}`,
  );
  return {
    serial_value: response.serial_value,
    product_id: response.product_id,
    product_name: response.product_name,
    status: response.status,
    sale_date: response.sale_date ?? undefined,
    warranty_expiry_date: response.warranty_expiry_date ?? undefined,
  };
}

// ---------- Batches ----------

export async function fetchProductBatches(productId: string): Promise<ProductBatch[]> {
  const response = await safeRequestJson<{ items: BackendProductBatch[] }>(
    `/api/products/${productId}/batches`,
    { items: [] },
  );
  return response.items.map(mapBatch);
}

export async function createProductBatch(
  productId: string,
  data: Partial<ProductBatch>,
): Promise<ProductBatch> {
  const response = await requestJson<BackendProductBatch>(`/api/products/${productId}/batches`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return mapBatch(response);
}

export async function updateProductBatch(
  productId: string,
  batchId: string,
  data: Partial<ProductBatch>,
): Promise<ProductBatch> {
  const response = await requestJson<BackendProductBatch>(
    `/api/products/${productId}/batches/${batchId}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
  );
  return mapBatch(response);
}

export async function fetchExpiringBatches(days = 30): Promise<ExpiringBatch[]> {
  const response = await safeRequestJson<{ items: ExpiringBatch[] }>(
    `/api/batches/expiring${buildQuery({ days })}`,
    { items: [] },
  );
  return response.items;
}

// ---------- Stocktake ----------

export async function fetchStocktakeSessions(
  params: {
    status?: string;
    page?: number;
    take?: number;
  } = {},
): Promise<StocktakeSession[]> {
  const response = await safeRequestJson<{ items: BackendStocktakeSession[] }>(
    `/api/stocktake/sessions${buildQuery({ status: params.status, page: params.page, take: params.take })}`,
    { items: [] },
  );
  return response.items.map(mapStocktakeSession);
}

export async function createStocktakeSession(): Promise<StocktakeSession> {
  const response = await requestJson<BackendStocktakeSession>("/api/stocktake/sessions", {
    method: "POST",
  });
  return mapStocktakeSession(response);
}

export async function getStocktakeSession(
  sessionId: string,
): Promise<{ session: StocktakeSession; items: StocktakeItem[] }> {
  const response = await requestJson<{
    session: BackendStocktakeSession;
    items: BackendStocktakeItem[];
  }>(`/api/stocktake/sessions/${sessionId}`);
  return {
    session: mapStocktakeSession(response.session),
    items: response.items.map(mapStocktakeItem),
  };
}

export async function startStocktakeSession(sessionId: string): Promise<StocktakeSession> {
  const response = await requestJson<BackendStocktakeSession>(
    `/api/stocktake/sessions/${sessionId}/start`,
    {
      method: "PUT",
    },
  );
  return mapStocktakeSession(response);
}

export async function updateStocktakeItem(
  sessionId: string,
  itemId: string,
  countedQty: number,
): Promise<StocktakeItem> {
  const response = await requestJson<BackendStocktakeItem>(
    `/api/stocktake/sessions/${sessionId}/items/${itemId}`,
    {
      method: "PUT",
      body: JSON.stringify({ counted_quantity: countedQty }),
    },
  );
  return mapStocktakeItem(response);
}

export async function completeStocktakeSession(sessionId: string): Promise<StocktakeSession> {
  const response = await requestJson<BackendStocktakeSession>(
    `/api/stocktake/sessions/${sessionId}/complete`,
    {
      method: "POST",
    },
  );
  return mapStocktakeSession(response);
}

// ---------- Warranty Claims ----------

export async function fetchWarrantyClaims(
  params: {
    status?: string;
    from_date?: string;
    to_date?: string;
    page?: number;
  } = {},
): Promise<WarrantyClaim[]> {
  const response = await safeRequestJson<{ items: BackendWarrantyClaim[] }>(
    `/api/warranty-claims${buildQuery({
      status: params.status,
      from_date: params.from_date,
      to_date: params.to_date,
      page: params.page,
    })}`,
    { items: [] },
  );
  return response.items.map(mapWarrantyClaim);
}

export async function createWarrantyClaim(data: {
  serial_number_id: string;
  claim_date: string;
  notes?: string;
}): Promise<WarrantyClaim> {
  const response = await requestJson<BackendWarrantyClaim>("/api/warranty-claims", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return mapWarrantyClaim(response);
}

export async function updateWarrantyClaim(
  claimId: string,
  data: { status: WarrantyClaim["status"]; resolution_notes?: string },
): Promise<WarrantyClaim> {
  const response = await requestJson<BackendWarrantyClaim>(`/api/warranty-claims/${claimId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return mapWarrantyClaim(response);
}
