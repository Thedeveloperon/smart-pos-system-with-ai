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

export type AiCheckoutPaymentMethod = "card" | "cash" | "bank_deposit";

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
    custom_payout_used: boolean;
    cash_short_amount: number;
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

type BackendCashSessionHistoryResponse = {
  items: {
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
  }[];
};

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

export type AdminShopsLicensingSnapshotResponse = {
  generated_at: string;
  items: {
    shop_id: string;
    shop_code: string;
    shop_name: string;
    is_active: boolean;
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

export type CreateAdminShopRequest = {
  shop_code: string;
  shop_name: string;
  owner_username: string;
  owner_password: string;
  owner_full_name?: string;
  actor?: string;
  reason_code?: string;
  actor_note: string;
};

export type UpdateAdminShopRequest = {
  shop_name?: string;
  shop_code?: string;
  actor?: string;
  reason_code?: string;
  actor_note: string;
};

export type DeactivateAdminShopRequest = {
  actor?: string;
  reason_code?: string;
  actor_note: string;
};

export type ReactivateAdminShopRequest = {
  actor?: string;
  reason_code?: string;
  actor_note: string;
};

export type AdminShopMutationResponse = {
  action: string;
  shop: {
    shop_id: string;
    shop_code: string;
    shop_name: string;
    is_active: boolean;
    created_at: string;
    updated_at?: string | null;
  };
  owner?: {
    user_id: string;
    username: string;
    full_name: string;
  } | null;
  processed_at: string;
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

export type AdminShopUserRow = {
  user_id: string;
  shop_id: string;
  shop_code: string;
  username: string;
  full_name: string;
  role_code: "owner" | "manager" | "cashier" | string;
  is_active: boolean;
  created_at: string;
  last_login_at?: string | null;
};

export type AdminShopUsersResponse = {
  generated_at: string;
  count: number;
  items: AdminShopUserRow[];
};

export type CreateAdminShopUserRequest = {
  shop_code: string;
  username: string;
  full_name: string;
  role_code: "owner" | "manager" | "cashier";
  password: string;
  actor?: string;
  reason_code?: string;
  actor_note: string;
};

export type UpdateAdminShopUserRequest = {
  username?: string;
  full_name?: string;
  role_code?: "owner" | "manager" | "cashier";
  actor?: string;
  reason_code?: string;
  actor_note: string;
};

export type DeactivateAdminShopUserRequest = {
  actor?: string;
  reason_code?: string;
  actor_note: string;
};

export type ReactivateAdminShopUserRequest = {
  actor?: string;
  reason_code?: string;
  actor_note: string;
};

export type ResetAdminShopUserPasswordRequest = {
  new_password: string;
  actor?: string;
  reason_code?: string;
  actor_note: string;
};

export type AdminShopUserMutationResponse = {
  action: string;
  user: AdminShopUserRow;
  processed_at: string;
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

function normalizeMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "Request failed.";
  }

  const asRecord = payload as Record<string, unknown>;
  const nestedError = asRecord.error as Record<string, unknown> | undefined;
  const message =
    (typeof nestedError?.message === "string" ? nestedError.message : undefined) ||
    (typeof asRecord.message === "string" ? asRecord.message : undefined);

  if (message && message.trim()) {
    return message.trim();
  }

  return "Request failed.";
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const headers = new Headers(init?.headers || undefined);

  if (method !== "GET" && !headers.has("Idempotency-Key")) {
    headers.set("Idempotency-Key", getIdempotencyKey());
  }

  const response = await fetch(path, {
    ...init,
    method,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  const payload = await parseResponseBody(response);
  if (!response.ok) {
    const asRecord = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : undefined;
    const nestedError = asRecord?.error as Record<string, unknown> | undefined;
    const code = typeof nestedError?.code === "string" ? nestedError.code : undefined;
    throw new ApiError(normalizeMessage(payload), response.status, code);
  }

  return payload as T;
}

function mapCashSessionHistoryItem(item: BackendCashSessionHistoryResponse["items"][number]): CashSessionHistoryItem {
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

function formatDateQueryValue(value: Date | string) {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function fetchAiPendingManualPayments(take = 40) {
  const normalizedTake = Math.max(1, Math.min(200, Math.trunc(take || 40)));
  return request<AiPendingManualPaymentsResponse>(`/api/ai/payments/pending-manual?take=${normalizedTake}`);
}

export async function verifyAiManualPayment(requestBody: AiManualPaymentVerifyRequest) {
  return request<AiCheckoutSessionResponse>("/api/ai/payments/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
}

export async function fetchDailySalesReport(fromDate: Date | string = new Date(), toDate: Date | string = fromDate) {
  const from = formatDateQueryValue(fromDate);
  const to = formatDateQueryValue(toDate);
  return request<DailySalesReportResponse>(`/api/reports/daily?from=${from}&to=${to}`);
}

export async function fetchTransactionsReport(
  fromDate: Date | string = new Date(),
  toDate: Date | string = fromDate,
  take = 200,
) {
  const from = formatDateQueryValue(fromDate);
  const to = formatDateQueryValue(toDate);
  return request<TransactionsReportResponse>(`/api/reports/transactions?from=${from}&to=${to}&take=${take}`);
}

export async function fetchPaymentBreakdownReport(
  fromDate: Date | string = new Date(),
  toDate: Date | string = fromDate,
) {
  const from = formatDateQueryValue(fromDate);
  const to = formatDateQueryValue(toDate);
  return request<PaymentBreakdownReportResponse>(`/api/reports/payment-breakdown?from=${from}&to=${to}`);
}

export async function fetchTopItemsReport(
  fromDate: Date | string = new Date(),
  toDate: Date | string = fromDate,
  take = 10,
) {
  const from = formatDateQueryValue(fromDate);
  const to = formatDateQueryValue(toDate);
  return request<TopItemsReportResponse>(`/api/reports/top-items?from=${from}&to=${to}&take=${take}`);
}

export async function fetchLowStockReport(take = 20, threshold = 5) {
  return request<LowStockReportResponse>(`/api/reports/low-stock?take=${take}&threshold=${threshold}`);
}

export async function fetchSupportTriageReport(windowMinutes = 30) {
  return request<SupportTriageReportResponse>(`/api/reports/support-triage?window_minutes=${windowMinutes}`);
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
    `/api/cash-sessions${query.toString() ? `?${query.toString()}` : ""}`,
  );

  return {
    items: response.items.map(mapCashSessionHistoryItem),
  };
}

export async function fetchAdminLicensingShops({
  search,
  includeInactive = false,
  take = 100,
}: {
  search?: string;
  includeInactive?: boolean;
  take?: number;
} = {}) {
  const params = new URLSearchParams();
  if (search?.trim()) {
    params.set("search", search.trim());
  }

  if (includeInactive) {
    params.set("include_inactive", "true");
  }

  params.set("take", String(Math.max(1, Math.min(500, Math.round(take)))));
  const query = params.toString();
  return request<AdminShopsLicensingSnapshotResponse>(`/api/admin/licensing/shops${query ? `?${query}` : ""}`);
}

export async function createAdminShop(payload: CreateAdminShopRequest) {
  return request<AdminShopMutationResponse>("/api/admin/licensing/shops", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function updateAdminShop(shopId: string, payload: UpdateAdminShopRequest) {
  return request<AdminShopMutationResponse>(`/api/admin/licensing/shops/${encodeURIComponent(shopId)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function deactivateAdminShop(shopId: string, payload: DeactivateAdminShopRequest) {
  return request<AdminShopMutationResponse>(`/api/admin/licensing/shops/${encodeURIComponent(shopId)}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function reactivateAdminShop(shopId: string, payload: ReactivateAdminShopRequest) {
  return request<AdminShopMutationResponse>(`/api/admin/licensing/shops/${encodeURIComponent(shopId)}/reactivate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function fetchAdminShopUsers({
  shopCode,
  search,
  includeInactive = false,
  take = 50,
}: {
  shopCode?: string;
  search?: string;
  includeInactive?: boolean;
  take?: number;
} = {}) {
  const params = new URLSearchParams();
  if (shopCode?.trim()) {
    params.set("shop_code", shopCode.trim());
  }

  if (search?.trim()) {
    params.set("search", search.trim());
  }

  if (includeInactive) {
    params.set("include_inactive", "true");
  }

  params.set("take", String(Math.max(1, Math.min(200, Math.round(take)))));
  const query = params.toString();
  return request<AdminShopUsersResponse>(`/api/admin/licensing/users${query ? `?${query}` : ""}`);
}

export async function createAdminShopUser(payload: CreateAdminShopUserRequest) {
  return request<AdminShopUserMutationResponse>("/api/admin/licensing/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function updateAdminShopUser(userId: string, payload: UpdateAdminShopUserRequest) {
  return request<AdminShopUserMutationResponse>(`/api/admin/licensing/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function deactivateAdminShopUser(userId: string, payload: DeactivateAdminShopUserRequest) {
  return request<AdminShopUserMutationResponse>(`/api/admin/licensing/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function reactivateAdminShopUser(userId: string, payload: ReactivateAdminShopUserRequest) {
  return request<AdminShopUserMutationResponse>(`/api/admin/licensing/users/${encodeURIComponent(userId)}/reactivate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function resetAdminShopUserPassword(userId: string, payload: ResetAdminShopUserPasswordRequest) {
  return request<AdminShopUserMutationResponse>(
    `/api/admin/licensing/users/${encodeURIComponent(userId)}/reset-password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
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
  reasonCode = "manual_device_revoke",
) {
  return request<AdminDeviceActionResponse>(`/api/admin/licensing/devices/${encodeURIComponent(deviceCode)}/revoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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
  reasonCode = "manual_device_deactivate",
) {
  return request<AdminDeviceActionResponse>(`/api/admin/licensing/devices/${encodeURIComponent(deviceCode)}/deactivate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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
  reasonCode = "manual_device_reactivate",
) {
  return request<AdminDeviceActionResponse>(`/api/admin/licensing/devices/${encodeURIComponent(deviceCode)}/reactivate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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
  reasonCode = "manual_device_activate",
) {
  return request<AdminDeviceActionResponse>(`/api/admin/licensing/devices/${encodeURIComponent(deviceCode)}/activate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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
  reasonCode = "manual_transfer_seat",
) {
  return request<AdminDeviceSeatTransferResponse>(
    `/api/admin/licensing/devices/${encodeURIComponent(deviceCode)}/transfer-seat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target_shop_code: targetShopCode,
        actor,
        reason_code: reasonCode,
        actor_note: actorNote,
        reason: actorNote,
      }),
    },
  );
}

export async function adminExtendDeviceGrace(
  deviceCode: string,
  extendDays: number,
  actorNote: string,
  actor = "support-ui",
  reasonCode = "manual_extend_grace",
  stepUpApprovedBy?: string,
  stepUpApprovalNote?: string,
) {
  return request<AdminDeviceActionResponse>(
    `/api/admin/licensing/devices/${encodeURIComponent(deviceCode)}/extend-grace`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actor,
        reason_code: reasonCode,
        actor_note: actorNote,
        reason: actorNote,
        step_up_approved_by: stepUpApprovedBy,
        step_up_approval_note: stepUpApprovalNote,
        extend_days: Math.max(1, Math.min(30, Math.round(extendDays))),
      }),
    },
  );
}

export async function adminForceLicenseResync(
  shopCode: string,
  actorNote: string,
  actor = "support-ui",
  reasonCode = "manual_license_resync",
) {
  return request<AdminLicenseResyncResponse>("/api/admin/licensing/resync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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
  stepUpApprovalNote?: string,
) {
  return request<AdminMassDeviceRevokeResponse>("/api/admin/licensing/devices/mass-revoke", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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
  reasonCode = `emergency_${action}`,
) {
  return request<AdminEmergencyCommandEnvelopeResponse>(
    `/api/admin/licensing/devices/${encodeURIComponent(deviceCode)}/emergency/envelope`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        actor,
        reason_code: reasonCode,
        actor_note: actorNote,
      }),
    },
  );
}

export async function executeAdminEmergencyCommand(deviceCode: string, envelopeToken: string) {
  return request<AdminEmergencyCommandExecuteResponse>(
    `/api/admin/licensing/devices/${encodeURIComponent(deviceCode)}/emergency/execute`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        envelope_token: envelopeToken,
      }),
    },
  );
}

export async function runAdminEmergencyAction(
  deviceCode: string,
  action: "lock_device" | "revoke_token" | "force_reauth",
  actorNote: string,
  actor = "support-ui",
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
  const response = await fetch(path, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Idempotency-Key": getIdempotencyKey(),
    },
  });
  const content = await parseResponseBody(response);

  if (!response.ok) {
    const asRecord = content && typeof content === "object" ? (content as Record<string, unknown>) : undefined;
    const nestedError = asRecord?.error as Record<string, unknown> | undefined;
    const code = typeof nestedError?.code === "string" ? nestedError.code : undefined;
    throw new ApiError(normalizeMessage(content), response.status, code);
  }

  const contentDisposition = response.headers.get("content-disposition") || "";
  const filenameMatch = /filename=\"?([^\";]+)\"?/i.exec(contentDisposition);
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

export async function createAdminManualBillingInvoice(payload: CreateAdminManualBillingInvoiceRequest) {
  return request<AdminManualBillingInvoiceRow>("/api/admin/licensing/billing/invoices", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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
    `/api/admin/licensing/billing/reconciliation/daily${query ? `?${query}` : ""}`,
  );
}

export async function runAdminBillingStateReconciliation(payload: RunAdminBillingStateReconciliationRequest) {
  return request<AdminBillingStateReconciliationRunResponse>("/api/admin/licensing/billing/reconciliation/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function recordAdminManualBillingPayment(payload: RecordAdminManualBillingPaymentRequest) {
  return request<AdminManualBillingPaymentRow>("/api/admin/licensing/billing/payments/record", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function verifyAdminManualBillingPayment(
  paymentId: string,
  payload: VerifyAdminManualBillingPaymentRequest,
) {
  return request<AdminManualBillingPaymentVerificationResponse>(
    `/api/admin/licensing/billing/payments/${encodeURIComponent(paymentId)}/verify`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
}

export async function rejectAdminManualBillingPayment(
  paymentId: string,
  payload: RejectAdminManualBillingPaymentRequest,
) {
  return request<AdminManualBillingPaymentRow>(
    `/api/admin/licensing/billing/payments/${encodeURIComponent(paymentId)}/reject`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
}
