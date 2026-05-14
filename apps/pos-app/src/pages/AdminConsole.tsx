import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Activity, Clock3, LogOut, RefreshCw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthContext";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchAiInsightsHistory,
  fetchAiPaymentHistory,
  fetchAiWallet,
  fetchCloudAccountStatus,
  type AiInsightsHistoryItem,
  type AiPaymentHistoryItem,
  type AiWalletResponse,
  type CloudAccountStatus,
} from "@/lib/api";

type WalletActivityEntry = {
  id: string;
  kind: "purchase" | "charge" | "refund";
  title: string;
  deltaCredits: number;
  balanceAfter?: number | null;
  timestamp: string;
  detail: string;
  meta: string;
};

const moneyFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleString();
};

const formatCredits = (value: number) => moneyFormatter.format(value);

const formatSignedCredits = (value: number) => {
  const magnitude = formatCredits(Math.abs(value));
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${magnitude}`;
};

const normalizeText = (value?: string | null) => (value || "").trim().replaceAll("_", " ");

const mapInsightToActivity = (item: AiInsightsHistoryItem): WalletActivityEntry | null => {
  const charged = item.charged_credits || 0;
  const refunded = item.refunded_credits || 0;
  const deltaCredits = refunded - charged;

  if (deltaCredits === 0 && charged === 0 && refunded === 0) {
    return null;
  }

  return {
    id: `insight-${item.request_id}`,
    kind: deltaCredits >= 0 ? "refund" : "charge",
    title: deltaCredits >= 0 ? "refund" : "charge",
    deltaCredits,
    timestamp: item.completed_at || item.created_at,
    detail: `${normalizeText(item.usage_type)} | ${normalizeText(item.status)}`.trim(),
    meta: `Req ${item.request_id.slice(0, 8)} - ${formatDateTime(item.completed_at || item.created_at)}`,
  };
};

const mapPaymentToActivity = (item: AiPaymentHistoryItem): WalletActivityEntry | null => {
  if ((item.credits || 0) === 0) {
    return null;
  }

  return {
    id: `payment-${item.payment_id}`,
    kind: "purchase",
    title: "purchase",
    deltaCredits: item.credits,
    timestamp: item.completed_at || item.created_at,
    detail: `${normalizeText(item.payment_method)} | ${normalizeText(item.payment_status)}`.trim(),
    meta: `Ref ${item.external_reference.slice(0, 12)} - ${formatDateTime(item.completed_at || item.created_at)}`,
  };
};

const AdminConsole = () => {
  const { user, logout } = useAuth();
  const [cloudAccountStatus, setCloudAccountStatus] = useState<CloudAccountStatus | null>(null);
  const [wallet, setWallet] = useState<AiWalletResponse | null>(null);
  const [payments, setPayments] = useState<AiPaymentHistoryItem[]>([]);
  const [insights, setInsights] = useState<AiInsightsHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [nextCloudAccountStatus, nextWallet, nextPayments, nextInsights] = await Promise.all([
        fetchCloudAccountStatus(),
        fetchAiWallet(),
        fetchAiPaymentHistory(6),
        fetchAiInsightsHistory(6),
      ]);

      setCloudAccountStatus(nextCloudAccountStatus);
      setWallet(nextWallet);
      setPayments(nextPayments.items);
      setInsights(nextInsights.items);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load admin dashboard.";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const walletActivity = useMemo(() => {
    const entries = [...payments.map(mapPaymentToActivity), ...insights.map(mapInsightToActivity)]
      .filter((item): item is WalletActivityEntry => Boolean(item))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (wallet === null) {
      return entries.map((entry) => ({
        ...entry,
        balanceAfter: null,
      }));
    }

    let runningBalance = wallet.available_credits;
    return entries.map((entry) => {
      const balanceAfter = runningBalance;
      runningBalance -= entry.deltaCredits;

      return {
        ...entry,
        balanceAfter,
      };
    });
  }, [insights, payments, wallet]);

  const activeCloudStatus = cloudAccountStatus?.is_linked ? "Linked" : "Not linked";
  const walletCredits = wallet?.available_credits ?? 0;
  const shopCode = cloudAccountStatus?.cloud_shop_code || "-";
  const cloudRole = cloudAccountStatus?.cloud_role || "-";
  const cloudUsername = cloudAccountStatus?.cloud_username || user?.username || "-";
  const cloudFullName = cloudAccountStatus?.cloud_full_name || user?.displayName || "-";

  return (
    <div className="min-h-screen px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </a>

        <Card className="rounded-2xl border-border/80 bg-card/95 shadow-sm">
          <CardContent className="space-y-6 p-6 sm:p-8">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Cloud Commerce Account
              </p>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">My Account</h1>
                    <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                      Sign in with your cloud owner account to purchase POS plans and AI credits.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => void loadDashboard()} disabled={isLoading}>
                    <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                    Refresh Account
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowSignOutConfirm(true)}
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/20 p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">
                      Signed in as <span className="font-semibold">{cloudFullName}</span>{" "}
                      <span className="text-muted-foreground">({cloudUsername})</span>
                    </p>
                    <Badge variant={cloudAccountStatus?.is_linked ? "default" : "secondary"}>{activeCloudStatus}</Badge>
                  </div>

                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>
                      Role: <span className="text-foreground">{cloudRole}</span> | Session ID:{" "}
                      <span className="font-mono text-xs text-foreground break-all">
                        {user?.sessionId || "-"}
                      </span>{" "}
                      | Expires: <span className="text-foreground">{formatDateTime(user?.sessionExpiresAt)}</span>
                    </p>
                    <p>
                      Shop: <span className="text-foreground">{shopCode}</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="bg-background/70">
                    <Clock3 className="mr-1 h-3.5 w-3.5" />
                    {wallet ? `Updated ${formatDateTime(wallet.updated_at)}` : "Updating..."}
                  </Badge>
                  <Badge variant="secondary" className="px-3 py-1 text-sm font-semibold">
                    {formatCredits(walletCredits)} credits
                  </Badge>
                </div>
              </div>

              {error && (
                <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              {cloudAccountStatus && !cloudAccountStatus.cloud_relay_configured && (
                <div className="mt-4 rounded-xl border border-amber-300/40 bg-amber-50/60 px-3 py-2 text-sm text-amber-900">
                  Cloud relay is not configured for this installation.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="rounded-2xl border border-border/80 bg-card/95 p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">AI Wallet</p>
              <h2 className="text-2xl font-semibold tracking-tight">Credits Overview</h2>
            </div>
            <Badge variant="secondary" className="px-3 py-1 text-sm font-semibold">
              {formatCredits(walletCredits)} credits
            </Badge>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
            <Card className="rounded-2xl border-border/80 bg-muted/10">
              <CardHeader className="flex-row items-start justify-between space-y-0 pb-4">
                <div className="space-y-1">
                  <CardTitle className="text-base">Recent Wallet Activity</CardTitle>
                  <CardDescription>Latest credit movements across purchases and AI usage.</CardDescription>
                </div>
                <div className="rounded-full bg-primary/10 p-2 text-primary">
                  <Activity className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading && walletActivity.length === 0 ? (
                  <div className="space-y-3">
                    <div className="h-16 animate-pulse rounded-xl border border-border/60 bg-background/60" />
                    <div className="h-16 animate-pulse rounded-xl border border-border/60 bg-background/60" />
                    <div className="h-16 animate-pulse rounded-xl border border-border/60 bg-background/60" />
                  </div>
                ) : walletActivity.length === 0 ? (
                  <div className="rounded-xl border border-border/60 bg-background/60 px-4 py-5 text-sm text-muted-foreground">
                    No wallet activity yet.
                  </div>
                ) : (
                  walletActivity.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-border/60 bg-background/70 px-4 py-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium capitalize">
                              {entry.title} | {formatSignedCredits(entry.deltaCredits)}
                            </p>
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {entry.kind}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{entry.meta}</p>
                          <p className="text-xs text-muted-foreground">{entry.detail}</p>
                        </div>
                        <div className="text-sm text-muted-foreground sm:text-right">
                          <p className="font-medium text-foreground">
                            Balance: {entry.balanceAfter === null ? "-" : formatCredits(entry.balanceAfter)}
                          </p>
                          <p>{formatDateTime(entry.timestamp)}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/80 bg-muted/10">
              <CardHeader className="flex-row items-start justify-between space-y-0 pb-4">
                <div className="space-y-1">
                  <CardTitle className="text-base">Recent AI Payments</CardTitle>
                  <CardDescription>Latest top-ups and checkout payments for the account.</CardDescription>
                </div>
                <div className="rounded-full bg-primary/10 p-2 text-primary">
                  <Wallet className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading && payments.length === 0 ? (
                  <div className="space-y-3">
                    <div className="h-20 animate-pulse rounded-xl border border-border/60 bg-background/60" />
                    <div className="h-20 animate-pulse rounded-xl border border-border/60 bg-background/60" />
                  </div>
                ) : payments.length === 0 ? (
                  <div className="rounded-xl border border-border/60 bg-background/60 px-4 py-5 text-sm text-muted-foreground">
                    No payment records yet.
                  </div>
                ) : (
                  payments.map((payment) => (
                    <div key={payment.payment_id} className="rounded-xl border border-border/60 bg-background/70 px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="space-y-1">
                            <p className="text-sm font-medium capitalize">{normalizeText(payment.payment_status)}</p>
                            <p className="text-xs text-muted-foreground">
                              {normalizeText(payment.payment_method)} · {payment.external_reference}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-foreground">
                            +{formatCredits(payment.credits)} credits
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                          <p>{formatDateTime(payment.completed_at || payment.created_at)}</p>
                          <p>
                            Amount: {moneyFormatter.format(payment.amount)} {payment.currency}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="text-[10px] capitalize">
                            {normalizeText(payment.payment_method)}
                          </Badge>
                          <Badge
                            variant={payment.payment_status === "completed" ? "default" : "outline"}
                            className="text-[10px] capitalize"
                          >
                            {normalizeText(payment.payment_status)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-2xl border-border/80 bg-card/95">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Cloud Status</CardTitle>
              <CardDescription>Linked account state and token health.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Link</span>
                <span className="font-medium">{cloudAccountStatus?.is_linked ? "Linked" : "Not linked"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Token</span>
                <span className="font-medium">{cloudAccountStatus?.is_token_expired ? "Expired" : "Valid"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Linked at</span>
                <span className="font-medium">{formatDateTime(cloudAccountStatus?.linked_at)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/80 bg-card/95">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Current Wallet</CardTitle>
              <CardDescription>Available credits and the last sync time.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Credits</span>
                <span className="font-medium">{formatCredits(walletCredits)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Updated</span>
                <span className="font-medium">{formatDateTime(wallet?.updated_at)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Session</span>
                <span className="font-medium">{user?.sessionId ? user.sessionId.slice(0, 12) : "-"}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/80 bg-card/95">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Quick Actions</CardTitle>
              <CardDescription>Refresh or leave the super admin console.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button variant="outline" onClick={() => void loadDashboard()} disabled={isLoading} className="justify-start">
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                Refresh Account
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowSignOutConfirm(true)}
                className="justify-start"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
      <ConfirmationDialog
        open={showSignOutConfirm}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setShowSignOutConfirm(false);
          }
        }}
        title="Sign out?"
        description="Are you sure you want to sign out of the admin console?"
        cancelLabel="Cancel"
        confirmLabel="Sign Out"
        confirmVariant="destructive"
        onCancel={() => setShowSignOutConfirm(false)}
        onConfirm={() => {
          setShowSignOutConfirm(false);
          void logout();
        }}
      />
    </div>
  );
};

export default AdminConsole;
