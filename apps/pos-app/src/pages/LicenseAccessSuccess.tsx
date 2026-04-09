import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  API_BASE_URL,
  ApiError,
  fetchLicenseAccessSuccess,
  trackLicenseAccessDownload,
  type LicenseAccessSuccessResponse,
} from "@/lib/api";

const installerDownloadUrl = (import.meta.env.VITE_INSTALLER_DOWNLOAD_URL || "").trim();
const installerChecksumSha256 = (import.meta.env.VITE_INSTALLER_CHECKSUM_SHA256 || "").trim();

const readKeyFromUrl = () => {
  if (typeof window === "undefined") {
    return "";
  }

  const params = new URLSearchParams(window.location.search);
  return (params.get("activation_entitlement_key") || params.get("key") || "").trim();
};

const clearKeyFromUrl = () => {
  if (typeof window === "undefined") {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (!params.has("activation_entitlement_key") && !params.has("key")) {
    return;
  }

  params.delete("activation_entitlement_key");
  params.delete("key");
  const nextQuery = params.toString();
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
  window.history.replaceState({}, "", nextUrl);
};

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

const LicenseAccessSuccess = () => {
  const [activationKey, setActivationKey] = useState(readKeyFromUrl());
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<LicenseAccessSuccessResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [manualCopyKey, setManualCopyKey] = useState<string | null>(null);

  const canLoad = useMemo(() => activationKey.trim().length > 0, [activationKey]);
  const resolvedInstallerDownloadUrl = useMemo(() => {
    const backendProvided = (data?.installer_download_url || "").trim();
    const fallback = installerDownloadUrl;
    const candidate = backendProvided || fallback;
    if (!candidate) {
      return "";
    }

    if (candidate.startsWith("/")) {
      return `${API_BASE_URL}${candidate}`;
    }

    return candidate;
  }, [data]);
  const resolvedInstallerChecksum = useMemo(
    () => (data?.installer_checksum_sha256 || "").trim() || installerChecksumSha256,
    [data],
  );

  const load = async (key: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetchLicenseAccessSuccess(key);
      setData(response);
    } catch (error) {
      console.error(error);
      setData(null);
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Failed to load access details.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!canLoad) {
      return;
    }

    void load(activationKey);
  }, [activationKey, canLoad]);

  useEffect(() => {
    clearKeyFromUrl();
  }, []);

  const copyActivationKey = async () => {
    const key = data?.activation_entitlement?.activation_entitlement_key?.trim() || activationKey.trim();
    if (!key) {
      toast.info("No activation key to copy.");
      return;
    }

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(key);
        toast.success("Activation key copied.");
        return;
      } catch {
        // fall back to manual copy dialog below
      }
    }

    setManualCopyKey(key);
    toast.info("Clipboard unavailable. Copy manually from dialog.");
  };

  const trackInstallerDownloadClick = async () => {
    const key = data?.activation_entitlement?.activation_entitlement_key?.trim() || activationKey.trim();
    if (!key) {
      return;
    }

    try {
      await trackLicenseAccessDownload(key, "installer_download_button");
    } catch (error) {
      console.error("Failed to track installer download.", error);
    }
  };

  return (
    <>
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Payment Success</p>
          <h1 className="mt-1 text-2xl font-bold">Your SmartPOS Access Is Ready</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Use the activation key below in your POS app to activate this device.
          </p>
        </div>

        {!canLoad && (
          <div className="space-y-3 rounded-xl border border-border p-4">
            <label className="block text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Activation Key
            </label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="SPK-XXXX-XXXX-XXXX"
              value={activationKey}
              onChange={(event) => setActivationKey(event.target.value)}
            />
            <Button
              onClick={() => {
                if (!activationKey.trim()) {
                  toast.error("Enter activation key.");
                  return;
                }
                void load(activationKey);
              }}
            >
              Load Access Details
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded-lg bg-muted" />
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
          </div>
        )}

        {!isLoading && errorMessage && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        {!isLoading && data && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
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
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Entitlement</p>
                <p className="mt-1 text-sm font-semibold capitalize">{toSentence(data.entitlement_state)}</p>
                <p className="text-xs text-muted-foreground">
                  {data.activation_entitlement.activations_used} / {data.activation_entitlement.max_activations} used
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Activation Key</p>
              <p className="mt-2 break-all font-mono text-sm">{data.activation_entitlement.activation_entitlement_key}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Expires {formatDateTime(data.activation_entitlement.expires_at)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void copyActivationKey()}>
                  Copy Key
                </Button>
                {resolvedInstallerDownloadUrl && (
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={resolvedInstallerDownloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => {
                        void trackInstallerDownloadClick();
                      }}
                    >
                      Download Installer
                    </a>
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => {
                    window.location.href = "/";
                  }}
                >
                  Open POS
                </Button>
              </div>
              {data.installer_download_protected && data.installer_download_expires_at && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Download link expires: {formatDateTime(data.installer_download_expires_at)}
                </p>
              )}
              {resolvedInstallerChecksum && (
                <p className="mt-2 text-[11px] text-muted-foreground break-all">
                  SHA-256: {resolvedInstallerChecksum}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground space-y-1">
              <p>1. Open your SmartPOS app.</p>
              <p>2. Enter this activation key on the activation screen.</p>
              <p>3. Click Activate to complete setup.</p>
            </div>
          </div>
        )}
      </div>
    </main>
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
            Clipboard access is unavailable. Copy the key below manually.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="manual-success-copy-key">Activation key</Label>
          <Input id="manual-success-copy-key" value={manualCopyKey || ""} readOnly className="font-mono text-xs" />
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

export default LicenseAccessSuccess;
