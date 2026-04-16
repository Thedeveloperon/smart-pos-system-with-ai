"use client";

import { type ElementType, type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Package,
  RefreshCw,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchAiPendingManualPayments,
  fetchAdminCloudProducts,
  fetchAdminCloudPurchases,
  fetchAdminLicensingShops,
  fetchAdminShopUsers,
  verifyAiManualPayment,
  type AdminShopUserRow,
  type AdminShopsLicensingSnapshotResponse,
  type AiPendingManualPaymentItem,
  type CloudProductRow,
  type CloudPurchaseRow,
} from "@/lib/adminApi";
import type { AdminSession } from "./auth";

type AdminPortalDashboardProps = {
  user: AdminSession;
  onSignOut: () => Promise<void>;
};

type SectionId = "overview" | "approvals" | "catalog" | "shops" | "users";

const sidebarItems: Array<{
  id: SectionId;
  label: string;
  icon: ElementType;
}> = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "approvals", label: "AI Approvals", icon: ClipboardList },
  { id: "catalog", label: "Catalog", icon: Package },
  { id: "shops", label: "Shops", icon: Store },
  { id: "users", label: "Users", icon: Users },
];

function formatDate(value?: string | null) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatCurrency(amount?: number | null, currency = "USD") {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return `— ${currency}`;
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function formatLabel(value?: string | null) {
  return (value || "—").replaceAll("_", " ");
}

function PanelCard({
  id,
  title,
  subtitle,
  action,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="rounded-[28px] border border-slate-200/80 bg-white/85 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">SmartPOS Admin</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ElementType;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_40px_rgba(15,23,42,0.07)]">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
          <p className="text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
          <p className="text-sm text-slate-500">{hint}</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default function AdminPortalDashboard({ user, onSignOut }: AdminPortalDashboardProps) {
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationRef, setVerificationRef] = useState("");
  const [pendingPayments, setPendingPayments] = useState<AiPendingManualPaymentItem[]>([]);
  const [products, setProducts] = useState<CloudProductRow[]>([]);
  const [purchases, setPurchases] = useState<CloudPurchaseRow[]>([]);
  const [shops, setShops] = useState<AdminShopsLicensingSnapshotResponse["items"]>([]);
  const [users, setUsers] = useState<AdminShopUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setError(null);
    setIsRefreshing(true);

    const [paymentsResult, productsResult, purchasesResult, shopsResult, usersResult] = await Promise.allSettled([
      fetchAiPendingManualPayments(60),
      fetchAdminCloudProducts({ includeInactive: true, take: 80 }),
      fetchAdminCloudPurchases({ take: 60 }),
      fetchAdminLicensingShops({ includeInactive: true, take: 80 }),
      fetchAdminShopUsers({ includeInactive: true, take: 120 }),
    ]);

    if (paymentsResult.status === "fulfilled") {
      setPendingPayments(paymentsResult.value.items || []);
    } else {
      setError(paymentsResult.reason instanceof Error ? paymentsResult.reason.message : "Failed to load pending payments.");
    }

    if (productsResult.status === "fulfilled") {
      setProducts(productsResult.value.items || []);
    }

    if (purchasesResult.status === "fulfilled") {
      setPurchases(purchasesResult.value.items || []);
    }

    if (shopsResult.status === "fulfilled") {
      setShops(shopsResult.value.items || []);
    }

    if (usersResult.status === "fulfilled") {
      setUsers(usersResult.value.items || []);
    }

    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleVerify = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = verificationRef.trim();
      if (!trimmed) {
        toast.error("Enter a payment ID or external reference.");
        return;
      }

      setIsVerifying(true);
      try {
        await verifyAiManualPayment({
          payment_id: trimmed,
          external_reference: trimmed,
        });
        toast.success("Payment verified and credits applied.");
        setVerificationRef("");
        await loadDashboard();
      } catch (verificationError) {
        toast.error(verificationError instanceof Error ? verificationError.message : "Unable to verify payment.");
      } finally {
        setIsVerifying(false);
      }
    },
    [loadDashboard, verificationRef],
  );

  const stats = useMemo(() => {
    const activeProducts = products.filter((product) => product.active).length;
    const activeShops = shops.filter((shop) => shop.is_active).length;
    const activeUsers = users.filter((currentUser) => currentUser.is_active).length;
    const pendingOrders = purchases.filter((purchase) =>
      ["submitted", "payment_pending", "pending_approval"].includes(purchase.status),
    ).length;

    return {
      activeProducts,
      activeShops,
      activeUsers,
      pendingOrders,
    };
  }, [products, purchases, shops, users]);

  const topShops = useMemo(() => shops.slice(0, 5), [shops]);
  const topUsers = useMemo(() => users.slice(0, 6), [users]);
  const topProducts = useMemo(() => products.slice(0, 6), [products]);
  const topPayments = useMemo(() => pendingPayments.slice(0, 6), [pendingPayments]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.11),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.10),_transparent_26%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] text-slate-900">
      <div className="mx-auto grid min-h-screen max-w-[1680px] lg:grid-cols-[296px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200/80 bg-slate-950/95 text-white lg:border-b-0 lg:border-r lg:border-slate-800">
          <div className="sticky top-0 flex h-full flex-col p-5 lg:h-screen">
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 shadow-2xl shadow-slate-950/20 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-wide text-white">SmartPOS Admin</p>
                  <p className="text-xs text-slate-300">Operations command center</p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
                Signed in as <span className="font-semibold text-white">{user.username}</span>
                <br />
                Role: <span className="font-semibold text-white">{user.role}</span>
              </div>
            </div>

            <nav className="mt-6 space-y-2">
              {sidebarItems.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveSection(item.id);
                      document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className={[
                      "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition",
                      active
                        ? "border-emerald-400/50 bg-emerald-400/15 text-white shadow-lg shadow-emerald-950/15"
                        : "border-white/8 bg-white/5 text-slate-200 hover:border-white/15 hover:bg-white/10",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto pt-6">
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Quick actions</p>
                <div className="mt-3 flex flex-col gap-2">
                  <Button variant="hero" className="justify-start" onClick={() => void loadDashboard()} disabled={isRefreshing}>
                    <RefreshCw className="h-4 w-4" />
                    {isRefreshing ? "Refreshing..." : "Refresh data"}
                  </Button>
                  <Button variant="hero-outline" className="justify-start" onClick={() => void onSignOut()}>
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <section
            id="overview"
            className="rounded-[32px] border border-slate-200/80 bg-white/85 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur"
          >
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-3xl space-y-3">
                <Badge className="rounded-full border border-emerald-500/20 bg-emerald-50 px-3 py-1 text-emerald-700 hover:bg-emerald-50">
                  Super Admin Console
                </Badge>
                <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                  Operations dashboard for approvals, shops, and catalog control.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  Live workspace for super-admin review. This layout pulls active data from the existing backend,
                  but the interface now follows a much more distinct dashboard shell.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button variant="hero" onClick={() => document.getElementById("approvals")?.scrollIntoView({ behavior: "smooth" })}>
                  Open approvals
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={() => void onSignOut()}>
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </div>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Active shops" value={String(stats.activeShops)} hint="Currently licensed and active" icon={Store} />
            <StatCard label="Active products" value={String(stats.activeProducts)} hint="Visible in the catalog" icon={Package} />
            <StatCard label="Pending orders" value={String(stats.pendingOrders)} hint="Awaiting review or payment" icon={ClipboardList} />
            <StatCard label="Active users" value={String(stats.activeUsers)} hint="Licensed admin/shop users" icon={Users} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
            <PanelCard
              id="approvals"
              title="AI manual payment approvals"
              subtitle="Verify a payment reference and review the current queue."
              action={<Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">Pending {pendingPayments.length}</Badge>}
            >
              <form className="mb-4 flex flex-col gap-3 sm:flex-row" onSubmit={handleVerify}>
                <Input
                  value={verificationRef}
                  onChange={(event) => setVerificationRef(event.target.value)}
                  placeholder="Payment ID or external reference"
                  className="h-12 rounded-2xl border-slate-200 bg-slate-50"
                />
                <Button type="submit" variant="hero" className="h-12 shrink-0" disabled={isVerifying}>
                  {isVerifying ? "Verifying..." : "Verify payment"}
                </Button>
              </form>

              {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

              <div className="space-y-3">
                {topPayments.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                    No pending manual payments right now.
                  </p>
                ) : (
                  topPayments.map((item) => (
                    <div key={item.payment_id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{item.target_full_name || item.target_username}</p>
                          <p className="text-xs text-slate-500">
                            {item.shop_name || "Unknown shop"} • {item.payment_id}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                            {formatLabel(item.payment_status)}
                          </Badge>
                          <Badge className="rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                            {item.credits.toLocaleString()} credits
                          </Badge>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {formatCurrency(item.amount, item.currency)} • {formatLabel(item.payment_method)} • {formatDate(item.created_at)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </PanelCard>

            <div className="space-y-6">
              <PanelCard
                id="catalog"
                title="Catalog snapshot"
                subtitle="Recent products from the current backend catalog."
                action={<Badge className="rounded-full bg-blue-50 text-blue-700 hover:bg-blue-50">Live</Badge>}
              >
                <div className="space-y-3">
                  {topProducts.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                      No products returned yet.
                    </p>
                  ) : (
                    topProducts.map((product) => (
                      <div key={product.product_code} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{product.product_name}</p>
                            <p className="text-xs text-slate-500">
                              {product.product_code} • {formatLabel(product.product_type)} • {formatLabel(product.billing_mode)}
                            </p>
                          </div>
                          <Badge className={product.active ? "rounded-full bg-emerald-50 text-emerald-700" : "rounded-full bg-slate-100 text-slate-500"}>
                            {product.active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          {formatCurrency(product.price, product.currency)} • Default qty {product.default_quantity_or_credits}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </PanelCard>

              <PanelCard
                id="shops"
                title="Shop overview"
                subtitle="Licensing status, plan, and device totals."
                action={<Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">{stats.activeShops} active</Badge>}
              >
                <div className="space-y-3">
                  {topShops.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                      No shop snapshot returned yet.
                    </p>
                  ) : (
                    topShops.map((shop) => (
                      <div key={shop.shop_id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{shop.shop_name}</p>
                            <p className="text-xs text-slate-500">{shop.shop_code}</p>
                          </div>
                          <Badge className={shop.is_active ? "rounded-full bg-emerald-50 text-emerald-700" : "rounded-full bg-rose-50 text-rose-700"}>
                            {formatLabel(shop.subscription_status)}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          Plan {formatLabel(shop.plan)} • Seats {shop.active_seats}/{shop.seat_limit} • Devices {shop.total_devices}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </PanelCard>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <PanelCard
              id="users"
              title="Users"
              subtitle="Super-admin, billing-admin, and shop-user snapshots."
              action={<Badge className="rounded-full bg-indigo-50 text-indigo-700 hover:bg-indigo-50">{stats.activeUsers} active</Badge>}
            >
              <div className="space-y-3">
                {topUsers.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                    No users returned yet.
                  </p>
                ) : (
                  topUsers.map((currentUser) => (
                    <div key={currentUser.user_id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{currentUser.full_name}</p>
                          <p className="text-xs text-slate-500">
                            {currentUser.username} • {currentUser.shop_code}
                          </p>
                        </div>
                        <Badge className={currentUser.is_active ? "rounded-full bg-emerald-50 text-emerald-700" : "rounded-full bg-slate-100 text-slate-500"}>
                          {formatLabel(currentUser.role_code)}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">Last login {formatDate(currentUser.last_login_at)}</p>
                    </div>
                  ))
                )}
              </div>
            </PanelCard>

            <PanelCard
              title="Recent purchase orders"
              subtitle="A compact view of recent purchase traffic from the existing backend."
              action={<Badge className="rounded-full bg-amber-50 text-amber-700 hover:bg-amber-50">{purchases.length} records</Badge>}
            >
              <div className="space-y-3">
                {purchases.slice(0, 6).length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                    No purchase orders returned yet.
                  </p>
                ) : (
                  purchases.slice(0, 6).map((purchase) => (
                    <div key={purchase.purchase_id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{purchase.order_number}</p>
                          <p className="text-xs text-slate-500">
                            {purchase.shop_code} • {purchase.items.map((item) => item.product_name).join(", ")}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-900">{formatCurrency(purchase.total_amount, purchase.currency)}</p>
                          <p className="text-xs text-slate-500">{formatLabel(purchase.status)}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </PanelCard>
          </div>

          <section className="rounded-[28px] border border-slate-200/80 bg-slate-950 px-5 py-4 text-slate-100 shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Session</p>
                <p className="mt-1 text-sm text-slate-200">
                  {user.full_name} ({user.username}) • {user.role}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="hero-outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={() => void loadDashboard()} disabled={isRefreshing}>
                  <RefreshCw className="h-4 w-4" />
                  {isRefreshing ? "Refreshing..." : "Refresh dashboard"}
                </Button>
                <Button variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={() => void onSignOut()}>
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
