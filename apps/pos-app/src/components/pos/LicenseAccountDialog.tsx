import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  deactivateCustomerLicenseDevice,
  fetchCustomerLicensePortal,
  type CustomerLicensePortalDevice,
  type CustomerLicensePortalResponse,
} from "@/lib/api";

interface LicenseAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
};

const toSentence = (value: string) => value.replaceAll("_", " ");

const LicenseAccountDialog = ({ open, onOpenChange, onChanged }: LicenseAccountDialogProps) => {
  const [data, setData] = useState<CustomerLicensePortalResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingDeviceCode, setPendingDeviceCode] = useState<string | null>(null);
  const [deactivationTarget, setDeactivationTarget] = useState<CustomerLicensePortalDevice | null>(null);
  const [deactivationReason, setDeactivationReason] = useState("seat_recovery");
  const [manualCopyKey, setManualCopyKey] = useState<string | null>(null);
  const currentDevice = useMemo(() => {
    if (!data) {
      return null;
    }

    return data.devices.find((device) => device.is_current_device) ?? data.devices[0] ?? null;
  }, [data]);

  const loadPortal = async () => {
    setIsLoading(true);
    try {
      const next = await fetchCustomerLicensePortal();
      setData(next);
      return true;
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to load license account.");
      setData(null);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const syncPortal = async () => {
    const synced = await loadPortal();
    onChanged?.();
    if (synced) {
      toast.success("License portal synced.");
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadPortal();
  }, [open]);

  const sortedDevices = useMemo(() => {
    if (!data) {
      return [];
    }

    return [...data.devices].sort((left, right) => {
      if (left.is_current_device === right.is_current_device) {
        return left.device_code.localeCompare(right.device_code);
      }

      return left.is_current_device ? -1 : 1;
    });
  }, [data]);

  const copyActivationKey = async () => {
    const key = data?.latest_activation_entitlement?.activation_entitlement_key?.trim();
    if (!key) {
      toast.info("No activation key available.");
      return;
    }

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(key);
        toast.success("Activation key copied.");
        return;
      }

      setManualCopyKey(key);
      toast.info("Clipboard unavailable. Copy manually from dialog.");
    } catch (error) {
      console.error(error);
      setManualCopyKey(key);
      toast.info("Clipboard unavailable. Copy manually from dialog.");
    }
  };

  const handleDeactivate = async (device: CustomerLicensePortalDevice) => {
    if (!data) {
      return;
    }

    if (device.is_current_device) {
      toast.error("Current device cannot be deactivated from this session.");
      return;
    }

    if (device.device_status !== "active") {
      toast.info("This device is already inactive.");
      return;
    }

    if (!data.can_deactivate_more_devices_today) {
      toast.error("Daily self-service deactivation limit reached.");
      return;
    }

    setDeactivationReason("seat_recovery");
    setDeactivationTarget(device);
  };

  const confirmDeactivation = async () => {
    if (!deactivationTarget) {
      return;
    }

    setPendingDeviceCode(deactivationTarget.device_code);
    try {
      await deactivateCustomerLicenseDevice(
        deactivationTarget.device_code,
        deactivationReason.trim() || undefined
      );
      toast.success(`Deactivated ${deactivationTarget.device_code}.`);
      onChanged?.();
      await loadPortal();
      setDeactivationTarget(null);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to deactivate device.");
    } finally {
      setPendingDeviceCode(null);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>My Account - Licenses</DialogTitle>
          <DialogDescription>
            View your active license details, activation key, and recover seats by deactivating old devices.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            <div className="h-20 animate-pulse rounded-lg bg-muted" />
            <div className="h-20 animate-pulse rounded-lg bg-muted" />
            <div className="h-56 animate-pulse rounded-lg bg-muted" />
          </div>
        ) : data ? (
          <div className="space-y-4 py-1">
            <div className="grid gap-3 md:grid-cols-5">
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Shop</p>
                <p className="mt-1 text-sm font-semibold">{data.shop_name}</p>
                <p className="text-xs text-muted-foreground">{data.shop_code}</p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Plan</p>
                <p className="mt-1 text-sm font-semibold">{data.plan}</p>
                <p className="text-xs text-muted-foreground capitalize">{toSentence(data.subscription_status)}</p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Seat Usage</p>
                <p className="mt-1 text-sm font-semibold">
                  {data.active_seats} / {data.seat_limit}
                </p>
                <p className="text-xs text-muted-foreground">Active devices</p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Self-Service Deactivate</p>
                <p className="mt-1 text-sm font-semibold">
                  {data.self_service_deactivations_remaining_today} remaining
                </p>
                <p className="text-xs text-muted-foreground">
                  Used {data.self_service_deactivations_used_today} / {data.self_service_deactivation_limit_per_day} today
                </p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Terminal ID</p>
                <p className="mt-1 font-mono text-sm font-semibold">{currentDevice?.terminal_id || currentDevice?.device_code || "-"}</p>
                <p className="text-xs text-muted-foreground">Current active terminal</p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Latest Activation Key</p>
                  <p className="mt-1 font-mono text-sm break-all">
                    {data.latest_activation_entitlement?.activation_entitlement_key || "No key issued yet"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Expires {formatDateTime(data.latest_activation_entitlement?.expires_at)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => void copyActivationKey()}>
                    Copy Key
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void syncPortal()}>
                    Sync Portal
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border">
              <div className="border-b border-border px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Provisioned Devices
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>Terminal ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>License</TableHead>
                    <TableHead>Last heartbeat</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedDevices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        No devices found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedDevices.map((device) => (
                      <TableRow key={device.provisioned_device_id}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">{device.device_name || "POS Device"}</p>
                            <p className="font-mono text-xs text-muted-foreground">{device.device_code}</p>
                            {device.is_current_device && <Badge variant="secondary">Current</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {device.terminal_id || device.device_code}
                        </TableCell>
                        <TableCell className="capitalize">{toSentence(device.device_status)}</TableCell>
                        <TableCell className="capitalize">{toSentence(device.license_state)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTime(device.last_heartbeat_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={
                              pendingDeviceCode === device.device_code ||
                              device.is_current_device ||
                              device.device_status !== "active" ||
                              !data.can_deactivate_more_devices_today
                            }
                            onClick={() => {
                              void handleDeactivate(device);
                            }}
                          >
                            {pendingDeviceCode === device.device_code ? "Deactivating..." : "Deactivate"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            Unable to load license account right now.
          </div>
        )}
      </DialogContent>
    </Dialog>
    <Dialog
      open={Boolean(deactivationTarget)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setDeactivationTarget(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deactivate Device</DialogTitle>
          <DialogDescription>
            Enter optional reason for deactivating {deactivationTarget?.device_code}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="deactivate-reason">Reason</Label>
          <Input
            id="deactivate-reason"
            value={deactivationReason}
            onChange={(event) => setDeactivationReason(event.target.value)}
            placeholder="seat_recovery"
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setDeactivationTarget(null);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              void confirmDeactivation();
            }}
            disabled={!deactivationTarget || pendingDeviceCode === deactivationTarget.device_code}
          >
            {pendingDeviceCode === deactivationTarget?.device_code ? "Deactivating..." : "Deactivate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog
      open={Boolean(manualCopyKey)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setManualCopyKey(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy Activation Key</DialogTitle>
          <DialogDescription>
            Clipboard access is unavailable. Copy the value below manually.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="manual-copy-key">Activation key</Label>
          <Input id="manual-copy-key" value={manualCopyKey || ""} readOnly className="font-mono text-xs" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setManualCopyKey(null)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default LicenseAccountDialog;
