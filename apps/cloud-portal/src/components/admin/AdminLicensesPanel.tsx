import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Download, RefreshCw, Shield, ShieldAlert, ShieldX } from "lucide-react";
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
import {
  type AdminShopsLicensingSnapshotResponse,
  type AdminAuditLogsResponse,
  adminActivateDevice,
  adminReactivateDevice,
  adminDeactivateDevice,
  adminRevokeDevice,
  adminForceLicenseResync,
  adminGenerateOfflineActivationEntitlementBatch,
  adminGenerateSignedActivationEntitlement,
  type AdminSignedActivationGenerateResponse,
  fetchAdminLicenseAuditLogs,
  exportAdminLicenseAuditLogs,
  adminExtendDeviceGrace,
  runAdminEmergencyAction,
  adminFraudLockDevice,
} from "@/lib/adminApi";

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

function truncateId(id?: string | null) {
  if (!id) return "—";
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

// ---------------------------------------------------------------------------
// Props — identical signature to original so AdminPortalDashboard.tsx is unchanged
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

type AdvancedMode = "extend_grace" | "fraud_lock" | "emergency";

type AdvancedDialogState = {
  open: boolean;
  deviceCode: string;
  deviceName: string;
  shopName: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminLicensesPanel({ shops, canManage, onRefresh }: AdminLicensesPanelProps) {
  // Devices tab state
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

  // Signed offline key state
  const [signedShopCode, setSignedShopCode] = useState("");
  const [signedCount, setSignedCount] = useState(1);
  const [signedTtlDays, setSignedTtlDays] = useState(90);
  const [signedMaxActivations, setSignedMaxActivations] = useState(1);
  const [signedActorNote, setSignedActorNote] = useState("");
  const [isGeneratingSigned, setIsGeneratingSigned] = useState(false);
  const [signedResult, setSignedResult] = useState<AdminSignedActivationGenerateResponse | null>(null);
  const [signedCopied, setSignedCopied] = useState<boolean[]>([]);

  // Advanced Actions dialog state
  const [advDialog, setAdvDialog] = useState<AdvancedDialogState>({ open: false, deviceCode: "", deviceName: "", shopName: "" });
  const [advMode, setAdvMode] = useState<AdvancedMode>("extend_grace");
  const [extendDays, setExtendDays] = useState(3);
  const [emergencyCommand, setEmergencyCommand] = useState<"lock_device" | "revoke_token" | "force_reauth">("force_reauth");
  const [advActorNote, setAdvActorNote] = useState("");
  const [isAdvSubmitting, setIsAdvSubmitting] = useState(false);

  // Audit Logs tab state
  const [activeTab, setActiveTab] = useState("devices");
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogsResponse["items"]>([]);
  const [isLoadingAuditLogs, setIsLoadingAuditLogs] = useState(false);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [auditTake, setAuditTake] = useState(50);

  // ---------------------------------------------------------------------------
  // Load audit logs from API when tab is active or filters change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (activeTab !== "audit") return;
    let cancelled = false;
    setIsLoadingAuditLogs(true);
    fetchAdminLicenseAuditLogs({
      search: auditSearch.trim() || undefined,
      action: auditActionFilter || undefined,
      take: auditTake,
    })
      .then((res) => { if (!cancelled) setAuditLogs(res.items); })
      .catch((err: Error) => { if (!cancelled) toast.error(`Failed to load audit logs: ${err.message}`); })
      .finally(() => { if (!cancelled) setIsLoadingAuditLogs(false); });
    return () => { cancelled = true; };
  }, [activeTab, auditSearch, auditActionFilter, auditTake]);

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
    validUntil: string | null | undefined;
    graceUntil: string | null | undefined;
    lastHeartbeatAt: string | null | undefined;
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

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleForceResync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await adminForceLicenseResync("", "Manual resync triggered from admin UI", "billing-ui");
      toast.success("License resync completed.");
      await onRefresh();
    } catch (err) {
      toast.error(`Resync failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const openActionDialog = (row: DeviceRow, action: DeviceAction) => {
    setActorNote("");
    setDialogReason("");
    setDialog({ open: true, action, shopId: row.shopId, shopName: row.shopName, deviceCode: row.deviceCode, deviceName: row.deviceName });
  };

  const openAdvancedDialog = (row: DeviceRow) => {
    setAdvMode("extend_grace");
    setExtendDays(3);
    setEmergencyCommand("force_reauth");
    setAdvActorNote("");
    setAdvDialog({ open: true, deviceCode: row.deviceCode, deviceName: row.deviceName, shopName: row.shopName });
  };

  const closeAdvancedDialog = () => {
    if (isAdvSubmitting) return;
    setAdvDialog((prev) => ({ ...prev, open: false }));
  };

  const handleAdvancedSubmit = async () => {
    if (!advActorNote.trim()) {
      toast.error("Actor note is required.");
      return;
    }
    if (isAdvSubmitting) return;
    setIsAdvSubmitting(true);
    try {
      if (advMode === "extend_grace") {
        await adminExtendDeviceGrace(advDialog.deviceCode, extendDays, advActorNote, "billing-ui");
        toast.success(`Grace period extended by ${extendDays} day(s) for ${advDialog.deviceCode}.`);
      } else if (advMode === "fraud_lock") {
        await adminFraudLockDevice(advDialog.deviceCode, advActorNote, "billing-ui");
        toast.success(`Fraud lock applied to ${advDialog.deviceCode}.`);
      } else if (advMode === "emergency") {
        await runAdminEmergencyAction(advDialog.deviceCode, emergencyCommand, advActorNote, "billing-ui");
        toast.success(`Emergency command '${emergencyCommand}' executed on ${advDialog.deviceCode}.`);
      }
      setAdvDialog((prev) => ({ ...prev, open: false }));
      await onRefresh();
    } catch (err) {
      toast.error(`Action failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsAdvSubmitting(false);
    }
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
    try {
      const { action, deviceCode } = dialog;
      if (action === "activate") {
        await adminActivateDevice(deviceCode, actorNote, "billing-ui");
      } else if (action === "reactivate") {
        await adminReactivateDevice(deviceCode, actorNote, "billing-ui");
      } else if (action === "deactivate") {
        await adminDeactivateDevice(deviceCode, actorNote, "billing-ui", dialogReason || undefined);
      } else if (action === "revoke") {
        await adminRevokeDevice(deviceCode, actorNote, "billing-ui", dialogReason || undefined);
      }
      toast.success(`Device ${deviceCode} ${action}d successfully.`);
      setDialog((prev) => ({ ...prev, open: false }));
      await onRefresh();
    } catch (err) {
      toast.error(`Action failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateKeys = async () => {
    if (!keyActorNote.trim()) {
      toast.error("Actor note is required.");
      return;
    }
    if (isGeneratingKeys) return;
    setIsGeneratingKeys(true);
    try {
      const result = await adminGenerateOfflineActivationEntitlementBatch({
        shop_code: keyShopCode.trim() || undefined,
        count: keyCount,
        ttl_days: keyTtlDays,
        max_activations: keyMaxActivations,
        allow_if_existing_batch: keyAllowExisting,
        actor_note: keyActorNote,
        actor: "billing-ui",
        reason_code: "activation_key_issued",
      });
      const keys: GeneratedKey[] = result.entitlements.map((e) => ({
        key: e.activation_entitlement_key,
        expires_at: e.expires_at,
        copied: false,
      }));
      setGeneratedKeys(keys);
      setGeneratedForShop(result.shop_code || "DEFAULT");
      toast.success(`${result.generated_count} key(s) generated.`);
    } catch (err) {
      toast.error(`Key generation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsGeneratingKeys(false);
    }
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

  const handleGenerateSignedKeys = async () => {
    if (!signedActorNote.trim()) {
      toast.error("Actor note is required.");
      return;
    }
    if (isGeneratingSigned) return;
    setIsGeneratingSigned(true);
    try {
      const result = await adminGenerateSignedActivationEntitlement({
        shop_code: signedShopCode.trim() || undefined,
        count: signedCount,
        ttl_days: signedTtlDays,
        max_activations: signedMaxActivations,
        actor_note: signedActorNote,
        actor: "billing-ui",
        reason_code: "signed_activation_key_generated",
      });
      setSignedResult(result);
      setSignedCopied(new Array(result.tokens.length).fill(false));
      toast.success(`${result.count} signed key(s) generated.`);
    } catch (err) {
      toast.error(`Signed key generation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsGeneratingSigned(false);
    }
  };

  const handleCopySignedKey = async (index: number) => {
    const token = signedResult?.tokens[index];
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
    } catch {
      // clipboard unavailable
    }
    setSignedCopied((prev) => prev.map((v, i) => (i === index ? true : v)));
    toast.success("Key copied to clipboard.");
    setTimeout(() => setSignedCopied((prev) => prev.map((v, i) => (i === index ? false : v))), 2000);
  };

  const handleExportAuditLogs = async (format: "csv" | "json") => {
    try {
      const result = await exportAdminLicenseAuditLogs({
        search: auditSearch.trim() || undefined,
        action: auditActionFilter || undefined,
        take: auditTake,
        format,
      });
      const blob = new Blob([result.content], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Export started: ${result.filename}`);
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
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
        <Button
          variant="outline"
          size="sm"
          title={`Generate activation key for ${row.shopName}`}
          onClick={() => {
            setKeyShopCode(row.shopCode);
            setActiveTab("keys");
          }}
        >
          Generate Key
        </Button>
        <Button
          variant="ghost"
          size="sm"
          title="Advanced actions (extend grace, fraud lock, emergency)"
          onClick={() => openAdvancedDialog(row)}
        >
          ···
        </Button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      <Tabs defaultValue="devices" onValueChange={setActiveTab}>
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
                    list="admin-key-shop-codes"
                    value={keyShopCode}
                    onChange={(e) => setKeyShopCode(e.target.value)}
                    placeholder="e.g. SHOP-DOWNTOWN (leave empty for default)"
                  />
                  <datalist id="admin-key-shop-codes">
                    {shops.map((s) => (
                      <option key={s.shop_id} value={s.shop_code}>
                        {s.shop_name}
                      </option>
                    ))}
                  </datalist>
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

          {/* Signed Offline Key generator */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-5">
              <div>
                <h3 className="text-base font-semibold">Generate Signed Offline Key</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Self-validating key (SPKS) — works even when the backend is offline or unreachable.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="signed-shop-code">Shop Code</Label>
                  <Input
                    id="signed-shop-code"
                    list="admin-signed-shop-codes"
                    value={signedShopCode}
                    onChange={(e) => setSignedShopCode(e.target.value)}
                    placeholder="e.g. SHOP-DOWNTOWN (leave empty for default)"
                  />
                  <datalist id="admin-signed-shop-codes">
                    {shops.map((s) => (
                      <option key={s.shop_id} value={s.shop_code}>
                        {s.shop_name}
                      </option>
                    ))}
                  </datalist>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="signed-count">Count</Label>
                    <Input
                      id="signed-count"
                      type="number"
                      min={1}
                      max={10}
                      value={signedCount}
                      onChange={(e) => setSignedCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signed-ttl">TTL (days)</Label>
                    <Input
                      id="signed-ttl"
                      type="number"
                      min={1}
                      max={3650}
                      value={signedTtlDays}
                      onChange={(e) => setSignedTtlDays(Math.max(1, parseInt(e.target.value) || 90))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signed-max-act">Max Activations</Label>
                    <Input
                      id="signed-max-act"
                      type="number"
                      min={1}
                      max={100}
                      value={signedMaxActivations}
                      onChange={(e) => setSignedMaxActivations(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="signed-actor-note">Actor Note <span className="text-red-500">*</span></Label>
                  <Input
                    id="signed-actor-note"
                    value={signedActorNote}
                    onChange={(e) => setSignedActorNote(e.target.value)}
                    placeholder="e.g. Offline activation for Shop ABC"
                  />
                </div>

                <Button
                  type="button"
                  variant="default"
                  className="w-full"
                  disabled={isGeneratingSigned}
                  onClick={() => void handleGenerateSignedKeys()}
                >
                  {isGeneratingSigned ? "Generating…" : "Generate Signed Key"}
                </Button>
              </div>
            </div>

            {/* Signed key results */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
              <h3 className="text-base font-semibold">Generated Signed Keys</h3>

              {!signedResult ? (
                <div className="flex h-40 items-center justify-center rounded-xl bg-slate-50 text-sm text-muted-foreground">
                  Fill in the form and click Generate Signed Key
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
                    {signedResult.count} key(s) generated for{" "}
                    <span className="font-semibold">{signedResult.shop_code}</span>
                    {" · "}expires in {signedResult.ttl_days} day(s)
                  </div>

                  <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                    {signedResult.tokens.map((token, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 px-3 py-3 bg-white">
                        <span className="font-mono text-xs break-all select-all">{token}</span>
                        <button
                          type="button"
                          onClick={() => void handleCopySignedKey(i)}
                          className="flex-shrink-0 flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition"
                        >
                          {signedCopied[i] ? (
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
                    onClick={() => setSignedResult(null)}
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
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="audit-search">Search</Label>
                  <Input
                    id="audit-search"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="actor, action…"
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
                    <option value="">All Actions</option>
                    <option value="provision_activate">Provision Activate</option>
                    <option value="provision_deactivate">Provision Deactivate</option>
                    <option value="license_revoke">License Revoke</option>
                    <option value="license_reactivate">License Reactivate</option>
                    <option value="subscription_change">Subscription Change</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="audit-take">Limit</Label>
                  <select
                    id="audit-take"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={auditTake}
                    onChange={(e) => setAuditTake(Number(e.target.value))}
                  >
                    <option value={50}>50 rows</option>
                    <option value={100}>100 rows</option>
                    <option value={200}>200 rows</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleExportAuditLogs("csv")}
                >
                  <Download className="h-3.5 w-3.5" />
                  CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleExportAuditLogs("json")}
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
                    <TableHead>Shop ID</TableHead>
                    <TableHead>Device ID</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Override</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingAuditLogs ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        Loading audit logs…
                      </TableCell>
                    </TableRow>
                  ) : auditLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        No audit log entries found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    auditLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm whitespace-nowrap">{formatDateTime(log.timestamp)}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground" title={log.shop_id ?? undefined}>
                          {truncateId(log.shop_id)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground" title={log.device_id ?? undefined}>
                          {truncateId(log.device_id)}
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

      {/* ------------------------------------------------------------------ */}
      {/* Advanced Actions Dialog                                             */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={advDialog.open} onOpenChange={(open) => { if (!open) closeAdvancedDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Advanced Actions</DialogTitle>
            <DialogDescription>
              Perform privileged resolution actions on this device.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Device info */}
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm space-y-0.5">
              <p>
                <span className="text-muted-foreground">Shop: </span>
                <span className="font-medium">{advDialog.shopName}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Device: </span>
                <span className="font-medium">{advDialog.deviceName}</span>
                <span className="ml-1.5 font-mono text-xs text-muted-foreground">({advDialog.deviceCode})</span>
              </p>
            </div>

            {/* Action selector */}
            <div className="space-y-1.5">
              <Label htmlFor="adv-mode">Action</Label>
              <select
                id="adv-mode"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={advMode}
                onChange={(e) => setAdvMode(e.target.value as AdvancedMode)}
              >
                <option value="extend_grace">Extend Grace Period</option>
                <option value="fraud_lock">Fraud Lock</option>
                <option value="emergency">Emergency Command</option>
              </select>
            </div>

            {/* Mode-specific fields */}
            {advMode === "extend_grace" && (
              <div className="space-y-1.5">
                <Label htmlFor="adv-days">Days to Extend</Label>
                <Input
                  id="adv-days"
                  type="number"
                  min={1}
                  max={30}
                  value={extendDays}
                  onChange={(e) => setExtendDays(Math.max(1, Math.min(30, parseInt(e.target.value) || 3)))}
                />
                <p className="text-xs text-muted-foreground">Max 30 days. Values above 7 require StepUp approval on the backend.</p>
              </div>
            )}

            {advMode === "fraud_lock" && (
              <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2.5 text-sm text-orange-800">
                This will lock the device against fraudulent use. The device will need manual reactivation to resume.
              </div>
            )}

            {advMode === "emergency" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="adv-cmd">Command</Label>
                  <select
                    id="adv-cmd"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={emergencyCommand}
                    onChange={(e) => setEmergencyCommand(e.target.value as "lock_device" | "revoke_token" | "force_reauth")}
                  >
                    <option value="force_reauth">Force Re-auth (mildest)</option>
                    <option value="revoke_token">Revoke Token</option>
                    <option value="lock_device">Lock Device (strongest)</option>
                  </select>
                </div>
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-800">
                  Emergency commands take effect immediately on the device.
                </div>
              </div>
            )}

            {/* Actor note */}
            <div className="space-y-1.5">
              <Label htmlFor="adv-actor-note">
                Actor Note <span className="text-red-500">*</span>
              </Label>
              <textarea
                id="adv-actor-note"
                className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Describe why this action is being taken…"
                value={advActorNote}
                onChange={(e) => setAdvActorNote(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeAdvancedDialog} disabled={isAdvSubmitting}>
              Cancel
            </Button>
            <Button
              variant={advMode === "fraud_lock" || advMode === "emergency" ? "destructive" : "default"}
              disabled={isAdvSubmitting || !advActorNote.trim()}
              onClick={() => void handleAdvancedSubmit()}
            >
              {isAdvSubmitting ? "Processing…" : "Confirm Action"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
