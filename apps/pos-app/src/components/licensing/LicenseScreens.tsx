import { AlertCircle, AlertTriangle, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LicenseStatus } from "@/lib/api";

type LicenseActivationScreenProps = {
  deviceCode?: string;
  error?: string | null;
  isBusy?: boolean;
  activationEntitlementKey?: string;
  onActivationEntitlementKeyChange?: (value: string) => void;
  onActivate: (activationEntitlementKey?: string) => void;
  onRefresh: () => void;
};

type LicenseBlockedScreenProps = {
  status: LicenseStatus;
  error?: string | null;
  isBusy?: boolean;
  activationEntitlementKey?: string;
  onActivationEntitlementKeyChange?: (value: string) => void;
  onRefresh: () => void;
  onActivate: (activationEntitlementKey?: string) => void;
};

type LicenseGraceBannerProps = {
  status: LicenseStatus;
  isRefreshing?: boolean;
  onRefresh: () => void;
};

type LicenseOfflineBannerProps = {
  status: LicenseStatus;
  pendingSyncCount?: number;
  isRefreshing?: boolean;
  onRefresh: () => void;
  onDismiss?: () => void;
};

const MARKETING_WEBSITE_BASE_URL = (import.meta.env.VITE_MARKETING_WEBSITE_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);
const MARKETING_ADMIN_LOGIN_URL = `${MARKETING_WEBSITE_BASE_URL}/admin/login`;

const formatDateTime = (value?: Date | null) => {
  if (!value) {
    return "unknown";
  }

  return value.toLocaleString();
};

const formatGraceRemaining = (status: LicenseStatus) => {
  if (!status.graceUntil) {
    return "Grace period active";
  }

  const remainingMs = status.graceUntil.getTime() - status.serverTime.getTime();
  if (remainingMs <= 0) {
    return "Grace period expires now";
  }

  const totalHours = Math.ceil(remainingMs / (60 * 60 * 1000));
  if (totalHours < 24) {
    return `${totalHours} hour${totalHours === 1 ? "" : "s"} remaining`;
  }

  const totalDays = Math.ceil(totalHours / 24);
  return `${totalDays} day${totalDays === 1 ? "" : "s"} remaining`;
};

const formatOfflineGrantRemaining = (status: LicenseStatus) => {
  if (!status.offlineGrantExpiresAt) {
    return "Offline grant expiry unavailable";
  }

  const remainingMs = status.offlineGrantExpiresAt.getTime() - status.serverTime.getTime();
  if (remainingMs <= 0) {
    return "Offline grant expires now";
  }

  const totalMinutes = Math.ceil(remainingMs / (60 * 1000));
  if (totalMinutes < 60) {
    return `${totalMinutes} minute${totalMinutes === 1 ? "" : "s"} remaining`;
  }

  const totalHours = Math.ceil(totalMinutes / 60);
  if (totalHours < 24) {
    return `${totalHours} hour${totalHours === 1 ? "" : "s"} remaining`;
  }

  const totalDays = Math.ceil(totalHours / 24);
  return `${totalDays} day${totalDays === 1 ? "" : "s"} remaining`;
};

const copyText = async (value: string, successMessage: string) => {
  if (!value.trim()) {
    toast.info("Nothing to copy.");
    return;
  }

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
      return;
    }

    const textArea = document.createElement("textarea");
    textArea.value = value;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
    toast.success(successMessage);
  } catch (error) {
    console.error(error);
    toast.error("Failed to copy.");
  }
};

