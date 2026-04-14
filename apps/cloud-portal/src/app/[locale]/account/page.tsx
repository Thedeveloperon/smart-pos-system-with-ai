"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LogOut, RefreshCw } from "lucide-react";
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

function canManageCommerce(role?: string | null) {
  const normalized = (role || "").trim().toLowerCase();
  return normalized === "owner";
}

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

  const [products, setProducts] = useState<CloudProductRow[]>([]);
  const [purchases, setPurchases] = useState<CloudPurchaseRow[]>([]);
  const [aiInvoices, setAiInvoices] = useState<AiCreditInvoiceRow[]>([]);
  const [wallet, setWallet] = useState<AiWalletResponse | null>(null);
  const [aiLedger, setAiLedger] = useState<AiCreditLedgerItemResponse[]>([]);
  const [aiPayments, setAiPayments] = useState<AiPaymentHistoryItemResponse[]>([]);
  const [commerceError, setCommerceError] = useState<string | null>(null);
  const [commerceMessage, setCommerceMessage] = useState<string | null>(null);
  const [isLoadingCommerce, setIsLoadingCommerce] = useState(false);

  const [selectedProductCode, setSelectedProductCode] = useState("");
  const [purchaseQuantity, setPurchaseQuantity] = useState("1");
  const [purchaseNote, setPurchaseNote] = useState("");
  const [isSubmittingPurchase, setIsSubmittingPurchase] = useState(false);

  const canPurchase = canManageCommerce(authSession?.role);

  const activeProducts = useMemo(
    () => products.filter((product) => product.active),
    [products],
  );

  const selectedProduct = useMemo(
    () => activeProducts.find((product) => product.product_code === selectedProductCode) || null,
    [activeProducts, selectedProductCode],
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
    ]);

    const [productsResult, purchasesResult, invoicesResult, walletResult, ledgerResult, paymentsResult] = settled;

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
    } finally {
      setAuthSession(null);
      setProducts([]);
      setPurchases([]);
      setAiInvoices([]);
      setWallet(null);
      setAiLedger([]);
      setAiPayments([]);
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

        <SectionCard className="space-y-4">
          <div className="space-y-2">
            <p className="portal-kicker">Cloud Commerce Account</p>
            <h1 className="text-4xl font-semibold tracking-tight">My Account</h1>
            <p className="text-sm text-muted-foreground">
              Sign in with your cloud owner account to purchase POS plans and AI credits.
            </p>
          </div>

          {isHydratingSession && <p className="text-sm text-muted-foreground">Checking your session...</p>}

          {!isHydratingSession && !authSession && (
            <form className="grid gap-3 md:grid-cols-2" onSubmit={handleLogin}>
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

              <label className="space-y-1 block md:col-span-2">
                <span className="portal-kicker">MFA Code (Optional)</span>
                <input
                  className="field-shell"
                  value={authMfaCode}
                  onChange={(event) => setAuthMfaCode(event.target.value)}
                  placeholder="123456"
                />
              </label>

              {authError && <p className="md:col-span-2 text-sm text-destructive">{authError}</p>}

              <div className="md:col-span-2">
                <Button type="submit" variant="hero" disabled={isLoggingIn}>
                  {isLoggingIn ? "Signing In..." : "Sign In"}
                </Button>
              </div>
            </form>
          )}

          {authSession && (
            <div className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-3">
              <p className="text-sm">
                Signed in as <span className="font-semibold">{authSession.full_name}</span> ({authSession.username})
              </p>
              <p className="text-xs text-muted-foreground">
                Role: {authSession.role} | Session ID: {authSession.session_id} | Expires: {formatDate(authSession.expires_at)}
              </p>
              <p className="text-xs text-muted-foreground">
                Shop: {authSession.shop_code || "-"}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void handleRefresh()} disabled={isLoadingCommerce}>
                  <RefreshCw size={16} />
                  {isLoadingCommerce ? "Refreshing..." : "Refresh Account"}
                </Button>
                <Button type="button" variant="outline" onClick={() => void handleLogout()} disabled={isLoggingOut}>
                  <LogOut size={16} />
                  {isLoggingOut ? "Signing Out..." : "Sign Out"}
                </Button>
              </div>
            </div>
          )}

          {authMessage && <p className="text-sm text-emerald-700">{authMessage}</p>}
        </SectionCard>

        {authSession && (
          <>
            <SectionCard className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="portal-kicker">AI Wallet</p>
                  <h2 className="text-xl font-semibold">Credits Overview</h2>
                </div>
                <StatusChip tone="neutral">{wallet ? `${formatCredits(wallet.available_credits)} credits` : "-"}</StatusChip>
              </div>

              {commerceError && <p className="text-sm text-destructive">{commerceError}</p>}
              {commerceMessage && <p className="text-sm text-emerald-700">{commerceMessage}</p>}

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-2">
                  <p className="text-sm font-semibold">Recent Wallet Activity</p>
                  {aiLedger.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No credit ledger entries yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {aiLedger.slice(0, 6).map((item, index) => (
                        <div key={`${item.created_at_utc}-${item.entry_type}-${index}`} className="rounded-md border border-border px-3 py-2">
                          <p className="text-sm font-medium">
                            {toSentence(item.entry_type)} | {item.delta_credits >= 0 ? "+" : ""}{formatCredits(item.delta_credits)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Balance: {formatCredits(item.balance_after_credits)} | {formatDate(item.created_at_utc)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-2">
                  <p className="text-sm font-semibold">Recent AI Payments</p>
                  {aiPayments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No payment records yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {aiPayments.slice(0, 6).map((item) => (
                        <div key={item.payment_id} className="rounded-md border border-border px-3 py-2">
                          <p className="text-sm font-medium">
                            {formatCredits(item.credits)} credits | {formatAmount(item.amount, item.currency)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {toSentence(item.payment_status)} | {toSentence(item.payment_method)} | {formatDate(item.created_at)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard className="space-y-4">
              <div>
                <p className="portal-kicker">Purchase</p>
                <h2 className="text-xl font-semibold">Buy POS Plans or AI Credit Packages</h2>
                <p className="text-sm text-muted-foreground">
                  Purchases are credential-based and do not require device provisioning.
                </p>
              </div>

              {!canPurchase && (
                <p className="text-sm text-muted-foreground">{OwnerOnlyMessage}</p>
              )}

              {canPurchase && (
                <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreatePurchase}>
                  <label className="space-y-1 block md:col-span-2">
                    <span className="portal-kicker">Product</span>
                    <select
                      className="field-shell"
                      value={selectedProductCode}
                      onChange={(event) => setSelectedProductCode(event.target.value)}
                      required
                    >
                      {activeProducts.length === 0 && <option value="">No active products</option>}
                      {activeProducts.map((product) => (
                        <option key={product.product_code} value={product.product_code}>
                          {product.product_name} ({product.product_code}) | {formatAmount(product.price, product.currency)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1 block">
                    <span className="portal-kicker">Quantity</span>
                    <input
                      className="field-shell"
                      type="number"
                      min={1}
                      max={1000}
                      value={purchaseQuantity}
                      onChange={(event) => setPurchaseQuantity(event.target.value)}
                      required
                    />
                  </label>

                  <label className="space-y-1 block">
                    <span className="portal-kicker">Note (Optional)</span>
                    <input
                      className="field-shell"
                      value={purchaseNote}
                      onChange={(event) => setPurchaseNote(event.target.value)}
                      placeholder="Invoice note for billing team"
                    />
                  </label>

                  <div className="md:col-span-2 flex items-center gap-2">
                    <Button type="submit" variant="hero" disabled={!selectedProductCode || isSubmittingPurchase}>
                      {isSubmittingPurchase ? "Submitting..." : "Create Purchase Request"}
                    </Button>
                    {selectedProduct && (
                      <span className="text-xs text-muted-foreground">
                        Type: {toSentence(selectedProduct.product_type)} | Billing: {toSentence(selectedProduct.billing_mode)}
                      </span>
                    )}
                  </div>
                </form>
              )}
            </SectionCard>

            <SectionCard className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="portal-kicker">History</p>
                  <h2 className="text-xl font-semibold">Purchases & AI Credit Invoices</h2>
                </div>
                <StatusChip tone="neutral">{purchases.length + aiInvoices.length} records</StatusChip>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-2">
                  <p className="text-sm font-semibold">Purchase Orders</p>
                  {purchases.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No purchases yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {purchases.slice(0, 10).map((purchase) => (
                        <div key={purchase.purchase_id} className="rounded-md border border-border px-3 py-2">
                          <p className="text-sm font-medium">
                            {purchase.order_number} | {toSentence(purchase.status)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatAmount(purchase.total_amount, purchase.currency)} | {formatDate(purchase.created_at)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-2">
                  <p className="text-sm font-semibold">AI Credit Invoices</p>
                  {aiInvoices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No AI credit invoices yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {aiInvoices.slice(0, 10).map((invoice) => (
                        <div key={invoice.invoice_id} className="rounded-md border border-border px-3 py-2">
                          <p className="text-sm font-medium">
                            {invoice.invoice_number} | {toSentence(invoice.status)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Pack: {invoice.pack_code} | Credits: {formatCredits(invoice.requested_credits)} | {formatAmount(invoice.amount_due, invoice.currency)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Updated: {formatDate(invoice.updated_at || invoice.created_at)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </PageShell>
  );
}
