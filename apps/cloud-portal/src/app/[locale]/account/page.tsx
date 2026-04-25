"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
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
  ShoppingBag,
  ShoppingCart,
  Settings2,
  Wallet,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
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

function formatSignedCredits(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  if (value === 0) {
    return "0";
  }

  const prefix = value > 0 ? "+" : "-";
  return `${prefix}${formatCredits(Math.abs(value))}`;
}

function formatAmount(value?: number | null, currency = "USD") {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return `- ${currency}`;
  }

  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function calculateDiscountedAmount(price: number, discountPercentage: number) {
  const normalizedDiscount = Math.min(100, Math.max(0, discountPercentage));
  return Math.max(0, price * (1 - normalizedDiscount / 100));
}

function resolveDiscountLabel(discountPercentage: number) {
  return `${discountPercentage.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}% off`;
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

type OwnerSectionId = "dashboard" | "products" | "purchases" | "wallet" | "provisioning" | "settings";
type ProductCatalogFilter = "all" | "pos" | "ai";
type PurchaseFilter = "all" | "active" | "completed";
type WalletTransactionKind = "purchase" | "spend" | "refund" | "adjustment";
type WalletTransactionSource = "order" | "payment" | "ledger";

type WalletTransaction = {
  id: string;
  kind: WalletTransactionKind;
  source: WalletTransactionSource;
  status: string;
  credits: number;
  amount?: number | null;
  currency?: string | null;
  balanceAfter?: number | null;
  reference?: string | null;
  description?: string | null;
  occurredAt: string;
};

const ownerNavItems: Array<{ id: OwnerSectionId; label: string; icon: typeof LayoutGrid }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "products", label: "Products", icon: Package },
  { id: "purchases", label: "My Purchases", icon: ShoppingCart },
  { id: "wallet", label: "AI Credit Wallet", icon: Wallet },
  { id: "provisioning", label: "POS Provisioning", icon: Monitor },
  { id: "settings", label: "Account Settings", icon: Settings2 },
];

const OwnerOnlyMessage = "Only shop owners can create package and AI credit purchases.";

const ownerCatalogFallbackProducts: CloudProductRow[] = [
  {
    product_code: "POS-STD-M",
    product_name: "POS Standard Monthly",
    product_type: "pos_subscription",
    description: "Standard POS terminal subscription with full feature access, monthly billing.",
    price: 49.99,
    discount_percentage: 0,
    currency: "USD",
    billing_mode: "monthly",
    validity: "30 days",
    default_quantity_or_credits: 1,
    active: true,
    created_at: null,
    updated_at: null,
  },
  {
    product_code: "POS-STD-Y",
    product_name: "POS Standard Yearly",
    product_type: "pos_subscription",
    description: "Standard POS terminal subscription with full feature access, annual billing with 2 months free.",
    price: 499.99,
    discount_percentage: 0,
    currency: "USD",
    billing_mode: "yearly",
    validity: "365 days",
    default_quantity_or_credits: 1,
    active: true,
    created_at: null,
    updated_at: null,
  },
  {
    product_code: "POS-PRO-M",
    product_name: "POS Pro Monthly",
    product_type: "pos_subscription",
    description: "Professional POS with advanced analytics, inventory management, and multi-terminal support.",
    price: 99.99,
    discount_percentage: 0,
    currency: "USD",
    billing_mode: "monthly",
    validity: "30 days",
    default_quantity_or_credits: 1,
    active: true,
    created_at: null,
    updated_at: null,
  },
  {
    product_code: "AI-100",
    product_name: "AI Credits — 100 Pack",
    product_type: "ai_credit",
    description: "100 AI processing credits for smart recommendations, receipt scanning, and inventory insights.",
    price: 19.99,
    discount_percentage: 0,
    currency: "USD",
    billing_mode: "one_time",
    validity: null,
    default_quantity_or_credits: 100,
    active: true,
    created_at: null,
    updated_at: null,
  },
  {
    product_code: "AI-500",
    product_name: "AI Credits — 500 Pack",
    product_type: "ai_credit",
    description: "500 AI processing credits. Best value for growing businesses.",
    price: 79.99,
    discount_percentage: 0,
    currency: "USD",
    billing_mode: "one_time",
    validity: null,
    default_quantity_or_credits: 500,
    active: true,
    created_at: null,
    updated_at: null,
  },
  {
    product_code: "AI-2000",
    product_name: "AI Credits — 2000 Pack",
    product_type: "ai_credit",
    description: "2000 AI processing credits. Enterprise volume pack.",
    price: 249.99,
    discount_percentage: 0,
    currency: "USD",
    billing_mode: "one_time",
    validity: null,
    default_quantity_or_credits: 2000,
    active: true,
    created_at: null,
    updated_at: null,
  },
];

