import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Download, Eye, EyeOff, RefreshCw, Shield, ShieldAlert, ShieldOff, ShieldX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AdminShopsLicensingSnapshotResponse } from "@/lib/adminApi";

// ---------------------------------------------------------------------------
// Mock data — replace with real API calls in the next phase
// ---------------------------------------------------------------------------

type MockDevice = {
  device_code: string;
  device_name: string;
  device_status: string;
  license_state: string;
  valid_until: string | null;
  grace_until: string | null;
  last_heartbeat_at: string | null;
};

type MockShop = {
  shop_id: string;
  shop_code: string;
  shop_name: string;
  is_active: boolean;
  devices: MockDevice[];
};

const INITIAL_MOCK_SHOPS: MockShop[] = [
  {
    shop_id: "shop-001",
    shop_code: "SHOP-DOWNTOWN",
    shop_name: "Downtown Café",
    is_active: true,
    devices: [
      {
        device_code: "DEV-A1B2",
        device_name: "Counter 1",
        device_status: "active",
        license_state: "active",
        valid_until: new Date(Date.now() + 18 * 3600000).toISOString(),
        grace_until: new Date(Date.now() + (18 + 7 * 24) * 3600000).toISOString(),
        last_heartbeat_at: new Date(Date.now() - 2 * 60000).toISOString(),
      },
      {
        device_code: "DEV-C3D4",
        device_name: "Counter 2",
        device_status: "active",
        license_state: "grace",
        valid_until: new Date(Date.now() - 3 * 3600000).toISOString(),
        grace_until: new Date(Date.now() + 5 * 24 * 3600000).toISOString(),
        last_heartbeat_at: new Date(Date.now() - 30 * 60000).toISOString(),
      },
    ],
  },
  {
    shop_id: "shop-002",
    shop_code: "SHOP-UPTOWN",
    shop_name: "Uptown Grill",
    is_active: true,
    devices: [
      {
        device_code: "DEV-E5F6",
        device_name: "POS Terminal 1",
        device_status: "revoked",
        license_state: "revoked",
        valid_until: null,
        grace_until: null,
        last_heartbeat_at: new Date(Date.now() - 2 * 24 * 3600000).toISOString(),
      },
      {
        device_code: "DEV-G7H8",
        device_name: "POS Terminal 2",
        device_status: "active",
        license_state: "suspended",
        valid_until: new Date(Date.now() - 13 * 24 * 3600000).toISOString(),
        grace_until: null,
        last_heartbeat_at: new Date(Date.now() - 5 * 3600000).toISOString(),
      },
    ],
  },
  {
    shop_id: "shop-003",
    shop_code: "SHOP-EASTSIDE",
    shop_name: "Eastside Market",
    is_active: true,
    devices: [
      {
        device_code: "DEV-I9J0",
        device_name: "Cashier Desk",
        device_status: "active",
        license_state: "unprovisioned",
        valid_until: null,
        grace_until: null,
        last_heartbeat_at: null,
      },
    ],
  },
  {
    shop_id: "shop-004",
    shop_code: "SHOP-WESTEND",
    shop_name: "West End Bakery",
    is_active: false,
    devices: [
      {
        device_code: "DEV-K1L2",
        device_name: "Front Counter",
        device_status: "revoked",
        license_state: "revoked",
        valid_until: null,
        grace_until: null,
        last_heartbeat_at: new Date(Date.now() - 30 * 24 * 3600000).toISOString(),
      },
    ],
  },
];

type MockAuditLog = {
  id: string;
  created_at: string;
  shop_code: string;
  device_code: string;
  action: string;
  actor: string;
  reason: string | null;
  is_manual_override: boolean;
};

