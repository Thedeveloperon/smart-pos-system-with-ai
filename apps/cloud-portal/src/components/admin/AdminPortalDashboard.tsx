"use client";

import { type ElementType, useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CircleDollarSign,
  CircleEllipsis,
  Clock3,
  LayoutGrid,
  Monitor,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ShoppingCart,
  Store,
  Shield,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import CloudProductCatalogPanel from "./CloudProductCatalogPanel";
import CloudPurchaseQueuePanel from "./CloudPurchaseQueuePanel";
import AdminShopsPanel from "./AdminShopsPanel";
import AdminUsersPanel from "./AdminUsersPanel";
import {
  fetchAdminCloudPurchases,
  fetchAdminCloudProducts,
  fetchAdminLicensingShops,
  fetchAdminShopUsers,
  type AdminShopUserRow,
  type AdminShopsLicensingSnapshotResponse,
  type CloudProductRow,
  type CloudPurchaseRow,
} from "@/lib/adminApi";
import type { AdminSession } from "./auth";
import { isSuperAdminRole } from "./auth";

type AdminPortalDashboardProps = {
  user: AdminSession;
  onSignOut: () => Promise<void>;
};

type SectionId = "overview" | "catalog" | "purchases" | "shops" | "users";

const navItems: Array<{ id: SectionId; label: string; icon: ElementType }> = [
  { id: "overview", label: "Dashboard", icon: LayoutGrid },
  { id: "catalog", label: "Product Catalog", icon: Package },
  { id: "purchases", label: "Purchase Queue", icon: ShoppingCart },
  { id: "shops", label: "Shops", icon: Store },
  { id: "users", label: "Users", icon: Users },
];

function formatCurrency(amount?: number | null, currency = "USD") {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return `— ${currency}`;
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

function formatDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatSentence(value?: string | null) {
  return (value || "—").replaceAll("_", " ");
}

function initials(fullName: string) {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function ShellStatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: ElementType;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-600">{label}</p>
          <p className={`mt-2 text-3xl font-semibold tracking-tight ${accent || "text-slate-950"}`}>{value}</p>
        </div>
        <Icon className="mt-1 h-5 w-5 text-slate-500" />
      </div>
    </div>
  );
}

function AdminSectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

export default function AdminPortalDashboard({ user, onSignOut }: AdminPortalDashboardProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<CloudProductRow[]>([]);
  const [purchases, setPurchases] = useState<CloudPurchaseRow[]>([]);
  const [shops, setShops] = useState<AdminShopsLicensingSnapshotResponse["items"]>([]);
  const [users, setUsers] = useState<AdminShopUserRow[]>([]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [productsResult, purchasesResult, shopsResult, usersResult] = await Promise.allSettled([
        fetchAdminCloudProducts({ includeInactive: true, take: 100 }),
        fetchAdminCloudPurchases({ take: 100 }),
        fetchAdminLicensingShops({ includeInactive: true, take: 100 }),
        fetchAdminShopUsers({ includeInactive: true, take: 200 }),
      ]);

      if (productsResult.status === "fulfilled") setProducts(productsResult.value.items || []);
      if (purchasesResult.status === "fulfilled") setPurchases(purchasesResult.value.items || []);
      if (shopsResult.status === "fulfilled") setShops(shopsResult.value.items || []);
      if (usersResult.status === "fulfilled") setUsers(usersResult.value.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const activeProducts = products.filter((product) => product.active);
  const activeShops = shops.filter((shop) => shop.is_active);
  const pendingRegistrations = shops.filter((shop) => !shop.is_active || /pending/i.test(shop.subscription_status));
  const pendingApprovals = purchases.filter((purchase) => ["submitted", "payment_pending", "pending_approval"].includes(purchase.status)).length;
  const totalRevenue = purchases.reduce((sum, purchase) => sum + (purchase.total_amount || 0), 0);
  const recentRegistrations = [...shops].slice(0, 2);
  const recentOrders = [...purchases].slice(0, 5);
  const adminUsers = users.filter((currentUser) => currentUser.is_active);

  const renderOverview = () => (
    <div className="space-y-6">
      <AdminSectionHeader title="Admin Dashboard" subtitle="System overview and pending actions." />

      <div className="grid gap-4 xl:grid-cols-4">
        <ShellStatCard label="Pending Registrations" value={String(pendingRegistrations.length)} icon={CircleEllipsis} />
        <ShellStatCard label="Pending Approvals" value={String(pendingApprovals)} icon={Clock3} />
        <ShellStatCard label="Active Shops" value={String(activeShops.length)} icon={Shield} />
        <ShellStatCard label="Total Revenue" value={formatCurrency(totalRevenue)} icon={CircleDollarSign} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">Pending Registrations</h2>
          </div>
          <div className="divide-y divide-slate-200">
            {recentRegistrations.length === 0 ? (
              <div className="px-5 py-8 text-sm text-slate-500">No pending registrations.</div>
            ) : (
              recentRegistrations.map((shop) => (
                <div key={shop.shop_id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div>
                    <p className="font-medium text-slate-950">{shop.shop_name}</p>
                    <p className="text-sm text-slate-500">{shop.shop_code}</p>
                  </div>
                  <Badge className="rounded-full bg-amber-100 text-amber-800">pending</Badge>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">Recent Purchase Orders</h2>
          </div>
          <div className="divide-y divide-slate-200">
            {recentOrders.length === 0 ? (
              <div className="px-5 py-8 text-sm text-slate-500">No purchase orders yet.</div>
            ) : (
              recentOrders.map((purchase) => {
                const statusTone =
                  purchase.status === "approved" || purchase.status === "assigned"
                    ? "bg-emerald-100 text-emerald-700"
                    : purchase.status === "rejected"
                      ? "bg-rose-100 text-rose-700"
                      : purchase.status === "pending_approval"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-sky-100 text-sky-700";

                return (
                  <div key={purchase.purchase_id} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div>
                      <p className="font-medium text-slate-950">{purchase.order_number}</p>
                      <p className="text-sm text-slate-500">
                        {purchase.owner_full_name || purchase.owner_username || "Unknown owner"} ·{" "}
                        {purchase.shop_name || purchase.shop_code}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-slate-950">{formatCurrency(purchase.total_amount, purchase.currency)}</span>
                      <Badge className={`rounded-full ${statusTone}`}>{formatSentence(purchase.status)}</Badge>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );

  const renderActivePage = () => {
    switch (activeSection) {
      case "overview":
        return renderOverview();
      case "catalog":
        return (
          <div className="space-y-6">
            <AdminSectionHeader title="Product Catalog" subtitle="Manage POS subscriptions and AI credit packs." />
            <CloudProductCatalogPanel />
          </div>
        );
      case "purchases":
        return (
          <div className="space-y-6">
            <AdminSectionHeader title="Purchase Queue" subtitle="Review and process purchase orders." />
            <CloudPurchaseQueuePanel heading="Purchase Queue" />
          </div>
        );
      case "shops":
        return (
          <div className="space-y-6">
            <AdminSectionHeader title="Shops Management" subtitle="Manage shop accounts and registrations." />
            <AdminShopsPanel shops={shops} onShopsChanged={loadDashboard} />
          </div>
        );
      case "users":
        return (
          <div className="space-y-6">
            <AdminSectionHeader title="Users Management" subtitle="Manage cloud-managed users, roles, and access." />
            <AdminUsersPanel shops={shops} />
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <div
        className={[
          "grid min-h-screen transition-[grid-template-columns] duration-300",
          sidebarCollapsed ? "lg:grid-cols-[72px_minmax(0,1fr)]" : "lg:grid-cols-[230px_minmax(0,1fr)]",
        ].join(" ")}
      >
        <aside className="border-r border-slate-200 bg-slate-50 transition-all duration-300">
          <div className="flex h-full flex-col">
            <div className={["flex items-center border-b border-slate-200 py-4", sidebarCollapsed ? "justify-center px-2" : "gap-3 px-4"].join(" ")}>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Monitor className="h-4 w-4" />
              </div>
              <div className={sidebarCollapsed ? "hidden" : ""}>
                <p className="text-sm font-semibold">Cloud Portal</p>
                <p className="text-xs text-slate-500">v1.0</p>
              </div>
            </div>

            <div className={["relative py-4", sidebarCollapsed ? "px-2" : "px-4"].join(" ")}>
              {isSuperAdminRole(user.role) ? (
                <div
                  className={[
                    "flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm",
                    sidebarCollapsed ? "justify-center px-2" : "",
                  ].join(" ")}
                  aria-label="Admin View"
                >
                  <Shield className="h-4 w-4 text-slate-600" />
                  <span className={sidebarCollapsed ? "hidden" : ""}>Admin View</span>
                </div>
              ) : null}
            </div>

            <div className="px-2">
              <p className={["pb-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-500", sidebarCollapsed ? "px-2 text-center" : "px-3"].join(" ")}>
                {sidebarCollapsed ? "" : "Administration"}
              </p>
              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      className={[
                        "flex w-full items-center rounded-lg py-2 text-sm transition",
                        sidebarCollapsed ? "justify-center px-2" : "gap-3 px-3",
                        active ? "bg-slate-200 font-medium" : "hover:bg-slate-100",
                      ].join(" ")}
                      title={item.label}
                    >
                      <Icon className="h-4 w-4 text-slate-600" />
                      <span className={sidebarCollapsed ? "hidden" : ""}>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className={["mt-auto border-t border-slate-200 py-4", sidebarCollapsed ? "px-2" : "px-4"].join(" ")}>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                  {initials(user.full_name)}
                </div>
                <div className={sidebarCollapsed ? "hidden" : ""}>
                  <p className="text-sm font-medium">{user.full_name}</p>
                  <p className="text-xs text-slate-500">Super Admin</p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-col">
          <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
            <button
              onClick={() => setSidebarCollapsed((current) => !current)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
            <div className="h-9 flex-1 border-l border-slate-200 pl-4" />
            <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50">
              <Bell className="h-4 w-4" />
            </button>
          </header>

          <div className="flex-1 px-4 py-6 sm:px-6">
            {renderActivePage()}
          </div>

          <div className="border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 sm:px-6">
            Signed in as <span className="font-medium text-slate-700">{user.username}</span>.{" "}
            {loading ? "Refreshing data..." : "System data loaded from the existing backend."}
            <div className="mt-2">
              <Button variant="outline" size="sm" onClick={() => void loadDashboard()}>
                Refresh Data
              </Button>
              <Button className="ml-2" variant="hero" size="sm" onClick={() => void onSignOut()}>
                Sign Out
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