const ownerPurchaseFallbackRows: CloudPurchaseRow[] = [
  {
    purchase_id: "fallback-purchase-1",
    order_number: "ORD-2024-0001",
    shop_code: "default",
    status: "assigned",
    items: [
      {
        product_code: "POS-STD-M",
        product_name: "POS Standard Monthly",
        product_type: "pos_subscription",
        quantity: 1,
        amount: 49.99,
        currency: "USD",
        credits: null,
      },
    ],
    total_amount: 49.99,
    currency: "USD",
    note: null,
    created_at: "2024-07-01T00:00:00Z",
  },
  {
    purchase_id: "fallback-purchase-2",
    order_number: "ORD-2024-0002",
    shop_code: "default",
    status: "approved",
    items: [
      {
        product_code: "AI-500",
        product_name: "AI Credits — 500 Pack",
        product_type: "ai_credit",
        quantity: 1,
        amount: 159.98,
        currency: "USD",
        credits: 500,
      },
    ],
    total_amount: 159.98,
    currency: "USD",
    note: null,
    created_at: "2024-08-05T00:00:00Z",
  },
  {
    purchase_id: "fallback-purchase-3",
    order_number: "ORD-2024-0004",
    shop_code: "default",
    status: "rejected",
    items: [
      {
        product_code: "POS-PRO-M",
        product_name: "POS Pro Monthly",
        product_type: "pos_subscription",
        quantity: 1,
        amount: 499.95,
        currency: "USD",
        credits: null,
      },
    ],
    total_amount: 499.95,
    currency: "USD",
    note: null,
    created_at: "2024-07-20T00:00:00Z",
  },
  {
    purchase_id: "fallback-purchase-4",
    order_number: "ORD-2024-0006",
    shop_code: "default",
    status: "draft",
    items: [
      {
        product_code: "AI-100",
        product_name: "AI Credits — 100 Pack",
        product_type: "ai_credit",
        quantity: 1,
        amount: 19.99,
        currency: "USD",
        credits: 100,
      },
    ],
    total_amount: 19.99,
    currency: "USD",
    note: null,
    created_at: "2024-08-12T00:00:00Z",
  },
];

