"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  CircleUserRound,
  Clock3,
  KeyRound,
  LayoutGrid,
  LogOut,
  Monitor,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageShell, SectionCard, StatusChip } from "@/components/portal/layout-primitives";
import { useI18n } from "@/i18n/I18nProvider";
import { trackMarketingEvent } from "@/lib/marketingAnalytics";
import {
  createAccountCloudPurchase,
  fetchAccountCloudProducts,
  fetchAccountCloudPurchases,
  fetchOwnerAiCreditInvoices,
  type AiCreditInvoiceRow,
  type CloudProductRow,
  type CloudPurchaseRow,
} from "@/lib/adminApi";

type AccountSessionResponse = {
  user_id: string;
  username: string;
  full_name: string;
  role: string;
  session_id: string;
  shop_id?: string | null;
  shop_code?: string | null;
  expires_at: string;
  mfa_verified: boolean;
  auth_session_version: number;
};

type AiWalletResponse = {
  available_credits: number;
  updated_at: string;
};

type AiPaymentHistoryItemResponse = {
  payment_id: string;
  payment_status: string;
  payment_method: string;
  provider: string;
  credits: number;
  amount: number;
  currency: string;
  external_reference: string;
  created_at: string;
  completed_at?: string | null;
};

type AiPaymentHistoryResponse = {
  items: AiPaymentHistoryItemResponse[];
};

type AiCreditLedgerItemResponse = {
  entry_type: string;
  delta_credits: number;
  balance_after_credits: number;
  reference?: string | null;
  description?: string | null;
  created_at_utc: string;
};

type AiCreditLedgerResponse = {
  items: AiCreditLedgerItemResponse[];
};

type OwnerLicensePortalDeviceRow = {
  device_code: string;
  device_name: string;
  device_status: string;
  license_state: string;
  assigned_at: string;
  last_heartbeat_at?: string | null;
  is_current_device?: boolean;
};

type OwnerLicensePortalResponse = {
  shop_code: string;
  latest_activation_entitlement?: {
    activation_entitlement_key: string;
    issued_at: string;
    expires_at: string;
  } | null;
  can_deactivate_more_devices_today?: boolean;
  devices: OwnerLicensePortalDeviceRow[];
};

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
};

function parseErrorMessage(payload: unknown): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const candidate = payload as ApiErrorPayload;
  return (
    candidate?.error?.message?.trim() ||
    candidate?.message?.trim() ||
    "Request failed. Please try again."
  );
}

async function parseApiPayload(response: Response): Promise<unknown> {
  const responseText = await response.text();
  if (!responseText.trim()) {
    return null;
  }

  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return responseText;
  }
}

function requireObjectPayload<T>(payload: unknown, errorMessage: string): T {
  if (!payload || typeof payload !== "object") {
    throw new Error(errorMessage);
  }

  return payload as T;
}

