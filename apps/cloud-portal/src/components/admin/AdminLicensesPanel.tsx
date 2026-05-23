import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  adminActivateDevice,
  adminReactivateDevice,
  type AdminShopsLicensingSnapshotResponse,
} from "@/lib/adminApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type LicenseStateFilter = "expired" | "all" | "suspended" | "revoked" | "grace" | "active" | "unprovisioned";

type AdminLicensesPanelProps = {
  shops: AdminShopsLicensingSnapshotResponse["items"];
  canManage: boolean;
  onRefresh: () => Promise<void> | void;
};

type DeviceRow = {
  shopId: string;
  shopCode: string;
  shopName: string;
  shopIsActive: boolean;
  deviceCode: string;
  deviceName: string;
  deviceStatus: string;
  licenseState: string;
  validUntil?: string | null;
  graceUntil?: string | null;
  lastHeartbeatAt?: string | null;
};

const EXPIRED_LICENSE_STATES = new Set(["suspended", "revoked"]);

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function normalize(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

function isExpiredLicenseState(value?: string | null) {
  return EXPIRED_LICENSE_STATES.has(normalize(value));
}

function shouldShowByStateFilter(licenseState: string, filter: LicenseStateFilter) {
  const normalizedState = normalize(licenseState);
  if (filter === "all") {
    return true;
  }

  if (filter === "expired") {
    return EXPIRED_LICENSE_STATES.has(normalizedState);
  }

  return normalizedState === filter;
}

function requiresRecoveryAction(row: DeviceRow) {
  const normalizedDeviceStatus = normalize(row.deviceStatus);
  return normalizedDeviceStatus !== "active" || isExpiredLicenseState(row.licenseState);
}

export default function AdminLicensesPanel({ shops, canManage, onRefresh }: AdminLicensesPanelProps) {
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [stateFilter, setStateFilter] = useState<LicenseStateFilter>("expired");
  const [submittingActionFor, setSubmittingActionFor] = useState<string | null>(null);

  const allRows = useMemo<DeviceRow[]>(() => {
    return shops.flatMap((shop) =>
      (shop.devices || []).map((device) => ({
        shopId: shop.shop_id,
        shopCode: shop.shop_code,
        shopName: shop.shop_name,
        shopIsActive: shop.is_active !== false,
        deviceCode: device.device_code,
        deviceName: device.device_name,
        deviceStatus: device.device_status,
        licenseState: device.license_state,
        validUntil: device.valid_until,
        graceUntil: device.grace_until,
        lastHeartbeatAt: device.last_heartbeat_at,
      })),
    );
  }, [shops]);

  const filteredRows = useMemo(() => {
    const query = normalize(search);
    return allRows
      .filter((row) => includeInactive || row.shopIsActive)
      .filter((row) => shouldShowByStateFilter(row.licenseState, stateFilter))
      .filter((row) => {
        if (!query) {
          return true;
        }

        const haystack = [
          row.shopCode,
          row.shopName,
          row.deviceCode,
          row.deviceName,
          row.deviceStatus,
          row.licenseState,
        ]
          .map((value) => normalize(value))
          .join(" ");
        return haystack.includes(query);
      });
  }, [allRows, includeInactive, search, stateFilter]);

  const expiredCount = useMemo(
    () => filteredRows.filter((row) => isExpiredLicenseState(row.licenseState)).length,
    [filteredRows],
  );
  const graceCount = useMemo(
    () => filteredRows.filter((row) => normalize(row.licenseState) === "grace").length,
    [filteredRows],
  );

  const runActivateAction = async (row: DeviceRow, action: "activate" | "reactivate") => {
    const actorNote = window.prompt(
      `${action === "activate" ? "Activate" : "Reactivate"} ${row.deviceCode}: actor note`,
      `${action} device from admin licenses panel`,
    );
    if (actorNote === null) {
      return;
    }

    const trimmedActorNote = actorNote.trim();
    if (!trimmedActorNote) {
      toast.error("Actor note is required.");
      return;
    }

    setSubmittingActionFor(`${action}:${row.deviceCode}`);
    try {
      if (action === "activate") {
        await adminActivateDevice(row.deviceCode, trimmedActorNote, "billing-ui");
        toast.success(`Device ${row.deviceCode} activated.`);
      } else {
        await adminReactivateDevice(row.deviceCode, trimmedActorNote, "billing-ui");
        toast.success(`Device ${row.deviceCode} reactivated.`);
      }

      await onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${action} device.`);
    } finally {
      setSubmittingActionFor(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Devices {filteredRows.length}</Badge>
        <Badge variant="outline">Expired {expiredCount}</Badge>
        <Badge variant="outline">Grace {graceCount}</Badge>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-end md:justify-between">
          <div className="grid w-full gap-3 md:grid-cols-3">
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="admin-licenses-search">Search</Label>
              <Input
                id="admin-licenses-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="shop or device code/name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="admin-licenses-state-filter">License State</Label>
              <select
                id="admin-licenses-state-filter"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={stateFilter}
                onChange={(event) => setStateFilter(event.target.value as LicenseStateFilter)}
              >
                <option value="expired">Expired (Suspended + Revoked)</option>
                <option value="all">All</option>
                <option value="suspended">Suspended</option>
                <option value="revoked">Revoked</option>
                <option value="grace">Grace</option>
                <option value="active">Active</option>
                <option value="unprovisioned">Unprovisioned</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(event) => setIncludeInactive(event.target.checked)}
              />
              Include inactive shops
            </label>
          </div>
        </div>

        <div className="max-h-[68vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shop</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>License</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead>Grace Until</TableHead>
                <TableHead>Last Heartbeat</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No license rows found for the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((row) => {
                  const canRunActions = canManage && requiresRecoveryAction(row);
                  const normalizedLicenseState = normalize(row.licenseState);
                  const rowKey = `${row.shopId}:${row.deviceCode}`;
                  return (
                    <TableRow key={rowKey}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{row.shopName}</p>
                          <p className="text-xs text-muted-foreground">{row.shopCode}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{row.deviceName}</p>
                          <p className="text-xs text-muted-foreground">{row.deviceCode}</p>
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">{row.deviceStatus}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            normalizedLicenseState === "active"
                              ? "default"
                              : normalizedLicenseState === "grace"
                                ? "secondary"
                                : "destructive"
                          }
                          className="capitalize"
                        >
                          {row.licenseState}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDateTime(row.validUntil)}</TableCell>
                      <TableCell>{formatDateTime(row.graceUntil)}</TableCell>
                      <TableCell>{formatDateTime(row.lastHeartbeatAt)}</TableCell>
                      <TableCell className="text-right">
                        {canRunActions ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={submittingActionFor !== null}
                              onClick={() => void runActivateAction(row, "activate")}
                            >
                              Activate
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={submittingActionFor !== null}
                              onClick={() => void runActivateAction(row, "reactivate")}
                            >
                              Reactivate
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {canManage ? "No recovery action needed" : "Read only"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
