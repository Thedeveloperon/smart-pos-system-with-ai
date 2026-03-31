import type { CartItem, HeldBill, PaymentMethod, Product, RecentSale } from "@/components/pos/types";
import type {
  CashSession,
  CashSessionEntry,
  DenominationCount,
} from "@/components/pos/cash-session/types";

function getDefaultApiBaseUrl() {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (import.meta.env.DEV && (host === "127.0.0.1" || host === "localhost")) {
      return `http://${host}:5080`;
    }

    return window.location.origin;
  }

  return "http://localhost:5080";
}

const DEFAULT_API_BASE_URL = getDefaultApiBaseUrl();

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, "");

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type BackendAuthSession = {
  user_id: string;
  username: string;
  full_name: string;
  role: string;
  device_id: string;
  device_code: string;
  expires_at: string;
};

type BackendProductSearchItem = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  image_url?: string | null;
  unitPrice: number;
  stockQuantity: number;
};

type BackendProductSearchResponse = {
  items: BackendProductSearchItem[];
};

type BackendProductCatalogItem = {
  product_id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  image_url?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  unit_price: number;
  cost_price: number;
  stock_quantity: number;
  reorder_level: number;
  alert_level: number;
  allow_negative_stock: boolean;
  is_active: boolean;
  is_low_stock: boolean;
  created_at: string;
  updated_at?: string | null;
};

type BackendProductCatalogResponse = {
  items: BackendProductCatalogItem[];
};

type BackendSaleItem = {
  sale_item_id: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
};

type BackendSalePayment = {
  method: string;
  amount: number;
  reference_number?: string | null;
};

export type SaleReceiptResponse = {
  sale_id: string;
  sale_number: string;
  status: string;
  subtotal: number;
  discount_total: number;
  discount_percent: number;
  tax_total: number;
  grand_total: number;
  paid_total: number;
  change: number;
  created_at: string;
  completed_at?: string | null;
  items: BackendSaleItem[];
  payments: BackendSalePayment[];
};

export type RefundableSaleItem = {
  sale_item_id: string;
  product_name: string;
  sold_quantity: number;
  refunded_quantity: number;
  refundable_quantity: number;
};

export type SaleRefundSummary = {
  sale_id: string;
  sale_number: string;
  sale_status: string;
  refunded_total: number;
  refunded_tax_total: number;
  remaining_refundable_total: number;
  items: RefundableSaleItem[];
  refunds: {
    refund_id: string;
    refund_number: string;
    grand_total: number;
    tax_amount: number;
    created_at: string;
  }[];
};

export type CreateRefundRequest = {
  sale_id: string;
  reason: string;
  items: {
    sale_item_id: string;
    quantity: number;
  }[];
};

export type RefundResponse = {
  refund_id: string;
  refund_number: string;
  sale_id: string;
  sale_status: string;
  subtotal_amount: number;
  discount_amount: number;
  tax_amount: number;
  grand_total: number;
  created_at: string;
  items: {
    sale_item_id: string;
    product_id: string;
    product_name: string;
    quantity: number;
    subtotal_amount: number;
    discount_amount: number;
    tax_amount: number;
    total_amount: number;
  }[];
  payment_reversals: {
    method: string;
    amount: number;
  }[];
};

type BackendCashCount = {
  denomination: number;
  quantity: number;
};

type BackendCashSessionEntry = {
  counts: BackendCashCount[];
  total: number;
  submitted_by: string;
  submitted_at: string;
  approved_by?: string | null;
  approved_at?: string | null;
};

type BackendCashSessionAuditEntry = {
  id: string;
  action: string;
  performed_by: string;
  performed_at: string;
  details: string;
  amount?: number | null;
};

type BackendCashSessionResponse = {
  cash_session_id: string;
  device_id?: string | null;
  device_code: string;
  cashier_name: string;
  status: string;
  opened_at: string;
  closed_at?: string | null;
  opening: BackendCashSessionEntry;
  closing?: BackendCashSessionEntry | null;
  expected_cash?: number | null;
  difference?: number | null;
  difference_reason?: string | null;
  cash_sales_total: number;
  audit_log: BackendCashSessionAuditEntry[];
};

type BackendCategoryItem = {
  category_id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  product_count: number;
  created_at: string;
  updated_at?: string | null;
};

type BackendCategoryListResponse = {
  items: BackendCategoryItem[];
};