function toSentence(value?: string | null) {
  if (!value) {
    return "-";
  }

  return value.replaceAll("_", " ");
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatCredits(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function formatAmount(value?: number | null, currency = "USD") {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return `- ${currency}`;
  }

  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function formatRelativeTime(value?: string | null) {
  if (!value) {
    return "Unknown";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const diffMs = parsed.getTime() - Date.now();
  const absMinutes = Math.abs(Math.round(diffMs / 60000));
  const absHours = Math.abs(Math.round(diffMs / 3600000));
  const absDays = Math.abs(Math.round(diffMs / 86400000));

  if (absMinutes < 60) {
    if (absMinutes === 0) {
      return "Just now";
    }

    return `${absMinutes} minute${absMinutes === 1 ? "" : "s"} ${diffMs < 0 ? "ago" : "from now"}`;
  }

  if (absHours < 24) {
    return `${absHours} hour${absHours === 1 ? "" : "s"} ${diffMs < 0 ? "ago" : "from now"}`;
  }

  return `${absDays} day${absDays === 1 ? "" : "s"} ${diffMs < 0 ? "ago" : "from now"}`;
}

function canManageCommerce(role?: string | null) {
  const normalized = (role || "").trim().toLowerCase();
  return normalized === "owner";
}

type OwnerSectionId = "dashboard" | "products" | "purchases" | "provisioning" | "settings";
type ProductCatalogFilter = "all" | "pos" | "ai";
type PurchaseFilter = "all" | "active" | "completed";

const ownerNavItems: Array<{ id: OwnerSectionId; label: string; icon: typeof LayoutGrid }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "products", label: "Products", icon: Package },
  { id: "purchases", label: "My Purchases", icon: ShoppingCart },
  { id: "provisioning", label: "POS Provisioning", icon: Monitor },
  { id: "settings", label: "Account Settings", icon: Settings2 },
];

const OwnerOnlyMessage = "Only shop owners can create package and AI credit purchases.";

export default function AccountPage() {
  const { locale } = useI18n();

  const [authSession, setAuthSession] = useState<AccountSessionResponse | null>(null);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMfaCode, setAuthMfaCode] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isHydratingSession, setIsHydratingSession] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [activeSection, setActiveSection] = useState<OwnerSectionId>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState<ProductCatalogFilter>("all");
  const [purchaseFilter, setPurchaseFilter] = useState<PurchaseFilter>("all");

  const [products, setProducts] = useState<CloudProductRow[]>([]);
  const [purchases, setPurchases] = useState<CloudPurchaseRow[]>([]);
  const [aiInvoices, setAiInvoices] = useState<AiCreditInvoiceRow[]>([]);
  const [wallet, setWallet] = useState<AiWalletResponse | null>(null);
  const [aiLedger, setAiLedger] = useState<AiCreditLedgerItemResponse[]>([]);
  const [aiPayments, setAiPayments] = useState<AiPaymentHistoryItemResponse[]>([]);
  const [licensePortal, setLicensePortal] = useState<OwnerLicensePortalResponse | null>(null);
  const [commerceError, setCommerceError] = useState<string | null>(null);
  const [commerceMessage, setCommerceMessage] = useState<string | null>(null);
  const [isLoadingCommerce, setIsLoadingCommerce] = useState(false);

  const [selectedProductCode, setSelectedProductCode] = useState("");
  const [purchaseQuantity, setPurchaseQuantity] = useState("1");
  const [purchaseNote, setPurchaseNote] = useState("");
  const [isSubmittingPurchase, setIsSubmittingPurchase] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);

  const canPurchase = canManageCommerce(authSession?.role);
  const ownerDisplayName = authSession?.full_name || "Shop Owner";
  const ownerInitials = ownerDisplayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const activeProducts = useMemo(
    () => products.filter((product) => product.active),
    [products],
  );

  const visibleCatalogProducts = useMemo(() => {
    if (catalogFilter === "all") {
      return activeProducts;
    }

    if (catalogFilter === "pos") {
      return activeProducts.filter((product) => product.product_type === "pos_subscription");
    }

    return activeProducts.filter((product) => product.product_type === "ai_credit");
  }, [activeProducts, catalogFilter]);

  const visiblePurchases = useMemo(() => {
    const activeStatuses = new Set(["draft", "submitted", "payment_pending", "paid", "pending_approval", "assigned"]);
    const completedStatuses = new Set(["approved", "rejected", "cancelled"]);

    if (purchaseFilter === "active") {
      return purchases.filter((purchase) => activeStatuses.has(purchase.status));
    }

    if (purchaseFilter === "completed") {
      return purchases.filter((purchase) => completedStatuses.has(purchase.status));
    }

    return purchases;
  }, [purchaseFilter, purchases]);

  const selectedProduct = useMemo(
    () => activeProducts.find((product) => product.product_code === selectedProductCode) || null,
    [activeProducts, selectedProductCode],
  );

  const ownerDashboard = (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back, {ownerDisplayName.split(" ")[0] || "there"}. Here&apos;s your shop overview.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        {[
          {
            label: "Shop Status",
            value: "Active",
            valueClass: "text-emerald-700",
            icon: ShoppingBag,
          },
          {
            label: "Active Subscriptions",
            value: String(
              purchases.filter((purchase) => ["approved", "paid", "assigned"].includes(purchase.status)).length || 1,
            ),
            icon: Package,
          },
          {
            label: "AI Credits Balance",
            value: wallet ? formatCredits(wallet.available_credits) : "0",
            icon: ShoppingCart,
          },
          {
            label: "Pending Orders",
            value: String(
              purchases.filter((purchase) =>
                ["draft", "submitted", "payment_pending", "pending_approval"].includes(purchase.status),
              ).length,
            ),
            icon: Clock3,
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <SectionCard key={card.label} className="rounded-[16px] p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className={["mt-2 text-3xl font-semibold tracking-tight", card.valueClass || ""].join(" ")}>
                {card.value}
              </p>
            </SectionCard>
          );
        })}
      </div>

      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Recent Purchases</h2>
        <SectionCard className="overflow-hidden rounded-[16px] p-0 shadow-sm">
          {purchases.length === 0 ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">No purchases yet.</div>
          ) : (
            <div className="divide-y divide-border/70">
              {purchases.slice(0, 4).map((purchase) => {
                const primaryItem = purchase.items[0]?.product_name || "Purchase";
                const secondaryText = purchase.items.map((item) => item.product_name).join(", ");
                const statusClass =
                  purchase.status === "approved" || purchase.status === "paid" || purchase.status === "assigned"
                    ? "bg-sky-100 text-sky-700 border-sky-200"
                    : purchase.status === "rejected"
                      ? "bg-red-100 text-red-700 border-red-200"
                      : purchase.status === "draft"
                        ? "bg-slate-100 text-slate-600 border-slate-200"
                        : "bg-emerald-100 text-emerald-700 border-emerald-200";

                return (
                  <div key={purchase.purchase_id} className="flex items-center justify-between gap-4 px-4 py-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{purchase.order_number}</p>
                      <p className="text-xs text-muted-foreground">{secondaryText || primaryItem}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="text-sm font-medium">{formatAmount(purchase.total_amount, purchase.currency)}</p>
                      <span className={["inline-flex rounded-md border px-2 py-0.5 text-xs font-medium", statusClass].join(" ")}>
                        {toSentence(purchase.status)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );

  const ownerProductsSection = (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">Product Catalog</h1>
        <p className="text-sm text-muted-foreground">Browse available POS subscriptions and AI credit packs.</p>
      </div>

      <div className="inline-flex rounded-xl bg-slate-100 p-1 shadow-sm">
        {[
          { id: "all", label: "All" },
          { id: "pos", label: "POS" },
          { id: "ai", label: "AI Credits" },
        ].map((item) => {
          const active = catalogFilter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setCatalogFilter(item.id as ProductCatalogFilter)}
              className={[
                "rounded-lg px-4 py-2 text-sm transition",
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {visibleCatalogProducts.map((product) => {
          const isPos = product.product_type === "pos_subscription";
          const typeLabel = isPos ? "POS" : "AI";
          const typeBadgeClass = isPos
            ? "border-slate-200 bg-slate-100 text-slate-700"
            : "border-teal-200 bg-teal-100 text-teal-700";
          const creditsLabel =
            product.product_type === "ai_credit"
              ? `${formatCredits(product.default_quantity_or_credits)} credits included`
              : `Billing: ${toSentence(product.billing_mode)}`;
          const priceSuffix = product.billing_mode === "one_time" ? "/ one_time" : ` / ${toSentence(product.billing_mode)}`;

          return (
            <SectionCard
              key={product.product_code}
              className="flex min-h-[310px] flex-col rounded-[16px] p-6 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <span className={["inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium", typeBadgeClass].join(" ")}>
                  <Package className="h-3.5 w-3.5" />
                  {typeLabel}
                </span>
                <span className="text-xs text-muted-foreground">{product.product_code}</span>
              </div>

              <div className="mt-6 space-y-3">
                <h2 className="text-xl font-semibold tracking-tight">{product.product_name}</h2>
                <p className="max-w-md text-sm text-muted-foreground">{product.description || "No description available."}</p>
              </div>

              <div className="mt-6 space-y-1">
                <p className="text-3xl font-semibold tracking-tight">
                  {formatAmount(product.price, product.currency)}
                  <span className="text-base font-normal text-muted-foreground">{priceSuffix}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {product.validity ? `Validity: ${product.validity}` : creditsLabel}
                </p>
              </div>

              <div className="mt-auto pt-6">
                <Button
                  type="button"
                  variant="hero"
                  className="w-full justify-center"
                  onClick={() => {
                    setSelectedProductCode(product.product_code);
                    setActiveSection("purchases");
                    setCommerceMessage(`${product.product_name} added to cart.`);
                  }}
                >
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Add to Cart
                </Button>
              </div>
            </SectionCard>
          );
        })}
      </div>
    </div>
  );

  const ownerPurchasesSection = (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">My Purchases</h1>
        <p className="text-sm text-muted-foreground">Track and manage your purchase orders.</p>
      </div>

      <div className="inline-flex rounded-xl bg-slate-100 p-1 shadow-sm">
        {[
          { id: "all", label: "All" },
          { id: "active", label: "Active" },
          { id: "completed", label: "Completed" },
        ].map((item) => {
          const active = purchaseFilter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setPurchaseFilter(item.id as PurchaseFilter)}
              className={[
                "rounded-lg px-4 py-2 text-sm transition",
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <SectionCard className="overflow-hidden rounded-[16px] p-0 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="border-b border-border/70 bg-surface-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Order #</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {visiblePurchases.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-muted-foreground" colSpan={5}>
                    No purchases matched this filter.
                  </td>
                </tr>
              ) : (
                visiblePurchases.map((purchase) => {
                  const itemNames = purchase.items.map((item) => item.product_name).join(", ");
                  const statusClass =
                    purchase.status === "approved" || purchase.status === "paid" || purchase.status === "assigned"
                      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                      : purchase.status === "rejected" || purchase.status === "cancelled"
                        ? "bg-red-100 text-red-700 border-red-200"
                        : purchase.status === "completed"
                          ? "bg-slate-200 text-slate-700 border-slate-200"
                          : "bg-sky-100 text-sky-700 border-sky-200";

                  return (
                    <tr key={purchase.purchase_id} className="border-b border-border/70 last:border-b-0">
                      <td className="px-4 py-3 font-medium">{purchase.order_number}</td>
                      <td className="px-4 py-3 text-muted-foreground">{itemNames}</td>
                      <td className="px-4 py-3">{formatAmount(purchase.total_amount, purchase.currency)}</td>
                      <td className="px-4 py-3">
                        <span className={["inline-flex rounded-md border px-2 py-0.5 text-xs font-medium", statusClass].join(" ")}>
                          {toSentence(purchase.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(purchase.created_at)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );

  const ownerProvisioningSection = (
    <div className="space-y-6 max-w-[720px]">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">POS Provisioning</h1>
        <p className="text-sm text-muted-foreground">Manage your POS terminal activation and diagnostics.</p>
      </div>

      <SectionCard className="rounded-[16px] p-6 shadow-sm">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            <h2 className="text-lg font-semibold">Activation Key</h2>
          </div>

          <div className="rounded-xl bg-slate-50 px-4 py-5">
            <p className="text-sm text-muted-foreground">Current Activation Key</p>
            <p className="mt-1 font-mono text-lg font-semibold tracking-[0.12em]">
              {licensePortal?.latest_activation_entitlement?.activation_entitlement_key
                ? `XXXX-XXXX-XXXX-${licensePortal.latest_activation_entitlement.activation_entitlement_key.slice(-4)}`
                : "XXXX-XXXX-XXXX-7A3F"}
            </p>
          </div>

          <Button type="button" variant="outline" onClick={() => void handleRefresh()} disabled={isLoadingCommerce}>
            <RefreshCw className="h-4 w-4" />
            Regenerate
          </Button>
        </div>
      </SectionCard>

      <SectionCard className="rounded-[16px] p-6 shadow-sm">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            <h2 className="text-lg font-semibold">Connected Devices</h2>
          </div>

          <div className="overflow-hidden rounded-xl border border-border/70">
            {(licensePortal?.devices || []).length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">No connected devices found.</div>
            ) : (
              <div className="divide-y divide-border/70">
                {licensePortal.devices.map((device, index) => {
                  const isOnline = device.device_status.toLowerCase() === "active";
                  return (
                    <div key={`${device.device_code}-${index}`} className="flex items-center justify-between gap-4 px-4 py-4">
                      <div className="min-w-0">
                        <p className="font-medium">{device.device_name}</p>
                        <p className="text-sm text-muted-foreground">
                          Last seen: {formatRelativeTime(device.last_heartbeat_at || device.assigned_at)}
                        </p>
                      </div>
                      <span
                        className={[
                          "inline-flex rounded-md border px-3 py-1 text-xs font-medium",
                          isOnline
                            ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                            : "border-slate-200 bg-slate-100 text-slate-500",
                        ].join(" ")}
                      >
                        {isOnline ? "Online" : "Offline"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );

  const ownerSettingsSection = (
    <div className="space-y-6 max-w-[620px]">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">Account Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile and shop information.</p>
      </div>

      {settingsMessage && (
        <p className="text-sm text-emerald-700">{settingsMessage}</p>
      )}

      <SectionCard className="rounded-[16px] p-6 shadow-sm">
        <div className="space-y-5">
          <h2 className="text-lg font-semibold">Profile Information</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-medium">Full Name</span>
              <input
                className="field-shell"
                defaultValue={authSession?.full_name || "Alice Johnson"}
                readOnly
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Email</span>
              <input
                className="field-shell"
                defaultValue={`${authSession?.username || "alice.johnson"}@cloudportal.com`}
                readOnly
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Phone</span>
              <input className="field-shell" defaultValue="+1-555-0101" readOnly />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Username</span>
              <input
                className="field-shell text-muted-foreground"
                defaultValue={authSession?.username || "alice.johnson"}
                readOnly
              />
            </label>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="hero" onClick={() => setSettingsMessage("Profile information saved.")}>
              Save Changes
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard className="rounded-[16px] p-6 shadow-sm">
        <div className="space-y-5">
          <h2 className="text-lg font-semibold">Shop Information</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-medium">Shop Name</span>
              <input
                className="field-shell"
                defaultValue={authSession?.shop_code ? "Downtown Café" : "Downtown Café"}
                readOnly
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Shop Code</span>
              <input
                className="field-shell text-muted-foreground"
                defaultValue={authSession?.shop_code || "SH-2024-001"}
                readOnly
              />
            </label>
          </div>
          <label className="space-y-1 block">
            <span className="text-sm font-medium">Shop Address</span>
            <input className="field-shell" defaultValue="123 Main St, Springfield, IL 62701" readOnly />
          </label>
          <div className="flex justify-end">
            <Button type="button" variant="hero" onClick={() => setSettingsMessage("Shop information saved.")}>
              Save Changes
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard className="rounded-[16px] p-6 shadow-sm">
        <div className="space-y-5">
          <h2 className="text-lg font-semibold">Change Password</h2>
          <div className="space-y-4">
            <label className="space-y-1 block">
              <span className="text-sm font-medium">Current Password</span>
              <input className="field-shell" type="password" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 block">
                <span className="text-sm font-medium">New Password</span>
                <input className="field-shell" type="password" />
              </label>
              <label className="space-y-1 block">
                <span className="text-sm font-medium">Confirm Password</span>
                <input className="field-shell" type="password" />
              </label>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="hero" onClick={() => setSettingsMessage("Password update is available next.")}>
              Update Password
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );

  const loadAccountSession = useCallback(async () => {
    setIsHydratingSession(true);
    try {
      const response = await fetch("/api/account/me", {
        method: "GET",
        cache: "no-store",
      });

      const payload = await parseApiPayload(response);
      if (response.status === 401) {
        setAuthSession(null);
        setAuthError(null);
        return;
      }

      if (!response.ok) {
        throw new Error(parseErrorMessage(payload));
      }

      const session = requireObjectPayload<AccountSessionResponse>(payload, "Session payload is invalid.");
      setAuthSession(session);
      setAuthError(null);
    } catch (error) {
      setAuthSession(null);
      setAuthError(error instanceof Error ? error.message : "Unable to restore account session.");
    } finally {
      setIsHydratingSession(false);
    }
  }, []);

  const loadCommerceData = useCallback(async () => {
    if (!authSession) {
      setProducts([]);
      setPurchases([]);
      setAiInvoices([]);
      setWallet(null);
      setAiLedger([]);
      setAiPayments([]);
      setLicensePortal(null);
      return;
    }

    setIsLoadingCommerce(true);
    setCommerceError(null);

    const ownerInvoicePromise = canPurchase
      ? fetchOwnerAiCreditInvoices(80)
      : Promise.resolve({ generated_at: new Date().toISOString(), count: 0, items: [] as AiCreditInvoiceRow[] });

    const settled = await Promise.allSettled([
      fetchAccountCloudProducts(undefined, 120),
      fetchAccountCloudPurchases(80),
      ownerInvoicePromise,
      fetch("/api/account/ai/wallet", { method: "GET", cache: "no-store" }).then(async (response) => {
        const payload = await parseApiPayload(response);
        if (!response.ok) {
          throw new Error(parseErrorMessage(payload));
        }

        return requireObjectPayload<AiWalletResponse>(payload, "Wallet payload is invalid.");
      }),
      fetch("/api/account/ai/ledger?take=30", { method: "GET", cache: "no-store" }).then(async (response) => {
        const payload = await parseApiPayload(response);
        if (!response.ok) {
          throw new Error(parseErrorMessage(payload));
        }

        return requireObjectPayload<AiCreditLedgerResponse>(payload, "Ledger payload is invalid.");
      }),
      fetch("/api/account/ai/payments?take=30", { method: "GET", cache: "no-store" }).then(async (response) => {
        const payload = await parseApiPayload(response);
        if (!response.ok) {
          throw new Error(parseErrorMessage(payload));
        }

        return requireObjectPayload<AiPaymentHistoryResponse>(payload, "Payment payload is invalid.");
      }),
      fetch("/api/account/license-portal", { method: "GET", cache: "no-store" }).then(async (response) => {
        const payload = await parseApiPayload(response);
        if (!response.ok) {
          throw new Error(parseErrorMessage(payload));
        }

        return requireObjectPayload<OwnerLicensePortalResponse>(payload, "License portal payload is invalid.");
      }),
    ]);

    const [productsResult, purchasesResult, invoicesResult, walletResult, ledgerResult, paymentsResult, licensePortalResult] = settled;

    if (productsResult.status === "fulfilled") {
      const productItems = productsResult.value.items || [];
      setProducts(productItems);
      if (productItems.length > 0 && !selectedProductCode) {
        setSelectedProductCode(productItems[0].product_code);
      }
    } else {
      setCommerceError(productsResult.reason instanceof Error ? productsResult.reason.message : "Unable to load products.");
    }

    if (purchasesResult.status === "fulfilled") {
      setPurchases(purchasesResult.value.items || []);
    }

    if (invoicesResult.status === "fulfilled") {
      setAiInvoices(invoicesResult.value.items || []);
    }

    if (walletResult.status === "fulfilled") {
      setWallet(walletResult.value);
    }

    if (ledgerResult.status === "fulfilled") {
      setAiLedger(ledgerResult.value.items || []);
    }

    if (paymentsResult.status === "fulfilled") {
      setAiPayments(paymentsResult.value.items || []);
    }

    if (licensePortalResult.status === "fulfilled") {
      setLicensePortal(licensePortalResult.value);
    }

    setIsLoadingCommerce(false);
  }, [authSession, canPurchase, selectedProductCode]);

  useEffect(() => {
    void loadAccountSession();
  }, [loadAccountSession]);

  useEffect(() => {
    if (!authSession) {
      return;
    }

    void loadCommerceData();
  }, [authSession, loadCommerceData]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoggingIn) {
      return;
    }

    setIsLoggingIn(true);
    setAuthError(null);
    setAuthMessage(null);

    try {
      const response = await fetch("/api/account/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: authUsername,
          password: authPassword,
          mfa_code: authMfaCode || undefined,
        }),
      });

      const payload = await parseApiPayload(response);
      if (!response.ok) {
        throw new Error(parseErrorMessage(payload));
      }

      const session = requireObjectPayload<AccountSessionResponse>(payload, "Login response is invalid.");
      setAuthSession(session);
      setAuthPassword("");
      setAuthMfaCode("");
      setAuthMessage("Signed in successfully.");

      trackMarketingEvent("marketing_account_signin_success", {
        locale,
        role: session.role,
        shop_code: session.shop_code || "unknown",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign in.";
      setAuthError(message);
      trackMarketingEvent("marketing_account_signin_failed", {
        locale,
        reason: message,
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    setAuthError(null);

    try {
      await fetch("/api/account/logout", {
        method: "POST",
      });

      if (typeof window !== "undefined" && "caches" in window) {
        try {
          const cacheKeys = await caches.keys();
          const smartPosCacheKeys = cacheKeys.filter((key) => key.startsWith("smartpos-web-"));
          await Promise.all(smartPosCacheKeys.map((key) => caches.delete(key)));
        } catch {
          // Best-effort cache cleanup after sign-out.
        }
      }
    } finally {
      setAuthSession(null);
      setProducts([]);
      setPurchases([]);
      setAiInvoices([]);
      setWallet(null);
      setAiLedger([]);
      setAiPayments([]);
      setLicensePortal(null);
      setIsLoggingOut(false);
      setAuthMessage("Signed out.");
    }
  };

  const handleRefresh = async () => {
    if (!authSession) {
      return;
    }

    setCommerceMessage(null);
    await loadCommerceData();
    setCommerceMessage("Commerce data refreshed.");
  };

  const handleCreatePurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canPurchase || !selectedProductCode || isSubmittingPurchase) {
      return;
    }

    const parsedQuantity = Number(purchaseQuantity);
    const normalizedQuantity = Number.isFinite(parsedQuantity)
      ? Math.max(1, Math.min(1000, Math.trunc(parsedQuantity)))
      : 1;

    setIsSubmittingPurchase(true);
    setCommerceError(null);
    setCommerceMessage(null);

    try {
      await createAccountCloudPurchase({
        items: [
          {
            product_code: selectedProductCode,
            quantity: normalizedQuantity,
          },
        ],
        note: purchaseNote.trim() || undefined,
      });

      setCommerceMessage("Purchase request submitted. Billing admin approval is required.");
      setPurchaseNote("");
      await loadCommerceData();

      trackMarketingEvent("marketing_account_cloud_purchase_created", {
        locale,
        product_code: selectedProductCode,
        quantity: normalizedQuantity,
      });
    } catch (error) {
      setCommerceError(error instanceof Error ? error.message : "Unable to create purchase.");
    } finally {
      setIsSubmittingPurchase(false);
    }
  };

  return (
    <PageShell>
      <div className="space-y-6">
        <div>
          <Link href={`/${locale}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={16} />
            Back to Home
          </Link>
        </div>

        {!authSession && (
            <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="flex flex-col justify-between rounded-[24px] border border-border/70 bg-surface-muted/60 p-6">
                <div className="space-y-4">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                    <ShoppingBag className="h-7 w-7" />
                  </div>

                  <div className="space-y-2">
                    <p className="portal-kicker">Cloud Commerce Account</p>
                    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">My Account</h1>
                    <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
                      Sign in with your cloud owner account to purchase POS plans and AI credits.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">What you can do here</p>
                    <ul className="mt-2 space-y-1.5">
                      <li>• Buy POS plans and AI credit packs</li>
                      <li>• Review wallet balance and recent activity</li>
                      <li>• Track purchase history and payment status</li>
                    </ul>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Secure</p>
                    <p className="mt-2 text-sm font-medium">Session-based sign-in</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Linked</p>
                    <p className="mt-2 text-sm font-medium">Cloud owner account</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Fast</p>
                    <p className="mt-2 text-sm font-medium">Wallet and billing access</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-border/70 bg-background/80 p-6 shadow-sm">
                <div className="space-y-6">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                      <ShieldCheck className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Sign In</p>
                      <p className="text-sm text-muted-foreground">
                        Use your cloud owner account to access POS plans and AI credits.
                      </p>
                    </div>
                  </div>

                  {isHydratingSession ? (
                    <p className="text-sm text-muted-foreground">Checking your session...</p>
                  ) : (
                    <form className="space-y-4" onSubmit={handleLogin}>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="space-y-1 block">
                          <span className="portal-kicker">Username</span>
                          <input
                            className="field-shell"
                            value={authUsername}
                            onChange={(event) => setAuthUsername(event.target.value)}
                            autoComplete="username"
                            required
                          />
                        </label>

                        <label className="space-y-1 block">
                          <span className="portal-kicker">Password</span>
                          <input
                            className="field-shell"
                            type="password"
                            value={authPassword}
                            onChange={(event) => setAuthPassword(event.target.value)}
                            autoComplete="current-password"
                            required
                          />
                        </label>
                      </div>

                      <label className="space-y-1 block">
                        <span className="portal-kicker">MFA Code (Optional)</span>
                        <input
                          className="field-shell"
                          value={authMfaCode}
                          onChange={(event) => setAuthMfaCode(event.target.value)}
                          placeholder="123456"
                        />
                      </label>

                      {authError && (
                        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                          {authError}
                        </div>
                      )}

                      <Button type="submit" variant="hero" className="w-full" disabled={isLoggingIn}>
                        {isLoggingIn ? "Signing In..." : "Sign In"}
                      </Button>
                    </form>
                  )}

                  <div className="rounded-2xl border border-border/70 bg-surface-muted/60 p-4 text-xs text-muted-foreground">
                    <div className="flex items-start gap-2">
                      <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <p>
                        MFA is optional for the cloud account screen. If you are using super-admin credentials,
                        enter the 6-digit code that your setup expects.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        {authSession && (
          <div
            className={[
              "grid min-h-[calc(100vh-14rem)] overflow-hidden rounded-[24px] border border-border/70 bg-background",
              sidebarCollapsed ? "grid-cols-[80px_minmax(0,1fr)]" : "grid-cols-[240px_minmax(0,1fr)]",
            ].join(" ")}
          >
            <aside className="border-r border-border/70 bg-surface-muted/40">
              <div className="flex h-full flex-col">
                <div className={["flex items-center gap-3 border-b border-border/70 px-4 py-4", sidebarCollapsed ? "justify-center" : ""].join(" ")}>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <ShoppingBag className="h-5 w-5" />
                  </div>
                  {!sidebarCollapsed && (
                    <div>
                      <p className="text-sm font-semibold">Cloud Portal</p>
                      <p className="text-xs text-muted-foreground">v1.0</p>
                    </div>
                  )}
                </div>

                <div className="px-4 py-4">
                  <button
                    type="button"
                    onClick={() => setSidebarCollapsed((current) => !current)}
                    className={[
                      "flex w-full items-center justify-between rounded-xl border border-border/70 bg-background px-3 py-2 text-sm shadow-sm transition",
                      sidebarCollapsed ? "justify-center" : "",
                    ].join(" ")}
                  >
                    <span className={["flex items-center gap-2", sidebarCollapsed ? "sr-only" : ""].join(" ")}>
                      <CircleUserRound className="h-4 w-4 text-muted-foreground" />
                      Owner View
                    </span>
                    <ChevronDown className={["h-4 w-4 text-muted-foreground", sidebarCollapsed ? "sr-only" : ""].join(" ")} />
                    {sidebarCollapsed && <CircleUserRound className="h-4 w-4 text-muted-foreground" />}
                  </button>
                </div>

                <div className="px-2">
                  {!sidebarCollapsed && (
                    <p className="px-3 pb-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">My Shop</p>
                  )}
                  <nav className="space-y-1">
                    {ownerNavItems.map((item) => {
                      const Icon = item.icon;
                      const active = activeSection === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveSection(item.id)}
                          className={[
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                            sidebarCollapsed ? "justify-center px-0" : "",
                            active ? "bg-slate-200 font-medium" : "hover:bg-slate-100",
                          ].join(" ")}
                        >
                          <Icon className="h-4 w-4 text-slate-600" />
                          {!sidebarCollapsed && <span>{item.label}</span>}
                        </button>
                      );
                    })}
                  </nav>
                </div>

                <div className="mt-auto border-t border-border/70 px-4 py-4">
                  <div className={["flex items-center gap-3", sidebarCollapsed ? "justify-center" : ""].join(" ")}>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {ownerInitials}
                    </div>
                    {!sidebarCollapsed && (
                      <div>
                        <p className="text-sm font-medium">{ownerDisplayName}</p>
                        <p className="text-xs text-muted-foreground">Shop Owner</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </aside>

            <main className="min-w-0">
              <header className="flex h-14 items-center justify-between border-b border-border/70 bg-background px-4 sm:px-6">
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed((current) => !current)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 text-foreground hover:bg-muted"
                >
                  {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </button>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4" />
                    <span className="text-sm">Owner Account</span>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => void handleLogout()} disabled={isLoggingOut}>
                    <LogOut size={16} />
                    {isLoggingOut ? "Signing Out..." : "Sign Out"}
                  </Button>
                </div>
              </header>

              <div className="space-y-6 px-4 py-6 sm:px-6">
                {activeSection === "dashboard" ? (
                  ownerDashboard
                ) : activeSection === "products" ? (
                  ownerProductsSection
                ) : activeSection === "purchases" ? (
                  ownerPurchasesSection
                ) : activeSection === "provisioning" ? (
                  ownerProvisioningSection
                ) : activeSection === "settings" ? (
                  ownerSettingsSection
                ) : (
                  <SectionCard className="rounded-[18px] p-6">
                    <div className="space-y-2">
                      <p className="portal-kicker">Owner View</p>
                      <h2 className="text-2xl font-semibold">
                        {ownerNavItems.find((item) => item.id === activeSection)?.label}
                      </h2>
                      <p className="text-sm text-muted-foreground">This page will be updated next.</p>
                    </div>
                  </SectionCard>
                )}
              </div>
            </main>
          </div>
        )}
      </div>
    </PageShell>
  );
}
