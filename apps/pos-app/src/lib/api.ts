import type { CartItem, HeldBill, PaymentMethod, Product, RecentSale, SelectedSerial } from "@/components/pos/types";
import type {
  CashSession,
  CashSessionEntry,
  DenominationCount,
} from "@/components/pos/cash-session/types";
import { buildDeviceActivationProof, buildDeviceRequestProof } from "@/lib/deviceIdentity";

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

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, "");
export const AUTH_SESSION_INVALIDATED_EVENT = "smartpos:auth-session-invalidated";
const DEFAULT_POS_VERSION = "1.0.0";
export const POS_CLIENT_VERSION = (import.meta.env.VITE_POS_VERSION || DEFAULT_POS_VERSION).trim() || DEFAULT_POS_VERSION;
const NON_INVALIDATING_AUTH_ERROR_CODES = new Set(["AI_CLOUD_RELAY_CONTEXT_RESOLUTION_FAILED"]);

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type BackendAuthSession = {
  user_id: string;
  username: string;
  full_name: string;
  role: string;
  session_id?: string;
  terminal_id?: string;
  device_id: string;
  device_code: string;
  expires_at: string;
};

type BackendLicenseErrorPayload = {
  message?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

type BackendLicenseStatus = {
  state: "unprovisioned" | "active" | "grace" | "suspended" | "revoked";
  shop_id?: string | null;
  terminal_id?: string;
  device_code: string;
  device_key_fingerprint?: string | null;
  subscription_status?: "trialing" | "active" | "past_due" | "canceled" | null;
  plan?: string | null;
  seat_limit?: number | null;
  active_seats?: number | null;
  valid_until?: string | null;
  grace_until?: string | null;
  license_token?: string | null;
  offline_grant_token?: string | null;
  offline_grant_expires_at?: string | null;
  offline_max_checkout_operations?: number | null;
  offline_max_refund_operations?: number | null;
  blocked_actions?: string[];
  server_time: string;
};

type BackendProvisionChallengeResponse = {
  challenge_id: string;
  terminal_id?: string;
  device_code: string;
  nonce: string;
  key_algorithm: string;
  issued_at: string;
  expires_at: string;
};

type BackendDeviceActionChallengeResponse = {
  challenge_id: string;
  terminal_id?: string;
  device_code: string;
  nonce: string;
  key_algorithm: string;
  issued_at: string;
  expires_at: string;
};

export type LicenseState = BackendLicenseStatus["state"];

export type LicenseStatus = {
  state: LicenseState;
  shopId?: string | null;
  terminalId: string;
  deviceCode: string;
  deviceKeyFingerprint?: string | null;
  subscriptionStatus?: BackendLicenseStatus["subscription_status"];
  plan?: string | null;
  seatLimit?: number | null;
  activeSeats?: number | null;
  validUntil?: Date | null;
  graceUntil?: Date | null;
  licenseToken?: string | null;
  offlineGrantToken?: string | null;
  offlineGrantExpiresAt?: Date | null;
  offlineMaxCheckoutOperations?: number | null;
  offlineMaxRefundOperations?: number | null;
  blockedActions: string[];
  serverTime: Date;
};

export type ActivateLicenseRequest = {
  terminalId?: string;
  deviceCode?: string;
  deviceName?: string;
  actor?: string;
  reason?: string;
  activationEntitlementKey?: string;
};

const TERMINAL_ID_STORAGE_KEY = "smartpos-terminal-id";
const DEVICE_CODE_STORAGE_KEY = "smartpos-device-code";
const LEGACY_LICENSE_TOKEN_STORAGE_KEY = "smartpos-license-token";
const DEFAULT_DEVICE_NAME = "Open Lanka POS Web";
const DEVICE_ID_HEADER = "X-Device-Id";
const TERMINAL_ID_HEADER = "X-Terminal-Id";
const DEVICE_CODE_HEADER = "X-Device-Code";
const POS_VERSION_HEADER = "X-POS-Version";
const DEVICE_NONCE_ID_HEADER = "X-Device-Nonce-Id";
const DEVICE_SIGNATURE_HEADER = "X-Device-Signature";
const DEVICE_TIMESTAMP_HEADER = "X-Device-Timestamp";
let inMemoryLicenseToken: string | null = null;
let hasMigratedLegacyLicenseToken = false;
const OFFLINE_SYNC_MESSAGE_MAP: Record<string, string> = {
  accepted: "Offline event accepted for processing.",
  offline_event_synced: "Offline event synced successfully.",
  duplicate_event_ignored: "Duplicate offline event ignored.",
  stock_update_applied: "Stock update applied.",
  stale_update_ignored_last_write_wins: "Stock update was stale and ignored.",
  stock_conflict_inventory_not_found: "Inventory not found for this stock update.",
  invalid_event_id: "Offline event ID is invalid.",
  invalid_event_type: "Offline event type is invalid.",
  invalid_payload_product_id: "Offline payload is missing a valid product.",
  invalid_payload_quantity: "Offline payload is missing a valid quantity.",
  offline_grant_required: "Offline grant is required. Reconnect and refresh license status.",
  offline_grant_expired: "Offline grant expired. Reconnect and refresh license status.",
  offline_grant_invalid: "Offline grant token is invalid. Reconnect and refresh license status.",
  offline_grant_device_mismatch: "Offline grant belongs to a different device.",
  offline_grant_device_key_mismatch: "Offline grant does not match this device key.",
  offline_grant_limit_exceeded: "Offline grant operation limit reached.",
  offline_grant_checkout_limit_exceeded: "Offline checkout limit reached for this grant window.",
  offline_grant_refund_limit_exceeded: "Offline refund limit reached for this grant window.",
};

type BackendProductSearchItem = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  image_url?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  brand_id?: string | null;
  brand_name?: string | null;
  unitPrice: number;
  costPrice: number;
  stockQuantity: number;
  is_low_stock?: boolean;
  is_serial_tracked?: boolean;
  has_pack_option?: boolean;
  pack_size?: number;
  pack_price?: number | null;
  pack_label?: string | null;
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
  brand_id?: string | null;
  brand_name?: string | null;
  unit_price: number;
  cost_price: number;
  stock_quantity: number;
  initial_stock_quantity?: number;
  reorder_level: number;
  safety_stock?: number;
  target_stock_level?: number;
  alert_level: number;
  allow_negative_stock: boolean;
  is_serial_tracked?: boolean;
  has_pack_option?: boolean;
  pack_size?: number;
  pack_price?: number | null;
  pack_label?: string | null;
  warranty_months?: number | null;
  is_batch_tracked?: boolean;
  expiry_alert_days?: number | null;
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
  product_id?: string | null;
  product_name: string;
  bundle_id?: string | null;
  bundle_name?: string | null;
  is_pack?: boolean;
  sale_pack_size?: number;
  pack_label?: string | null;
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
  custom_payout_used?: boolean;
  cash_short_amount?: number;
  items: BackendSaleItem[];
  payments: BackendSalePayment[];
};

type BackendSaleResponse = SaleReceiptResponse;

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
    item_type?: "product" | "bundle";
    product_id?: string | null;
    product_name: string;
    bundle_id?: string | null;
    bundle_name?: string | null;
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

type BackendBundleItem = {
  id: string;
  product_id?: string | null;
  item_name: string;
  quantity: number;
  notes?: string | null;
};

type BackendBundle = {
  id: string;
  name: string;
  barcode?: string | null;
  description?: string | null;
  price: number;
  stock_quantity: number;
  is_active: boolean;
  items: BackendBundleItem[];
};

type BackendBundleCatalogResponse = {
  items: BackendBundle[];
};

type BackendBundleSearchItem = {
  id: string;
  name: string;
  barcode?: string | null;
  price: number;
  stock_quantity: number;
};

type BackendBundleSearchResponse = {
  items: BackendBundleSearchItem[];
};

export type BundleItem = {
  id: string;
  product_id?: string | null;
  item_name: string;
  quantity: number;
  notes?: string | null;
};