type BackendShopProfileResponse = {
  id: string;
  shop_name: string;
  address_line1?: string | null;
  address_line2?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
  receipt_footer?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type CreateProductRequest = {
  name: string;
  sku?: string | null;
  barcode?: string | null;
  image_url?: string | null;
  category_id?: string | null;
  unit_price: number;
  cost_price: number;
  initial_stock_quantity: number;
  reorder_level: number;
  allow_negative_stock: boolean;
  is_active: boolean;
};

export type CreateCategoryRequest = {
  name: string;
  description?: string | null;
  is_active?: boolean;
};

export type CatalogProduct = {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  image?: string;
  imageUrl?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  unitPrice: number;
  costPrice: number;
  stockQuantity: number;
  reorderLevel: number;
  alertLevel: number;
  allowNegativeStock: boolean;
  isActive: boolean;
  isLowStock: boolean;
  createdAt: string;
  updatedAt?: string | null;
};

export type PurchaseOcrTotalsValidation = {
  line_total_sum: number;
  extracted_subtotal?: number | null;
  extracted_tax_total?: number | null;
  extracted_grand_total?: number | null;
  expected_grand_total?: number | null;
  difference: number;
  tolerance: number;
  within_tolerance: boolean;
  requires_approval_reason: boolean;
};

export type PurchaseOcrDraftLineItem = {
  line_no: number;
  raw_text?: string | null;
  item_name?: string | null;
  quantity?: number | null;
  unit_cost?: number | null;
  line_total?: number | null;
  confidence?: number | null;
  review_status: string;
  match_status: string;
  match_method?: string | null;
  match_score?: number | null;
  matched_product_id?: string | null;
  matched_product_name?: string | null;
  matched_product_sku?: string | null;
  matched_product_barcode?: string | null;
};

export type PurchaseOcrDraftResponse = {
  draft_id: string;
  correlation_id: string;
  status: string;
  scan_status: string;
  file_name: string;
  content_type: string;
  file_size: number;
  supplier_name?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  currency: string;
  subtotal?: number | null;
  tax_total?: number | null;
  grand_total?: number | null;
  ocr_confidence?: number | null;
  review_required: boolean;
  can_auto_commit: boolean;
  blocked_reasons: string[];
  totals: PurchaseOcrTotalsValidation;
  line_items: PurchaseOcrDraftLineItem[];
  warnings: string[];
  created_at: string;
};

export type PurchaseImportConfirmLineRequest = {
  line_no: number;
  product_id: string;
  supplier_item_name?: string | null;
  quantity: number;
  unit_cost: number;
  line_total: number;
};

export type PurchaseImportConfirmRequest = {
  import_request_id: string;
  draft_id: string;
  supplier_name?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  currency?: string | null;
  approval_reason?: string | null;
  update_cost_price?: boolean;
  tax_total?: number | null;
  grand_total?: number | null;
  items: PurchaseImportConfirmLineRequest[];
};

export type PurchaseImportConfirmResponse = {
  purchase_bill_id: string;
  import_request_id: string;
  status: string;
  idempotent_replay: boolean;
  supplier_id: string;
  supplier_name: string;
  invoice_number: string;
  invoice_date: string;
  currency: string;
  subtotal: number;
  tax_total: number;
  grand_total: number;
  items: {
    purchase_bill_item_id: string;
    line_no?: number | null;
    product_id: string;
    product_name: string;
    quantity: number;
    unit_cost: number;
    line_total: number;
  }[];
  inventory_updates: {
    product_id: string;
    product_name: string;
    previous_quantity: number;
    delta_quantity: number;
    new_quantity: number;
  }[];
  created_at: string;
};

export type ShopProfile = {
  id: string;
  shopName: string;
  addressLine1: string;
  addressLine2: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
  receiptFooter: string;
  createdAt: string;
  updatedAt?: string | null;
};

type HeldSalesResponse = {
  items: {
    sale_id: string;
    sale_number: string;
    grand_total: number;
    created_at: string;
    item_count: number;
  }[];
};

type RecentSalesResponse = {
  items: {
    sale_id: string;
    sale_number: string;
    status: string;
    grand_total: number;
    created_at: string;
    completed_at?: string | null;
  }[];
};

type DailySalesReportResponse = {
  from_date: string;
  to_date: string;
  sales_count: number;
  refund_count: number;
  gross_sales_total: number;
  refunded_total: number;
  net_sales_total: number;
  items: {
    date: string;
    sales_count: number;
    refund_count: number;
    gross_sales: number;
    refunded_total: number;
    net_sales: number;
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
    payment_breakdown: {
      method: string;
      paid_amount: number;
      reversed_amount: number;
      net_amount: number;
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

type LowStockReportResponse = {
  generated_at: string;
  threshold: number;
  take: number;
  items: {
    product_id: string;
    product_name: string;
    sku?: string | null;
    barcode?: string | null;
    quantity_on_hand: number;
    reorder_level: number;
    alert_level: number;
    deficit: number;
  }[];
};

type CreateSaleRequest = {
  sale_id?: string;
  items?: { product_id: string; quantity: number }[];
  discount_percent?: number;
  role: string;
  payments: { method: string; amount: number; reference_number?: string | null }[];
};

type HoldSaleRequest = {
  items: { product_id: string; quantity: number }[];
  discount_percent: number;
  role: string;
};

function getAuthDeviceCode() {
  const storageKey = "smartpos-device-code";
  const existing = localStorage.getItem(storageKey);
  if (existing) {
    return existing;
  }

  const generated = crypto.randomUUID();
  localStorage.setItem(storageKey, generated);
  return generated;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const raw = response.status === 204 ? "" : await response.text();

  if (!response.ok) {
    let message = response.statusText || "Request failed";
    if (raw) {
      try {
        const payload = JSON.parse(raw) as { message?: string };
        message = payload.message || message;
      } catch {
        message = raw;
      }
    }

    throw new ApiError(message, response.status);
  }

  if (!raw) {
    return undefined as T;
  }

  if (contentType.includes("application/json")) {
    return JSON.parse(raw) as T;
  }

  return raw as T;
}

async function request<T>(path: string, init: RequestInit = {}) {
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init.body && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });

  return parseResponse<T>(response);
}

function mapBackendRole(role: string): "admin" | "manager" | "cashier" {
  if (role.toLowerCase() === "owner") {
    return "admin";
  }

  if (role.toLowerCase() === "manager") {
    return "manager";
  }

  return "cashier";
}

function toBackendRole(role: "admin" | "manager" | "cashier") {
  return role === "admin" ? "owner" : role;
}

function createProductImage(label: string, accent = "#2F855A") {
  const safeLabel = label.trim().slice(0, 18) || "Product";
  const initials = safeLabel
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.92" />
          <stop offset="100%" stop-color="#1F2937" stop-opacity="0.9" />
        </linearGradient>
      </defs>
      <rect width="320" height="320" rx="28" fill="url(#g)" />
      <circle cx="250" cy="70" r="54" fill="white" fill-opacity="0.08" />
      <circle cx="72" cy="252" r="64" fill="white" fill-opacity="0.08" />
      <text x="160" y="164" text-anchor="middle" font-family="Arial, sans-serif" font-size="74" font-weight="700" fill="white">${initials}</text>
      <text x="160" y="214" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="600" fill="white" fill-opacity="0.85">${safeLabel}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const SAMPLE_PRODUCT_IMAGES: Record<string, string> = {
  "ball pen blue": "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=600&h=600&fit=crop",
  "bath soap": "https://images.unsplash.com/photo-1607006344380-b6775a0824a7?w=600&h=600&fit=crop",
  "bottled water 1.5l": "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=600&h=600&fit=crop",
  "biscuits chocolate cream 150g": "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&h=600&fit=crop",
  "canned tuna 180g": "https://images.unsplash.com/photo-1547592180-85f173990554?w=600&h=600&fit=crop",
  "ceylon tea 100g": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=600&h=600&fit=crop",
  "ceylon tea": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=600&h=600&fit=crop",
  "coconut oil pure 750ml": "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&h=600&fit=crop",
  "dhal red lentils 1kg": "https://images.unsplash.com/photo-1613758947307-f3825f5bfcb3?w=600&h=600&fit=crop",
  "eggs pack of 10": "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=600&h=600&fit=crop",
  "fresh milk full cream 1l": "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=600&h=600&fit=crop",
  "rice 5kg": "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&h=600&fit=crop",
  "sugar 1kg": "https://images.unsplash.com/photo-1582657625660-d2c6b8a2fd7d?w=600&h=600&fit=crop",
  "milk powder 400g": "https://images.unsplash.com/photo-1547592180-85f173990554?w=600&h=600&fit=crop",
  "washing powder 1kg": "https://images.unsplash.com/photo-1585441695325-21557e22afba?w=600&h=600&fit=crop",
  "white sugar 1kg": "https://images.unsplash.com/photo-1582657625660-d2c6b8a2fd7d?w=600&h=600&fit=crop",
  "soap bar lux 100g": "https://images.unsplash.com/photo-1607006344380-b6775a0824a7?w=600&h=600&fit=crop",
  "shampoo 180ml": "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=600&h=600&fit=crop",
  "toothpaste 120g": "https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=600&h=600&fit=crop",
  "notebook a5": "https://images.unsplash.com/photo-1516979187457-637abb4f9353?w=600&h=600&fit=crop",
  "story book grade 5": "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&h=600&fit=crop",
};

function colorFromText(text: string) {
  const palette = ["#2F855A", "#2563EB", "#7C3AED", "#DB2777", "#EA580C", "#0F766E"];
  const hash = [...text].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

function getSampleProductImage(name: string) {
  const normalized = name.trim().toLowerCase();
  if (SAMPLE_PRODUCT_IMAGES[normalized]) {
    return SAMPLE_PRODUCT_IMAGES[normalized];
  }

  if (/(rice|tea|sugar|milk|lentil|dhal|oil|tuna|eggs|biscuits|water|soap|shampoo|toothpaste|powder)/i.test(normalized)) {
    return "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&h=600&fit=crop";
  }

  return undefined;
}

function mapProduct(item: BackendProductSearchItem): Product {
  const accent = colorFromText(item.name + (item.barcode || ""));
  const sampleImage = getSampleProductImage(item.name);
  return {
    id: item.id,
    name: item.name,
    sku: item.sku || item.id.slice(0, 8),
    barcode: item.barcode || undefined,
    price: Number(item.unitPrice),
    category: undefined,
    stock: Number(item.stockQuantity),
    image: item.image_url || sampleImage || createProductImage(item.name, accent),
  };
}

function mapCatalogProduct(item: BackendProductCatalogItem): Product {
  const accent = colorFromText(item.name + (item.barcode || ""));
  const sampleImage = getSampleProductImage(item.name);
  return {
    id: item.product_id,
    name: item.name,
    sku: item.sku || item.product_id.slice(0, 8),
    barcode: item.barcode || undefined,
    price: Number(item.unit_price),
    category: undefined,
    stock: Number(item.stock_quantity),
    image: item.image_url || sampleImage || createProductImage(item.name, accent),
  };
}

function mapSaleItems(items: BackendSaleItem[]): CartItem[] {
  return items.map((item) => ({
    product: {
      id: item.product_id,
      name: item.product_name,
      sku: item.product_id.slice(0, 8),
      barcode: undefined,
      price: Number(item.unit_price),
      category: undefined,
      stock: Number(item.quantity),
      image: getSampleProductImage(item.product_name) || createProductImage(item.product_name),
    },
    quantity: Number(item.quantity),
  }));
}

function normalizePaymentMethod(method: string): PaymentMethod {
  switch (method.toLowerCase()) {
    case "card":
      return "card";
    case "qr":
    case "lankaqr":
      return "qr";
    default:
      return "cash";
  }
}

function mapSaleResponseToRecentSale(sale: BackendSaleResponse): RecentSale {
  const primaryPayment = sale.payments[0];
  return {
    id: sale.sale_id,
    items: mapSaleItems(sale.items),
    total: Number(sale.grand_total),
    status: sale.status,
    paymentMethod: primaryPayment ? normalizePaymentMethod(primaryPayment.method) : "cash",
    customerMobile: undefined,
    completedAt: new Date(sale.completed_at || sale.created_at),
    cashReceived: Number(sale.paid_total),
    change: Number(sale.change),
  };
}

function mapSaleResponseToHeldBill(sale: BackendSaleResponse): HeldBill {
  return {
    id: sale.sale_id,
    label: sale.sale_number,
    items: mapSaleItems(sale.items),
    heldAt: new Date(sale.created_at),
  };
}

function mapCashSessionEntry(entry: BackendCashSessionEntry): CashSessionEntry {
  return {
    counts: entry.counts.map((count) => ({
      denomination: Number(count.denomination),
      quantity: Number(count.quantity),
    })),
    total: Number(entry.total),
    submittedBy: entry.submitted_by,
    submittedAt: new Date(entry.submitted_at),
    approvedBy: entry.approved_by ?? undefined,
    approvedAt: entry.approved_at ? new Date(entry.approved_at) : undefined,
  };
}

function mapCashSessionResponse(session: BackendCashSessionResponse): CashSession {
  return {
    id: session.cash_session_id,
    cashierName: session.cashier_name,
    openedAt: new Date(session.opened_at),
    closedAt: session.closed_at ? new Date(session.closed_at) : undefined,
    opening: mapCashSessionEntry(session.opening),
    closing: session.closing ? mapCashSessionEntry(session.closing) : undefined,
    expectedCash: session.expected_cash ?? undefined,
    difference: session.difference ?? undefined,
    differenceReason: session.difference_reason ?? undefined,
    status: session.status as CashSession["status"],
    auditLog: session.audit_log.map((entry) => ({
      id: entry.id,
      action: entry.action,
      performedBy: entry.performed_by,
      performedAt: new Date(entry.performed_at),
      details: entry.details,
      amount: entry.amount ?? undefined,
    })),
    cashSalesTotal: Number(session.cash_sales_total),
  };
}

function mapCatalogProductItem(item: BackendProductCatalogItem): CatalogProduct {
  const accent = colorFromText(item.name + (item.barcode || ""));
  const sampleImage = getSampleProductImage(item.name);
  return {
    id: item.product_id,
    name: item.name,
    sku: item.sku || item.product_id.slice(0, 8),
    barcode: item.barcode || undefined,
    image: item.image_url || sampleImage || createProductImage(item.name, accent),
    imageUrl: item.image_url || null,
    categoryId: item.category_id || null,
    categoryName: item.category_name || null,
    unitPrice: Number(item.unit_price),
    costPrice: Number(item.cost_price),
    stockQuantity: Number(item.stock_quantity),
    reorderLevel: Number(item.reorder_level),
    alertLevel: Number(item.alert_level),
    allowNegativeStock: item.allow_negative_stock,
    isActive: item.is_active,
    isLowStock: item.is_low_stock,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function mapShopProfile(profile: BackendShopProfileResponse): ShopProfile {
  return {
    id: profile.id,
    shopName: profile.shop_name,
    addressLine1: profile.address_line1 || "",
    addressLine2: profile.address_line2 || "",
    phone: profile.phone || "",
    email: profile.email || "",
    website: profile.website || "",
    logoUrl: profile.logo_url || "",
    receiptFooter: profile.receipt_footer || "",
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

export async function bootstrapSession() {
  return request<BackendAuthSession>("/api/auth/me");
}

export async function login(username: string, password: string) {
  const payload = {
    username,
    password,
    device_code: getAuthDeviceCode(),
    device_name: "RetailFlow POS Web",
  };

  return request<BackendAuthSession>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function logout() {
  return request<{ message: string }>("/api/auth/logout", {
    method: "POST",
  });
}

export async function fetchProducts(query?: string) {
  const search = query ? `?q=${encodeURIComponent(query)}` : "";
  const response = await request<BackendProductSearchResponse>(`/api/products/search${search}`);
  return response.items.map(mapProduct);
}

export async function fetchProductCatalog(take = 200) {
  const response = await request<BackendProductCatalogResponse>(
    `/api/products/catalog?take=${Math.max(1, Math.min(200, take))}&include_inactive=false`
  );
  return response.items.map(mapCatalogProduct);
}

export async function fetchProductCatalogItems(take = 200, includeInactive = true) {
  const response = await request<BackendProductCatalogResponse>(
    `/api/products/catalog?take=${Math.max(1, Math.min(200, take))}&include_inactive=${includeInactive ? "true" : "false"}`
  );
  return response.items.map(mapCatalogProductItem);
}

export async function fetchCategories(includeInactive = false) {
  const query = `?include_inactive=${includeInactive ? "true" : "false"}`;
  const response = await request<BackendCategoryListResponse>(`/api/categories${query}`);
  return response.items;
}

export async function createCategory(requestBody: CreateCategoryRequest) {
  return request<BackendCategoryItem>("/api/categories", {
    method: "POST",
    body: JSON.stringify({
      description: requestBody.description ?? null,
      is_active: requestBody.is_active ?? true,
      name: requestBody.name,
    }),
  });
}

export async function createProduct(requestBody: CreateProductRequest) {
  const response = await request<BackendProductCatalogItem>("/api/products", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });

  return mapCatalogProduct(response);
}

export type ProductAiSuggestionTarget = "name" | "sku" | "barcode" | "image_url" | "category";

export type ProductAiSuggestionRequest = {
  target: ProductAiSuggestionTarget;
  name?: string | null;
  sku?: string | null;
  barcode?: string | null;
  image_url?: string | null;
  image_hint?: string | null;
  category_name?: string | null;
  category_options?: string[];
  unit_price?: number | null;
  cost_price?: number | null;
};

export type ProductAiSuggestionResponse = {
  target: ProductAiSuggestionTarget;
  suggestion: string;
  model: string;
  source: string;
};

export async function generateProductAiSuggestion(requestBody: ProductAiSuggestionRequest) {
  return request<ProductAiSuggestionResponse>("/api/ai/product-suggestions", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
}

export type ProductFromImageRequest = {
  image_url?: string | null;
  image_hint?: string | null;
  name?: string | null;
  sku?: string | null;
  barcode?: string | null;
  category_name?: string | null;
  category_options?: string[];
  unit_price?: number | null;
  cost_price?: number | null;
};

export type ProductFromImageResponse = {
  name?: string | null;
  sku?: string | null;
  barcode?: string | null;
  category?: string | null;
  source: string;
  model: string;
  details: ProductAiSuggestionResponse[];
};

export async function generateProductFromImageSuggestions(requestBody: ProductFromImageRequest) {
  return request<ProductFromImageResponse>("/api/ai/product-from-image", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
}

export type UpdateProductRequest = {
  name: string;
  sku?: string | null;
  barcode?: string | null;
  image_url?: string | null;
  category_id?: string | null;
  unit_price: number;
  cost_price: number;
  reorder_level: number;
  allow_negative_stock: boolean;
  is_active: boolean;
};

export async function updateProduct(productId: string, requestBody: UpdateProductRequest) {
  const response = await request<BackendProductCatalogItem>(`/api/products/${productId}`, {
    method: "PUT",
    body: JSON.stringify(requestBody),
  });

  return mapCatalogProduct(response);
}

export async function deleteProduct(productId: string) {
  return request<void>(`/api/products/${productId}`, {
    method: "DELETE",
  });
}

export async function fetchHeldBills() {
  const response = await request<HeldSalesResponse>("/api/checkout/held");
  const details = await Promise.all(
    response.items.map((item) => request<BackendSaleResponse>(`/api/checkout/held/${item.sale_id}`))
  );
  return details.map(mapSaleResponseToHeldBill);
}

export async function fetchRecentSales(take = 20) {
  const response = await request<RecentSalesResponse>(`/api/checkout/history?take=${take}`);
  const details = await Promise.all(
    response.items.map((item) => request<BackendSaleResponse>(`/api/receipts/${item.sale_id}`))
  );
  return details.map(mapSaleResponseToRecentSale);
}

export async function fetchHeldBill(saleId: string) {
  const response = await request<BackendSaleResponse>(`/api/checkout/held/${saleId}`);
  return mapSaleResponseToHeldBill(response);
}

export async function fetchCurrentCashSession() {
  const response = await request<BackendCashSessionResponse | null>("/api/cash-sessions/current");
  return response ? mapCashSessionResponse(response) : null;
}

export async function openCashSession(counts: DenominationCount[], total: number) {
  const payload = {
    counts: counts.map((item) => ({
      denomination: item.denomination,
      quantity: item.quantity,
    })),
    total,
  };

  const response = await request<BackendCashSessionResponse>("/api/cash-sessions/open", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return mapCashSessionResponse(response);
}

export async function closeCashSession(
  sessionId: string,
  counts: DenominationCount[],
  total: number,
  reason?: string
) {
  const payload = {
    counts: counts.map((item) => ({
      denomination: item.denomination,
      quantity: item.quantity,
    })),
    total,
    reason: reason || null,
  };

  const response = await request<BackendCashSessionResponse>(`/api/cash-sessions/${sessionId}/close`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return mapCashSessionResponse(response);
}

export async function holdSale(items: CartItem[], role: "admin" | "manager" | "cashier") {
  const payload: HoldSaleRequest = {
    items: items.map((item) => ({
      product_id: item.product.id,
      quantity: item.quantity,
    })),
    discount_percent: 0,
    role: toBackendRole(role),
  };

  return request<BackendSaleResponse>("/api/checkout/hold", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function completeSale(
  items: CartItem[],
  role: "admin" | "manager" | "cashier",
  paymentMethod: PaymentMethod,
  amount: number,
  saleId?: string,
  referenceNumber?: string
) {
  const payload: CreateSaleRequest = {
    sale_id: saleId,
    items: saleId
      ? []
      : items.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
        })),
    discount_percent: 0,
    role: toBackendRole(role),
    payments: [
      {
        method: paymentMethod,
        amount,
        reference_number: referenceNumber || null,
      },
    ],
  };

  return request<BackendSaleResponse>("/api/checkout/complete", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function voidSale(saleId: string) {
  return request<BackendSaleResponse>(`/api/checkout/${saleId}/void`, {
    method: "POST",
  });
}

export async function fetchReceipt(saleId: string) {
  return request<SaleReceiptResponse>(`/api/receipts/${saleId}`);
}

export function fetchReceiptHtmlUrl(saleId: string) {
  return `${API_BASE_URL}/api/receipts/${saleId}/html`;
}

export async function fetchThermalReceipt(saleId: string) {
  return request<string>(`/api/receipts/${saleId}/thermal`);
}

export async function fetchWhatsAppReceipt(saleId: string, phone?: string) {
  const query = phone ? `?phone=${encodeURIComponent(phone)}` : "";
  return request<{ message: string; url: string }>(`/api/receipts/${saleId}/whatsapp${query}`);
}

export async function fetchSaleRefundSummary(saleId: string) {
  return request<SaleRefundSummary>(`/api/refunds/sale/${saleId}`);
}

export async function createRefund(requestBody: CreateRefundRequest) {
  return request<RefundResponse>("/api/refunds", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
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

export async function fetchDailySalesReport(fromDate: Date | string = new Date(), toDate: Date | string = fromDate) {
  const from = formatDateQueryValue(fromDate);
  const to = formatDateQueryValue(toDate);
  return request<DailySalesReportResponse>(`/api/reports/daily?from=${from}&to=${to}`);
}

export async function fetchTransactionsReport(
  fromDate: Date | string = new Date(),
  toDate: Date | string = fromDate,
  take = 200
) {
  const from = formatDateQueryValue(fromDate);
  const to = formatDateQueryValue(toDate);
  return request<TransactionsReportResponse>(`/api/reports/transactions?from=${from}&to=${to}&take=${take}`);
}

export async function fetchPaymentBreakdownReport(
  fromDate: Date | string = new Date(),
  toDate: Date | string = fromDate
) {
  const from = formatDateQueryValue(fromDate);
  const to = formatDateQueryValue(toDate);
  return request<PaymentBreakdownReportResponse>(`/api/reports/payment-breakdown?from=${from}&to=${to}`);
}

export async function fetchTopItemsReport(
  fromDate: Date | string = new Date(),
  toDate: Date | string = fromDate,
  take = 10
) {
  const from = formatDateQueryValue(fromDate);
  const to = formatDateQueryValue(toDate);
  return request<TopItemsReportResponse>(`/api/reports/top-items?from=${from}&to=${to}&take=${take}`);
}

export async function fetchLowStockReport(take = 20, threshold = 5) {
  return request<LowStockReportResponse>(`/api/reports/low-stock?take=${take}&threshold=${threshold}`);
}

export async function createPurchaseOcrDraft(file: File, supplierHint?: string) {
  const formData = new FormData();
  formData.append("file", file);

  if (supplierHint?.trim()) {
    formData.append("supplier_hint", supplierHint.trim());
  }

  return request<PurchaseOcrDraftResponse>("/api/purchases/imports/ocr-draft", {
    method: "POST",
    body: formData,
  });
}

export async function confirmPurchaseImport(payload: PurchaseImportConfirmRequest) {
  return request<PurchaseImportConfirmResponse>("/api/purchases/imports/confirm", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchShopProfile() {
  const response = await request<BackendShopProfileResponse>("/api/settings/shop-profile");
  return mapShopProfile(response);
}

export async function updateShopProfile(profile: ShopProfile) {
  const response = await request<BackendShopProfileResponse>("/api/settings/shop-profile", {
    method: "PUT",
    body: JSON.stringify({
      shop_name: profile.shopName,
      address_line1: profile.addressLine1 || null,
      address_line2: profile.addressLine2 || null,
      phone: profile.phone || null,
      email: profile.email || null,
      website: profile.website || null,
      logo_url: profile.logoUrl || null,
      receipt_footer: profile.receiptFooter || null,
    }),
  });

  return mapShopProfile(response);
}