const MOCK_AUDIT_LOGS: MockAuditLog[] = [
  {
    id: "log-1",
    created_at: new Date(Date.now() - 3600000).toISOString(),
    shop_code: "SHOP-DOWNTOWN",
    device_code: "DEV-A1B2",
    action: "provision_activate",
    actor: "billing-ui",
    reason: "Initial setup",
    is_manual_override: false,
  },
  {
    id: "log-2",
    created_at: new Date(Date.now() - 7200000).toISOString(),
    shop_code: "SHOP-UPTOWN",
    device_code: "DEV-E5F6",
    action: "provision_deactivate",
    actor: "support-admin",
    reason: "Customer request",
    is_manual_override: true,
  },
  {
    id: "log-3",
    created_at: new Date(Date.now() - 86400000).toISOString(),
    shop_code: "SHOP-UPTOWN",
    device_code: "DEV-G7H8",
    action: "license_revoke",
    actor: "system",
    reason: "Subscription suspended",
    is_manual_override: false,
  },
  {
    id: "log-4",
    created_at: new Date(Date.now() - 172800000).toISOString(),
    shop_code: "SHOP-EASTSIDE",
    device_code: "DEV-I9J0",
    action: "provision_activate",
    actor: "billing-ui",
    reason: "New device registration",
    is_manual_override: false,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type LicenseStateFilter = "expired" | "all" | "suspended" | "revoked" | "grace" | "active" | "unprovisioned";
type DeviceAction = "activate" | "reactivate" | "deactivate" | "revoke";

function normalize(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatRelativeTime(value?: string | null) {
  if (!value) return "Never";
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hr ago`;
  return `${Math.floor(diff / 86400000)} days ago`;
}

function getLicenseBadgeClass(state: string) {
  switch (normalize(state)) {
    case "active":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "grace":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "suspended":
      return "bg-orange-100 text-orange-700 border-orange-200";
    case "revoked":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-slate-100 text-slate-500 border-slate-200";
  }
}

function getActionLabel(action: string) {
  return action.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Props — kept identical to original so AdminPortalDashboard.tsx is unchanged
// ---------------------------------------------------------------------------

type AdminLicensesPanelProps = {
  shops: AdminShopsLicensingSnapshotResponse["items"];
  canManage: boolean;
  onRefresh: () => Promise<void> | void;
};

type ActionDialogState = {
  open: boolean;
  action: DeviceAction | null;
  shopId: string;
  shopName: string;
  deviceCode: string;
  deviceName: string;
};

type GeneratedKey = {
  key: string;
  expires_at: string;
  copied: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminLicensesPanel({ canManage }: AdminLicensesPanelProps) {
  // Devices tab state
  const [shops, setShops] = useState<MockShop[]>(INITIAL_MOCK_SHOPS);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<LicenseStateFilter>("all");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Action dialog state
  const [dialog, setDialog] = useState<ActionDialogState>({
    open: false,
    action: null,
    shopId: "",
    shopName: "",
    deviceCode: "",
    deviceName: "",
  });
  const [actorNote, setActorNote] = useState("");
  const [dialogReason, setDialogReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // License Keys tab state
  const [keyShopCode, setKeyShopCode] = useState("");
  const [keyCount, setKeyCount] = useState(1);
  const [keyTtlDays, setKeyTtlDays] = useState(90);
  const [keyMaxActivations, setKeyMaxActivations] = useState(1);
  const [keyAllowExisting, setKeyAllowExisting] = useState(false);
  const [keyActorNote, setKeyActorNote] = useState("");
  const [isGeneratingKeys, setIsGeneratingKeys] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState<GeneratedKey[]>([]);
  const [generatedForShop, setGeneratedForShop] = useState("");

  // Audit Logs tab state
  const [auditLogs] = useState<MockAuditLog[]>(MOCK_AUDIT_LOGS);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("all");
  const [auditTake] = useState(50);

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  type DeviceRow = {
    shopId: string;
    shopCode: string;
    shopName: string;
    shopIsActive: boolean;
    deviceCode: string;
    deviceName: string;
    deviceStatus: string;
    licenseState: string;
    validUntil: string | null;
    graceUntil: string | null;
    lastHeartbeatAt: string | null;
  };

  const allRows = useMemo<DeviceRow[]>(() =>
    shops.flatMap((shop) =>
      shop.devices.map((device) => ({
        shopId: shop.shop_id,
        shopCode: shop.shop_code,
        shopName: shop.shop_name,
        shopIsActive: shop.is_active,
        deviceCode: device.device_code,
        deviceName: device.device_name,
        deviceStatus: device.device_status,
        licenseState: device.license_state,
        validUntil: device.valid_until,
        graceUntil: device.grace_until,
        lastHeartbeatAt: device.last_heartbeat_at,
      })),
    ), [shops]);

  const filteredRows = useMemo(() => {
    const query = normalize(search);
    return allRows
      .filter((row) => includeInactive || row.shopIsActive)
      .filter((row) => {
        const s = normalize(row.licenseState);
        if (stateFilter === "all") return true;
        if (stateFilter === "expired") return s === "suspended" || s === "revoked";
        return s === stateFilter;
      })
      .filter((row) => {
        if (!query) return true;
        const haystack = [row.shopCode, row.shopName, row.deviceCode, row.deviceName].map(normalize).join(" ");
        return haystack.includes(query);
      });
  }, [allRows, includeInactive, search, stateFilter]);

  const statsTotal = allRows.filter((r) => includeInactive || r.shopIsActive).length;
  const statsActive = allRows.filter((r) => (includeInactive || r.shopIsActive) && normalize(r.licenseState) === "active").length;
  const statsGrace = allRows.filter((r) => (includeInactive || r.shopIsActive) && normalize(r.licenseState) === "grace").length;
  const statsExpired = allRows.filter((r) => (includeInactive || r.shopIsActive) && (normalize(r.licenseState) === "suspended" || normalize(r.licenseState) === "revoked")).length;

  const filteredAuditLogs = useMemo(() => {
    const query = normalize(auditSearch);
    return auditLogs
      .filter((log) => auditActionFilter === "all" || normalize(log.action) === auditActionFilter)
      .filter((log) => {
        if (!query) return true;
        const haystack = [log.shop_code, log.device_code, log.actor, log.action, log.reason ?? ""].map(normalize).join(" ");
        return haystack.includes(query);
      })
      .slice(0, auditTake);
  }, [auditLogs, auditSearch, auditActionFilter, auditTake]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleForceResync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    // TODO: replace with adminForceLicenseResync()
    await delay(800);
    setIsSyncing(false);
    toast.success("License resync completed.");
  };

  const openActionDialog = (row: DeviceRow, action: DeviceAction) => {
    setActorNote("");
    setDialogReason("");
    setDialog({ open: true, action, shopId: row.shopId, shopName: row.shopName, deviceCode: row.deviceCode, deviceName: row.deviceName });
  };

  const closeDialog = () => {
    if (isSubmitting) return;
    setDialog((prev) => ({ ...prev, open: false }));
  };

  const handleDialogSubmit = async () => {
    if (!actorNote.trim()) {
      toast.error("Actor note is required.");
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);

    // TODO: replace with real API calls:
    //   activate   → adminActivateDevice(deviceCode, actorNote, "billing-ui")
    //   reactivate → adminReactivateDevice(deviceCode, actorNote, "billing-ui")
    //   deactivate → adminDeactivateDevice(deviceCode, actorNote, "billing-ui", dialogReason)
    //   revoke     → adminRevokeDevice(deviceCode, actorNote, "billing-ui", dialogReason)
    await delay(600);

    const { action, shopId, deviceCode } = dialog;

    const nextStateMap: Record<DeviceAction, { device_status: string; license_state: string }> = {
      activate: { device_status: "active", license_state: "active" },
      reactivate: { device_status: "active", license_state: "active" },
      deactivate: { device_status: "revoked", license_state: "revoked" },
      revoke: { device_status: "revoked", license_state: "revoked" },
    };

    if (action) {
      setShops((prev) =>
        prev.map((shop) => {
          if (shop.shop_id !== shopId) return shop;
          return {
            ...shop,
            devices: shop.devices.map((d) =>
              d.device_code === deviceCode ? { ...d, ...nextStateMap[action], last_heartbeat_at: action === "activate" || action === "reactivate" ? new Date().toISOString() : d.last_heartbeat_at } : d,
            ),
          };
        }),
      );
      toast.success(`Device ${deviceCode} ${action}d successfully.`);
    }

    setIsSubmitting(false);
    setDialog((prev) => ({ ...prev, open: false }));
  };

  const handleGenerateKeys = async () => {
    if (!keyActorNote.trim()) {
      toast.error("Actor note is required.");
      return;
    }
    if (isGeneratingKeys) return;
    setIsGeneratingKeys(true);

    // TODO: replace with adminGenerateOfflineActivationEntitlementBatch({ shop_code: keyShopCode, count: keyCount, ttl_days: keyTtlDays, max_activations: keyMaxActivations, allow_if_existing_batch: keyAllowExisting, actor_note: keyActorNote })
    await delay(700);

    const shopLabel = keyShopCode.trim() || "DEFAULT";
    const expiry = new Date(Date.now() + keyTtlDays * 24 * 3600000).toISOString();
    const keys: GeneratedKey[] = Array.from({ length: keyCount }, (_, i) => ({
      key: `SPK-${shopLabel.slice(0, 4).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${String(i + 1).padStart(4, "0")}`,
      expires_at: expiry,
      copied: false,
    }));

    setGeneratedKeys(keys);
    setGeneratedForShop(shopLabel);
    setIsGeneratingKeys(false);
    toast.success(`${keyCount} key(s) generated.`);
  };

  const handleCopyKey = async (index: number) => {
    const key = generatedKeys[index]?.key;
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
    } catch {
      // clipboard unavailable
    }
    setGeneratedKeys((prev) => prev.map((k, i) => (i === index ? { ...k, copied: true } : k)));
    toast.success("Key copied to clipboard.");
    setTimeout(() => setGeneratedKeys((prev) => prev.map((k, i) => (i === index ? { ...k, copied: false } : k))), 2000);
  };

  const handleExportAuditLogs = (format: "csv" | "json") => {
    // TODO: replace with exportAdminLicenseAuditLogs({ format })
    toast.info(`Export as ${format.toUpperCase()} started (mock — no file downloaded).`);
  };

  // ---------------------------------------------------------------------------
  // Action buttons logic
  // ---------------------------------------------------------------------------

  function renderActionButtons(row: DeviceRow) {
    if (!canManage) {
      return <span className="text-xs text-muted-foreground">Read only</span>;
    }

    const state = normalize(row.licenseState);

    return (
      <div className="flex justify-end gap-1.5">
        {state === "unprovisioned" && (
          <Button variant="default" size="sm" onClick={() => openActionDialog(row, "activate")}>
            Activate
          </Button>
        )}
        {(state === "suspended" || state === "revoked") && (
          <Button variant="outline" size="sm" onClick={() => openActionDialog(row, "reactivate")}>
            Reactivate
          </Button>
        )}
        {(state === "active" || state === "grace") && (
          <>
            <Button variant="outline" size="sm" onClick={() => openActionDialog(row, "deactivate")}>
              Deactivate
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => openActionDialog(row, "revoke")}
            >
              Revoke
            </Button>
          </>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      <Tabs defaultValue="devices">
        <div className="flex items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="devices">Devices</TabsTrigger>
            <TabsTrigger value="keys">License Keys</TabsTrigger>
            <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" disabled={isSyncing} onClick={() => void handleForceResync()}>
            <RefreshCw className={["h-4 w-4", isSyncing ? "animate-spin" : ""].join(" ")} />
            {isSyncing ? "Syncing…" : "Force Resync"}
          </Button>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* TAB: Devices                                                      */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="devices" className="space-y-4 mt-4">
          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm">
              <Shield className="h-3.5 w-3.5 text-slate-500" />
              <span className="font-medium">{statsTotal}</span>
              <span className="text-muted-foreground">total</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700">
              <Shield className="h-3.5 w-3.5" />
              <span className="font-medium">{statsActive}</span>
              <span>active</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-700">
              <ShieldAlert className="h-3.5 w-3.5" />
              <span className="font-medium">{statsGrace}</span>
              <span>grace</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-700">
              <ShieldX className="h-3.5 w-3.5" />
              <span className="font-medium">{statsExpired}</span>
              <span>expired</span>
            </div>
          </div>

          {/* Filters */}
          <div className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-end md:justify-between">
              <div className="grid w-full gap-3 md:grid-cols-3">
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="admin-licenses-search">Search</Label>
                  <Input
                    id="admin-licenses-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="shop or device code / name"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="admin-licenses-state">License State</Label>
                  <select
                    id="admin-licenses-state"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={stateFilter}
                    onChange={(e) => setStateFilter(e.target.value as LicenseStateFilter)}
                  >
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="grace">Grace</option>
                    <option value="suspended">Suspended</option>
                    <option value="revoked">Revoked</option>
                    <option value="unprovisioned">Unprovisioned</option>
                    <option value="expired">Expired (Suspended + Revoked)</option>
                  </select>
                </div>
              </div>
              <label className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                />
                Include inactive shops
              </label>
            </div>

            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shop</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>License</TableHead>
                    <TableHead>Valid Until</TableHead>
                    <TableHead>Last Heartbeat</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        No devices match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((row) => (
                      <TableRow key={`${row.shopId}:${row.deviceCode}`}>
                        <TableCell>
                          <div className="space-y-0.5">
                            <p className="font-medium leading-tight">{row.shopName}</p>
                            <p className="text-xs text-muted-foreground">{row.shopCode}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <p className="font-medium leading-tight">{row.deviceName}</p>
                            <p className="font-mono text-xs text-muted-foreground">{row.deviceCode}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={[
                              "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium capitalize",
                              normalize(row.deviceStatus) === "active"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-slate-50 text-slate-500",
                            ].join(" ")}
                          >
                            {row.deviceStatus}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={[
                              "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium capitalize",
                              getLicenseBadgeClass(row.licenseState),
                            ].join(" ")}
                          >
                            {row.licenseState}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">{formatDateTime(row.validUntil)}</TableCell>
                        <TableCell className="text-sm">{formatRelativeTime(row.lastHeartbeatAt)}</TableCell>
                        <TableCell>{renderActionButtons(row)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* TAB: License Keys                                                 */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="keys" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Generator form */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-5">
              <div>
                <h3 className="text-base font-semibold">Generate Offline Activation Keys</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Creates one-time activation keys (SPK) for manual local installations.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="key-shop-code">Shop Code</Label>
                  <Input
                    id="key-shop-code"
                    value={keyShopCode}
                    onChange={(e) => setKeyShopCode(e.target.value)}
                    placeholder="e.g. SHOP-DOWNTOWN (leave empty for default)"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="key-count">Count</Label>
                    <Input
                      id="key-count"
                      type="number"
                      min={1}
                      max={10}
                      value={keyCount}
                      onChange={(e) => setKeyCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="key-ttl">TTL (days)</Label>
                    <Input
                      id="key-ttl"
                      type="number"
                      min={1}
                      max={365}
                      value={keyTtlDays}
                      onChange={(e) => setKeyTtlDays(Math.max(1, parseInt(e.target.value) || 90))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="key-max-act">Max Activations</Label>
                    <Input
                      id="key-max-act"
                      type="number"
                      min={1}
                      max={100}
                      value={keyMaxActivations}
                      onChange={(e) => setKeyMaxActivations(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="key-actor-note">Actor Note <span className="text-red-500">*</span></Label>
                  <Input
                    id="key-actor-note"
                    value={keyActorNote}
                    onChange={(e) => setKeyActorNote(e.target.value)}
                    placeholder="e.g. Manual issuance for Shop ABC"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={keyAllowExisting}
                    onChange={(e) => setKeyAllowExisting(e.target.checked)}
                  />
                  Allow generation even if active keys exist for this shop
                </label>

                <Button
                  type="button"
                  variant="default"
                  className="w-full"
                  disabled={isGeneratingKeys}
                  onClick={() => void handleGenerateKeys()}
                >
                  {isGeneratingKeys ? "Generating…" : "Generate Keys"}
                </Button>
              </div>
            </div>

            {/* Results panel */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
              <h3 className="text-base font-semibold">Generated Keys</h3>

              {generatedKeys.length === 0 ? (
                <div className="flex h-40 items-center justify-center rounded-xl bg-slate-50 text-sm text-muted-foreground">
                  Fill in the form and click Generate Keys
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
                    {generatedKeys.length} key(s) generated for{" "}
                    <span className="font-semibold">{generatedForShop}</span>
                    {" · "}expires{" "}
                    {new Date(generatedKeys[0]?.expires_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>

                  <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                    {generatedKeys.map((item, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 px-3 py-3 bg-white">
                        <span className="font-mono text-sm select-all">{item.key}</span>
                        <button
                          type="button"
                          onClick={() => void handleCopyKey(i)}
                          className="flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition"
                        >
                          {item.copied ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground"
                    onClick={() => setGeneratedKeys([])}
                  >
                    Clear Results
                  </Button>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* TAB: Audit Logs                                                   */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="audit" className="space-y-4 mt-4">
          <div className="rounded-2xl border border-border bg-card shadow-sm">
            {/* Filters + Export */}
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-end md:justify-between">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="audit-search">Search</Label>
                  <Input
                    id="audit-search"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="shop, device, actor…"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="audit-action">Action</Label>
                  <select
                    id="audit-action"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={auditActionFilter}
                    onChange={(e) => setAuditActionFilter(e.target.value)}
                  >
                    <option value="all">All Actions</option>
                    <option value="provision_activate">Provision Activate</option>
                    <option value="provision_deactivate">Provision Deactivate</option>
                    <option value="license_revoke">License Revoke</option>
                    <option value="license_reactivate">License Reactivate</option>
                    <option value="subscription_change">Subscription Change</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportAuditLogs("csv")}
                >
                  <Download className="h-3.5 w-3.5" />
                  CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportAuditLogs("json")}
                >
                  <Download className="h-3.5 w-3.5" />
                  JSON
                </Button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Shop</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Override</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAuditLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        No audit log entries found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAuditLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm whitespace-nowrap">{formatDateTime(log.created_at)}</TableCell>
                        <TableCell className="text-sm">{log.shop_code}</TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">{log.device_code}</span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={[
                              "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
                              log.action.includes("activate")
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                : log.action.includes("revoke") || log.action.includes("deactivate")
                                  ? "bg-red-50 border-red-200 text-red-700"
                                  : "bg-slate-50 border-slate-200 text-slate-600",
                            ].join(" ")}
                          >
                            {getActionLabel(log.action)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">{log.actor}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{log.reason ?? "—"}</TableCell>
                        <TableCell>
                          {log.is_manual_override ? (
                            <span className="inline-flex rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
                              Manual
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ------------------------------------------------------------------ */}
      {/* Action Dialog                                                       */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={dialog.open} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="capitalize">
              {dialog.action} Device
            </DialogTitle>
            <DialogDescription>
              {dialog.action === "revoke"
                ? "This permanently revokes the license. The device will need a new activation key to come back online."
                : dialog.action === "deactivate"
                  ? "The device will lose its active license. The seat will be freed for another device."
                  : dialog.action === "reactivate"
                    ? "Reactivates the device and issues a fresh license token."
                    : "Activates this device and issues an initial license token."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm space-y-0.5">
              <p>
                <span className="text-muted-foreground">Shop: </span>
                <span className="font-medium">{dialog.shopName}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Device: </span>
                <span className="font-medium">{dialog.deviceName}</span>
                <span className="ml-1.5 font-mono text-xs text-muted-foreground">({dialog.deviceCode})</span>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dialog-actor-note">
                Actor Note <span className="text-red-500">*</span>
              </Label>
              <textarea
                id="dialog-actor-note"
                className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Describe the reason for this action…"
                value={actorNote}
                onChange={(e) => setActorNote(e.target.value)}
              />
            </div>

            {(dialog.action === "deactivate" || dialog.action === "revoke") && (
              <div className="space-y-1.5">
                <Label htmlFor="dialog-reason">Reason (optional)</Label>
                <Input
                  id="dialog-reason"
                  placeholder="e.g. Hardware replaced, Contract ended…"
                  value={dialogReason}
                  onChange={(e) => setDialogReason(e.target.value)}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant={dialog.action === "revoke" ? "destructive" : "default"}
              disabled={isSubmitting || !actorNote.trim()}
              onClick={() => void handleDialogSubmit()}
            >
              {isSubmitting ? "Processing…" : `Confirm ${dialog.action ?? ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
