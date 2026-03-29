import type { CartItem, HeldBill, PaymentMethod, Product, RecentSale } from "@/components/pos/types";

const DEFAULT_API_BASE_URL = "http://localhost:5080";

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

type BackendSaleResponse = {
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

type CreateProductRequest = {
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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
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

export async function fetchCategories(includeInactive = false) {
  const query = `?include_inactive=${includeInactive ? "true" : "false"}`;
  const response = await request<BackendCategoryListResponse>(`/api/categories${query}`);
  return response.items;
}

export async function createProduct(requestBody: CreateProductRequest) {
  return request<Record<string, unknown>>("/api/products", {
    method: "POST",
    body: JSON.stringify(requestBody),
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
  return request<BackendSaleResponse>(`/api/receipts/${saleId}`);
}

export async function fetchThermalReceipt(saleId: string) {
  return request<string>(`/api/receipts/${saleId}/thermal`);
}

export async function fetchWhatsAppReceipt(saleId: string, phone?: string) {
  const query = phone ? `?phone=${encodeURIComponent(phone)}` : "";
  return request<{ message: string; url: string }>(`/api/receipts/${saleId}/whatsapp${query}`);
}

export async function fetchDailySalesReport(date = new Date()) {
  const utcDate = date.toISOString().slice(0, 10);
  return request<DailySalesReportResponse>(`/api/reports/daily?from=${utcDate}&to=${utcDate}`);
}

export async function fetchTransactionsReport(date = new Date(), take = 200) {
  const utcDate = date.toISOString().slice(0, 10);
  return request<TransactionsReportResponse>(`/api/reports/transactions?from=${utcDate}&to=${utcDate}&take=${take}`);
}
