// ============================================================================
// POS Inventory Management - API layer
// ----------------------------------------------------------------------------
// This module talks to the backend API directly. It does not keep any local
// in-memory mock store or seeded sample data.
// ============================================================================

export type Category = {
  category_id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  product_count: number;
  can_delete: boolean;
  delete_block_reason?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type Brand = {
  brand_id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  is_active: boolean;
  product_count: number;
  can_delete: boolean;
  delete_block_reason?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type Service = {
  id: string;
  name: string;
  sku?: string | null;
  price: number;
  description?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  duration_minutes?: number | null;
  is_active: boolean;
};

export type CreateCategoryRequest = {
  name: string;
  description?: string | null;
  is_active?: boolean;
};

export type Supplier = {
  supplier_id: string;
  id: string;
  name: string;
  phone?: string | null;
  company_name?: string | null;
  companyName?: string | null;
  company_phone?: string | null;
  companyPhone?: string | null;
  address?: string | null;
  is_active: boolean;
  isActive: boolean;
  brands: SupplierBrand[];
  linked_product_count: number;
  linkedProductCount: number;
  can_delete: boolean;
  delete_block_reason?: string | null;
  created_at: string;
  createdAt: string;
  updated_at?: string | null;
  updatedAt?: string | null;
};

export type SupplierBrand = {
  brand_id: string;
  name: string;
};

export type ProductSupplier = {
  product_supplier_id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_sku?: string | null;
  supplier_item_name?: string | null;
  is_preferred: boolean;
  lead_time_days?: number | null;
  min_order_qty?: number | null;
  pack_size?: number | null;
  last_purchase_price?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
};

export type GenerateBarcodeResponse = {
  barcode: string;
  format: string;
  generated_at: string;
};

export type ValidateBarcodeResponse = {
  barcode: string;
  normalized_barcode: string;
  is_valid: boolean;
  format: string;
  message?: string | null;
  exists: boolean;
};

export type BulkGenerateMissingProductBarcodesResponse = {
  dry_run: boolean;
  scanned: number;
  generated: number;
  would_generate: number;
  skipped_existing: number;
  failed: number;
  processed_at: string;
  items?: Array<{
    product_id: string;
    name: string;
    status: string;
    barcode?: string | null;
    message?: string | null;
  }>;
};

export type StockAdjustmentResponse = {
  product_id: string;
  delta_quantity: number;
  previous_quantity: number;
  new_quantity: number;
  reason: string;
  is_low_stock: boolean;
  alert_level: number;
  safety_stock: number;
  target_stock_level: number;
  updated_at: string;
};

export type Product = {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  image_url?: string | null;
  image?: string;
  category_id?: string | null;
  category_name?: string | null;
  brand_id?: string | null;
  brand_name?: string | null;
  price: number;
  unit_price?: number;
  cost_price?: number;
  stock: number;
  stock_quantity?: number;
  initial_stock_quantity?: number;
  reorder_level?: number;
  safety_stock?: number;
  target_stock_level?: number;
  alert_level?: number;
  allow_negative_stock?: boolean;
  is_low_stock?: boolean;
  is_serial_tracked?: boolean;
  permanent_discount_percent?: number | null;
  permanent_discount_fixed?: number | null;
  warranty_months?: number;
  is_batch_tracked?: boolean;
  expiry_alert_days?: number;
  product_suppliers?: ProductSupplier[];
  is_active?: boolean;
  created_at?: string;
  updated_at?: string | null;
};

export type PromotionScope = "all" | "category" | "product";
export type PromotionValueType = "percent" | "fixed";

export type Promotion = {
  id: string;
  name: string;
  description?: string | null;
  scope: PromotionScope;
  category_id?: string | null;
  product_id?: string | null;
  value_type: PromotionValueType;
  value: number;
  starts_at_utc: string;
  ends_at_utc: string;
  is_active: boolean;
  created_at_utc: string;
  updated_at_utc?: string | null;
};

export type UpsertPromotionRequest = {
  name: string;
  description?: string | null;
  scope: PromotionScope;
  category_id?: string | null;
  product_id?: string | null;
  value_type: PromotionValueType;
  value: number;
  starts_at_utc: string;
  ends_at_utc: string;
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
  sale_item_id?: string;
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
  status: "Draft" | "InProgress" | "Completed" | "Reverted";
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
  is_serial_tracked: boolean;
  system_quantity: number;
  counted_quantity?: number;
  variance_quantity?: number;
  notes?: string;
};

export type WarrantyClaim = {
  id: string;
  serial_number_id: string;
  product_id: string;
  serial_value: string;
  product_name: string;
  replacement_serial_number_id?: string;
  replacement_serial_value?: string;
  replacement_date?: string;
  claim_date: string;
  status: "Open" | "InRepair" | "Resolved" | "Rejected";
  resolution_notes?: string;
  supplier_name?: string;
  handover_date?: string;
  pickup_person_name?: string;
  received_back_date?: string;
  created_at: string;
  updated_at?: string;
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
  category_name?: string | null;
  brand_id?: string | null;
  brand_name?: string | null;
  unit_price: number;
  cost_price?: number;
  stock_quantity: number;
  initial_stock_quantity?: number;
  reorder_level?: number;
  safety_stock?: number;
  target_stock_level?: number;
  alert_level?: number;
  allow_negative_stock?: boolean;
  is_low_stock?: boolean;
  is_serial_tracked?: boolean;
  permanent_discount_percent?: number | null;
  permanent_discount_fixed?: number | null;
  warranty_months?: number;
  is_batch_tracked?: boolean;
  expiry_alert_days?: number;
  product_suppliers?: Array<{
    product_supplier_id: string;
    supplier_id: string;
    supplier_name: string;
    supplier_sku?: string | null;
    supplier_item_name?: string | null;
    is_preferred: boolean;
    lead_time_days?: number | null;
    min_order_qty?: number | null;
    pack_size?: number | null;
    last_purchase_price?: number | null;
    is_active: boolean;
    created_at: string;
    updated_at?: string | null;
  }>;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string | null;
};

type BackendCategoryItem = {
  category_id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  product_count: number;
  can_delete: boolean;
  delete_block_reason?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type BackendBrandItem = {
  brand_id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  is_active: boolean;
  product_count: number;
  can_delete: boolean;
  delete_block_reason?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type BackendServiceItem = {
  id: string;
  name: string;
  sku?: string | null;
  price: number;
  description?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  duration_minutes?: number | null;
  is_active: boolean;
};

type BackendSupplierItem = {
  supplier_id: string;
  name: string;
  phone?: string | null;
  company_name?: string | null;
  company_phone?: string | null;
  address?: string | null;
  is_active: boolean;
  brands: BackendSupplierBrandItem[];
  linked_product_count: number;
  can_delete: boolean;
  delete_block_reason?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type BackendSupplierBrandItem = {
  brand_id: string;
  name: string;
};

type BackendProductSupplierItem = {
  product_supplier_id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_sku?: string | null;
  supplier_item_name?: string | null;
  is_preferred: boolean;
  lead_time_days?: number | null;
  min_order_qty?: number | null;
  pack_size?: number | null;
  last_purchase_price?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
};

type BackendCategoryListResponse = { items: BackendCategoryItem[] };
type BackendBrandListResponse = { items: BackendBrandItem[] };
type BackendServiceListResponse = { items: BackendServiceItem[] };
type BackendSupplierListResponse = { items: BackendSupplierItem[] };
type BackendProductSupplierListResponse = { items: BackendProductSupplierItem[] };

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
  store_id?: string;
  status: StocktakeSession["status"];
  started_at: string;
  completed_at?: string | null;
  created_by_user_id?: string | null;
  item_count?: number;
  variance_count?: number;
  items?: BackendStocktakeItem[];
};

type BackendStocktakeItem = {
  id: string;
  session_id: string;
  product_id: string;
  product_name: string;
  is_serial_tracked?: boolean;
  system_quantity: number;
  counted_quantity?: number | null;
  variance_quantity?: number | null;
  notes?: string | null;
};

type BackendWarrantyClaim = {
  id: string;
  serial_number_id: string;
  product_id: string;
  serial_value: string;
  product_name: string;
  replacement_serial_number_id?: string | null;
  replacement_serial_value?: string | null;
  replacement_date?: string | null;
  claim_date: string;
  status: WarrantyClaim["status"];
  resolution_notes?: string | null;
  supplier_name?: string | null;
  handover_date?: string | null;
  pickup_person_name?: string | null;
  received_back_date?: string | null;
  created_at: string;
  updated_at?: string | null;
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

type DailySalesReportResponse = {
  from_date: string;
  to_date: string;
  sales_count: number;
  refund_count: number;
  gross_sales_total: number;
  refunded_total: number;
  net_sales_total: number;
  items_sold_total: number;
  items: {
    date: string;
    sales_count: number;
    refund_count: number;
    gross_sales: number;
    refunded_total: number;
    net_sales: number;
    items_sold: number;
  }[];
};

type TransactionsReportResponse = {
  from_date: string;
  to_date: string;
  take: number;
  transaction_count: number;
  gross_total: number;
  reversed_total: number;
  net_collected_total: number;
  items: {
    sale_id: string;
    sale_number: string;
    status: string;
    timestamp: string;
    created_by_user_id?: string | null;
    cashier_username?: string | null;
    cashier_full_name?: string | null;
    items_count: number;
    grand_total: number;
    paid_total: number;
    reversed_total: number;
    net_collected: number;
    custom_payout_used: boolean;
    cash_short_amount: number;
    transaction_type?: string;
    cash_movement_amount?: number | null;
    payment_breakdown: {
      method: string;
      count: number;
      paid_amount: number;
      reversed_amount: number;
      net_amount: number;
    }[];
    line_items: {
      sale_item_id: string;
      product_id: string;
      product_name: string;
      category_id?: string | null;
      category_name?: string | null;
      quantity: number;
      unit_price: number;
      line_total: number;
    }[];
  }[];
};

type PaymentBreakdownReportResponse = {
  from_date: string;
  to_date: string;
  paid_total: number;
  reversed_total: number;
  net_total: number;
  items: {
    method: string;
    count: number;
    paid_amount: number;
    reversed_amount: number;
    net_amount: number;
  }[];
};

type TopItemsReportResponse = {
  from_date: string;
  to_date: string;
  take: number;
  items: {
    product_id: string;
    product_name: string;
    sold_quantity: number;
    refunded_quantity: number;
    net_quantity: number;
    net_sales: number;
  }[];
};

type WorstItemsReportResponse = {
  from_date: string;
  to_date: string;
  take: number;
  items: {
    product_id: string;
    product_name: string;
    sold_quantity: number;
    refunded_quantity: number;
    net_quantity: number;
    net_sales: number;
  }[];
};

type MonthlySalesForecastReportResponse = {
  generated_at: string;
  months: number;
  average_monthly_net_sales: number;
  trend_percent: number;
  forecast_next_month_net_sales: number;
  confidence: "low" | "medium" | "high";
  items: {
    month: string;
    sales_count: number;
    refund_count: number;
    net_sales: number;
  }[];
};

type LowStockReportResponse = {
  generated_at: string;
  threshold: number;
  take: number;
  items: {
    product_id: string;
    product_name: string;
    sku?: string | null;
    barcode?: string | null;
    brand_id?: string | null;
    brand_name?: string | null;
    preferred_supplier_id?: string | null;
    preferred_supplier_name?: string | null;
    quantity_on_hand: number;
    reorder_level: number;
    safety_stock: number;
    target_stock_level: number;
    alert_level: number;
    deficit: number;
  }[];
};

type LowStockByBrandReportResponse = {
  generated_at: string;
  threshold: number;
  take: number;
  items: {
    brand_id?: string | null;
    brand_name?: string | null;
    low_stock_count: number;
    total_deficit: number;
    estimated_reorder_value: number;
  }[];
};

type LowStockBySupplierReportResponse = {
  generated_at: string;
  threshold: number;
  take: number;
  items: {
    supplier_id?: string | null;
    supplier_name?: string | null;
    low_stock_count: number;
    total_deficit: number;
    estimated_reorder_value: number;
  }[];
};

type CashierLeaderboardReportResponse = {
  from_date: string;
  to_date: string;
  items: {
    cashier_user_id?: string | null;
    cashier_name: string;
    transaction_count: number;
    items_sold: number;
    gross_sales: number;
    refund_count: number;
    average_basket: number;
  }[];
};

type MarginSummaryReportResponse = {
  from_date: string;
  to_date: string;
  take: number;
  items: {
    product_id: string;
    product_name: string;
    net_quantity: number;
    net_sales: number;
    cost_of_goods: number;
    gross_profit: number;
    margin_percent: number;
  }[];
};

type SalesComparisonReportResponse = {
  current_from: string;
  current_to: string;
  prior_from: string;
  prior_to: string;
  current_net_sales: number;
  prior_net_sales: number;
  change_percent: number;
  current_items: { date: string; net_sales: number; sales_count: number }[];
  prior_items: { date: string; net_sales: number; sales_count: number }[];
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

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
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

function formatDateQueryValue(value: Date | string) {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mapProduct(item: BackendProductCatalogItem): Product {
  return {
    id: item.product_id,
    name: item.name,
    sku: item.sku ?? "",
    barcode: item.barcode ?? undefined,
    image_url: item.image_url ?? undefined,
    image: item.image_url ?? undefined,
    category_id: item.category_id ?? undefined,
    category_name: item.category_name ?? undefined,
    brand_id: item.brand_id ?? undefined,
    brand_name: item.brand_name ?? undefined,
    price: item.unit_price,
    unit_price: item.unit_price,
    cost_price: item.cost_price ?? item.unit_price,
    stock: item.stock_quantity,
    stock_quantity: item.stock_quantity,
    initial_stock_quantity: item.initial_stock_quantity,
    reorder_level: item.reorder_level,
    safety_stock: item.safety_stock,
    target_stock_level: item.target_stock_level,
    alert_level: item.alert_level,
    allow_negative_stock: item.allow_negative_stock,
    is_low_stock: item.is_low_stock,
    is_serial_tracked: item.is_serial_tracked,
    permanent_discount_percent: item.permanent_discount_percent ?? null,
    permanent_discount_fixed: item.permanent_discount_fixed ?? null,
    warranty_months: item.warranty_months,
    is_batch_tracked: item.is_batch_tracked,
    expiry_alert_days: item.expiry_alert_days,
    product_suppliers: item.product_suppliers?.map(mapProductSupplier) ?? [],
    is_active: item.is_active,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

function mapCategory(item: BackendCategoryItem): Category {
  return {
    category_id: item.category_id,
    name: item.name,
    description: item.description ?? undefined,
    is_active: item.is_active,
    product_count: item.product_count,
    can_delete: item.can_delete,
    delete_block_reason: item.delete_block_reason ?? undefined,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

function mapBrand(item: BackendBrandItem): Brand {
  return {
    brand_id: item.brand_id,
    name: item.name,
    code: item.code ?? undefined,
    description: item.description ?? undefined,
    is_active: item.is_active,
    product_count: item.product_count,
    can_delete: item.can_delete,
    delete_block_reason: item.delete_block_reason ?? undefined,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

function mapService(item: BackendServiceItem): Service {
  return {
    id: item.id,
    name: item.name,
    sku: item.sku ?? undefined,
    price: Number(item.price),
    description: item.description ?? undefined,
    category_id: item.category_id ?? undefined,
    category_name: item.category_name ?? undefined,
    duration_minutes: item.duration_minutes ?? undefined,
    is_active: item.is_active,
  };
}

function mapSupplier(item: BackendSupplierItem): Supplier {
  return {
    supplier_id: item.supplier_id,
    id: item.supplier_id,
    name: item.name,
    phone: item.phone ?? undefined,
    company_name: item.company_name ?? undefined,
    companyName: item.company_name ?? undefined,
    company_phone: item.company_phone ?? undefined,
    companyPhone: item.company_phone ?? undefined,
    address: item.address ?? undefined,
    is_active: item.is_active,
    isActive: item.is_active,
    brands: (item.brands ?? []).map((brand) => ({
      brand_id: brand.brand_id,
      name: brand.name,
    })),
    linked_product_count: item.linked_product_count,
    linkedProductCount: item.linked_product_count,
    can_delete: item.can_delete,
    delete_block_reason: item.delete_block_reason ?? undefined,
    created_at: item.created_at,
    createdAt: item.created_at,
    updated_at: item.updated_at,
    updatedAt: item.updated_at,
  };
}

function mapProductSupplier(item: BackendProductSupplierItem): ProductSupplier {
  return {
    product_supplier_id: item.product_supplier_id,
    supplier_id: item.supplier_id,
    supplier_name: item.supplier_name,
    supplier_sku: item.supplier_sku ?? undefined,
    supplier_item_name: item.supplier_item_name ?? undefined,
    is_preferred: item.is_preferred,
    lead_time_days: item.lead_time_days ?? undefined,
    min_order_qty: item.min_order_qty ?? undefined,
    pack_size: item.pack_size ?? undefined,
    last_purchase_price: item.last_purchase_price ?? undefined,
    is_active: item.is_active,
    created_at: item.created_at,
    updated_at: item.updated_at,
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
  const items = item.items ?? [];
  return {
    id: item.id,
    store_id: item.store_id ?? "",
    status: item.status,
    started_at: item.started_at,
    completed_at: item.completed_at ?? undefined,
    created_by_user_id: item.created_by_user_id ?? undefined,
    item_count: item.item_count ?? items.length,
    variance_count:
      item.variance_count ??
      items.filter((entry) => entry.variance_quantity != null && entry.variance_quantity !== 0)
        .length,
  };
}

function mapStocktakeItem(item: BackendStocktakeItem): StocktakeItem {
  return {
    id: item.id,
    session_id: item.session_id,
    product_id: item.product_id,
    product_name: item.product_name,
    is_serial_tracked: item.is_serial_tracked ?? false,
    system_quantity: item.system_quantity,
    counted_quantity: item.counted_quantity ?? undefined,
    variance_quantity: item.variance_quantity ?? undefined,
    notes: item.notes ?? undefined,
  };
}

type CompleteStocktakeSessionInput = {
  serial_reconciliations?: Array<{
    item_id: string;
    serials: string[];
  }>;
};

function mapWarrantyClaim(item: BackendWarrantyClaim): WarrantyClaim {
  return {
    id: item.id,
    serial_number_id: item.serial_number_id,
    product_id: item.product_id,
    serial_value: item.serial_value,
    product_name: item.product_name,
    replacement_serial_number_id: item.replacement_serial_number_id ?? undefined,
    replacement_serial_value: item.replacement_serial_value ?? undefined,
    replacement_date: item.replacement_date ?? undefined,
    claim_date: item.claim_date,
    status: item.status,
    resolution_notes: item.resolution_notes ?? undefined,
    supplier_name: item.supplier_name ?? undefined,
    handover_date: item.handover_date ?? undefined,
    pickup_person_name: item.pickup_person_name ?? undefined,
    received_back_date: item.received_back_date ?? undefined,
    created_at: item.created_at,
    updated_at: item.updated_at ?? undefined,
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

function normalizeProductPayload(
  data: Partial<Product> & { name: string },
  includeInitialStock: boolean,
) {
  const unitPrice = data.unit_price ?? data.price ?? 0;
  const costPrice = data.cost_price ?? data.price ?? unitPrice;
  const stockQuantity = data.stock_quantity ?? data.stock ?? data.initial_stock_quantity ?? 0;
  const categoryId = data.category_id ?? null;
  const brandId = data.brand_id ?? null;
  const productSuppliers = data.product_suppliers ?? [];
  const preferredSupplier = productSuppliers.find((supplier) => supplier.is_preferred);

  return {
    name: data.name,
    sku: data.sku?.trim() || null,
    barcode: data.barcode?.trim() || null,
    image_url: data.image_url ?? data.image ?? null,
    category_id: categoryId,
    brand_id: brandId,
    unit_price: unitPrice,
    cost_price: costPrice,
    initial_stock_quantity: includeInitialStock
      ? (data.initial_stock_quantity ?? stockQuantity)
      : undefined,
    reorder_level: data.reorder_level ?? 0,
    safety_stock: data.safety_stock ?? 0,
    target_stock_level: data.target_stock_level ?? 0,
    allow_negative_stock: data.allow_negative_stock ?? false,
    is_serial_tracked: data.is_serial_tracked ?? false,
    permanent_discount_percent: data.permanent_discount_percent ?? null,
    permanent_discount_fixed: data.permanent_discount_fixed ?? null,
    warranty_months: data.is_serial_tracked ? (data.warranty_months ?? 0) : 0,
    is_batch_tracked: data.is_batch_tracked ?? false,
    expiry_alert_days: data.is_batch_tracked ? (data.expiry_alert_days ?? 30) : 30,
    is_active: data.is_active ?? true,
    preferred_supplier_id: preferredSupplier?.supplier_id ?? null,
  };
}

export async function fetchProductCatalogItems(
  take = 200,
  includeInactive = true,
): Promise<Product[]> {
  const query = buildQuery({
    take,
    include_inactive: includeInactive,
  });
  const response = await safeRequestJson<{ items: BackendProductCatalogItem[] }>(
    `/api/products/catalog${query}`,
    { items: [] },
  );
  return response.items.map(mapProduct);
}

export async function updateProduct(
  id: string,
  data: Partial<Product> & { name: string },
): Promise<Product> {
  const payload = normalizeProductPayload(data, false);
  const response = await requestJson<BackendProductCatalogItem>(`/api/products/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  const updated = mapProduct(response);

  if (payload.preferred_supplier_id) {
    try {
      await setPreferredProductSupplier(updated.id, payload.preferred_supplier_id);
    } catch {
      // Ignore supplier preference errors so the core product save still succeeds.
    }
  }

  return updated;
}

export async function createProduct(data: Partial<Product> & { name: string }): Promise<Product> {
  const payload = normalizeProductPayload(data, true);
  const response = await requestJson<BackendProductCatalogItem>("/api/products", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const created = mapProduct(response);

  if (payload.preferred_supplier_id) {
    try {
      await setPreferredProductSupplier(created.id, payload.preferred_supplier_id);
    } catch {
      // Ignore supplier preference errors so the core product save still succeeds.
    }
  }

  return created;
}

export async function deleteProduct(productId: string): Promise<void> {
  await requestJson<void>(`/api/products/${productId}`, {
    method: "DELETE",
  });
}

export async function hardDeleteProduct(productId: string): Promise<void> {
  await requestJson<void>(`/api/products/${productId}/hard-delete`, {
    method: "DELETE",
  });
}

export async function adjustStock(
  productId: string,
  deltaQuantity: number,
  reason = "manual_adjustment",
  batchId?: string | null,
): Promise<StockAdjustmentResponse> {
  return requestJson<StockAdjustmentResponse>(`/api/products/${productId}/stock-adjustments`, {
    method: "POST",
    body: JSON.stringify({
      delta_quantity: deltaQuantity,
      reason,
      batch_id: batchId ?? null,
    }),
  });
}

export async function fetchCategories(includeInactive = false): Promise<Category[]> {
  const response = await safeRequestJson<BackendCategoryListResponse>(
    `/api/categories${buildQuery({ include_inactive: includeInactive })}`,
    { items: [] },
  );
  return response.items.map(mapCategory);
}

export async function createCategory(requestBody: CreateCategoryRequest): Promise<Category> {
  const response = await requestJson<BackendCategoryItem>("/api/categories", {
    method: "POST",
    body: JSON.stringify({
      name: requestBody.name.trim(),
      description: requestBody.description?.trim() || null,
      is_active: requestBody.is_active ?? true,
    }),
  });
  return mapCategory(response);
}

export async function updateCategory(
  categoryId: string,
  requestBody: CreateCategoryRequest,
): Promise<Category> {
  const response = await requestJson<BackendCategoryItem>(`/api/categories/${categoryId}`, {
    method: "PUT",
    body: JSON.stringify({
      name: requestBody.name.trim(),
      description: requestBody.description?.trim() || null,
      is_active: requestBody.is_active ?? true,
    }),
  });
  return mapCategory(response);
}

export async function hardDeleteCategory(categoryId: string): Promise<void> {
  await requestJson<void>(`/api/categories/${categoryId}/hard-delete`, {
    method: "DELETE",
  });
}

function mapPromotion(item: Promotion): Promotion {
  return {
    ...item,
    value: Number(item.value),
  };
}

export async function fetchPromotions(): Promise<Promotion[]> {
  const response = await requestJson<{ items: Promotion[] }>("/api/promotions");
  return (response.items ?? []).map(mapPromotion);
}

export async function fetchPromotion(id: string): Promise<Promotion> {
  const response = await requestJson<Promotion>(`/api/promotions/${id}`);
  return mapPromotion(response);
}

export async function createPromotion(payload: UpsertPromotionRequest): Promise<Promotion> {
  const response = await requestJson<Promotion>("/api/promotions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return mapPromotion(response);
}

export async function updatePromotion(id: string, payload: UpsertPromotionRequest): Promise<Promotion> {
  const response = await requestJson<Promotion>(`/api/promotions/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return mapPromotion(response);
}

export async function deactivatePromotion(id: string): Promise<void> {
  await requestJson<void>(`/api/promotions/${id}`, {
    method: "DELETE",
  });
}

export async function fetchBrands(includeInactive = false): Promise<Brand[]> {
  const response = await safeRequestJson<BackendBrandListResponse>(
    `/api/brands${buildQuery({ include_inactive: includeInactive })}`,
    { items: [] },
  );
  return response.items.map(mapBrand);
}

export async function createBrand(payload: {
  name: string;
  code?: string;
  description?: string;
  is_active?: boolean;
}): Promise<Brand> {
  const response = await requestJson<BackendBrandItem>("/api/brands", {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      code: payload.code?.trim() || null,
      description: payload.description?.trim() || null,
      is_active: payload.is_active ?? true,
    }),
  });
  return mapBrand(response);
}

export async function updateBrand(
  brandId: string,
  payload: Partial<{ name: string; code: string; description: string; is_active: boolean }>,
): Promise<Brand> {
  const response = await requestJson<BackendBrandItem>(`/api/brands/${brandId}`, {
    method: "PUT",
    body: JSON.stringify({
      name: payload.name,
      code: payload.code?.trim() || null,
      description: payload.description?.trim() || null,
      is_active: payload.is_active ?? true,
    }),
  });
  return mapBrand(response);
}

export async function hardDeleteBrand(brandId: string): Promise<void> {
  await requestJson<void>(`/api/brands/${brandId}/hard-delete`, {
    method: "DELETE",
  });
}

export type CreateServiceRequest = {
  name: string;
  sku?: string | null;
  price: number;
  description?: string | null;
  category_id?: string | null;
  duration_minutes?: number | null;
};

export type UpdateServiceRequest = {
  name?: string | null;
  sku?: string | null;
  price?: number | null;
  description?: string | null;
  category_id?: string | null;
  duration_minutes?: number | null;
};

export async function fetchServices(): Promise<Service[]> {
  const response = await safeRequestJson<BackendServiceListResponse>("/api/services", { items: [] });
  return response.items.map(mapService);
}

export async function createService(payload: CreateServiceRequest): Promise<Service> {
  const response = await requestJson<BackendServiceItem>("/api/services", {
    method: "POST",
    body: JSON.stringify({
      name: payload.name.trim(),
      sku: payload.sku?.trim() || null,
      price: payload.price,
      description: payload.description?.trim() || null,
      category_id: payload.category_id ?? null,
      duration_minutes: payload.duration_minutes ?? null,
    }),
  });

  return mapService(response);
}

export async function updateService(serviceId: string, payload: UpdateServiceRequest): Promise<Service> {
  const response = await requestJson<BackendServiceItem>(`/api/services/${serviceId}`, {
    method: "PUT",
    body: JSON.stringify({
      name: payload.name?.trim() || null,
      sku: payload.sku?.trim() || null,
      price: payload.price ?? null,
      description: payload.description?.trim() || null,
      category_id: payload.category_id ?? null,
      duration_minutes: payload.duration_minutes ?? null,
    }),
  });

  return mapService(response);
}

export async function deleteService(serviceId: string): Promise<void> {
  await requestJson<void>(`/api/services/${serviceId}`, {
    method: "DELETE",
  });
}

export async function fetchSuppliers(includeInactive = false): Promise<Supplier[]> {
  const response = await safeRequestJson<BackendSupplierListResponse>(
    `/api/suppliers${buildQuery({ include_inactive: includeInactive })}`,
    { items: [] },
  );
  return response.items.map(mapSupplier);
}

export async function createSupplier(payload: {
  name: string;
  phone?: string;
  company_name?: string;
  company_phone?: string;
  address?: string;
  is_active?: boolean;
  brand_ids?: string[];
}): Promise<Supplier> {
  const response = await requestJson<BackendSupplierItem>("/api/suppliers", {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      phone: payload.phone?.trim() || null,
      company_name: payload.company_name?.trim() || null,
      company_phone: payload.company_phone?.trim() || null,
      address: payload.address?.trim() || null,
      is_active: payload.is_active ?? true,
      brand_ids: payload.brand_ids ?? [],
    }),
  });
  return mapSupplier(response);
}

export async function updateSupplier(
  supplierId: string,
  payload: Partial<{
    name: string;
    phone: string;
    company_name: string;
    company_phone: string;
    address: string;
    is_active: boolean;
    brand_ids: string[];
  }>,
): Promise<Supplier> {
  const response = await requestJson<BackendSupplierItem>(`/api/suppliers/${supplierId}`, {
    method: "PUT",
    body: JSON.stringify({
      name: payload.name,
      phone: payload.phone?.trim() || null,
      company_name: payload.company_name?.trim() || null,
      company_phone: payload.company_phone?.trim() || null,
      address: payload.address?.trim() || null,
      is_active: payload.is_active ?? true,
      brand_ids: payload.brand_ids ?? [],
    }),
  });
  return mapSupplier(response);
}

export async function hardDeleteSupplier(supplierId: string): Promise<void> {
  await requestJson<void>(`/api/suppliers/${supplierId}/hard-delete`, {
    method: "DELETE",
  });
}

export async function fetchProductSuppliers(productId: string): Promise<ProductSupplier[]> {
  const response = await safeRequestJson<BackendProductSupplierListResponse>(
    `/api/products/${productId}/suppliers`,
    { items: [] },
  );
  return response.items.map(mapProductSupplier);
}

export async function upsertProductSupplier(
  productId: string,
  payload: {
    supplier_id: string;
    supplier_sku?: string | null;
    supplier_item_name?: string | null;
    is_preferred: boolean;
    lead_time_days?: number | null;
    min_order_qty?: number | null;
    pack_size?: number | null;
    last_purchase_price?: number | null;
    is_active?: boolean;
  },
): Promise<ProductSupplier> {
  const response = await requestJson<BackendProductSupplierItem>(
    `/api/products/${productId}/suppliers`,
    {
      method: "PUT",
      body: JSON.stringify({
        supplier_id: payload.supplier_id,
        supplier_sku: payload.supplier_sku ?? null,
        supplier_item_name: payload.supplier_item_name ?? null,
        is_preferred: payload.is_preferred,
        lead_time_days: payload.lead_time_days ?? null,
        min_order_qty: payload.min_order_qty ?? null,
        pack_size: payload.pack_size ?? null,
        last_purchase_price: payload.last_purchase_price ?? null,
        is_active: payload.is_active ?? true,
      }),
    },
  );
  return mapProductSupplier(response);
}

export async function setPreferredProductSupplier(
  productId: string,
  supplierId: string,
): Promise<ProductSupplier> {
  const response = await requestJson<BackendProductSupplierItem>(
    `/api/products/${productId}/preferred-supplier`,
    {
      method: "PUT",
      body: JSON.stringify({
        supplier_id: supplierId,
      }),
    },
  );
  return mapProductSupplier(response);
}

export async function generateProductBarcode(
  payload: {
    name?: string;
    sku?: string;
    seed?: string;
  } = {},
): Promise<GenerateBarcodeResponse> {
  return requestJson<GenerateBarcodeResponse>("/api/products/barcodes/generate", {
    method: "POST",
    body: JSON.stringify({
      name: payload.name ?? null,
      sku: payload.sku ?? null,
      seed: payload.seed ?? null,
    }),
  });
}

export async function validateProductBarcode(payload: {
  barcode: string;
  exclude_product_id?: string | null;
  check_existing?: boolean;
}): Promise<ValidateBarcodeResponse> {
  return requestJson<ValidateBarcodeResponse>("/api/products/barcodes/validate", {
    method: "POST",
    body: JSON.stringify({
      barcode: payload.barcode,
      exclude_product_id: payload.exclude_product_id ?? null,
      check_existing: payload.check_existing ?? true,
    }),
  });
}

export async function generateAndAssignProductBarcode(
  productId: string,
  payload: { force_replace?: boolean; seed?: string } = {},
): Promise<Product> {
  const response = await requestJson<BackendProductCatalogItem>(
    `/api/products/${productId}/barcode/generate`,
    {
      method: "POST",
      body: JSON.stringify({
        force_replace: payload.force_replace ?? false,
        seed: payload.seed ?? null,
      }),
    },
  );
  return mapProduct(response);
}

export async function bulkGenerateMissingProductBarcodes(
  payload: { dry_run?: boolean; take?: number; include_inactive?: boolean } = {},
): Promise<BulkGenerateMissingProductBarcodesResponse> {
  return requestJson<BulkGenerateMissingProductBarcodesResponse>(
    "/api/products/barcodes/bulk-generate-missing",
    {
      method: "POST",
      body: JSON.stringify({
        dry_run: payload.dry_run ?? false,
        take: payload.take ?? 200,
        include_inactive: payload.include_inactive ?? false,
      }),
    },
  );
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

  if (
    products.status === "rejected" &&
    dashboard.status === "rejected" &&
    expiringBatches.status === "rejected" &&
    sessions.status === "rejected" &&
    claims.status === "rejected"
  ) {
    throw new Error("Failed to load inventory dashboard.");
  }

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
    expiry_alerts: expiryAlerts,
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
      body: JSON.stringify({ serials: serialValues }),
    },
  );
  return response.items;
}

export async function updateSerialNumber(
  productId: string,
  serialId: string,
  data: { status: SerialNumberRecord["status"]; warranty_expiry_date?: string | null },
): Promise<SerialNumberRecord> {
  return await requestJson<SerialNumberRecord>(`/api/products/${productId}/serials/${serialId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function replaceSerialNumber(
  productId: string,
  serialId: string,
  data: { new_serial_value: string },
): Promise<SerialNumberRecord> {
  return await requestJson<SerialNumberRecord>(
    `/api/products/${productId}/serials/${serialId}/replace`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

export async function deleteSerialNumber(productId: string, serialId: string): Promise<void> {
  await requestJson<void>(`/api/products/${productId}/serials/${serialId}`, {
    method: "DELETE",
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
    body: JSON.stringify({}),
  });
  return mapStocktakeSession(response);
}

export async function getStocktakeSession(
  sessionId: string,
): Promise<{ session: StocktakeSession; items: StocktakeItem[] }> {
  const response = await requestJson<BackendStocktakeSession>(
    `/api/stocktake/sessions/${sessionId}`,
  );
  return {
    session: mapStocktakeSession(response),
    items: (response.items ?? []).map(mapStocktakeItem),
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
): Promise<Pick<StocktakeItem, "id" | "counted_quantity" | "variance_quantity">> {
  const response = await requestJson<
    Pick<BackendStocktakeItem, "id" | "counted_quantity" | "variance_quantity">
  >(`/api/stocktake/sessions/${sessionId}/items/${itemId}`, {
    method: "PUT",
    body: JSON.stringify({ counted_quantity: countedQty }),
  });
  return {
    id: response.id,
    counted_quantity: response.counted_quantity ?? undefined,
    variance_quantity: response.variance_quantity ?? undefined,
  };
}

export async function completeStocktakeSession(
  sessionId: string,
  data: CompleteStocktakeSessionInput = {},
): Promise<StocktakeSession> {
  const response = await requestJson<BackendStocktakeSession>(
    `/api/stocktake/sessions/${sessionId}/complete`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
  return mapStocktakeSession(response);
}

export async function revertStocktakeSession(sessionId: string): Promise<StocktakeSession> {
  const response = await requestJson<BackendStocktakeSession>(
    `/api/stocktake/sessions/${sessionId}/revert`,
    {
      method: "POST",
    },
  );
  return mapStocktakeSession(response);
}

export async function deleteStocktakeSession(sessionId: string): Promise<void> {
  await requestJson<void>(`/api/stocktake/sessions/${sessionId}`, {
    method: "DELETE",
  });
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
  claim_date?: string;
  resolution_notes?: string;
}): Promise<WarrantyClaim> {
  const response = await requestJson<BackendWarrantyClaim>("/api/warranty-claims", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return mapWarrantyClaim(response);
}

export async function updateWarrantyClaim(
  claimId: string,
  data: {
    status: WarrantyClaim["status"];
    resolution_notes?: string;
    supplier_name?: string;
    handover_date?: string;
    pickup_person_name?: string;
    received_back_date?: string;
  },
): Promise<WarrantyClaim> {
  const response = await requestJson<BackendWarrantyClaim>(`/api/warranty-claims/${claimId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return mapWarrantyClaim(response);
}

export async function replaceWarrantyClaim(
  claimId: string,
  data: {
    replacement_serial_number_id: string;
    replacement_date?: string;
    resolution_notes?: string;
  },
): Promise<WarrantyClaim> {
  const response = await requestJson<BackendWarrantyClaim>(
    `/api/warranty-claims/${claimId}/replace`,
    {
      method: "POST",
      body: JSON.stringify({
        replacement_serial_number_id: data.replacement_serial_number_id,
        replacement_date: data.replacement_date,
        resolution_notes: data.resolution_notes,
      }),
    },
  );
  return mapWarrantyClaim(response);
}

export async function fetchDailySalesReport(
  fromDate: Date | string = new Date(),
  toDate: Date | string = fromDate,
) {
  const from = formatDateQueryValue(fromDate);
  const to = formatDateQueryValue(toDate);
  return requestJson<DailySalesReportResponse>(`/api/reports/daily?from=${from}&to=${to}`);
}

export async function fetchTransactionsReport(
  fromDate: Date | string = new Date(),
  toDate: Date | string = fromDate,
  take = 200,
) {
  const from = formatDateQueryValue(fromDate);
  const to = formatDateQueryValue(toDate);
  return requestJson<TransactionsReportResponse>(
    `/api/reports/transactions?from=${from}&to=${to}&take=${take}`,
  );
}

export async function fetchPaymentBreakdownReport(
  fromDate: Date | string = new Date(),
  toDate: Date | string = fromDate,
) {
  const from = formatDateQueryValue(fromDate);
  const to = formatDateQueryValue(toDate);
  return requestJson<PaymentBreakdownReportResponse>(
    `/api/reports/payment-breakdown?from=${from}&to=${to}`,
  );
}

export async function fetchTopItemsReport(
  fromDate: Date | string = new Date(),
  toDate: Date | string = fromDate,
  take = 25,
) {
  const from = formatDateQueryValue(fromDate);
  const to = formatDateQueryValue(toDate);
  return requestJson<TopItemsReportResponse>(
    `/api/reports/top-items?from=${from}&to=${to}&take=${take}`,
  );
}

export async function fetchWorstItemsReport(
  fromDate: Date | string = new Date(),
  toDate: Date | string = fromDate,
  take = 25,
) {
  const from = formatDateQueryValue(fromDate);
  const to = formatDateQueryValue(toDate);
  return requestJson<WorstItemsReportResponse>(
    `/api/reports/worst-items?from=${from}&to=${to}&take=${take}`,
  );
}

export async function fetchMonthlySalesForecastReport(months = 6) {
  return requestJson<MonthlySalesForecastReportResponse>(
    `/api/reports/monthly-forecast?months=${months}`,
  );
}

export async function fetchLowStockReport(take = 100, threshold = 5) {
  return requestJson<LowStockReportResponse>(
    `/api/reports/low-stock?take=${take}&threshold=${threshold}`,
  );
}

export async function fetchLowStockByBrandReport(take = 20, threshold = 5) {
  return requestJson<LowStockByBrandReportResponse>(
    `/api/reports/low-stock/by-brand?take=${take}&threshold=${threshold}`,
  );
}

export async function fetchLowStockBySupplierReport(take = 20, threshold = 5) {
  return requestJson<LowStockBySupplierReportResponse>(
    `/api/reports/low-stock/by-supplier?take=${take}&threshold=${threshold}`,
  );
}

export async function fetchCashierLeaderboardReport(
  fromDate: Date | string = new Date(),
  toDate: Date | string = fromDate,
) {
  const from = formatDateQueryValue(fromDate);
  const to = formatDateQueryValue(toDate);
  return requestJson<CashierLeaderboardReportResponse>(
    `/api/reports/cashier-leaderboard?from=${from}&to=${to}`,
  );
}

export async function fetchMarginSummaryReport(
  fromDate: Date | string = new Date(),
  toDate: Date | string = fromDate,
  take = 25,
) {
  const from = formatDateQueryValue(fromDate);
  const to = formatDateQueryValue(toDate);
  return requestJson<MarginSummaryReportResponse>(
    `/api/reports/margin-summary?from=${from}&to=${to}&take=${take}`,
  );
}

export async function fetchSalesComparisonReport(
  fromDate: Date | string = new Date(),
  toDate: Date | string = fromDate,
) {
  const from = formatDateQueryValue(fromDate);
  const to = formatDateQueryValue(toDate);
  return requestJson<SalesComparisonReportResponse>(
    `/api/reports/sales-comparison?from=${from}&to=${to}`,
  );
}