export type Bundle = {
  id: string;
  name: string;
  barcode?: string | null;
  description?: string | null;
  price: number;
  stock_quantity: number;
  is_active: boolean;
  items: BundleItem[];
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

type BackendCashDrawer = {
  counts: BackendCashCount[];
  total: number;
  updated_at?: string | null;
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
  shift_number: number;
  status: string;
  opened_at: string;
  closed_at?: string | null;
  opening: BackendCashSessionEntry;
  drawer: BackendCashDrawer;
  closing?: BackendCashSessionEntry | null;
  expected_cash?: number | null;
  difference?: number | null;
  difference_reason?: string | null;
  cash_sales_total: number;
  audit_log: BackendCashSessionAuditEntry[];
};

type BackendCashSessionHistoryItem = {
  cash_session_id: string;
  shift_number: number;
  cashier_name: string;
  status: string;
  opened_at: string;
  closed_at?: string | null;
  opening_total: number;
  closing_total?: number | null;
  expected_cash?: number | null;
  difference?: number | null;
  cash_sales_total: number;
};

type BackendCashSessionHistoryResponse = {
  items: BackendCashSessionHistoryItem[];
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

export type Category = BackendCategoryItem & {
  id?: string;
  isActive?: boolean;
  productCount?: number;
  createdAt?: string;
  updatedAt?: string | null;
};

type BackendBrandItem = {
  brand_id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  is_active: boolean;
  product_count: number;
  can_delete?: boolean;
  delete_block_reason?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type BackendBrandListResponse = {
  items: BackendBrandItem[];
};

export type BrandRecord = {
  id: string;
  name: string;
  code: string;
  description: string;
  isActive: boolean;
  productCount: number;
  createdAt: string;
  updatedAt?: string | null;
};

export type Brand = BrandRecord & {
  brand_id: string;
  is_active: boolean;
  product_count: number;
  can_delete: boolean;
  delete_block_reason?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type CreateBrandRequest = {
  name: string;
  code?: string | null;
  description?: string | null;
  isActive?: boolean;
};

type BackendShopStockSettings = {
  id: string;
  store_id?: string | null;
  default_low_stock_threshold: number;
  threshold_multiplier: number;
  default_safety_stock: number;
  default_lead_time_days: number;
  default_target_days_of_cover: number;
  created_at: string;
  updated_at?: string | null;
};

export type ShopStockSettingsRecord = {
  id: string;
  storeId?: string | null;
  defaultLowStockThreshold: number;
  thresholdMultiplier: number;
  defaultSafetyStock: number;
  defaultLeadTimeDays: number;
  defaultTargetDaysOfCover: number;
  createdAt: string;
  updatedAt?: string | null;
};

export type UpdateShopStockSettingsRequest = {
  defaultLowStockThreshold: number;
  thresholdMultiplier: number;
  defaultSafetyStock: number;
  defaultLeadTimeDays: number;
  defaultTargetDaysOfCover: number;
};

type BackendShopProfileResponse = {
  id: string;
  shop_name: string;
  language?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
  receipt_footer?: string | null;
  show_new_item_for_cashier?: boolean;
  show_manage_for_cashier?: boolean;
  show_reports_for_cashier?: boolean;
  show_ai_insights_for_cashier?: boolean;
  show_held_bills_for_cashier?: boolean;
  show_reminders_for_cashier?: boolean;
  show_audit_trail_for_cashier?: boolean;
  show_end_shift_for_cashier?: boolean;
  show_today_sales_for_cashier?: boolean;
  show_import_bill_for_cashier?: boolean;
  show_shop_settings_for_cashier?: boolean;
  show_my_licenses_for_cashier?: boolean;
  show_offline_sync_for_cashier?: boolean;
  created_at: string;
  updated_at?: string | null;
};

export type CreateProductRequest = {
  name: string;
  sku?: string | null;
  barcode?: string | null;
  image_url?: string | null;
  category_id?: string | null;
  brand_id?: string | null;
  unit_price: number;
  cost_price: number;
  initial_stock_quantity: number;
  reorder_level: number;
  safety_stock: number;
  target_stock_level: number;
  allow_negative_stock: boolean;
  is_serial_tracked?: boolean;
  has_pack_option?: boolean;
  pack_size?: number;
  pack_price?: number | null;
  pack_label?: string | null;
  warranty_months?: number | null;
  is_batch_tracked?: boolean;
  expiry_alert_days?: number | null;
  is_active: boolean;
  product_suppliers?: {
    supplier_id: string;
    is_preferred: boolean;
  }[];
};

export type InventoryDashboardSummary = {
  expiry_alert_count: number;
  open_warranty_claims: number;
};

export type InventoryDashboard = InventoryDashboardSummary & {
  low_stock_count: number;
  open_stocktake_sessions: number;
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

export type StockMovement = {
  id: string;
  product_id: string;
  product_name: string;
  movement_type:
    | "Sale"
    | "Purchase"
    | "Refund"
    | "Adjustment"
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
  serial_id: string;
  serial_value: string;
  product_id: string;
  product_name: string;
  status: string;
  sale_id?: string;
  sale_item_id?: string;
  refund_id?: string;
  sale_date?: string;
  warranty_expiry_date?: string;
  product: Product;
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
  received_back_person_name?: string;
  created_at: string;
  updated_at?: string;
};

export type GenerateProductBarcodeRequest = {
  name?: string | null;
  sku?: string | null;
  seed?: string | null;
};

export type GenerateProductBarcodeResponse = {
  barcode: string;
  format: string;
  generated_at: string;
};

export type ValidateProductBarcodeRequest = {
  barcode: string;
  exclude_product_id?: string | null;
  check_existing?: boolean;
};

export type ValidateProductBarcodeResponse = {
  barcode: string;
  normalized_barcode: string;
  is_valid: boolean;
  format: string;
  message?: string | null;
  exists: boolean;
};

export type GenerateAndAssignProductBarcodeRequest = {
  force_replace?: boolean;
  seed?: string | null;
};

export type BulkGenerateMissingProductBarcodesRequest = {
  take?: number;
  include_inactive?: boolean;
  dry_run?: boolean;
};

export type BulkGenerateMissingProductBarcodeItem = {
  product_id: string;
  name: string;
  status: string;
  barcode?: string | null;
  message?: string | null;
};

export type BulkGenerateMissingProductBarcodesResponse = {
  dry_run: boolean;
  scanned: number;
  generated: number;
  would_generate: number;
  skipped_existing: number;
  failed: number;
  processed_at: string;
  items: BulkGenerateMissingProductBarcodeItem[];
};

export type CreateCategoryRequest = {
  name: string;
  description?: string | null;
  is_active?: boolean;
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
  can_delete?: boolean;
  delete_block_reason?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type BackendSupplierBrandItem = {
  brand_id: string;
  name: string;
};

type BackendSupplierListResponse = {
  items: BackendSupplierItem[];
};

export type SupplierRecord = {
  id: string;
  supplier_id: string;
  name: string;
  phone: string;
  companyName: string;
  company_name: string;
  companyPhone: string;
  company_phone: string;
  address: string;
  brands: SupplierBrand[];
  isActive: boolean;
  is_active: boolean;
  linkedProductCount: number;
  linked_product_count: number;
  can_delete: boolean;
  delete_block_reason?: string | null;
  createdAt: string;
  created_at: string;
  updatedAt?: string | null;
  updated_at?: string | null;
};

export type SupplierBrand = {
  brand_id: string;
  name: string;
};

export type Supplier = SupplierRecord;

export type CreateSupplierRequest = {
  name: string;
  phone?: string | null;
  company_name?: string | null;
  company_phone?: string | null;
  address?: string | null;
  isActive?: boolean;
  brand_ids?: string[];
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

type BackendProductSupplierListResponse = {
  items: BackendProductSupplierItem[];
};

type BackendUpsertProductSupplierRequest = {
  supplier_id: string;
  supplier_sku?: string | null;
  supplier_item_name?: string | null;
  is_preferred: boolean;
  lead_time_days?: number | null;
  min_order_qty?: number | null;
  pack_size?: number | null;
  last_purchase_price?: number | null;
  is_active: boolean;
};

export type ProductSupplierRecord = {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierSku: string;
  supplierItemName: string;
  isPreferred: boolean;
  leadTimeDays?: number | null;
  minOrderQty?: number | null;
  packSize?: number | null;
  lastPurchasePrice?: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string | null;
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

function mapProductSupplier(item: BackendProductSupplierItem): ProductSupplierRecord {
  return {
    id: item.product_supplier_id,
    supplierId: item.supplier_id,
    supplierName: item.supplier_name,
    supplierSku: item.supplier_sku ?? "",
    supplierItemName: item.supplier_item_name ?? "",
    isPreferred: item.is_preferred,
    leadTimeDays: item.lead_time_days ?? null,
    minOrderQty: item.min_order_qty ?? null,
    packSize: item.pack_size ?? null,
    lastPurchasePrice: item.last_purchase_price ?? null,
    isActive: item.is_active,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    product_supplier_id: item.product_supplier_id,
    supplier_id: item.supplier_id,
    supplier_name: item.supplier_name,
    supplier_sku: item.supplier_sku ?? null,
    supplier_item_name: item.supplier_item_name ?? null,
    is_preferred: item.is_preferred,
    lead_time_days: item.lead_time_days ?? null,
    min_order_qty: item.min_order_qty ?? null,
    pack_size: item.pack_size ?? null,
    last_purchase_price: item.last_purchase_price ?? null,
    is_active: item.is_active,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

export type CatalogProduct = {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  image?: string;
  imageUrl?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  brandId?: string | null;
  brandName?: string | null;
  unitPrice: number;
  costPrice: number;
  stockQuantity: number;
  initialStockQuantity?: number;
  reorderLevel: number;
  alertLevel: number;
  allowNegativeStock: boolean;
  isSerialTracked?: boolean;
  hasPackOption?: boolean;
  packSize?: number | null;
  packPrice?: number | null;
  packLabel?: string | null;
  warrantyMonths?: number | null;
  isBatchTracked?: boolean;
  expiryAlertDays?: number | null;
  safetyStock?: number;
  targetStockLevel?: number;
  isActive: boolean;
  isLowStock: boolean;
  createdAt: string;
  updatedAt?: string | null;
};

export type Product = CatalogProduct & {
  product_id: string;
  image_url?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  brand_id?: string | null;
  brand_name?: string | null;
  unit_price: number;
  cost_price: number;
  stock_quantity: number;
  initial_stock_quantity?: number;
  reorder_level: number;
  safety_stock?: number;
  target_stock_level?: number;
  alert_level: number;
  allow_negative_stock: boolean;
  is_serial_tracked?: boolean;
  has_pack_option?: boolean;
  pack_size?: number | null;
  pack_price?: number | null;
  pack_label?: string | null;
  warranty_months?: number | null;
  is_batch_tracked?: boolean;
  expiry_alert_days?: number | null;
  is_active: boolean;
  is_low_stock: boolean;
  created_at: string;
  updated_at?: string | null;
  product_suppliers?: ProductSupplierRecord[];
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
  extraction_provider?: string | null;
  extraction_model?: string | null;
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
  language: ShopProfileLanguage;
  addressLine1: string;
  addressLine2: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
  receiptFooter: string;
  showNewItemForCashier: boolean;
  showManageForCashier: boolean;
  showReportsForCashier: boolean;
  showAiInsightsForCashier: boolean;
  showHeldBillsForCashier: boolean;
  showRemindersForCashier: boolean;
  showAuditTrailForCashier: boolean;
  showEndShiftForCashier: boolean;
  showTodaySalesForCashier: boolean;
  showImportBillForCashier: boolean;
  showShopSettingsForCashier: boolean;
  showMyLicensesForCashier: boolean;
  showOfflineSyncForCashier: boolean;
  createdAt: string;
  updatedAt?: string | null;
};

export type ShopProfileLanguage = "english" | "sinhala" | "tamil";

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
    custom_payout_used?: boolean;
    cash_short_amount?: number;
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
      item_type?: "product" | "bundle" | "unknown";
      product_id?: string | null;
      product_name: string;
      bundle_id?: string | null;
      bundle_name?: string | null;
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
    item_type?: "product" | "bundle" | "unknown";
    product_id?: string | null;
    bundle_id?: string | null;
    bundle_name?: string | null;
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

type WorstItemsReportResponse = {
  from_date: string;
  to_date: string;
  take: number;
  items: {
    item_type?: "product" | "bundle" | "unknown";
    product_id?: string | null;
    bundle_id?: string | null;
    bundle_name?: string | null;
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
    item_type?: "product" | "bundle" | "unknown";
    product_id?: string | null;
    bundle_id?: string | null;
    bundle_name?: string | null;
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

type SupportTriageReportResponse = {
  generated_at: string;
  window_minutes: number;
  devices: {
    active_devices: number;
    grace_devices: number;
    suspended_devices: number;
    revoked_devices: number;
    devices_without_license: number;
  };
  shops: {
    active_shops: number;
    grace_shops: number;
    suspended_shops: number;
    revoked_shops: number;
    shops_with_missing_license: number;
  };
  activity: {
    activations_in_window: number;
    deactivations_in_window: number;
    heartbeats_in_window: number;
  };
  alerts: {
    validation_failures_in_window: number;
    webhook_failures_in_window: number;
    security_anomalies_in_window: number;
    auth_impossible_travel_signals_in_window: number;
    auth_concurrent_device_signals_in_window: number;
    sensitive_action_proof_failures_in_window: number;
    devices_with_unusual_source_changes_in_window: number;
    top_validation_failures: {
      reason: string;
      count: number;
    }[];
    top_webhook_failures: {
      reason: string;
      count: number;
    }[];
    top_security_anomalies: {
      reason: string;
      count: number;
    }[];
    top_sensitive_action_failure_sources: {
      reason: string;
      count: number;
    }[];
    last_validation_alert_at?: string | null;
    last_webhook_alert_at?: string | null;
    last_security_alert_at?: string | null;
  };
  recent_audit_events: {
    timestamp: string;
    action: string;
    actor: string;
    device_code?: string | null;
    reason?: string | null;
    source_ip?: string | null;
    source_ip_prefix?: string | null;
    source_user_agent_family?: string | null;
    source_fingerprint?: string | null;
  }[];
};

export type AdminShopsLicensingSnapshotResponse = {
  generated_at: string;
  items: {
    shop_id: string;
    shop_code: string;
    shop_name: string;
    subscription_status: string;
    plan: string;
    seat_limit: number;
    active_seats: number;
    total_devices: number;
    latest_activation_entitlement?: ActivationEntitlement | null;
    devices: {
      provisioned_device_id: string;
      device_code: string;
      device_name: string;
      device_status: string;
      license_state: string;
      valid_until?: string | null;
      grace_until?: string | null;
      last_heartbeat_at?: string | null;
    }[];
  }[];
};

export type AdminAuditLogsResponse = {
  generated_at: string;
  count: number;
  items: {
    id: string;
    timestamp: string;
    shop_id?: string | null;
    device_id?: string | null;
    action: string;
    actor: string;
    reason?: string | null;
    metadata_json?: string | null;
    is_manual_override: boolean;
    immutable_hash?: string | null;
    immutable_previous_hash?: string | null;
  }[];
};

export type AdminDeviceActionResponse = {
  shop_id: string;
  device_code: string;
  action: string;
  status: string;
  license_state: string;
  valid_until?: string | null;
  grace_until?: string | null;
  processed_at: string;
};

export type AdminDeviceSeatTransferResponse = {
  device_code: string;
  action: string;
  source_shop_id: string;
  source_shop_code: string;
  target_shop_id: string;
  target_shop_code: string;
  status: string;
  license_state: string;
  valid_until?: string | null;
  grace_until?: string | null;
  processed_at: string;
};

export type AdminMassDeviceRevokeResponse = {
  action: string;
  requested_count: number;
  revoked_count: number;
  already_revoked_count: number;
  items: AdminDeviceActionResponse[];
  processed_at: string;
};

export type AdminEmergencyCommandEnvelopeResponse = {
  command_id: string;
  device_code: string;
  action: "lock_device" | "revoke_token" | "force_reauth" | string;
  envelope_token: string;
  issued_at: string;
  expires_at: string;
};

export type AdminEmergencyCommandExecuteResponse = {
  device_code: string;
  action: "lock_device" | "revoke_token" | "force_reauth" | string;
  status: string;
  revoked_token_sessions: number;
  processed_at: string;
};

export type AdminLicenseResyncResponse = {
  shop_id: string;
  shop_code: string;
  subscription_status: string;
  plan: string;
  reissued_devices: number;
  revoked_licenses: number;
  processed_at: string;
};

export type AdminManualBillingInvoiceRow = {
  invoice_id: string;
  shop_id: string;
  shop_code: string;
  invoice_number: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: "open" | "pending_verification" | "paid" | "overdue" | "canceled";
  due_at: string;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type AdminManualBillingInvoicesResponse = {
  generated_at: string;
  count: number;
  items: AdminManualBillingInvoiceRow[];
};

export type CreateAdminManualBillingInvoiceRequest = {
  shop_code?: string;
  invoice_number?: string;
  amount_due: number;
  currency?: string;
  due_at?: string;
  notes?: string;
  actor?: string;
  reason_code?: string;
  actor_note?: string;
};

export type AdminManualBillingPaymentRow = {
  payment_id: string;
  shop_id: string;
  shop_code: string;
  invoice_id: string;
  invoice_number: string;
  method: "cash" | "bank_deposit" | "bank_transfer";
  amount: number;
  currency: string;
  status: "pending_verification" | "verified" | "rejected";
  bank_reference?: string | null;
  received_at: string;
  notes?: string | null;
  recorded_by?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type AdminManualBillingPaymentsResponse = {
  generated_at: string;
  count: number;
  items: AdminManualBillingPaymentRow[];
};

export type RecordAdminManualBillingPaymentRequest = {
  invoice_id?: string;
  invoice_number?: string;
  method: "cash" | "bank_deposit" | "bank_transfer";
  amount: number;
  currency?: string;
  bank_reference?: string;
  received_at?: string;
  notes?: string;
  actor?: string;
  reason_code?: string;
  actor_note?: string;
};

export type VerifyAdminManualBillingPaymentRequest = {
  extend_days?: number;
  plan?: string;
  seat_limit?: number;
  customer_email?: string;
  actor?: string;
  reason?: string;
  reason_code: string;
  actor_note: string;
};

export type RejectAdminManualBillingPaymentRequest = {
  actor?: string;
  reason?: string;
  reason_code: string;
  actor_note: string;
};

export type AdminManualBillingPaymentVerificationResponse = {
  payment: AdminManualBillingPaymentRow;
  invoice: AdminManualBillingInvoiceRow;
  subscription_status: string;
  plan: string;
  seat_limit: number;
  period_end: string;
  activation_entitlement?: ActivationEntitlement | null;
  access_delivery?: LicenseAccessDeliveryResponse | null;
  processed_at: string;
};

export type GenerateAdminManualBillingLicenseCodeRequest = {
  actor?: string;
  reason?: string;
  reason_code: string;
  actor_note: string;
};

export type AdminManualBillingPaymentLicenseCodeGenerateResponse = {
  payment: AdminManualBillingPaymentRow;
  invoice: AdminManualBillingInvoiceRow;
  activation_entitlement: ActivationEntitlement;
  revoked_entitlements_count: number;
  processed_at: string;
};

export type ActivationEntitlement = {
  entitlement_id: string;
  shop_id: string;
  shop_code: string;
  activation_entitlement_key: string;
  source: string;
  source_reference?: string | null;
  status: string;
  max_activations: number;
  activations_used: number;
  issued_by?: string | null;
  issued_at: string;
  expires_at: string;
  last_used_at?: string | null;
  revoked_at?: string | null;
};

export type LicenseAccessEmailDeliveryResult = {
  recipient_email?: string | null;
  status: "sent" | "skipped" | "failed" | string;
  reason?: string | null;
  processed_at: string;
};

export type LicenseAccessDeliveryResponse = {
  shop_id: string;
  shop_code: string;
  success_page_url: string;
  email_delivery: LicenseAccessEmailDeliveryResult;
  processed_at: string;
};

export type LicenseAccessSuccessResponse = {
  generated_at: string;
  shop_id: string;
  shop_code: string;
  shop_name: string;
  subscription_status: string;
  plan: string;
  seat_limit: number;
  entitlement_state: "active" | "consumed" | "expired" | "revoked" | string;
  can_activate: boolean;
  installer_download_url?: string | null;
  installer_download_expires_at?: string | null;
  installer_download_protected?: boolean;
  installer_checksum_sha256?: string | null;
  activation_entitlement: ActivationEntitlement;
};

export type LicenseAccessDownloadTrackResponse = {
  tracked_at: string;
  shop_code: string;
  activation_entitlement_key: string;
  source: string;
  channel: string;
  payment_id?: string | null;
  invoice_id?: string | null;
  invoice_number?: string | null;
};

export type CustomerLicensePortalDevice = {
  provisioned_device_id: string;
  terminal_id?: string | null;
  device_code: string;
  device_name: string;
  device_status: "active" | "revoked" | string;
  license_state: "unprovisioned" | "active" | "grace" | "suspended" | "revoked" | string;
  assigned_at: string;
  last_heartbeat_at?: string | null;
  valid_until?: string | null;
  grace_until?: string | null;
  is_current_device: boolean;
};

export type CustomerLicensePortalResponse = {
  generated_at: string;
  shop_id: string;
  shop_code: string;
  shop_name: string;
  subscription_status: string;
  plan: string;
  seat_limit: number;
  active_seats: number;
  self_service_deactivation_limit_per_day: number;
  self_service_deactivations_used_today: number;
  self_service_deactivations_remaining_today: number;
  can_deactivate_more_devices_today: boolean;
  latest_activation_entitlement?: ActivationEntitlement | null;
  devices: CustomerLicensePortalDevice[];
};

export type CustomerSelfServiceDeviceDeactivationResponse = {
  shop_id: string;
  shop_code: string;
  device_code: string;
  status: string;
  reason: string;
  deactivations_used_today: number;
  deactivation_limit_per_day: number;
  deactivations_remaining_today: number;
  processed_at: string;
};

export type AdminManualBillingReconciliationAlertRow = {
  code: string;
  severity: "info" | "warning" | "critical" | string;
  message: string;
  count: number;
};

export type AdminManualBillingReconciliationItemRow = {
  payment_id: string;
  shop_code: string;
  invoice_number: string;
  method: "bank_deposit" | "bank_transfer";
  amount: number;
  currency: string;
  status: "pending_verification" | "verified" | "rejected";
  bank_reference?: string | null;
  received_at: string;
  recorded_by?: string | null;
  verified_by?: string | null;
  mismatch_flags: string[];
};

export type AdminManualBillingDailyReconciliationResponse = {
  date: string;
  window_start: string;
  window_end: string;
  currency: string;
  expected_bank_total?: number | null;
  recorded_bank_total: number;
  verified_bank_total: number;
  pending_bank_total: number;
  rejected_bank_total: number;
  mismatch_amount?: number | null;
  has_mismatch: boolean;
  mismatch_reasons: string[];
  alert_count: number;
  alerts: AdminManualBillingReconciliationAlertRow[];
  count: number;
  items: AdminManualBillingReconciliationItemRow[];
  generated_at: string;
};

export type AdminBillingStateReconciliationSubscriptionRow = {
  shop_id: string;
  shop_code: string;
  subscription_id?: string | null;
  customer_id?: string | null;
  period_end: string;
  previous_status: string;
  reconciled_status: string;
  reason: string;
  applied: boolean;
  error?: string | null;
};

export type AdminBillingStateReconciliationWebhookFailureRow = {
  event_id: string;
  event_type: string;
  status: string;
  shop_id?: string | null;
  shop_code?: string | null;
  subscription_id?: string | null;
  last_error_code?: string | null;
  received_at: string;
  updated_at?: string | null;
};

export type RunAdminBillingStateReconciliationRequest = {
  dry_run?: boolean;
  take?: number;
  webhook_failure_take?: number;
  actor?: string;
  reason?: string;
  reason_code?: string;
  actor_note?: string;
};

export type AdminBillingStateReconciliationRunResponse = {
  generated_at: string;
  source: string;
  dry_run: boolean;
  actor: string;
  reason: string;
  period_end_grace_hours: number;
  webhook_failure_lookback_hours: number;
  billing_subscriptions_scanned: number;
  drift_candidates: number;
  subscriptions_reconciled: number;
  webhook_failures_detected: number;
  subscription_updates: AdminBillingStateReconciliationSubscriptionRow[];
  failed_webhook_events: AdminBillingStateReconciliationWebhookFailureRow[];
};

type BackendSyncEventsRequest = {
  device_id?: string | null;
  offline_grant_token?: string | null;
  events: BackendSyncEventRequestItem[];
};

type BackendSyncEventRequestItem = {
  event_id: string;
  store_id?: string | null;
  device_id?: string | null;
  device_timestamp: string;
  type: "sale" | "refund" | "stock_update";
  payload: Record<string, unknown>;
};

type BackendSyncEventsResponse = {
  results: BackendSyncEventResult[];
};

type BackendSyncEventResult = {
  event_id: string;
  status: string;
  server_timestamp?: string | null;
  message?: string | null;
};

export type SyncEventType = "sale" | "refund" | "stock_update";

export type SyncEventRequestItem = {
  eventId: string;
  storeId?: string | null;
  deviceId?: string | null;
  deviceTimestamp: Date | string;
  type: SyncEventType;
  payload: Record<string, unknown>;
};

export type SyncEventResultStatus = "pending" | "synced" | "conflict" | "rejected";

export type SyncEventResult = {
  eventId: string;
  status: SyncEventResultStatus;
  serverTimestamp?: Date | null;
  message?: string | null;
  displayMessage?: string | null;
};

export type SyncEventsResponse = {
  results: SyncEventResult[];
};

export type SyncEventsRequestOptions = {
  deviceId?: string | null;
  offlineGrantToken?: string | null;
};

type CreateSaleRequest = {
  sale_id?: string;
  items?: {
    product_id?: string | null;
    bundle_id?: string | null;
    quantity: number;
    is_pack_sale?: boolean;
    serial_number_id?: string;
    sale_item_id?: string;
  }[];
  discount_percent?: number;
  customer_id?: string;
  role: string;
  payments: { method: string; amount: number; reference_number?: string | null }[];
  cash_received_counts?: { denomination: number; quantity: number }[];
  cash_change_counts?: { denomination: number; quantity: number }[];
  custom_payout_used?: boolean;
  cash_short_amount?: number;
};

type HoldSaleRequest = {
  items: {
    product_id?: string | null;
    bundle_id?: string | null;
    quantity: number;
    is_pack_sale?: boolean;
    serial_number_id?: string;
  }[];
  discount_percent: number;
  role: string;
};

export function getStoredLicenseToken() {
  if (typeof window === "undefined") {
    return null;
  }

  migrateLegacyLicenseTokenOnce();
  const token = inMemoryLicenseToken?.trim();
  return token || null;
}

function setStoredLicenseToken(token?: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  migrateLegacyLicenseTokenOnce();
  if (!token || !token.trim()) {
    inMemoryLicenseToken = null;
    localStorage.removeItem(LEGACY_LICENSE_TOKEN_STORAGE_KEY);
    return;
  }

  inMemoryLicenseToken = token.trim();
  localStorage.removeItem(LEGACY_LICENSE_TOKEN_STORAGE_KEY);
}

function migrateLegacyLicenseTokenOnce() {
  if (typeof window === "undefined" || hasMigratedLegacyLicenseToken) {
    return;
  }

  hasMigratedLegacyLicenseToken = true;
  const legacyToken = localStorage.getItem(LEGACY_LICENSE_TOKEN_STORAGE_KEY)?.trim();
  if (legacyToken) {
    inMemoryLicenseToken = legacyToken;
  }

  localStorage.removeItem(LEGACY_LICENSE_TOKEN_STORAGE_KEY);
}

export function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `idemp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getAuthTerminalId() {
  if (typeof window === "undefined") {
    return "server-terminal";
  }

  const existing = localStorage.getItem(TERMINAL_ID_STORAGE_KEY) || localStorage.getItem(DEVICE_CODE_STORAGE_KEY);
  if (existing?.trim()) {
    localStorage.setItem(TERMINAL_ID_STORAGE_KEY, existing.trim());
    localStorage.removeItem(DEVICE_CODE_STORAGE_KEY);
    return existing;
  }

  const generated =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  localStorage.setItem(TERMINAL_ID_STORAGE_KEY, generated);
  return generated;
}

function getAuthDeviceCode() {
  return getAuthTerminalId();
}

function mapLicenseStatus(status: BackendLicenseStatus): LicenseStatus {
  const resolvedTerminalId = status.terminal_id || status.device_code || getAuthTerminalId();
  return {
    state: status.state,
    shopId: status.shop_id ?? null,
    terminalId: resolvedTerminalId,
    deviceCode: resolvedTerminalId,
    deviceKeyFingerprint: status.device_key_fingerprint ?? null,
    subscriptionStatus: status.subscription_status ?? null,
    plan: status.plan ?? null,
    seatLimit: status.seat_limit ?? null,
    activeSeats: status.active_seats ?? null,
    validUntil: status.valid_until ? new Date(status.valid_until) : null,
    graceUntil: status.grace_until ? new Date(status.grace_until) : null,
    licenseToken: status.license_token ?? null,
    offlineGrantToken: status.offline_grant_token ?? null,
    offlineGrantExpiresAt: status.offline_grant_expires_at ? new Date(status.offline_grant_expires_at) : null,
    offlineMaxCheckoutOperations: status.offline_max_checkout_operations ?? null,
    offlineMaxRefundOperations: status.offline_max_refund_operations ?? null,
    blockedActions: Array.isArray(status.blocked_actions) ? status.blocked_actions : [],
    serverTime: new Date(status.server_time),
  };
}

function normalizeOptionalString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const LICENSE_TOKEN_RECOVERY_ERROR_CODES = new Set([
  "INVALID_LICENSE_TOKEN",
  "INVALID_TOKEN",
  "DEVICE_MISMATCH",
  "DEVICE_KEY_MISMATCH",
  "TOKEN_REPLAY_DETECTED",
]);

function isLicenseTokenRecoveryErrorCode(code?: string) {
  return !!code && LICENSE_TOKEN_RECOVERY_ERROR_CODES.has(code.trim().toUpperCase());
}

function requiresOfflineGrant(events: SyncEventRequestItem[]) {
  return events.some((item) => item.type === "sale" || item.type === "refund");
}

function normalizeSyncEventStatus(status: string): SyncEventResultStatus {
  const normalized = status.trim().toLowerCase();
  if (normalized === "pending" || normalized === "synced" || normalized === "conflict" || normalized === "rejected") {
    return normalized;
  }

  return "rejected";
}

function mapSyncEventRequestItem(item: SyncEventRequestItem): BackendSyncEventRequestItem {
  return {
    event_id: item.eventId,
    store_id: item.storeId ?? null,
    device_id: item.deviceId ?? null,
    device_timestamp:
      typeof item.deviceTimestamp === "string"
        ? item.deviceTimestamp
        : item.deviceTimestamp.toISOString(),
    type: item.type,
    payload: item.payload ?? {},
  };
}

function mapSyncEventResult(item: BackendSyncEventResult): SyncEventResult {
  return {
    eventId: item.event_id,
    status: normalizeSyncEventStatus(item.status || ""),
    serverTimestamp: item.server_timestamp ? new Date(item.server_timestamp) : null,
    message: item.message ?? null,
    displayMessage: mapOfflineSyncEventMessage(item.message),
  };
}

export function mapOfflineSyncEventMessage(message?: string | null) {
  const normalized = message?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (OFFLINE_SYNC_MESSAGE_MAP[normalized]) {
    return OFFLINE_SYNC_MESSAGE_MAP[normalized];
  }

  return normalized.replace(/_/g, " ");
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const raw = response.status === 204 ? "" : await response.text();

  if (!response.ok) {
    let message = response.statusText || "Request failed";
    let code: string | undefined;
    if (raw) {
      try {
        const payload = JSON.parse(raw) as BackendLicenseErrorPayload;
        if (payload.error?.message) {
          message = payload.error.message;
        } else if (payload.message) {
          message = payload.message;
        }

        if (payload.error?.code) {
          code = payload.error.code;
        }
      } catch {
        message = raw;
      }
    }

    throw new ApiError(message, response.status, code);
  }

  if (!raw) {
    return undefined as T;
  }

  if (contentType.includes("application/json")) {
    return JSON.parse(raw) as T;
  }

  return raw as T;
}

function isSensitiveMutationPath(path: string, method: string) {
  if (method !== "POST" && method !== "PUT" && method !== "PATCH" && method !== "DELETE") {
    return false;
  }

  return (
    path.startsWith("/api/checkout") ||
    path.startsWith("/api/refunds") ||
    path.startsWith("/api/admin")
  );
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function computeBodyHash(body: BodyInit | null | undefined): Promise<string | null> {
  if (typeof crypto === "undefined" || typeof crypto.subtle === "undefined") {
    return null;
  }

  const encoder = new TextEncoder();
  if (!body) {
    return sha256Hex(encoder.encode(""));
  }

  if (typeof body === "string") {
    return sha256Hex(encoder.encode(body));
  }

  if (body instanceof URLSearchParams) {
    return sha256Hex(encoder.encode(body.toString()));
  }

  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return sha256Hex(new Uint8Array(await body.arrayBuffer()));
  }

  if (body instanceof ArrayBuffer) {
    return sha256Hex(new Uint8Array(body));
  }

  if (ArrayBuffer.isView(body)) {
    return sha256Hex(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return null;
  }

  return null;
}

type RequestExecutionOptions = {
  skipDeviceProof?: boolean;
  deviceProofRecoveryAttempted?: boolean;
  licenseTokenRecoveryAttempted?: boolean;
};

function notifyAuthSessionInvalidated() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(AUTH_SESSION_INVALIDATED_EVENT));
}

function shouldInvalidateAuthSession(error: ApiError) {
  if (error.status !== 401) {
    return false;
  }

  if (error.code && NON_INVALIDATING_AUTH_ERROR_CODES.has(error.code)) {
    return false;
  }

  return true;
}

async function request<T>(path: string, init: RequestInit = {}, options: RequestExecutionOptions = {}) {
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  const terminalId = getAuthTerminalId();
  const licenseToken = getStoredLicenseToken();
  const method = (init.method || "GET").toUpperCase();
  const isMutation = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
  const isSensitiveMutation = isSensitiveMutationPath(path, method);
  const existingHeaders = new Headers(init.headers || {});
  if (isMutation && !existingHeaders.has("Idempotency-Key")) {
    existingHeaders.set("Idempotency-Key", createIdempotencyKey());
  }

  if (!options.skipDeviceProof && isSensitiveMutation) {
    const bodyHash = await computeBodyHash(init.body);
    if (bodyHash) {
      try {
        const challenge = await request<BackendDeviceActionChallengeResponse>(
          "/api/security/challenge",
          {
            method: "POST",
            body: JSON.stringify({
              device_code: terminalId,
              terminal_id: terminalId,
            }),
          },
          { skipDeviceProof: true }
        );

        const timestampUnix = Math.floor(Date.now() / 1000);
        const proof = await buildDeviceRequestProof({
          nonceId: challenge.challenge_id,
          nonce: challenge.nonce,
          deviceCode: terminalId,
          timestampUnix,
          method,
          pathAndQuery: path,
          bodyHash,
        });

        if (proof) {
          existingHeaders.set(DEVICE_NONCE_ID_HEADER, challenge.challenge_id);
          existingHeaders.set(DEVICE_SIGNATURE_HEADER, proof.signature);
          existingHeaders.set(DEVICE_TIMESTAMP_HEADER, String(timestampUnix));
        }
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) {
          throw error;
        }
      }
    }
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        ...(init.body && !isFormData ? { "Content-Type": "application/json" } : {}),
        [TERMINAL_ID_HEADER]: terminalId,
        [DEVICE_ID_HEADER]: terminalId,
        [DEVICE_CODE_HEADER]: terminalId,
        [POS_VERSION_HEADER]: POS_CLIENT_VERSION,
        ...(licenseToken ? { "X-License-Token": licenseToken } : {}),
        ...Object.fromEntries(existingHeaders.entries()),
      },
    });

    return await parseResponse<T>(response);
  } catch (error) {
    if (error instanceof ApiError && shouldInvalidateAuthSession(error)) {
      notifyAuthSessionInvalidated();
    }

    if (
      error instanceof ApiError &&
      isLicenseTokenRecoveryErrorCode(error.code) &&
      !options.licenseTokenRecoveryAttempted &&
      !path.startsWith("/api/license/status") &&
      !path.startsWith("/api/license/heartbeat") &&
      !path.startsWith("/api/provision/activate")
    ) {
      const retryHeaders = {
        ...Object.fromEntries(new Headers(init.headers || {}).entries()),
        ...(existingHeaders.get("Idempotency-Key")
          ? { "Idempotency-Key": existingHeaders.get("Idempotency-Key") as string }
          : {}),
      };

      // Stale X-License-Token headers can override a valid HttpOnly cookie and trigger replay errors.
      setStoredLicenseToken(null);
      try {
        await fetchLicenseStatus();
      } catch {
        // Retry once anyway so cookie-only validation can proceed when available.
      }

      return request<T>(
        path,
        {
          ...init,
          headers: retryHeaders,
        },
        {
          ...options,
          licenseTokenRecoveryAttempted: true,
        }
      );
    }

    if (
      error instanceof ApiError &&
      error.code === "DEVICE_KEY_MISMATCH" &&
      isSensitiveMutation &&
      !options.skipDeviceProof &&
      !options.deviceProofRecoveryAttempted
    ) {
      const retryHeaders = {
        ...Object.fromEntries(new Headers(init.headers || {}).entries()),
        "Idempotency-Key": existingHeaders.get("Idempotency-Key") || createIdempotencyKey(),
      };

      try {
        return await request<T>(
          path,
          {
            ...init,
            headers: retryHeaders,
          },
          {
            ...options,
            skipDeviceProof: true,
            deviceProofRecoveryAttempted: true,
          }
        );
      } catch (retryError) {
        if (
          retryError instanceof ApiError &&
          retryError.code === "DEVICE_PROOF_REQUIRED" &&
          !path.startsWith("/api/admin")
        ) {
          await activateLicense({
            terminalId,
            actor: "pos-web-ui",
            reason: "device_proof_rebind",
          });

          return request<T>(
            path,
            {
              ...init,
              headers: retryHeaders,
            },
            {
              ...options,
              deviceProofRecoveryAttempted: true,
            }
          );
        }

        throw retryError;
      }
    }

    throw error;
  }
}

export async function requestJson<T>(path: string, init: RequestInit = {}) {
  return request<T>(path, init);
}

async function safeRequest<T>(path: string, fallback: T, init: RequestInit = {}, options: RequestExecutionOptions = {}) {
  try {
    return await request<T>(path, init, options);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 405 || error.status === 501)) {
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

function mapBackendRole(role: string): "admin" | "manager" | "cashier" {
  const normalizedRole = role.toLowerCase();

  if (
    normalizedRole === "owner" ||
    normalizedRole === "super_admin" ||
    normalizedRole === "support" ||
    normalizedRole === "billing_admin" ||
    normalizedRole === "security_admin"
  ) {
    return "admin";
  }

  if (normalizedRole === "manager") {
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

function resolveImageUrl(imageUrl?: string | null) {
  if (!imageUrl) {
    return undefined;
  }

  if (/^(https?:|data:|blob:)/i.test(imageUrl)) {
    return imageUrl;
  }

  if (imageUrl.startsWith("/")) {
    return `${API_BASE_URL}${imageUrl}`;
  }

  return imageUrl;
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
    product_id: item.id,
    name: item.name,
    sku: item.sku || item.id.slice(0, 8),
    barcode: item.barcode || undefined,
    imageUrl: item.image_url || null,
    image_url: item.image_url || null,
    price: Number(item.unitPrice),
    unitPrice: Number(item.unitPrice),
    unit_price: Number(item.unitPrice),
    costPrice: Number(item.costPrice),
    category: item.category_name || undefined,
    category_id: item.category_id || null,
    categoryId: item.category_id || undefined,
    categoryName: item.category_name || undefined,
    category_name: item.category_name || null,
    brandId: item.brand_id || undefined,
    brandName: item.brand_name || undefined,
    brand_id: item.brand_id || null,
    brand_name: item.brand_name || null,
    isLowStock: item.is_low_stock ?? undefined,
    is_low_stock: item.is_low_stock ?? false,
    isSerialTracked: item.is_serial_tracked ?? false,
    is_serial_tracked: item.is_serial_tracked ?? false,
    hasPackOption: item.has_pack_option ?? false,
    has_pack_option: item.has_pack_option ?? false,
    packSize: item.pack_size ?? null,
    pack_size: item.pack_size ?? null,
    packPrice: item.pack_price ?? null,
    pack_price: item.pack_price ?? null,
    packLabel: item.pack_label ?? null,
    pack_label: item.pack_label ?? null,
    stockQuantity: Number(item.stockQuantity),
    stock: Number(item.stockQuantity),
    stock_quantity: Number(item.stockQuantity),
    cost_price: Number(item.costPrice),
    initial_stock_quantity: Number(item.stockQuantity),
    reorderLevel: 0,
    reorder_level: 0,
    safetyStock: 0,
    safety_stock: 0,
    targetStockLevel: 0,
    target_stock_level: 0,
    alertLevel: 0,
    alert_level: 0,
    allowNegativeStock: false,
    allow_negative_stock: false,
    warranty_months: null,
    is_batch_tracked: false,
    expiry_alert_days: null,
    isActive: true,
    is_active: true,
    createdAt: "",
    created_at: "",
    image: resolveImageUrl(item.image_url) || sampleImage || createProductImage(item.name, accent),
  };
}

function mapSerialLookupProduct(item: BackendSerialLookupResponse["product"]): Product {
  const accent = colorFromText(item.name + (item.barcode || ""));
  const sampleImage = getSampleProductImage(item.name);
  return {
    id: item.id,
    product_id: item.id,
    name: item.name,
    sku: item.sku || item.id.slice(0, 8),
    barcode: item.barcode || undefined,
    image_url: item.image_url || null,
    price: Number(item.unit_price),
    unit_price: Number(item.unit_price),
    category: item.category_name || undefined,
    category_id: item.category_id || null,
    categoryId: item.category_id || undefined,
    categoryName: item.category_name || undefined,
    category_name: item.category_name || null,
    brandId: item.brand_id || undefined,
    brandName: item.brand_name || undefined,
    brand_id: item.brand_id || null,
    brand_name: item.brand_name || null,
    isLowStock: item.is_low_stock ?? undefined,
    is_low_stock: item.is_low_stock ?? false,
    isSerialTracked: item.is_serial_tracked ?? false,
    is_serial_tracked: item.is_serial_tracked ?? false,
    hasPackOption: item.has_pack_option ?? false,
    has_pack_option: item.has_pack_option ?? false,
    packSize: item.pack_size ?? null,
    pack_size: item.pack_size ?? null,
    packPrice: item.pack_price ?? null,
    pack_price: item.pack_price ?? null,
    packLabel: item.pack_label ?? null,
    pack_label: item.pack_label ?? null,
    stock: Number(item.stock_quantity),
    stock_quantity: Number(item.stock_quantity),
    cost_price: Number(item.unit_price),
    initial_stock_quantity: Number(item.stock_quantity),
    reorder_level: 0,
    safety_stock: 0,
    target_stock_level: 0,
    alert_level: 0,
    allow_negative_stock: false,
    warranty_months: item.warranty_months ?? null,
    is_batch_tracked: false,
    expiry_alert_days: null,
    is_active: true,
    created_at: "",
    image: resolveImageUrl(item.image_url) || sampleImage || createProductImage(item.name, accent),
  };
}

function mapCatalogProduct(item: BackendProductCatalogItem): Product {
  const accent = colorFromText(item.name + (item.barcode || ""));
  const sampleImage = getSampleProductImage(item.name);
  return {
    id: item.product_id,
    product_id: item.product_id,
    name: item.name,
    sku: item.sku || item.product_id.slice(0, 8),
    barcode: item.barcode || undefined,
    image_url: item.image_url || null,
    price: Number(item.unit_price),
    unit_price: Number(item.unit_price),
    category: item.category_name || undefined,
    category_id: item.category_id || null,
    categoryId: item.category_id || undefined,
    categoryName: item.category_name || undefined,
    category_name: item.category_name || null,
    brandId: item.brand_id || undefined,
    brandName: item.brand_name || undefined,
    brand_id: item.brand_id || null,
    brand_name: item.brand_name || null,
    isLowStock: item.is_low_stock,
    is_low_stock: item.is_low_stock,
    hasPackOption: item.has_pack_option ?? false,
    has_pack_option: item.has_pack_option ?? false,
    packSize: item.pack_size ?? null,
    pack_size: item.pack_size ?? null,
    packPrice: item.pack_price ?? null,
    pack_price: item.pack_price ?? null,
    packLabel: item.pack_label ?? null,
    pack_label: item.pack_label ?? null,
    stock: Number(item.stock_quantity),
    stock_quantity: Number(item.stock_quantity),
    cost_price: Number(item.cost_price),
    initial_stock_quantity: Number(item.initial_stock_quantity ?? item.stock_quantity),
    reorder_level: Number(item.reorder_level),
    safety_stock: Number(item.safety_stock ?? 0),
    target_stock_level: Number(item.target_stock_level ?? 0),
    alert_level: Number(item.alert_level),
    allow_negative_stock: item.allow_negative_stock,
    is_serial_tracked: item.is_serial_tracked ?? false,
    warranty_months: item.warranty_months ?? null,
    is_batch_tracked: item.is_batch_tracked ?? false,
    expiry_alert_days: item.expiry_alert_days ?? null,
    is_active: item.is_active,
    created_at: item.created_at,
    image: resolveImageUrl(item.image_url) || sampleImage || createProductImage(item.name, accent),
  };
}

function mapSaleItems(items: BackendSaleItem[]): CartItem[] {
  return items.map((item) => {
    const isBundle = Boolean(item.bundle_id);
    const isPack = Boolean(item.is_pack);
    const rawQuantity = Number(item.quantity);
    const salePackSize = Number(item.sale_pack_size ?? 0);
    const cartQuantity = isPack && salePackSize > 0
      ? rawQuantity / salePackSize
      : rawQuantity;
    const productId = item.product_id || item.bundle_id || item.sale_item_id;
    const mode: CartItem["sellMode"] = isBundle ? "bundle" : isPack ? "pack" : "unit";
    const lineId = isBundle
      ? `bundle:${item.bundle_id}`
      : isPack
        ? `product:${item.product_id}:pack`
        : `product:${item.product_id}:unit`;

    return {
      saleItemId: item.sale_item_id,
      lineId,
      sellMode: mode,
      bundleId: item.bundle_id ?? undefined,
      bundleName: item.bundle_name ?? undefined,
      packSize: isPack ? salePackSize : undefined,
      packLabel: item.pack_label ?? undefined,
      baseUnitPrice: undefined,
      product: {
        id: isBundle ? `bundle:${item.bundle_id}` : productId,
        bundleId: item.bundle_id ?? undefined,
        isBundle,
        name: item.product_name,
        sku: productId.slice(0, 8),
        barcode: undefined,
        price: Number(item.unit_price),
        category: undefined,
        stock: rawQuantity,
        image: getSampleProductImage(item.product_name) || createProductImage(item.product_name),
      },
      quantity: Number.isFinite(cartQuantity) ? cartQuantity : rawQuantity,
    };
  });
}

function normalizePaymentMethod(method: string): PaymentMethod {
  switch (method.toLowerCase()) {
    case "credit":
      return "credit";
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

function mapBundle(item: BackendBundle): Bundle {
  return {
    id: item.id,
    name: item.name,
    barcode: item.barcode ?? null,
    description: item.description ?? null,
    price: Number(item.price),
    stock_quantity: Number(item.stock_quantity),
    is_active: item.is_active,
    items: item.items.map((bundleItem) => ({
      id: bundleItem.id,
      product_id: bundleItem.product_id ?? null,
      item_name: bundleItem.item_name,
      quantity: Number(bundleItem.quantity),
      notes: bundleItem.notes ?? null,
    })),
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

function mapCashDrawer(drawer: BackendCashDrawer) {
  return {
    counts: drawer.counts.map((count) => ({
      denomination: Number(count.denomination),
      quantity: Number(count.quantity),
    })),
    total: Number(drawer.total),
    updatedAt: drawer.updated_at ? new Date(drawer.updated_at) : undefined,
  };
}

function mapCashSessionResponse(session: BackendCashSessionResponse): CashSession {
  return {
    id: session.cash_session_id,
    cashierName: session.cashier_name,
    shiftNumber: Number(session.shift_number),
    openedAt: new Date(session.opened_at),
    closedAt: session.closed_at ? new Date(session.closed_at) : undefined,
    opening: mapCashSessionEntry(session.opening),
    drawer: mapCashDrawer(session.drawer),
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

export type CashSessionHistoryItem = {
  id: string;
  shiftNumber: number;
  cashierName: string;
  status: string;
  openedAt: Date;
  closedAt?: Date;
  openingTotal: number;
  closingTotal?: number;
  expectedCash?: number;
  difference?: number;
  cashSalesTotal: number;
};

function mapCashSessionHistoryItem(item: BackendCashSessionHistoryItem): CashSessionHistoryItem {
  return {
    id: item.cash_session_id,
    shiftNumber: Number(item.shift_number),
    cashierName: item.cashier_name,
    status: item.status,
    openedAt: new Date(item.opened_at),
    closedAt: item.closed_at ? new Date(item.closed_at) : undefined,
    openingTotal: Number(item.opening_total),
    closingTotal: item.closing_total ?? undefined,
    expectedCash: item.expected_cash ?? undefined,
    difference: item.difference ?? undefined,
    cashSalesTotal: Number(item.cash_sales_total),
  };
}

function mapCatalogProductItem(item: BackendProductCatalogItem): Product {
  const accent = colorFromText(item.name + (item.barcode || ""));
  const sampleImage = getSampleProductImage(item.name);
  return {
    id: item.product_id,
    product_id: item.product_id,
    name: item.name,
    sku: item.sku || item.product_id.slice(0, 8),
    barcode: item.barcode || undefined,
    image: item.image_url || sampleImage || createProductImage(item.name, accent),
    imageUrl: item.image_url || null,
    image_url: item.image_url || null,
    categoryId: item.category_id || null,
    category_id: item.category_id || null,
    categoryName: item.category_name || null,
    category_name: item.category_name || null,
    brandId: item.brand_id || null,
    brand_id: item.brand_id || null,
    brandName: item.brand_name || null,
    brand_name: item.brand_name || null,
    unitPrice: Number(item.unit_price),
    unit_price: Number(item.unit_price),
    costPrice: Number(item.cost_price),
    cost_price: Number(item.cost_price),
    stockQuantity: Number(item.stock_quantity),
    stock_quantity: Number(item.stock_quantity),
    initialStockQuantity: Number(item.initial_stock_quantity ?? item.stock_quantity),
    initial_stock_quantity: Number(item.initial_stock_quantity ?? item.stock_quantity),
    reorderLevel: Number(item.reorder_level),
    reorder_level: Number(item.reorder_level),
    safetyStock: Number(item.safety_stock ?? 0),
    safety_stock: Number(item.safety_stock ?? 0),
    targetStockLevel: Number(item.target_stock_level ?? 0),
    target_stock_level: Number(item.target_stock_level ?? 0),
    alertLevel: Number(item.alert_level),
    alert_level: Number(item.alert_level),
    allowNegativeStock: item.allow_negative_stock,
    allow_negative_stock: item.allow_negative_stock,
    isSerialTracked: item.is_serial_tracked ?? false,
    is_serial_tracked: item.is_serial_tracked ?? false,
    hasPackOption: item.has_pack_option ?? false,
    has_pack_option: item.has_pack_option ?? false,
    packSize: item.pack_size ?? null,
    pack_size: item.pack_size ?? null,
    packPrice: item.pack_price ?? null,
    pack_price: item.pack_price ?? null,
    packLabel: item.pack_label ?? null,
    pack_label: item.pack_label ?? null,
    warrantyMonths: item.warranty_months ?? null,
    warranty_months: item.warranty_months ?? null,
    isBatchTracked: item.is_batch_tracked ?? false,
    is_batch_tracked: item.is_batch_tracked ?? false,
    expiryAlertDays: item.expiry_alert_days ?? null,
    expiry_alert_days: item.expiry_alert_days ?? null,
    isActive: item.is_active,
    is_active: item.is_active,
    isLowStock: item.is_low_stock,
    is_low_stock: item.is_low_stock,
    createdAt: item.created_at,
    created_at: item.created_at,
    updatedAt: item.updated_at,
    updated_at: item.updated_at,
  };
}

function mapShopProfile(profile: BackendShopProfileResponse): ShopProfile {
  return {
    id: profile.id,
    shopName: profile.shop_name,
    language: normalizeShopProfileLanguage(profile.language),
    addressLine1: profile.address_line1 || "",
    addressLine2: profile.address_line2 || "",
    phone: profile.phone || "",
    email: profile.email || "",
    website: profile.website || "",
    logoUrl: profile.logo_url || "",
    receiptFooter: profile.receipt_footer || "",
    showNewItemForCashier: profile.show_new_item_for_cashier ?? true,
    showManageForCashier: profile.show_manage_for_cashier ?? true,
    showReportsForCashier: profile.show_reports_for_cashier ?? true,
    showAiInsightsForCashier: profile.show_ai_insights_for_cashier ?? true,
    showHeldBillsForCashier: profile.show_held_bills_for_cashier ?? true,
    showRemindersForCashier: profile.show_reminders_for_cashier ?? true,
    showAuditTrailForCashier: profile.show_audit_trail_for_cashier ?? true,
    showEndShiftForCashier: profile.show_end_shift_for_cashier ?? true,
    showTodaySalesForCashier: profile.show_today_sales_for_cashier ?? true,
    showImportBillForCashier: profile.show_import_bill_for_cashier ?? true,
    showShopSettingsForCashier: profile.show_shop_settings_for_cashier ?? true,
    showMyLicensesForCashier: profile.show_my_licenses_for_cashier ?? true,
    showOfflineSyncForCashier: profile.show_offline_sync_for_cashier ?? true,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

function normalizeShopProfileLanguage(value?: string | null): ShopProfileLanguage {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "sinhala" || normalized === "tamil") {
    return normalized;
  }

  return "english";
}

export async function bootstrapSession() {
  return request<BackendAuthSession>("/api/auth/me");
}

export function getTerminalId() {
  return getAuthTerminalId();
}

export function getDeviceCode() {
  return getAuthDeviceCode();
}

export async function fetchLicenseStatus() {
  try {
    const response = await request<BackendLicenseStatus>("/api/license/status");
    const status = mapLicenseStatus(response);
    setStoredLicenseToken(status.licenseToken);
    return status;
  } catch (error) {
    if (error instanceof ApiError && isLicenseTokenRecoveryErrorCode(error.code)) {
      setStoredLicenseToken(null);

      const retryResponse = await request<BackendLicenseStatus>("/api/license/status");
      const retryStatus = mapLicenseStatus(retryResponse);
      setStoredLicenseToken(retryStatus.licenseToken);
      return retryStatus;
    }

    throw error;
  }
}

export async function activateLicense(requestBody: ActivateLicenseRequest = {}) {
  const resolvedTerminalId = requestBody.terminalId || requestBody.deviceCode || getAuthTerminalId();
  let proof:
    | {
        keyFingerprint: string;
        publicKeySpki: string;
        keyAlgorithm: string;
        challengeId: string;
        challengeSignature: string;
      }
    | null = null;

  try {
    const challenge = await request<BackendProvisionChallengeResponse>("/api/provision/challenge", {
      method: "POST",
      body: JSON.stringify({
        terminal_id: resolvedTerminalId,
        device_code: resolvedTerminalId,
      }),
    });

    proof = await buildDeviceActivationProof(challenge.challenge_id, challenge.nonce, resolvedTerminalId);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) {
      throw error;
    }
  }

  const payload = {
    terminal_id: resolvedTerminalId,
    device_code: resolvedTerminalId,
    device_name: requestBody.deviceName || DEFAULT_DEVICE_NAME,
    actor: requestBody.actor || "pos-web-ui",
    reason: requestBody.reason || null,
    activation_entitlement_key: normalizeOptionalString(requestBody.activationEntitlementKey),
    ...(proof
      ? {
          key_fingerprint: proof.keyFingerprint,
          public_key_spki: proof.publicKeySpki,
          key_algorithm: proof.keyAlgorithm,
          challenge_id: proof.challengeId,
          challenge_signature: proof.challengeSignature,
        }
      : {}),
  };

  const response = await request<BackendLicenseStatus>("/api/provision/activate", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const status = mapLicenseStatus(response);
  setStoredLicenseToken(status.licenseToken);
  return status;
}

export async function heartbeatLicense(deviceCode?: string) {
  const resolvedTerminalId = deviceCode || getAuthTerminalId();
  const payload = {
    terminal_id: resolvedTerminalId,
    device_code: resolvedTerminalId,
    license_token: getStoredLicenseToken(),
  };

  const response = await request<BackendLicenseStatus>("/api/license/heartbeat", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const status = mapLicenseStatus(response);
  setStoredLicenseToken(status.licenseToken);
  return status;
}

export async function fetchCustomerLicensePortal() {
  return request<CustomerLicensePortalResponse>("/api/license/account/licenses");
}

export async function deactivateCustomerLicenseDevice(deviceCode: string, reason?: string) {
  return request<CustomerSelfServiceDeviceDeactivationResponse>(
    `/api/license/account/licenses/devices/${encodeURIComponent(deviceCode)}/deactivate`,
    {
      method: "POST",
      body: JSON.stringify({
        reason: normalizeOptionalString(reason),
      }),
    }
  );
}

export async function fetchLicenseAccessSuccess(activationEntitlementKey: string) {
  const normalizedKey = activationEntitlementKey.trim();
  if (!normalizedKey) {
    throw new Error("Activation entitlement key is required.");
  }

  const query = new URLSearchParams({
    activation_entitlement_key: normalizedKey,
  }).toString();
  return request<LicenseAccessSuccessResponse>(`/api/license/access/success?${query}`);
}

export async function trackLicenseAccessDownload(
  activationEntitlementKey: string,
  channel = "installer_download"
) {
  const normalizedKey = activationEntitlementKey.trim();
  if (!normalizedKey) {
    throw new Error("Activation entitlement key is required.");
  }

  return request<LicenseAccessDownloadTrackResponse>("/api/license/public/download-track", {
    method: "POST",
    body: JSON.stringify({
      activation_entitlement_key: normalizedKey,
      source: "license_access_success",
      channel: normalizeOptionalString(channel) || "installer_download",
    }),
  });
}

export async function login(username: string, password: string, mfaCode?: string) {
  const terminalId = getAuthTerminalId();
  const payload = {
    username,
    password,
    terminal_id: terminalId,
    device_code: terminalId,
    device_name: DEFAULT_DEVICE_NAME,
    mfa_code: mfaCode?.trim() || null,
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

export async function fetchProducts(query?: string, take = 200) {
  const params = new URLSearchParams();
  if (query?.trim()) {
    params.set("q", query.trim());
  }
  params.set("take", String(Math.max(1, Math.min(200, Math.trunc(take) || 200))));

  const response = await request<BackendProductSearchResponse>(`/api/products/search?${params.toString()}`);
  return response.items.map(mapProduct);
}

export async function searchBundles(query?: string, take = 30) {
  const params = new URLSearchParams();
  if (query?.trim()) {
    params.set("q", query.trim());
  }
  params.set("take", String(Math.max(1, Math.min(100, Math.trunc(take) || 30))));

  const response = await request<BackendBundleSearchResponse>(`/api/bundles/search?${params.toString()}`);
  return response.items.map((item) => ({
    id: item.id,
    bundleId: item.id,
    isBundle: true,
    name: item.name,
    sku: item.barcode?.trim() || item.id.slice(0, 8),
    barcode: item.barcode ?? undefined,
    price: Number(item.price),
    stock: Number(item.stock_quantity),
    category: "Bundle",
  }));
}

export async function fetchBundles(
  query?: string,
  take = 80,
  includeInactive = false,
): Promise<Bundle[]> {
  const params = new URLSearchParams();
  if (query?.trim()) {
    params.set("q", query.trim());
  }
  params.set("take", String(Math.max(1, Math.min(300, Math.trunc(take) || 80))));
  params.set("include_inactive", includeInactive ? "true" : "false");
  const response = await request<BackendBundleCatalogResponse>(`/api/bundles?${params.toString()}`);
  return response.items.map(mapBundle);
}

export type BundleItemRequest = {
  product_id?: string | null;
  item_name: string;
  quantity: number;
  notes?: string | null;
};

export type CreateBundleRequest = {
  name: string;
  barcode?: string | null;
  description?: string | null;
  price: number;
  is_active?: boolean;
  initial_stock?: number;
  items?: BundleItemRequest[];
};

export type UpdateBundleRequest = {
  name?: string | null;
  barcode?: string | null;
  description?: string | null;
  price?: number | null;
  is_active?: boolean | null;
  items?: BundleItemRequest[] | null;
};

export async function createBundle(requestBody: CreateBundleRequest): Promise<Bundle> {
  const response = await request<BackendBundle>("/api/bundles", {
    method: "POST",
    body: JSON.stringify({
      name: requestBody.name,
      barcode: normalizeOptionalString(requestBody.barcode),
      description: normalizeOptionalString(requestBody.description),
      price: requestBody.price,
      is_active: requestBody.is_active ?? true,
      initial_stock: requestBody.initial_stock ?? 0,
      items: requestBody.items ?? [],
    }),
  });
  return mapBundle(response);
}

export async function updateBundle(bundleId: string, requestBody: UpdateBundleRequest): Promise<Bundle> {
  const response = await request<BackendBundle>(`/api/bundles/${encodeURIComponent(bundleId)}`, {
    method: "PUT",
    body: JSON.stringify({
      name: normalizeOptionalString(requestBody.name),
      barcode: normalizeOptionalString(requestBody.barcode),
      description: normalizeOptionalString(requestBody.description),
      price: requestBody.price ?? null,
      is_active: requestBody.is_active ?? null,
      items: requestBody.items ?? null,
    }),
  });
  return mapBundle(response);
}

export async function receiveBundles(bundleId: string, quantity: number): Promise<Bundle> {
  const response = await request<BackendBundle>(`/api/bundles/${encodeURIComponent(bundleId)}/receive`, {
    method: "POST",
    body: JSON.stringify({ quantity }),
  });
  return mapBundle(response);
}

export async function assembleBundles(bundleId: string, quantity: number): Promise<Bundle> {
  const response = await request<BackendBundle>(`/api/bundles/${encodeURIComponent(bundleId)}/assemble`, {
    method: "POST",
    body: JSON.stringify({ quantity }),
  });
  return mapBundle(response);
}

export async function breakBundles(bundleId: string, quantity: number): Promise<Bundle> {
  const response = await request<BackendBundle>(`/api/bundles/${encodeURIComponent(bundleId)}/break`, {
    method: "POST",
    body: JSON.stringify({ quantity }),
  });
  return mapBundle(response);
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

export type ImportRowResult = {
  row_index: number;
  status: "ok" | "skipped" | "updated" | "error";
  entity_id?: string | null;
  name?: string | null;
  error?: string | null;
};

export type ImportSummary = {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  rows: ImportRowResult[];
};

export type BulkImportBrandRow = {
  row_index: number;
  name: string;
  code?: string | null;
  description?: string | null;
  is_active: boolean;
};

export type BulkImportCategoryRow = {
  row_index: number;
  name: string;
  description?: string | null;
  is_active: boolean;
};

export type BulkImportProductRow = {
  row_index: number;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  category_name?: string | null;
  brand_name?: string | null;
  unit_price: number;
  cost_price: number;
  initial_stock_quantity: number;
  reorder_level: number;
  safety_stock: number;
  target_stock_level: number;
  allow_negative_stock: boolean;
  is_active: boolean;
};

export type BulkImportCustomerRow = {
  row_index: number;
  name: string;
  code?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  date_of_birth?: string | null;
  credit_limit: number;
  notes?: string | null;
  is_active: boolean;
};

export async function bulkImportBrands(rows: BulkImportBrandRow[], duplicateStrategy: "skip" | "update") {
  return request<ImportSummary>("/api/import/brands", {
    method: "POST",
    body: JSON.stringify({
      rows,
      duplicate_strategy: duplicateStrategy,
    }),
  });
}

export async function bulkImportCategories(rows: BulkImportCategoryRow[], duplicateStrategy: "skip" | "update") {
  return request<ImportSummary>("/api/import/categories", {
    method: "POST",
    body: JSON.stringify({
      rows,
      duplicate_strategy: duplicateStrategy,
    }),
  });
}

export async function bulkImportProducts(rows: BulkImportProductRow[], duplicateStrategy: "skip" | "update") {
  return request<ImportSummary>("/api/import/products", {
    method: "POST",
    body: JSON.stringify({
      rows,
      duplicate_strategy: duplicateStrategy,
    }),
  });
}

export async function bulkImportCustomers(rows: BulkImportCustomerRow[], duplicateStrategy: "skip" | "update") {
  return request<ImportSummary>("/api/import/customers", {
    method: "POST",
    body: JSON.stringify({
      rows,
      duplicate_strategy: duplicateStrategy,
    }),
  });
}

type BackendCustomerPriceTierItem = {
  price_tier_id: string;
  name: string;
  code: string;
  discount_percent: number;
  description?: string | null;
  is_active: boolean;
  customer_count: number;
  created_at: string;
  updated_at?: string | null;
};

type BackendCustomerSearchItem = {
  customer_id: string;
  name: string;
  code: string;
  phone?: string | null;
  email?: string | null;
  credit_limit?: number;
  outstanding_balance?: number;
  is_active: boolean;
  price_tier?: {
    price_tier_id: string;
    name: string;
    code: string;
    discount_percent: number;
  } | null;
};

type BackendCustomerSearchResponse = {
  items: BackendCustomerSearchItem[];
  total: number;
  page: number;
  take: number;
};

type BackendCustomerDetail = {
  customer_id: string;
  name: string;
  code: string;
  phone?: string | null;
  email?: string | null;
  credit_limit?: number;
  outstanding_balance?: number;
};

export type CustomerLookupItem = {
  id: string;
  name: string;
  code: string;
  phone?: string | null;
  email?: string | null;
  creditLimit?: number;
  outstandingBalance?: number;
};

export type CreateCustomerRequest = {
  name: string;
  code?: string | null;
  idNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  dateOfBirth?: string | null;
  priceTierId?: string | null;
  fixedDiscountPercent?: number | null;
  creditLimit?: number;
  notes?: string | null;
  tags?: string[];
  isActive?: boolean;
};

function mapCustomerLookupItem(item: BackendCustomerSearchItem): CustomerLookupItem {
  return {
    id: item.customer_id,
    name: item.name,
    code: item.code,
    phone: item.phone ?? null,
    email: item.email ?? null,
    creditLimit: item.credit_limit == null ? undefined : Number(item.credit_limit),
    outstandingBalance: item.outstanding_balance == null ? undefined : Number(item.outstanding_balance),
  };
}

export async function searchCustomers(query = "", take = 10) {
  const params = new URLSearchParams();
  if (query.trim()) {
    params.set("q", query.trim());
  }
  params.set("take", String(Math.max(1, Math.min(50, Math.trunc(take) || 10))));

  const response = await request<BackendCustomerSearchResponse>(`/api/customers/search?${params.toString()}`);
  return response.items.map(mapCustomerLookupItem);
}

export async function fetchCustomerDirectoryLookup() {
  const pageSize = 100;
  const firstPage = await request<BackendCustomerSearchResponse>(`/api/customers?include_inactive=false&page=1&take=${pageSize}`);
  const totalPages = Math.max(1, Math.ceil(firstPage.total / firstPage.take));
  const items = [...firstPage.items];

  if (totalPages > 1) {
    const remainingPages = await Promise.all(
      Array.from({ length: totalPages - 1 }, async (_unused, index) =>
        request<BackendCustomerSearchResponse>(`/api/customers?include_inactive=false&page=${index + 2}&take=${pageSize}`)
      )
    );

    for (const page of remainingPages) {
      items.push(...page.items);
    }
  }

  return items.map(mapCustomerLookupItem);
}

export async function fetchCustomer(customerId: string) {
  const response = await request<BackendCustomerDetail>(`/api/customers/${encodeURIComponent(customerId)}`);
  return mapCustomerLookupItem({
    customer_id: response.customer_id,
    name: response.name,
    code: response.code,
    phone: response.phone ?? null,
    email: response.email ?? null,
    credit_limit: response.credit_limit,
    outstanding_balance: response.outstanding_balance,
    is_active: true,
    price_tier: null,
  });
}

export async function fetchCustomerPriceTiers() {
  const response = await request<BackendCustomerPriceTierItem[]>("/api/customer-price-tiers");
  return response.map((item) => ({
    id: item.price_tier_id,
    name: item.name,
    code: item.code,
    discountPercent: Number(item.discount_percent) || 0,
    description: item.description ?? "",
    isActive: item.is_active,
    customerCount: item.customer_count,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }));
}

export async function createCustomer(requestBody: CreateCustomerRequest) {
  const response = await request<BackendCustomerSearchItem>("/api/customers", {
    method: "POST",
    body: JSON.stringify({
      name: requestBody.name.trim(),
      code: normalizeOptionalString(requestBody.code),
      id_number: normalizeOptionalString(requestBody.idNumber),
      phone: normalizeOptionalString(requestBody.phone),
      email: normalizeOptionalString(requestBody.email),
      address: normalizeOptionalString(requestBody.address),
      date_of_birth: requestBody.dateOfBirth || null,
      price_tier_id: requestBody.priceTierId || null,
      fixed_discount_percent: requestBody.fixedDiscountPercent ?? null,
      credit_limit: requestBody.creditLimit ?? 0,
      notes: normalizeOptionalString(requestBody.notes),
      tags: requestBody.tags ?? [],
      is_active: requestBody.isActive ?? true,
    }),
  });

  return mapCustomerLookupItem(response);
}

function mapBrand(item: BackendBrandItem): Brand {
  return {
    id: item.brand_id,
    brand_id: item.brand_id,
    name: item.name,
    code: item.code ?? "",
    description: item.description ?? "",
    isActive: item.is_active,
    is_active: item.is_active,
    productCount: item.product_count,
    product_count: item.product_count,
    can_delete: item.can_delete ?? true,
    delete_block_reason: item.delete_block_reason ?? null,
    createdAt: item.created_at,
    created_at: item.created_at,
    updatedAt: item.updated_at,
    updated_at: item.updated_at,
  };
}

export async function fetchBrands(includeInactive = false) {
  const query = `?include_inactive=${includeInactive ? "true" : "false"}`;
  const response = await request<BackendBrandListResponse>(`/api/brands${query}`);
  return response.items.map(mapBrand);
}

export async function createBrand(requestBody: CreateBrandRequest) {
  const response = await request<BackendBrandItem>("/api/brands", {
    method: "POST",
    body: JSON.stringify({
      name: requestBody.name,
      code: normalizeOptionalString(requestBody.code),
      description: normalizeOptionalString(requestBody.description),
      is_active: requestBody.isActive ?? true,
    }),
  });

  return mapBrand(response);
}

export async function updateBrand(brandId: string, requestBody: CreateBrandRequest) {
  const response = await request<BackendBrandItem>(`/api/brands/${encodeURIComponent(brandId)}`, {
    method: "PUT",
    body: JSON.stringify({
      name: requestBody.name,
      code: normalizeOptionalString(requestBody.code),
      description: normalizeOptionalString(requestBody.description),
      is_active: requestBody.isActive ?? true,
    }),
  });

  return mapBrand(response);
}

export async function hardDeleteBrand(brandId: string) {
  return request<void>(`/api/brands/${encodeURIComponent(brandId)}/hard-delete`, {
    method: "DELETE",
  });
}

export async function createCategory(requestBody: CreateCategoryRequest) {
  return request<BackendCategoryItem>("/api/categories", {
    method: "POST",
    body: JSON.stringify({
      description: requestBody.description?.trim() || null,
      is_active: requestBody.is_active ?? true,
      name: requestBody.name.trim(),
    }),
  });
}

export async function updateCategory(categoryId: string, requestBody: CreateCategoryRequest) {
  return request<BackendCategoryItem>(`/api/categories/${encodeURIComponent(categoryId)}`, {
    method: "PUT",
    body: JSON.stringify({
      description: requestBody.description?.trim() || null,
      is_active: requestBody.is_active ?? true,
      name: requestBody.name.trim(),
    }),
  });
}

export async function hardDeleteCategory(categoryId: string) {
  return request<void>(`/api/categories/${encodeURIComponent(categoryId)}/hard-delete`, {
    method: "DELETE",
  });
}

function mapSupplier(item: BackendSupplierItem): SupplierRecord {
  const brands = item.brands ?? [];
  return {
    id: item.supplier_id,
    supplier_id: item.supplier_id,
    name: item.name,
    phone: item.phone ?? "",
    companyName: item.company_name ?? "",
    company_name: item.company_name ?? "",
    companyPhone: item.company_phone ?? "",
    company_phone: item.company_phone ?? "",
    address: item.address ?? "",
    brands: brands.map((brand) => ({
      brand_id: brand.brand_id,
      name: brand.name,
    })),
    isActive: item.is_active,
    is_active: item.is_active,
    linkedProductCount: item.linked_product_count,
    linked_product_count: item.linked_product_count,
    can_delete: item.can_delete ?? true,
    delete_block_reason: item.delete_block_reason ?? null,
    createdAt: item.created_at,
    created_at: item.created_at,
    updatedAt: item.updated_at,
    updated_at: item.updated_at,
  };
}

export async function fetchSuppliers(includeInactive = false) {
  const query = `?include_inactive=${includeInactive ? "true" : "false"}`;
  const response = await request<BackendSupplierListResponse>(`/api/suppliers${query}`);
  return response.items.map(mapSupplier);
}

export async function createSupplier(requestBody: CreateSupplierRequest) {
  const response = await request<BackendSupplierItem>("/api/suppliers", {
    method: "POST",
    body: JSON.stringify({
      name: requestBody.name,
      phone: normalizeOptionalString(requestBody.phone),
      company_name: normalizeOptionalString(requestBody.company_name),
      company_phone: normalizeOptionalString(requestBody.company_phone),
      address: normalizeOptionalString(requestBody.address),
      is_active: requestBody.isActive ?? true,
      brand_ids: requestBody.brand_ids ?? [],
    }),
  });

  return mapSupplier(response);
}

function mapShopStockSettings(item: BackendShopStockSettings): ShopStockSettingsRecord {
  return {
    id: item.id,
    storeId: item.store_id ?? null,
    defaultLowStockThreshold: item.default_low_stock_threshold,
    thresholdMultiplier: item.threshold_multiplier,
    defaultSafetyStock: item.default_safety_stock,
    defaultLeadTimeDays: item.default_lead_time_days,
    defaultTargetDaysOfCover: item.default_target_days_of_cover,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

export async function fetchShopStockSettings() {
  const response = await request<BackendShopStockSettings>("/api/settings/stock-settings");
  return mapShopStockSettings(response);
}

export async function updateShopStockSettings(requestBody: UpdateShopStockSettingsRequest) {
  const response = await request<BackendShopStockSettings>("/api/settings/stock-settings", {
    method: "PUT",
    body: JSON.stringify({
      default_low_stock_threshold: requestBody.defaultLowStockThreshold,
      threshold_multiplier: requestBody.thresholdMultiplier,
      default_safety_stock: requestBody.defaultSafetyStock,
      default_lead_time_days: requestBody.defaultLeadTimeDays,
      default_target_days_of_cover: requestBody.defaultTargetDaysOfCover,
    }),
  });

  return mapShopStockSettings(response);
}

export async function updateSupplier(supplierId: string, requestBody: CreateSupplierRequest) {
  const response = await request<BackendSupplierItem>(`/api/suppliers/${encodeURIComponent(supplierId)}`, {
    method: "PUT",
    body: JSON.stringify({
      name: requestBody.name,
      phone: normalizeOptionalString(requestBody.phone),
      company_name: normalizeOptionalString(requestBody.company_name),
      company_phone: normalizeOptionalString(requestBody.company_phone),
      address: normalizeOptionalString(requestBody.address),
      is_active: requestBody.isActive ?? true,
      brand_ids: requestBody.brand_ids ?? [],
    }),
  });

  return mapSupplier(response);
}

export async function hardDeleteSupplier(supplierId: string) {
  return request<void>(`/api/suppliers/${encodeURIComponent(supplierId)}/hard-delete`, {
    method: "DELETE",
  });
}

export async function fetchProductSuppliers(productId: string) {
  const response = await request<BackendProductSupplierListResponse>(
    `/api/products/${encodeURIComponent(productId)}/suppliers`
  );
  return response.items.map(mapProductSupplier);
}

export async function upsertProductSupplier(
  productId: string,
  requestBody: {
    supplier_id: string;
    supplier_sku?: string | null;
    supplier_item_name?: string | null;
    is_preferred: boolean;
    lead_time_days?: number | null;
    min_order_qty?: number | null;
    pack_size?: number | null;
    last_purchase_price?: number | null;
    is_active?: boolean;
  }
) {
  const response = await request<BackendProductSupplierItem>(
    `/api/products/${encodeURIComponent(productId)}/suppliers`,
    {
      method: "PUT",
      body: JSON.stringify({
        supplier_id: requestBody.supplier_id,
        supplier_sku: normalizeOptionalString(requestBody.supplier_sku),
        supplier_item_name: normalizeOptionalString(requestBody.supplier_item_name),
        is_preferred: requestBody.is_preferred,
        lead_time_days: requestBody.lead_time_days ?? null,
        min_order_qty: requestBody.min_order_qty ?? null,
        pack_size: requestBody.pack_size ?? null,
        last_purchase_price: requestBody.last_purchase_price ?? null,
        is_active: requestBody.is_active ?? true,
      }),
    }
  );

  return mapProductSupplier(response);
}

export async function setPreferredProductSupplier(productId: string, supplierId: string) {
  const response = await request<BackendProductSupplierItem>(
    `/api/products/${encodeURIComponent(productId)}/preferred-supplier`,
    {
      method: "PUT",
      body: JSON.stringify({
        supplier_id: supplierId,
      }),
    }
  );

  return mapProductSupplier(response);
}

export async function createProduct(requestBody: CreateProductRequest) {
  const response = await request<BackendProductCatalogItem>("/api/products", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });

  return mapCatalogProduct(response);
}

export async function generateProductBarcode(requestBody: GenerateProductBarcodeRequest = {}) {
  return request<GenerateProductBarcodeResponse>("/api/products/barcodes/generate", {
    method: "POST",
    body: JSON.stringify({
      name: normalizeOptionalString(requestBody.name),
      sku: normalizeOptionalString(requestBody.sku),
      seed: normalizeOptionalString(requestBody.seed),
    }),
  });
}

export async function validateProductBarcode(requestBody: ValidateProductBarcodeRequest) {
  return request<ValidateProductBarcodeResponse>("/api/products/barcodes/validate", {
    method: "POST",
    body: JSON.stringify({
      barcode: requestBody.barcode,
      exclude_product_id: normalizeOptionalString(requestBody.exclude_product_id),
      check_existing: requestBody.check_existing ?? true,
    }),
  });
}

export async function fetchInventoryDashboardSummary(): Promise<InventoryDashboardSummary> {
  return request<InventoryDashboardSummary>("/api/inventory/dashboard");
}

export async function fetchInventoryDashboard(): Promise<InventoryDashboard> {
  return request<InventoryDashboard>("/api/inventory/dashboard");
}

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

type BackendSerialLookupResponse = {
  serial: {
    id: string;
    product_id: string;
    serial_value: string;
    status: string;
    sale_id?: string | null;
    sale_item_id?: string | null;
    refund_id?: string | null;
    warranty_expiry_date?: string | null;
  };
  product: {
    id: string;
    name: string;
    sku?: string | null;
    barcode?: string | null;
    image_url?: string | null;
    category_id?: string | null;
    category_name?: string | null;
    brand_id?: string | null;
    brand_name?: string | null;
    unit_price: number;
    stock_quantity: number;
    is_low_stock?: boolean;
    has_pack_option?: boolean;
    pack_size?: number | null;
    pack_price?: number | null;
    pack_label?: string | null;
    warranty_months?: number | null;
    is_serial_tracked?: boolean;
  };
  sale?: {
    id: string;
    sale_number: string;
    completed_at?: string | null;
  } | null;
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
  status: WarrantyClaim["status"] | number | string;
  resolution_notes?: string | null;
  supplier_name?: string | null;
  handover_date?: string | null;
  pickup_person_name?: string | null;
  received_back_date?: string | null;
  received_back_person_name?: string | null;
  created_at: string;
  updated_at?: string | null;
};

const WARRANTY_CLAIM_STATUS_CODES: Record<WarrantyClaim["status"], number> = {
  Open: 1,
  InRepair: 2,
  Resolved: 3,
  Rejected: 4,
};

const WARRANTY_CLAIM_STATUS_LABELS: Record<WarrantyClaim["status"], string> = {
  Open: "Open",
  InRepair: "In repair",
  Resolved: "Resolved",
  Rejected: "Rejected",
};

function normalizeWarrantyClaimStatus(status: BackendWarrantyClaim["status"]): WarrantyClaim["status"] {
  if (typeof status === "number") {
    switch (status) {
      case 1:
        return "Open";
      case 2:
        return "InRepair";
      case 3:
        return "Resolved";
      case 4:
        return "Rejected";
      default:
        return "Open";
    }
  }

  const normalized = status.trim().toLowerCase().replace(/\s+/g, "");
  switch (normalized) {
    case "1":
    case "open":
      return "Open";
    case "2":
    case "inrepair":
      return "InRepair";
    case "3":
    case "resolved":
      return "Resolved";
    case "4":
    case "rejected":
      return "Rejected";
    default:
      return "Open";
  }
}

function serializeWarrantyClaimStatus(status: WarrantyClaim["status"]): number {
  return WARRANTY_CLAIM_STATUS_CODES[status];
}

export function formatWarrantyClaimStatus(status: WarrantyClaim["status"]) {
  return WARRANTY_CLAIM_STATUS_LABELS[status];
}

function mapStockMovement(item: BackendStockMovementPage["items"][number]): StockMovement {
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

function mapProductBatch(item: BackendProductBatch): ProductBatch {
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
    status: normalizeWarrantyClaimStatus(item.status),
    resolution_notes: item.resolution_notes ?? undefined,
    supplier_name: item.supplier_name ?? undefined,
    handover_date: item.handover_date ?? undefined,
    pickup_person_name: item.pickup_person_name ?? undefined,
    received_back_date: item.received_back_date ?? undefined,
    received_back_person_name: item.received_back_person_name ?? undefined,
    created_at: item.created_at,
    updated_at: item.updated_at ?? undefined,
  };
}

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
  const response = await safeRequest<BackendStockMovementPage>(
    `/api/inventory/movements${buildQuery({
      product_id: params.product_id,
      movement_type: params.movement_type,
      from_date: params.from_date,
      to_date: params.to_date,
      page: params.page ?? 1,
      take: params.take ?? 20,
    })}`,
    { items: [], total: 0, page: params.page ?? 1, take: params.take ?? 20 },
  );

  return {
    items: response.items.map(mapStockMovement),
    total: response.total,
    page: response.page,
    take: response.take,
  };
}

export async function fetchSerialNumbers(productId: string): Promise<SerialNumberRecord[]> {
  const response = await safeRequest<{ items: SerialNumberRecord[] }>(
    `/api/products/${productId}/serials`,
    { items: [] },
  );
  return response.items;
}

export async function addSerialNumbers(
  productId: string,
  serialValues: string[],
): Promise<SerialNumberRecord[]> {
  const response = await request<{ items: SerialNumberRecord[] }>(`/api/products/${productId}/serials`, {
    method: "POST",
    body: JSON.stringify({ serials: serialValues }),
  });
  return response.items;
}

export async function updateSerialNumber(
  productId: string,
  serialId: string,
  data: { status: SerialNumberRecord["status"]; warranty_expiry_date?: string | null },
): Promise<SerialNumberRecord> {
  return request<SerialNumberRecord>(`/api/products/${productId}/serials/${serialId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function replaceSerialNumber(
  productId: string,
  serialId: string,
  data: { new_serial_value: string },
): Promise<SerialNumberRecord> {
  return request<SerialNumberRecord>(`/api/products/${productId}/serials/${serialId}/replace`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteSerialNumber(productId: string, serialId: string): Promise<void> {
  await request<void>(`/api/products/${productId}/serials/${serialId}`, {
    method: "DELETE",
  });
}

export async function lookupSerial(serialValue: string): Promise<SerialLookupResult> {
  const response = await request<BackendSerialLookupResponse>(
    `/api/serials/lookup${buildQuery({ serial: serialValue })}`,
  );
  const product = mapSerialLookupProduct(response.product);

  return {
    serial_id: response.serial.id,
    serial_value: response.serial.serial_value,
    product_id: response.product.id,
    product_name: response.product.name,
    status: response.serial.status,
    sale_id: response.serial.sale_id ?? undefined,
    sale_item_id: response.serial.sale_item_id ?? undefined,
    refund_id: response.serial.refund_id ?? undefined,
    sale_date: response.sale?.completed_at ?? undefined,
    warranty_expiry_date: response.serial.warranty_expiry_date ?? undefined,
    product,
  };
}

export async function fetchProductBatches(productId: string): Promise<ProductBatch[]> {
  const response = await safeRequest<{ items: BackendProductBatch[] }>(
    `/api/products/${productId}/batches`,
    { items: [] },
  );
  return response.items.map(mapProductBatch);
}

export async function createProductBatch(
  productId: string,
  data: Partial<ProductBatch>,
): Promise<ProductBatch> {
  const response = await request<BackendProductBatch>(`/api/products/${productId}/batches`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return mapProductBatch(response);
}

export async function updateProductBatch(
  productId: string,
  batchId: string,
  data: Partial<ProductBatch>,
): Promise<ProductBatch> {
  const response = await request<BackendProductBatch>(
    `/api/products/${productId}/batches/${batchId}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
  );
  return mapProductBatch(response);
}

export async function fetchExpiringBatches(days = 30): Promise<ExpiringBatch[]> {
  const response = await safeRequest<{ items: ExpiringBatch[] }>(
    `/api/batches/expiring${buildQuery({ days })}`,
    { items: [] },
  );
  return response.items;
}

export async function fetchStocktakeSessions(
  params: {
    status?: string;
    page?: number;
    take?: number;
  } = {},
): Promise<StocktakeSession[]> {
  const response = await safeRequest<{ items: BackendStocktakeSession[] }>(
    `/api/stocktake/sessions${buildQuery({
      status: params.status,
      page: params.page,
      take: params.take,
    })}`,
    { items: [] },
  );
  return response.items.map(mapStocktakeSession);
}

export async function createStocktakeSession(): Promise<StocktakeSession> {
  const response = await request<BackendStocktakeSession>("/api/stocktake/sessions", {
    method: "POST",
    body: JSON.stringify({}),
  });
  return mapStocktakeSession(response);
}

export async function getStocktakeSession(
  sessionId: string,
): Promise<{ session: StocktakeSession; items: StocktakeItem[] }> {
  const response = await request<BackendStocktakeSession>(`/api/stocktake/sessions/${sessionId}`);
  return {
    session: mapStocktakeSession(response),
    items: (response.items ?? []).map(mapStocktakeItem),
  };
}

export async function startStocktakeSession(sessionId: string): Promise<StocktakeSession> {
  const response = await request<BackendStocktakeSession>(`/api/stocktake/sessions/${sessionId}/start`, {
    method: "PUT",
  });
  return mapStocktakeSession(response);
}

export async function updateStocktakeItem(
  sessionId: string,
  itemId: string,
  countedQty: number,
): Promise<Pick<StocktakeItem, "id" | "counted_quantity" | "variance_quantity">> {
  const response = await request<Pick<BackendStocktakeItem, "id" | "counted_quantity" | "variance_quantity">>(
    `/api/stocktake/sessions/${sessionId}/items/${itemId}`,
    {
      method: "PUT",
      body: JSON.stringify({ counted_quantity: countedQty }),
    },
  );
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
  const response = await request<BackendStocktakeSession>(`/api/stocktake/sessions/${sessionId}/complete`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return mapStocktakeSession(response);
}

export async function revertStocktakeSession(sessionId: string): Promise<StocktakeSession> {
  const response = await request<BackendStocktakeSession>(`/api/stocktake/sessions/${sessionId}/revert`, {
    method: "POST",
  });
  return mapStocktakeSession(response);
}

export async function deleteStocktakeSession(sessionId: string): Promise<void> {
  await request<void>(`/api/stocktake/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

export async function fetchWarrantyClaims(
  params: {
    status?: string;
    from_date?: string;
    to_date?: string;
    page?: number;
  } = {},
): Promise<WarrantyClaim[]> {
  const response = await safeRequest<{ items: BackendWarrantyClaim[] }>(
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
  const response = await request<BackendWarrantyClaim>("/api/warranty-claims", {
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
    received_back_person_name?: string;
  },
): Promise<WarrantyClaim> {
  const response = await request<BackendWarrantyClaim>(`/api/warranty-claims/${claimId}`, {
    method: "PUT",
    body: JSON.stringify({
      status: serializeWarrantyClaimStatus(data.status),
      resolution_notes: data.resolution_notes,
      supplier_name: data.supplier_name,
      handover_date: data.handover_date,
      pickup_person_name: data.pickup_person_name,
      received_back_date: data.received_back_date,
      received_back_person_name: data.received_back_person_name,
    }),
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
  const response = await request<BackendWarrantyClaim>(`/api/warranty-claims/${claimId}/replace`, {
    method: "POST",
    body: JSON.stringify({
      replacement_serial_number_id: data.replacement_serial_number_id,
      replacement_date: data.replacement_date,
      resolution_notes: data.resolution_notes,
    }),
  });
  return mapWarrantyClaim(response);
}

export async function generateAndAssignProductBarcode(
  productId: string,
  requestBody: GenerateAndAssignProductBarcodeRequest = {}
) {
  const response = await request<BackendProductCatalogItem>(`/api/products/${productId}/barcode/generate`, {
    method: "POST",
    body: JSON.stringify({
      force_replace: requestBody.force_replace ?? false,
      seed: normalizeOptionalString(requestBody.seed),
    }),
  });

  return mapCatalogProductItem(response);
}

export async function bulkGenerateMissingProductBarcodes(
  requestBody: BulkGenerateMissingProductBarcodesRequest = {}
) {
  return request<BulkGenerateMissingProductBarcodesResponse>("/api/products/barcodes/bulk-generate-missing", {
    method: "POST",
    body: JSON.stringify({
      take: Math.max(1, Math.min(1000, Math.trunc(requestBody.take ?? 200))),
      include_inactive: requestBody.include_inactive ?? false,
      dry_run: requestBody.dry_run ?? false,
    }),
  });
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

export type AiInsightsRequest = {
  prompt: string;
  idempotency_key?: string;
  usage_type?: AiInsightsUsageType;
};

export type AiInsightsEstimateRequest = {
  prompt: string;
  usage_type?: AiInsightsUsageType;
};

export type AiInsightsUsageType = "quick_insights" | "advanced_analysis" | "smart_reports";

export type AiInsightsEstimateResponse = {
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  estimated_charge_credits: number;
  reserve_credits: number;
  available_credits: number;
  daily_remaining_credits: number;
  can_afford: boolean;
  pricing_rules_version: string;
  usage_type: AiInsightsUsageType;
};

export type AiInsightsResponse = {
  request_id: string;
  status: string;
  provider: string;
  model: string;
  pricing_rules_version: string;
  insight: string;
  input_tokens: number;
  output_tokens: number;
  reserved_credits: number;
  charged_credits: number;
  credits_used: number;
  refunded_credits: number;
  remaining_credits: number;
  usage_type: AiInsightsUsageType;
  created_at: string;
  completed_at: string;
};

export type AiInsightsHistoryItem = {
  request_id: string;
  status: string;
  provider: string;
  model: string;
  pricing_rules_version: string;
  input_tokens: number;
  output_tokens: number;
  reserved_credits: number;
  charged_credits: number;
  credits_used: number;
  refunded_credits: number;
  usage_type: AiInsightsUsageType;
  created_at: string;
  completed_at?: string | null;
  error_message?: string | null;
};

export type AiInsightsHistoryResponse = {
  items: AiInsightsHistoryItem[];
};

export type AiChatUsageType = AiInsightsUsageType;

export type AiChatCreateSessionRequest = {
  title?: string;
  usage_type?: AiChatUsageType;
};

export type AiChatMessageCreateRequest = {
  message: string;
  usage_type?: AiChatUsageType;
  idempotency_key?: string;
};

export type AiChatCitation = {
  bucket_key: string;
  title: string;
  summary: string;
};

export type AiChatStockTableRowBlock = {
  item: string;
  current_stock: number;
  reorder_level: number;
  status: "low" | "out" | "ok" | string;
};

export type AiChatStockTableBlock = {
  title: string;
  rows: AiChatStockTableRowBlock[];
  footer_note?: string | null;
};

export type AiChatSalesKpiBlock = {
  title: string;
  from_date: string;
  to_date: string;
  revenue: number;
  transactions: number;
  average_basket: number;
  top_seller?: string | null;
  trend_percent: number;
  trend_label: "up" | "down" | "flat" | string;
};

export type AiChatSummaryListBlock = {
  title: string;
  items: string[];
};

export type AiChatMessageBlock = {
  type: "stock_table" | "sales_kpi" | "summary_list" | string;
  stock_table?: AiChatStockTableBlock | null;
  sales_kpi?: AiChatSalesKpiBlock | null;
  summary_list?: AiChatSummaryListBlock | null;
};

export type AiChatMessage = {
  message_id: string;
  role: "user" | "assistant" | "system" | string;
  status: "pending" | "succeeded" | "failed" | string;
  usage_type: AiChatUsageType;
  content: string;
  confidence?: string | null;
  citations: AiChatCitation[];
  blocks?: AiChatMessageBlock[];
  input_tokens: number;
  output_tokens: number;
  reserved_credits: number;
  charged_credits: number;
  refunded_credits: number;
  created_at: string;
  completed_at?: string | null;
  error_message?: string | null;
};

export type AiChatSessionSummary = {
  session_id: string;
  title: string;
  default_usage_type: AiChatUsageType;
  message_count: number;
  created_at: string;
  updated_at: string;
  last_message_at?: string | null;
};

export type AiChatHistoryResponse = {
  items: AiChatSessionSummary[];
};

export type AiChatSessionDetailResponse = {
  session: AiChatSessionSummary;
  messages: AiChatMessage[];
};

export type AiChatPostMessageResponse = {
  session: AiChatSessionSummary;
  user_message: AiChatMessage;
  assistant_message: AiChatMessage;
  remaining_credits: number;
};

export type ReminderRuleType =
  | "low_stock"
  | "update_available"
  | "subscription_follow_up"
  | "weekly_report"
  | "monthly_report";

export type ReminderSeverity = "info" | "warning" | "critical" | string;
export type ReminderStatus = "open" | "acknowledged" | string;

export type ReminderRule = {
  rule_id: string;
  reminder_type: ReminderRuleType | string;
  enabled: boolean;
  low_stock_threshold?: number | null;
  snoozed_until?: string | null;
  last_evaluated_at?: string | null;
  last_triggered_at?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type ReminderItem = {
  reminder_id: string;
  rule_id?: string | null;
  event_type: string;
  severity: ReminderSeverity;
  status: ReminderStatus;
  title: string;
  message: string;
  action_path?: string | null;
  created_at: string;
  acknowledged_at?: string | null;
  metadata_json?: string | null;
};

export type RemindersResponse = {
  generated_at: string;
  open_count: number;
  items: ReminderItem[];
};

export type UpsertReminderRuleRequest = {
  reminder_type: ReminderRuleType;
  enabled?: boolean;
  low_stock_threshold?: number | null;
  snooze_minutes?: number | null;
  clear_snooze?: boolean;
};

export type SmartReportJobSummary = {
  job_id: string;
  cadence: "weekly" | "monthly" | string;
  status: string;
  period_start_utc: string;
  period_end_utc: string;
  title: string;
  summary?: string | null;
  created_at: string;
  completed_at?: string | null;
  error_message?: string | null;
};

export type RunRemindersNowResponse = {
  executed_at: string;
  processed_rules: number;
  skipped_rules: number;
  created_events: number;
  generated_reports: number;
  jobs: SmartReportJobSummary[];
};

export type AiWalletResponse = {
  available_credits: number;
  updated_at: string;
};

export type AiWalletTopUpRequest = {
  user_id?: string;
  credits: number;
  purchase_reference: string;
  description?: string;
};

export type AiWalletTopUpResponse = {
  available_credits: number;
  applied_credits: number;
  purchase_reference: string;
  updated_at: string;
};

export type AiWalletAdjustmentRequest = {
  user_id?: string;
  delta_credits: number;
  reference: string;
  reason?: string;
};

export type AiWalletAdjustmentResponse = {
  available_credits: number;
  applied_delta: number;
  reference: string;
  updated_at: string;
};

export type AiCreditPack = {
  pack_code: string;
  credits: number;
  price: number;
  currency: string;
};

export type AiCreditPackListResponse = {
  items: AiCreditPack[];
};

export type AiCheckoutPaymentMethod = "card" | "cash" | "bank_deposit";

export type AiCheckoutSessionRequest = {
  pack_code: string;
  payment_method?: AiCheckoutPaymentMethod;
  bank_reference?: string;
  idempotency_key?: string;
};

export type AiCheckoutSessionResponse = {
  payment_id: string;
  payment_status: string;
  payment_method: AiCheckoutPaymentMethod | string;
  provider: string;
  pack_code: string;
  credits: number;
  amount: number;
  currency: string;
  external_reference: string;
  checkout_url?: string | null;
  created_at: string;
};

export type AiPaymentHistoryItem = {
  payment_id: string;
  payment_status: string;
  payment_method: AiCheckoutPaymentMethod | string;
  provider: string;
  credits: number;
  amount: number;
  currency: string;
  external_reference: string;
  created_at: string;
  completed_at?: string | null;
};

export type AiPaymentHistoryResponse = {
  items: AiPaymentHistoryItem[];
};

export type AiPendingManualPaymentItem = {
  payment_id: string;
  target_username: string;
  target_full_name?: string | null;
  shop_name?: string | null;
  payment_status: string;
  payment_method: AiCheckoutPaymentMethod | string;
  credits: number;
  amount: number;
  currency: string;
  external_reference: string;
  submitted_reference?: string | null;
  created_at: string;
};

export type AiPendingManualPaymentsResponse = {
  items: AiPendingManualPaymentItem[];
};

export type AiManualPaymentVerifyRequest = {
  payment_id?: string;
  external_reference?: string;
};

export async function fetchAiWallet() {
  return request<AiWalletResponse>("/api/ai/wallet");
}

export async function generateAiInsights(requestBody: AiInsightsRequest) {
  return request<AiInsightsResponse>("/api/ai/insights", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
}

export async function estimateAiInsights(requestBody: AiInsightsEstimateRequest) {
  return request<AiInsightsEstimateResponse>("/api/ai/insights/estimate", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
}

export async function fetchAiInsightsHistory(take = 10) {
  const normalizedTake = Math.max(1, Math.min(100, Math.trunc(take || 10)));
  return request<AiInsightsHistoryResponse>(`/api/ai/insights/history?take=${normalizedTake}`);
}

export async function createAiChatSession(requestBody: AiChatCreateSessionRequest) {
  return request<AiChatSessionSummary>("/api/ai/chat/sessions", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
}

export async function postAiChatMessage(sessionId: string, requestBody: AiChatMessageCreateRequest) {
  return request<AiChatPostMessageResponse>(`/api/ai/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
}

export async function fetchAiChatSession(sessionId: string, take = 50) {
  const normalizedTake = Math.max(1, Math.min(200, Math.trunc(take || 50)));
  return request<AiChatSessionDetailResponse>(`/api/ai/chat/sessions/${sessionId}?take=${normalizedTake}`);
}

export async function fetchAiChatHistory(take = 20) {
  const normalizedTake = Math.max(1, Math.min(100, Math.trunc(take || 20)));
  return request<AiChatHistoryResponse>(`/api/ai/chat/history?take=${normalizedTake}`);
}

export async function fetchReminders(take = 20, includeAcknowledged = false) {
  const normalizedTake = Math.max(1, Math.min(100, Math.trunc(take || 20)));
  const query = new URLSearchParams({
    take: String(normalizedTake),
    include_acknowledged: includeAcknowledged ? "true" : "false",
  }).toString();

  return request<RemindersResponse>(`/api/reminders?${query}`);
}

export async function upsertReminderRule(requestBody: UpsertReminderRuleRequest) {
  return request<ReminderRule>("/api/reminders/rules", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
}

export async function acknowledgeReminder(reminderId: string) {
  return request<ReminderItem>(`/api/reminders/${reminderId}/ack`, {
    method: "POST",
  });
}

export async function runRemindersNow() {
  return request<RunRemindersNowResponse>("/api/reminders/run-now", {
    method: "POST",
  });
}

export async function topUpAiWallet(requestBody: AiWalletTopUpRequest) {
  return request<AiWalletTopUpResponse>("/api/ai/wallet/top-up", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
}

export async function adjustAiWallet(requestBody: AiWalletAdjustmentRequest) {
  return request<AiWalletAdjustmentResponse>("/api/ai/wallet/adjust", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
}

export async function fetchAiCreditPacks() {
  return request<AiCreditPackListResponse>("/api/ai/credit-packs");
}

export async function createAiCheckoutSession(requestBody: AiCheckoutSessionRequest) {
  return request<AiCheckoutSessionResponse>("/api/ai/payments/checkout", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
}

export async function fetchAiPaymentHistory(take = 10) {
  const normalizedTake = Math.max(1, Math.min(100, Math.trunc(take || 10)));
  return request<AiPaymentHistoryResponse>(`/api/ai/payments?take=${normalizedTake}`);
}

export async function fetchAiPendingManualPayments(take = 40) {
  const normalizedTake = Math.max(1, Math.min(200, Math.trunc(take || 40)));
  return request<AiPendingManualPaymentsResponse>(`/api/ai/payments/pending-manual?take=${normalizedTake}`);
}

export async function verifyAiManualPayment(requestBody: AiManualPaymentVerifyRequest) {
  return request<AiCheckoutSessionResponse>("/api/ai/payments/verify", {
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
  brand_id?: string | null;
  unit_price: number;
  cost_price: number;
  initial_stock_quantity: number;
  reorder_level: number;
  safety_stock: number;
  target_stock_level: number;
  allow_negative_stock: boolean;
  is_serial_tracked?: boolean;
  has_pack_option?: boolean;
  pack_size?: number;
  pack_price?: number | null;
  pack_label?: string | null;
  warranty_months?: number | null;
  is_batch_tracked?: boolean;
  expiry_alert_days?: number | null;
  is_active: boolean;
  product_suppliers?: {
    supplier_id: string;
    is_preferred: boolean;
  }[];
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

export async function hardDeleteProduct(productId: string) {
  return request<void>(`/api/products/${productId}/hard-delete`, {
    method: "DELETE",
  });
}

export async function adjustStock(
  productId: string,
  deltaQuantity: number,
  reason = "manual_adjustment",
  batchId?: string | null,
): Promise<StockAdjustmentResponse> {
  return request<StockAdjustmentResponse>(`/api/products/${productId}/stock-adjustments`, {
    method: "POST",
    body: JSON.stringify({
      delta_quantity: deltaQuantity,
      reason,
      batch_id: batchId ?? null,
    }),
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

export async function fetchCashSessionHistory(from?: string, to?: string) {
  const query = new URLSearchParams();
  if (from) {
    query.set("from", from);
  }
  if (to) {
    query.set("to", to);
  }

  const response = await request<BackendCashSessionHistoryResponse>(
    `/api/cash-sessions${query.toString() ? `?${query.toString()}` : ""}`
  );
  return {
    items: response.items.map(mapCashSessionHistoryItem),
  };
}

export async function openCashSession(counts: DenominationCount[], total: number, cashierName?: string) {
  const payload = {
    counts: counts.map((item) => ({
      denomination: item.denomination,
      quantity: item.quantity,
    })),
    total,
    cashier_name: cashierName?.trim() || undefined,
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

export async function updateCurrentCashDrawer(counts: DenominationCount[], total: number, reason: string) {
  const payload = {
    counts: counts.map((item) => ({
      denomination: item.denomination,
      quantity: item.quantity,
    })),
    total,
    reason,
  };

  const response = await request<BackendCashSessionResponse>("/api/cash-sessions/current/drawer", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  return mapCashSessionResponse(response);
}

export async function holdSale(items: CartItem[], role: "admin" | "manager" | "cashier") {
  const payload: HoldSaleRequest = {
    items: items.map((item) => {
      const sellMode = item.sellMode ?? (item.bundleId || item.product.isBundle ? "bundle" : "unit");
      return {
      product_id:
        sellMode === "bundle"
          ? null
          : item.product.id.startsWith("bundle:")
            ? null
            : item.product.id,
      bundle_id: sellMode === "bundle"
        ? (item.bundleId || item.product.bundleId || item.product.id.replace(/^bundle:/, ""))
        : undefined,
      quantity: item.quantity,
      is_pack_sale: sellMode === "pack",
      serial_number_id: item.selectedSerial?.id,
    };
    }),
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
  referenceNumber?: string,
  cashReceivedCounts?: DenominationCount[],
  cashChangeCounts?: DenominationCount[],
  customPayoutUsed?: boolean,
  cashShortAmount?: number,
  customerId?: string
) {
  const cartItemsPayload = saleId
    ? undefined
    : items.map((item) => {
      const sellMode = item.sellMode ?? (item.bundleId || item.product.isBundle ? "bundle" : "unit");
      return {
        product_id:
          sellMode === "bundle"
            ? null
            : item.product.id.startsWith("bundle:")
              ? null
              : item.product.id,
        bundle_id: sellMode === "bundle"
          ? (item.bundleId || item.product.bundleId || item.product.id.replace(/^bundle:/, ""))
          : undefined,
        quantity: item.quantity,
        is_pack_sale: sellMode === "pack",
        serial_number_id: item.selectedSerial?.id,
        sale_item_id: item.saleItemId,
      };
    });

  const payload: CreateSaleRequest = {
    sale_id: saleId,
    items: cartItemsPayload,
    discount_percent: 0,
    role: toBackendRole(role),
    customer_id: customerId || undefined,
    payments: [
      {
        method: paymentMethod,
        amount,
        reference_number: referenceNumber || null,
      },
    ],
    cash_received_counts: cashReceivedCounts?.map((item) => ({
      denomination: item.denomination,
      quantity: item.quantity,
    })),
    cash_change_counts: cashChangeCounts?.map((item) => ({
      denomination: item.denomination,
      quantity: item.quantity,
    })),
    custom_payout_used: customPayoutUsed ?? false,
    cash_short_amount: cashShortAmount ?? 0,
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

export async function syncOfflineEvents(
  events: SyncEventRequestItem[],
  options: SyncEventsRequestOptions = {}
) {
  if (!Array.isArray(events) || events.length === 0) {
    return { results: [] } satisfies SyncEventsResponse;
  }

  let offlineGrantToken = normalizeOptionalString(options.offlineGrantToken);
  if (!offlineGrantToken && requiresOfflineGrant(events)) {
    try {
      const licenseStatus = await fetchLicenseStatus();
      offlineGrantToken = normalizeOptionalString(licenseStatus.offlineGrantToken);
    } catch (error) {
      if (!(error instanceof ApiError)) {
        throw error;
      }
    }
  }

  const payload: BackendSyncEventsRequest = {
    device_id: options.deviceId ?? null,
    offline_grant_token: offlineGrantToken,
    events: events.map(mapSyncEventRequestItem),
  };

  const response = await request<BackendSyncEventsResponse>("/api/sync/events", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return {
    results: Array.isArray(response.results) ? response.results.map(mapSyncEventResult) : [],
  } satisfies SyncEventsResponse;
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

export async function fetchWorstItemsReport(
  fromDate: Date | string = new Date(),
  toDate: Date | string = fromDate,
  take = 25
) {
  const from = formatDateQueryValue(fromDate);
  const to = formatDateQueryValue(toDate);
  return request<WorstItemsReportResponse>(`/api/reports/worst-items?from=${from}&to=${to}&take=${take}`);
}

export async function fetchMonthlySalesForecastReport(months = 6) {
  return request<MonthlySalesForecastReportResponse>(`/api/reports/monthly-forecast?months=${months}`);
}

export async function fetchLowStockReport(take = 20, threshold = 5) {
  return request<LowStockReportResponse>(`/api/reports/low-stock?take=${take}&threshold=${threshold}`);
}

export async function fetchLowStockByBrandReport(take = 20, threshold = 5) {
  return request<LowStockByBrandReportResponse>(
    `/api/reports/low-stock/by-brand?take=${take}&threshold=${threshold}`,
  );
}

export async function fetchLowStockBySupplierReport(take = 20, threshold = 5) {
  return request<LowStockBySupplierReportResponse>(
    `/api/reports/low-stock/by-supplier?take=${take}&threshold=${threshold}`,
  );
}

export async function fetchCashierLeaderboardReport(
  fromDate: Date | string = new Date(),
  toDate: Date | string = fromDate,
) {
  const from = formatDateQueryValue(fromDate);
  const to = formatDateQueryValue(toDate);
  return request<CashierLeaderboardReportResponse>(
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
  return request<MarginSummaryReportResponse>(
    `/api/reports/margin-summary?from=${from}&to=${to}&take=${take}`,
  );
}

export async function fetchSalesComparisonReport(
  fromDate: Date | string = new Date(),
  toDate: Date | string = fromDate,
) {
  const from = formatDateQueryValue(fromDate);
  const to = formatDateQueryValue(toDate);
  return request<SalesComparisonReportResponse>(
    `/api/reports/sales-comparison?from=${from}&to=${to}`,
  );
}

export async function fetchSupportTriageReport(windowMinutes = 30) {
  return request<SupportTriageReportResponse>(`/api/reports/support-triage?window_minutes=${windowMinutes}`);
}

export async function fetchAdminLicensingShops(search?: string) {
  const query = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  return request<AdminShopsLicensingSnapshotResponse>(`/api/admin/licensing/shops${query}`);
}

export async function fetchAdminLicenseAuditLogs({
  search,
  action,
  actor,
  take = 50,
}: {
  search?: string;
  action?: string;
  actor?: string;
  take?: number;
}) {
  const params = new URLSearchParams();
  if (search?.trim()) {
    params.set("search", search.trim());
  }

  if (action?.trim()) {
    params.set("action", action.trim());
  }

  if (actor?.trim()) {
    params.set("actor", actor.trim());
  }

  params.set("take", String(Math.max(1, Math.min(200, take))));
  const query = params.toString();
  return request<AdminAuditLogsResponse>(`/api/admin/licensing/audit-logs${query ? `?${query}` : ""}`);
}

export async function adminRevokeDevice(
  deviceCode: string,
  actorNote: string,
  actor = "support-ui",
  reasonCode = "manual_device_revoke"
) {
  return request<AdminDeviceActionResponse>(`/api/admin/licensing/devices/${encodeURIComponent(deviceCode)}/revoke`, {
    method: "POST",
    body: JSON.stringify({
      actor,
      reason_code: reasonCode,
      actor_note: actorNote,
      reason: actorNote,
    }),
  });
}

export async function adminDeactivateDevice(
  deviceCode: string,
  actorNote: string,
  actor = "support-ui",
  reasonCode = "manual_device_deactivate"
) {
  return request<AdminDeviceActionResponse>(`/api/admin/licensing/devices/${encodeURIComponent(deviceCode)}/deactivate`, {
    method: "POST",
    body: JSON.stringify({
      actor,
      reason_code: reasonCode,
      actor_note: actorNote,
      reason: actorNote,
    }),
  });
}

export async function adminReactivateDevice(
  deviceCode: string,
  actorNote: string,
  actor = "support-ui",
  reasonCode = "manual_device_reactivate"
) {
  return request<AdminDeviceActionResponse>(`/api/admin/licensing/devices/${encodeURIComponent(deviceCode)}/reactivate`, {
    method: "POST",
    body: JSON.stringify({
      actor,
      reason_code: reasonCode,
      actor_note: actorNote,
      reason: actorNote,
    }),
  });
}

export async function adminActivateDevice(
  deviceCode: string,
  actorNote: string,
  actor = "support-ui",
  reasonCode = "manual_device_activate"
) {
  return request<AdminDeviceActionResponse>(`/api/admin/licensing/devices/${encodeURIComponent(deviceCode)}/activate`, {
    method: "POST",
    body: JSON.stringify({
      actor,
      reason_code: reasonCode,
      actor_note: actorNote,
      reason: actorNote,
    }),
  });
}

export async function adminTransferDeviceSeat(
  deviceCode: string,
  targetShopCode: string,
  actorNote: string,
  actor = "support-ui",
  reasonCode = "manual_transfer_seat"
) {
  return request<AdminDeviceSeatTransferResponse>(
    `/api/admin/licensing/devices/${encodeURIComponent(deviceCode)}/transfer-seat`,
    {
      method: "POST",
      body: JSON.stringify({
        target_shop_code: targetShopCode,
        actor,
        reason_code: reasonCode,
        actor_note: actorNote,
        reason: actorNote,
      }),
    }
  );
}

export async function adminExtendDeviceGrace(
  deviceCode: string,
  extendDays: number,
  actorNote: string,
  actor = "support-ui",
  reasonCode = "manual_extend_grace",
  stepUpApprovedBy?: string,
  stepUpApprovalNote?: string
) {
  return request<AdminDeviceActionResponse>(
    `/api/admin/licensing/devices/${encodeURIComponent(deviceCode)}/extend-grace`,
    {
      method: "POST",
      body: JSON.stringify({
        actor,
        reason_code: reasonCode,
        actor_note: actorNote,
        reason: actorNote,
        step_up_approved_by: stepUpApprovedBy,
        step_up_approval_note: stepUpApprovalNote,
        extend_days: Math.max(1, Math.min(30, Math.round(extendDays))),
      }),
    }
  );
}

export async function adminForceLicenseResync(
  shopCode: string,
  actorNote: string,
  actor = "support-ui",
  reasonCode = "manual_license_resync"
) {
  return request<AdminLicenseResyncResponse>("/api/admin/licensing/resync", {
    method: "POST",
    body: JSON.stringify({
      shop_code: shopCode,
      actor,
      reason_code: reasonCode,
      actor_note: actorNote,
      reason: actorNote,
    }),
  });
}

export async function adminMassRevokeDevices(
  deviceCodes: string[],
  actorNote: string,
  actor = "support-ui",
  reasonCode = "manual_mass_revoke",
  stepUpApprovedBy?: string,
  stepUpApprovalNote?: string
) {
  return request<AdminMassDeviceRevokeResponse>("/api/admin/licensing/devices/mass-revoke", {
    method: "POST",
    body: JSON.stringify({
      device_codes: deviceCodes,
      actor,
      reason_code: reasonCode,
      actor_note: actorNote,
      step_up_approved_by: stepUpApprovedBy,
      step_up_approval_note: stepUpApprovalNote,
    }),
  });
}

export async function createAdminEmergencyCommandEnvelope(
  deviceCode: string,
  action: "lock_device" | "revoke_token" | "force_reauth",
  actorNote: string,
  actor = "support-ui",
  reasonCode = `emergency_${action}`
) {
  return request<AdminEmergencyCommandEnvelopeResponse>(
    `/api/admin/licensing/devices/${encodeURIComponent(deviceCode)}/emergency/envelope`,
    {
      method: "POST",
      body: JSON.stringify({
        action,
        actor,
        reason_code: reasonCode,
        actor_note: actorNote,
      }),
    }
  );
}

export async function executeAdminEmergencyCommand(deviceCode: string, envelopeToken: string) {
  return request<AdminEmergencyCommandExecuteResponse>(
    `/api/admin/licensing/devices/${encodeURIComponent(deviceCode)}/emergency/execute`,
    {
      method: "POST",
      body: JSON.stringify({
        envelope_token: envelopeToken,
      }),
    }
  );
}

export async function runAdminEmergencyAction(
  deviceCode: string,
  action: "lock_device" | "revoke_token" | "force_reauth",
  actorNote: string,
  actor = "support-ui"
) {
  const envelope = await createAdminEmergencyCommandEnvelope(deviceCode, action, actorNote, actor);
  return executeAdminEmergencyCommand(deviceCode, envelope.envelope_token);
}

export async function exportAdminLicenseAuditLogs({
  search,
  action,
  actor,
  take = 200,
  format = "csv",
}: {
  search?: string;
  action?: string;
  actor?: string;
  take?: number;
  format?: "csv" | "json";
}) {
  const params = new URLSearchParams();
  if (search?.trim()) {
    params.set("search", search.trim());
  }

  if (action?.trim()) {
    params.set("action", action.trim());
  }

  if (actor?.trim()) {
    params.set("actor", actor.trim());
  }

  params.set("take", String(Math.max(1, Math.min(500, Math.round(take)))));
  params.set("format", format);
  const query = params.toString();
  const path = `/api/admin/licensing/audit-logs/export${query ? `?${query}` : ""}`;
  const terminalId = getAuthTerminalId();
  const licenseToken = getStoredLicenseToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      [TERMINAL_ID_HEADER]: terminalId,
      [DEVICE_ID_HEADER]: terminalId,
      [DEVICE_CODE_HEADER]: terminalId,
      [POS_VERSION_HEADER]: POS_CLIENT_VERSION,
      ...(licenseToken ? { "X-License-Token": licenseToken } : {}),
    },
  });
  const content = await parseResponse<string | object>(response);
  const contentDisposition = response.headers.get("content-disposition") || "";
  const filenameMatch = /filename="?([^";]+)"?/i.exec(contentDisposition);
  const fallbackFileName = `license-audit-logs.${format}`;
  return {
    filename: filenameMatch?.[1] || fallbackFileName,
    mimeType: response.headers.get("content-type") || (format === "json" ? "application/json" : "text/csv"),
    content: typeof content === "string" ? content : JSON.stringify(content, null, 2),
  };
}

export async function fetchAdminManualBillingInvoices({
  search,
  status,
  take = 50,
}: {
  search?: string;
  status?: "open" | "pending_verification" | "paid" | "overdue" | "canceled";
  take?: number;
} = {}) {
  const params = new URLSearchParams();
  if (search?.trim()) {
    params.set("search", search.trim());
  }

  if (status?.trim()) {
    params.set("status", status.trim());
  }

  params.set("take", String(Math.max(1, Math.min(200, Math.round(take)))));
  const query = params.toString();
  return request<AdminManualBillingInvoicesResponse>(`/api/admin/licensing/billing/invoices${query ? `?${query}` : ""}`);
}

export async function createAdminManualBillingInvoice(
  payload: CreateAdminManualBillingInvoiceRequest
) {
  return request<AdminManualBillingInvoiceRow>("/api/admin/licensing/billing/invoices", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchAdminManualBillingPayments({
  search,
  status,
  take = 50,
}: {
  search?: string;
  status?: "pending_verification" | "verified" | "rejected";
  take?: number;
} = {}) {
  const params = new URLSearchParams();
  if (search?.trim()) {
    params.set("search", search.trim());
  }

  if (status?.trim()) {
    params.set("status", status.trim());
  }

  params.set("take", String(Math.max(1, Math.min(200, Math.round(take)))));
  const query = params.toString();
  return request<AdminManualBillingPaymentsResponse>(`/api/admin/licensing/billing/payments${query ? `?${query}` : ""}`);
}

export async function fetchAdminManualBillingDailyReconciliation({
  date,
  currency = "LKR",
  expectedTotal,
  take = 50,
}: {
  date?: string;
  currency?: string;
  expectedTotal?: number;
  take?: number;
} = {}) {
  const params = new URLSearchParams();
  if (date?.trim()) {
    params.set("date", date.trim());
  }

  if (currency?.trim()) {
    params.set("currency", currency.trim());
  }

  if (typeof expectedTotal === "number" && Number.isFinite(expectedTotal)) {
    params.set("expected_total", String(expectedTotal));
  }

  params.set("take", String(Math.max(1, Math.min(200, Math.round(take)))));
  const query = params.toString();
  return request<AdminManualBillingDailyReconciliationResponse>(
    `/api/admin/licensing/billing/reconciliation/daily${query ? `?${query}` : ""}`
  );
}

export async function runAdminBillingStateReconciliation(
  payload: RunAdminBillingStateReconciliationRequest
) {
  return request<AdminBillingStateReconciliationRunResponse>("/api/admin/licensing/billing/reconciliation/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function recordAdminManualBillingPayment(
  payload: RecordAdminManualBillingPaymentRequest
) {
  return request<AdminManualBillingPaymentRow>("/api/admin/licensing/billing/payments/record", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function verifyAdminManualBillingPayment(
  paymentId: string,
  payload: VerifyAdminManualBillingPaymentRequest
) {
  return request<AdminManualBillingPaymentVerificationResponse>(
    `/api/admin/licensing/billing/payments/${encodeURIComponent(paymentId)}/verify`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function rejectAdminManualBillingPayment(
  paymentId: string,
  payload: RejectAdminManualBillingPaymentRequest
) {
  return request<AdminManualBillingPaymentRow>(
    `/api/admin/licensing/billing/payments/${encodeURIComponent(paymentId)}/reject`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function generateAdminManualBillingLicenseCode(
  paymentId: string,
  payload: GenerateAdminManualBillingLicenseCodeRequest
) {
  return request<AdminManualBillingPaymentLicenseCodeGenerateResponse>(
    `/api/admin/licensing/billing/payments/${encodeURIComponent(paymentId)}/license-code/generate`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
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
      language: profile.language,
      address_line1: profile.addressLine1 || null,
      address_line2: profile.addressLine2 || null,
      phone: profile.phone || null,
      email: profile.email || null,
      website: profile.website || null,
      logo_url: profile.logoUrl || null,
      receipt_footer: profile.receiptFooter || null,
      show_new_item_for_cashier: profile.showNewItemForCashier,
      show_manage_for_cashier: profile.showManageForCashier,
      show_reports_for_cashier: profile.showReportsForCashier,
      show_ai_insights_for_cashier: profile.showAiInsightsForCashier,
      show_held_bills_for_cashier: profile.showHeldBillsForCashier,
      show_reminders_for_cashier: profile.showRemindersForCashier,
      show_audit_trail_for_cashier: profile.showAuditTrailForCashier,
      show_end_shift_for_cashier: profile.showEndShiftForCashier,
      show_today_sales_for_cashier: profile.showTodaySalesForCashier,
      show_import_bill_for_cashier: profile.showImportBillForCashier,
      show_shop_settings_for_cashier: profile.showShopSettingsForCashier,
      show_my_licenses_for_cashier: profile.showMyLicensesForCashier,
      show_offline_sync_for_cashier: profile.showOfflineSyncForCashier,
    }),
  });

  return mapShopProfile(response);
}

export type CloudAccountStatus = {
  is_linked: boolean;
  cloud_username?: string | null;
  cloud_full_name?: string | null;
  cloud_role?: string | null;
  cloud_shop_code?: string | null;
  token_expires_at?: string | null;
  is_token_expired: boolean;
  linked_at?: string | null;
  cloud_relay_configured: boolean;
};

export type CloudAccountLinkResult = {
  cloud_username: string;
  cloud_full_name: string;
  cloud_role: string;
  cloud_shop_code: string;
  token_expires_at: string;
  linked_at: string;
};

export async function fetchCloudAccountStatus() {
  return request<CloudAccountStatus>("/api/cloud-account/status");
}

export async function linkCloudAccount(username: string, password: string) {
  return request<CloudAccountLinkResult>("/api/cloud-account/link", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function unlinkCloudAccount() {
  return request<{ message: string }>("/api/cloud-account/unlink", {
    method: "DELETE",
  });
}