export const LicenseActivationScreen = ({
  deviceCode,
  error,
  isBusy,
  activationEntitlementKey,
  onActivationEntitlementKeyChange,
  onActivate,
  onRefresh,
}: LicenseActivationScreenProps) => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">License Activation Required</h1>
          <p className="text-sm text-muted-foreground">
            This POS device is not provisioned yet. Activate it before sign-in.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Device Code</p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  void copyText(deviceCode || "", "Device code copied.");
                }}
                disabled={isBusy || !deviceCode}
              >
                Copy
              </Button>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs break-all">
              {deviceCode || "Unavailable"}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Activation Key</p>
            <Input
              value={activationEntitlementKey || ""}
              onChange={(event) => onActivationEntitlementKeyChange?.(event.target.value)}
              placeholder="SPK-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              disabled={isBusy}
            />
            <p className="text-xs text-muted-foreground">
              Enter the key shared after payment verification (cash or bank deposit).
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-destructive/10 text-destructive text-sm px-3 py-2 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              variant="pos-primary"
              className="rounded-xl"
              onClick={() => {
                const key = (activationEntitlementKey || "").trim();
                if (!key) {
                  toast.error("Activation key is required.");
                  return;
                }
                onActivate(key);
              }}
              disabled={isBusy}
            >
              {isBusy ? "Activating..." : "Activate Device"}
            </Button>
            <Button variant="outline" className="rounded-xl" onClick={onRefresh} disabled={isBusy}>
              Recheck Status
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const LicenseBlockedScreen = ({
  status,
  error,
  isBusy,
  activationEntitlementKey,
  onActivationEntitlementKeyChange,
  onRefresh,
  onActivate,
}: LicenseBlockedScreenProps) => {
  const isRevoked = status.state === "revoked";
  const title = isRevoked ? "License Revoked" : "License Suspended";
  const description = isRevoked
    ? "This device has been revoked and cannot continue checkout operations."
    : "Grace period has ended. Checkout and refund operations are blocked.";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-destructive/15 text-destructive flex items-center justify-center">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm">
          <div className="rounded-xl border border-border bg-muted/30 px-3 py-3 text-sm">
            <p>
              <span className="font-medium">Device:</span> <span className="font-mono">{status.deviceCode}</span>
            </p>
            <p className="mt-1">
              <span className="font-medium">Blocked actions:</span>{" "}
              {status.blockedActions.length ? status.blockedActions.join(", ") : "checkout, refund"}
            </p>
            <p className="mt-1">
              <span className="font-medium">Subscription:</span> {status.subscriptionStatus || "unknown"}
            </p>
            <p className="mt-1">
              <span className="font-medium">Grace until:</span> {formatDateTime(status.graceUntil)}
            </p>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Recovery steps</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Renew or settle the subscription payment for this shop.</li>
              <li>Sign in to super admin billing/support and verify the device allocation.</li>
              <li>Contact support with this device code if lock state remains after payment.</li>
              <li>Re-run activation to request a fresh license token for this device.</li>
              <li>Use Recheck Status after payment or provisioning updates complete.</li>
            </ol>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Activation Key</p>
            <Input
              value={activationEntitlementKey || ""}
              onChange={(event) => onActivationEntitlementKeyChange?.(event.target.value)}
              placeholder="SPK-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              disabled={isBusy}
            />
            <p className="text-xs text-muted-foreground">
              Enter a valid activation key before retrying activation.
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-destructive/10 text-destructive text-sm px-3 py-2 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button variant="outline" className="rounded-xl" onClick={onRefresh} disabled={isBusy}>
              {isBusy ? "Checking..." : "Recheck Status"}
            </Button>
            <Button
              variant="pos-primary"
              className="rounded-xl"
              onClick={() => {
                const key = (activationEntitlementKey || "").trim();
                if (!key) {
                  toast.error("Activation key is required.");
                  return;
                }
                onActivate(key);
              }}
              disabled={isBusy}
            >
              Retry Activation
            </Button>
            <Button asChild variant="ghost" className="rounded-xl sm:col-span-2">
              <a href={MARKETING_ADMIN_LOGIN_URL}>Open Admin Sign-In</a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const LicenseGraceBanner = ({ status, isRefreshing, onRefresh }: LicenseGraceBannerProps) => {
  return (
    <div className="mx-3 mt-3 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-700 dark:text-amber-200" />
          <div className="text-sm">
            <p className="font-semibold text-amber-900 dark:text-amber-100">License grace mode</p>
            <p className="text-amber-800 dark:text-amber-200">
              {formatGraceRemaining(status)}. Grace until {formatDateTime(status.graceUntil)}.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-8 border-amber-700/40 bg-transparent text-amber-900 hover:bg-amber-500/20 dark:text-amber-100"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>
    </div>
  );
};

export const LicenseOfflineBanner = ({
  status,
  pendingSyncCount = 0,
  isRefreshing,
  onRefresh,
  onDismiss,
}: LicenseOfflineBannerProps) => {
  if (!status.offlineGrantToken) {
    return null;
  }

  return (
    <div className="mx-3 mt-2 rounded-xl border border-sky-500/45 bg-sky-500/10 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <p className="font-semibold text-sky-900 dark:text-sky-100">Offline fallback ready</p>
          <p className="text-sky-800 dark:text-sky-200">
            {formatOfflineGrantRemaining(status)}. Checkout cap{" "}
            <span className="font-medium">{status.offlineMaxCheckoutOperations ?? "n/a"}</span>, refund cap{" "}
            <span className="font-medium">{status.offlineMaxRefundOperations ?? "n/a"}</span>.
          </p>
          {pendingSyncCount > 0 && (
            <p className="text-sky-800 dark:text-sky-200">
              {pendingSyncCount} offline event{pendingSyncCount === 1 ? "" : "s"} pending sync.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-sky-700/40 bg-transparent text-sky-900 hover:bg-sky-500/20 dark:text-sky-100"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
          {onDismiss && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-sky-900 hover:bg-sky-500/20 dark:text-sky-100"
              onClick={onDismiss}
              aria-label="Close offline fallback banner"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