export default function AccountPage() {
  const { locale } = useI18n();

  const [authSession, setAuthSession] = useState<AccountSessionResponse | null>(null);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
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

  const [isSubmittingPurchase, setIsSubmittingPurchase] = useState(false);
  const [orderingProductCode, setOrderingProductCode] = useState<string | null>(null);
  const [pendingOrderProduct, setPendingOrderProduct] = useState<CloudProductRow | null>(null);
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
  const showMarketingChrome = !authSession;

  const catalogProducts = useMemo(
    () => (products.length > 0 ? products : ownerCatalogFallbackProducts),
    [products],
  );

  const visibleCatalogProducts = useMemo(() => {
    if (catalogFilter === "all") {
      return catalogProducts;
    }

    if (catalogFilter === "pos") {
      return catalogProducts.filter((product) => product.product_type === "pos_subscription");
    }

    return catalogProducts.filter((product) => product.product_type === "ai_credit");
  }, [catalogProducts, catalogFilter]);

  const purchaseRows = useMemo(
    () => (purchases.length > 0 ? purchases : ownerPurchaseFallbackRows),
    [purchases],
  );

  const visiblePurchases = useMemo(() => {
    const activeStatuses = new Set(["draft", "submitted", "payment_pending", "paid", "pending_approval", "assigned"]);
    const completedStatuses = new Set(["approved", "rejected", "cancelled"]);

    if (purchaseFilter === "active") {
      return purchaseRows.filter((purchase) => activeStatuses.has(purchase.status));
    }

    if (purchaseFilter === "completed") {
      return purchaseRows.filter((purchase) => completedStatuses.has(purchase.status));
    }

    return purchaseRows;
  }, [purchaseFilter, purchaseRows]);

  const walletPurchasedCredits = useMemo(
    () =>
      aiLedger.reduce((total, entry) => {
        if (entry.delta_credits > 0) {
          return total + entry.delta_credits;
        }
        return total;
      }, 0),
    [aiLedger],
  );

  const walletSpentCredits = useMemo(
    () =>
      aiLedger.reduce((total, entry) => {
        if (entry.delta_credits < 0) {
          return total + Math.abs(entry.delta_credits);
        }
        return total;
      }, 0),
    [aiLedger],
  );

  const walletTransactions = useMemo<WalletTransaction[]>(() => {
    const purchaseTransactions: WalletTransaction[] = purchases
      .filter((purchase) => purchase.items.some((item) => item.product_type === "ai_credit"))
      .map((purchase) => {
        const aiItems = purchase.items.filter((item) => item.product_type === "ai_credit");
        const requestedCredits = aiItems.reduce((total, item) => {
          const perItemCredits = typeof item.credits === "number" ? item.credits : 0;
          const quantity = Number.isFinite(item.quantity) ? Math.max(1, item.quantity) : 1;
          return total + perItemCredits * quantity;
        }, 0);

        return {
          id: `order-${purchase.purchase_id}`,
          kind: "purchase",
          source: "order",
          status: purchase.status,
          credits: requestedCredits,
          amount: purchase.total_amount,
          currency: purchase.currency,
          reference: purchase.order_number,
          description: aiItems.map((item) => item.product_name).join(", "),
          occurredAt: purchase.created_at,
        };
      });

    const paymentTransactions: WalletTransaction[] = aiPayments
      .map((payment) => ({
        id: `payment-${payment.payment_id}`,
        kind: "purchase",
        source: "payment",
        status: payment.payment_status,
        credits: payment.credits,
        amount: payment.amount,
        currency: payment.currency,
        reference: payment.external_reference,
        description: `${toSentence(payment.payment_method)} via ${payment.provider || "provider"}`,
        occurredAt: payment.created_at,
      }));

    const ledgerTransactions: WalletTransaction[] = aiLedger.map((entry, index) => {
      const entryType = (entry.entry_type || "").trim().toLowerCase();
      const kind: WalletTransactionKind =
        entryType === "charge"
          ? "spend"
          : entryType === "refund"
            ? "refund"
            : entryType === "purchase"
              ? "purchase"
              : entry.delta_credits < 0
                ? "spend"
                : "adjustment";

      return {
        id: `ledger-${entry.created_at_utc}-${entry.reference || index}`,
        kind,
        source: "ledger",
        status: "recorded",
        credits: entry.delta_credits,
        balanceAfter: entry.balance_after_credits,
        reference: entry.reference || null,
        description: entry.description || null,
        occurredAt: entry.created_at_utc,
      };
    });

    const parseTimestamp = (value: string) => {
      const parsed = new Date(value).getTime();
      return Number.isNaN(parsed) ? 0 : parsed;
    };

    return [...ledgerTransactions, ...purchaseTransactions, ...paymentTransactions]
      .sort((left, right) => parseTimestamp(right.occurredAt) - parseTimestamp(left.occurredAt))
      .slice(0, 30);
  }, [aiLedger, aiPayments, purchases]);

  const getWalletTransactionTypeLabel = (kind: WalletTransactionKind, source: WalletTransactionSource) => {
    if (kind === "purchase" && source !== "ledger") {
      return "Credit Purchase Request";
    }

    if (kind === "purchase") {
      return "Credit Purchase";
    }

    if (kind === "spend") {
      return "AI Credit Spend";
    }

    if (kind === "refund") {
      return "Credit Refund";
    }

    return "Wallet Adjustment";
  };

  const getWalletTransactionStatusTone = (status: string): "neutral" | "success" | "warning" | "info" => {
    const normalized = status.trim().toLowerCase();
    if (["approved", "assigned", "paid", "settled", "succeeded", "completed", "recorded"].includes(normalized)) {
      return "success";
    }

    if (["pending", "pending_approval", "pending_verification", "payment_pending", "submitted", "draft", "processing"].includes(normalized)) {
      return "warning";
    }

    if (["rejected", "failed", "cancelled", "canceled", "refunded"].includes(normalized)) {
      return "neutral";
    }

    return "info";
  };

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
          const discountedPrice = calculateDiscountedAmount(product.price, product.discount_percentage);
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
                {product.discount_percentage > 0 && (
                  <p className="text-sm text-muted-foreground line-through">
                    {formatAmount(product.price, product.currency)}
                  </p>
                )}
                <p className="text-3xl font-semibold tracking-tight">
                  {formatAmount(discountedPrice, product.currency)}
                  <span className="text-base font-normal text-muted-foreground">{priceSuffix}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {product.validity ? `Validity: ${product.validity}` : creditsLabel}
                </p>
                {product.discount_percentage > 0 && (
                  <p className="text-sm font-medium text-emerald-600">
                    {resolveDiscountLabel(product.discount_percentage)}
                  </p>
                )}
              </div>

              <div className="mt-auto pt-6">
                <Button
                  type="button"
                  variant="hero"
                  className="w-full justify-center"
                  disabled={isSubmittingPurchase}
                  onClick={() => {
                    handleOrderNow(product);
                  }}
                >
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  {isSubmittingPurchase && orderingProductCode === product.product_code ? "Ordering..." : "Order Now"}
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

  const ownerWalletSection = (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">AI Credit Wallet</h1>
        <p className="text-sm text-muted-foreground">
          View your remaining balance and recent AI credit transactions.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard className="rounded-[16px] p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-muted-foreground">Remaining Balance</p>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-2 text-3xl font-semibold tracking-tight">
            {wallet ? formatCredits(wallet.available_credits) : "0"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Last updated: {wallet?.updated_at ? formatDate(wallet.updated_at) : "Not available"}
          </p>
        </SectionCard>

        <SectionCard className="rounded-[16px] p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-muted-foreground">Purchased Credits</p>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-emerald-700">
            {formatCredits(walletPurchasedCredits)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">From credited top-ups and refunds.</p>
        </SectionCard>

        <SectionCard className="rounded-[16px] p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-muted-foreground">Spent Credits</p>
            <Clock3 className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-rose-700">
            {formatCredits(walletSpentCredits)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Credits used by AI features.</p>
        </SectionCard>
      </div>

      <SectionCard className="overflow-hidden rounded-[16px] p-0 shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Recent Transactions</h2>
            <p className="text-xs text-muted-foreground">AI credit purchases and spending activity.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void handleRefresh()} disabled={isLoadingCommerce}>
            <RefreshCw className={["h-4 w-4", isLoadingCommerce ? "animate-spin" : ""].join(" ")} />
            Refresh
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="border-b border-border/70 bg-surface-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Credits</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Balance After</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {walletTransactions.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-muted-foreground" colSpan={7}>
                    No AI credit transactions yet.
                  </td>
                </tr>
              ) : (
                walletTransactions.map((transaction) => {
                  const signedCredits = formatSignedCredits(transaction.credits);
                  const creditsClass =
                    transaction.credits > 0
                      ? "text-emerald-700"
                      : transaction.credits < 0
                        ? "text-rose-700"
                        : "text-muted-foreground";

                  return (
                    <tr key={transaction.id} className="border-b border-border/70 last:border-b-0">
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(transaction.occurredAt)}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          <p className="font-medium">
                            {getWalletTransactionTypeLabel(transaction.kind, transaction.source)}
                          </p>
                          {transaction.description ? (
                            <p className="text-xs text-muted-foreground">{transaction.description}</p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">{transaction.reference || "-"}</td>
                      <td className={["px-4 py-3 font-medium", creditsClass].join(" ")}>{signedCredits}</td>
                      <td className="px-4 py-3">
                        {typeof transaction.amount === "number" && Number.isFinite(transaction.amount)
                          ? formatAmount(transaction.amount, transaction.currency || "USD")
                          : "-"}
                      </td>
                      <td className="px-4 py-3">
                        {typeof transaction.balanceAfter === "number" ? formatCredits(transaction.balanceAfter) : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip tone={getWalletTransactionStatusTone(transaction.status)}>
                          {toSentence(transaction.status)}
                        </StatusChip>
                      </td>
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
      setProducts(productsResult.value.items || []);
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
  }, [authSession, canPurchase]);

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
        }),
      });

      const payload = await parseApiPayload(response);
      if (!response.ok) {
        throw new Error(parseErrorMessage(payload));
      }

      const session = requireObjectPayload<AccountSessionResponse>(payload, "Login response is invalid.");
      setAuthSession(session);
      setAuthPassword("");
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
      setPendingOrderProduct(null);
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

  const closeOrderDialog = useCallback(() => {
    if (isSubmittingPurchase) {
      return;
    }

    setPendingOrderProduct(null);
  }, [isSubmittingPurchase]);

  const handleOrderNow = (product: CloudProductRow) => {
    if (!canPurchase) {
      setCommerceError(OwnerOnlyMessage);
      return;
    }

    if (isSubmittingPurchase) {
      return;
    }

    setCommerceError(null);
    setPendingOrderProduct(product);
  };

  const handleConfirmOrder = async () => {
    if (!pendingOrderProduct) {
      return;
    }

    if (!canPurchase) {
      setCommerceError(OwnerOnlyMessage);
      setPendingOrderProduct(null);
      return;
    }

    if (isSubmittingPurchase) {
      return;
    }

    const product = pendingOrderProduct;
    setIsSubmittingPurchase(true);
    setOrderingProductCode(product.product_code);
    setCommerceError(null);
    setCommerceMessage(null);

    try {
      await createAccountCloudPurchase({
        items: [
          {
            product_code: product.product_code,
            quantity: 1,
          },
        ],
      });

      setActiveSection("purchases");
      setCommerceMessage(
        `${product.product_name} purchase created with pending status. It will be assigned after super admin approval.`,
      );
      await loadCommerceData();

      trackMarketingEvent("marketing_account_cloud_purchase_created", {
        locale,
        product_code: product.product_code,
        quantity: 1,
      });
    } catch (error) {
      setCommerceError(error instanceof Error ? error.message : "Unable to create purchase.");
    } finally {
      setIsSubmittingPurchase(false);
      setOrderingProductCode(null);
      setPendingOrderProduct(null);
    }
  };

  return (
    <div className={showMarketingChrome ? "flex min-h-screen flex-col bg-background" : "min-h-screen bg-background"}>
      {showMarketingChrome && <Navbar />}
      <PageShell
        className={
          showMarketingChrome
            ? "flex-1 !min-h-0 pt-24 pb-4 md:pt-28 md:pb-6"
            : "!min-h-screen pt-4 pb-4 md:pt-6 md:pb-6"
        }
      >
        <div className="space-y-6">
          {!authSession && (
            <div className="mx-auto w-full max-w-md rounded-[24px] border border-border/70 bg-background/80 p-6 shadow-sm">
              <div className="space-y-6">
                <div className="space-y-2">
                  <p className="portal-kicker">Cloud Commerce Account</p>
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">My Account</h1>
                </div>

                {isHydratingSession ? (
                  <p className="text-sm text-muted-foreground">Checking your session...</p>
                ) : (
                  <form className="space-y-4" onSubmit={handleLogin}>
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
                    <div
                      className={[
                        "flex w-full items-center rounded-xl border border-border/70 bg-background px-3 py-2 text-sm shadow-sm",
                        sidebarCollapsed ? "justify-center" : "gap-2",
                      ].join(" ")}
                    >
                      <CircleUserRound className="h-4 w-4 text-muted-foreground" />
                      {!sidebarCollapsed && <span>Owner View</span>}
                    </div>
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
                {commerceError && (
                  <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {commerceError}
                  </div>
                )}
                {commerceMessage && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    {commerceMessage}
                  </div>
                )}
                {activeSection === "dashboard" ? (
                  ownerDashboard
                ) : activeSection === "products" ? (
                  ownerProductsSection
                ) : activeSection === "purchases" ? (
                  ownerPurchasesSection
                ) : activeSection === "wallet" ? (
                  ownerWalletSection
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
          <ConfirmationDialog
            open={Boolean(pendingOrderProduct)}
            onOpenChange={(open) => {
              if (!open) {
                closeOrderDialog();
              }
            }}
            onCancel={closeOrderDialog}
            onConfirm={() => {
              void handleConfirmOrder();
            }}
            title="Order Confirmation"
            description={
              pendingOrderProduct
                ? `Review your order for ${pendingOrderProduct.product_name} (${formatAmount(
                    calculateDiscountedAmount(
                      pendingOrderProduct.price,
                      pendingOrderProduct.discount_percentage,
                    ),
                    pendingOrderProduct.currency,
                  )}). This creates a pending purchase that requires approval before assignment.`
                : "Review this order before continuing."
            }
            cancelLabel="Cancel"
            confirmLabel={isSubmittingPurchase ? "Ordering..." : "Confirm Order"}
            confirmVariant="hero"
            confirmDisabled={isSubmittingPurchase}
            cancelDisabled={isSubmittingPurchase}
          />
        </div>
      </PageShell>
      {showMarketingChrome && <Footer />}
    </div>
  );
}
