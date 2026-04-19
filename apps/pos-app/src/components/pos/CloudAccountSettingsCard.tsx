import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchCloudAccountStatus,
  linkCloudAccount,
  unlinkCloudAccount,
  type CloudAccountStatus,
} from "@/lib/api";

type CloudAccountSettingsCardProps = {
  open: boolean;
};

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

const CloudAccountSettingsCard = ({ open }: CloudAccountSettingsCardProps) => {
  const [status, setStatus] = useState<CloudAccountStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isLinked = Boolean(status?.is_linked);
  const tokenExpired = Boolean(status?.is_token_expired);

  const linkButtonLabel = useMemo(() => {
    if (!isLinked) {
      return "Link Cloud Account";
    }

    return "Re-link Cloud Account";
  }, [isLinked]);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchCloudAccountStatus();
      setStatus(next);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load cloud account status.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadStatus();
  }, [open]);

  const handleLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedUsername = username.trim();
    if (!normalizedUsername || !password) {
      setError("Cloud username and password are required.");
      return;
    }

    setLinking(true);
    setError(null);
    try {
      await linkCloudAccount(normalizedUsername, password);
      setPassword("");
      toast.success("Cloud account linked.");
      await loadStatus();
    } catch (linkError) {
      const message = linkError instanceof Error ? linkError.message : "Failed to link cloud account.";
      setError(message);
      toast.error(message);
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async () => {
    setUnlinking(true);
    setError(null);
    try {
      await unlinkCloudAccount();
      toast.success("Cloud account unlinked.");
      await loadStatus();
    } catch (unlinkError) {
      const message = unlinkError instanceof Error ? unlinkError.message : "Failed to unlink cloud account.";
      setError(message);
      toast.error(message);
    } finally {
      setUnlinking(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-muted/10 p-4">
      <div className="space-y-1.5">
        <p className="text-sm font-semibold">Cloud account</p>
        <p className="text-xs text-muted-foreground">
          Sign in with your cloud portal owner account. This is separate from local POS credentials.
        </p>
      </div>

      {loading ? (
        <div className="mt-4 space-y-2">
          <div className="h-10 animate-pulse rounded-lg bg-muted" />
          <div className="h-10 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {!status?.cloud_relay_configured && (
            <div className="rounded-xl border border-amber-300/40 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
              Cloud relay is not configured. Set `AiInsights__CloudRelayBaseUrl` (or licensing cloud relay base URL) in
              backend environment settings.
            </div>
          )}

          <div className="rounded-xl border border-border bg-background px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Status</p>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  isLinked ? "bg-emerald-100 text-emerald-900" : "bg-muted text-muted-foreground"
                }`}
              >
                {isLinked ? "Linked" : "Not linked"}
              </span>
            </div>
            {isLinked ? (
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <p>
                  Username: <span className="text-foreground">{status?.cloud_username || "-"}</span>
                </p>
                <p>
                  Full name: <span className="text-foreground">{status?.cloud_full_name || "-"}</span>
                </p>
                <p>
                  Role: <span className="text-foreground">{status?.cloud_role || "-"}</span>
                </p>
                <p>
                  Shop code: <span className="text-foreground">{status?.cloud_shop_code || "-"}</span>
                </p>
                <p>
                  Linked at: <span className="text-foreground">{formatDateTime(status?.linked_at)}</span>
                </p>
                <p>
                  Token expires:{" "}
                  <span className={tokenExpired ? "font-medium text-red-600" : "text-foreground"}>
                    {formatDateTime(status?.token_expires_at)}
                    {tokenExpired ? " (expired - re-link required)" : ""}
                  </span>
                </p>
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">No cloud account linked for this POS installation.</p>
            )}
          </div>

          <form className="space-y-3" onSubmit={handleLink}>
            <div className="grid gap-2">
              <Label htmlFor="cloud-account-username">Cloud username</Label>
              <Input
                id="cloud-account-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Cloud portal username"
                autoComplete="username"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cloud-account-password">Cloud password</Label>
              <Input
                id="cloud-account-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                placeholder="Cloud portal password"
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={linking || unlinking}>
                {linking ? "Linking..." : linkButtonLabel}
              </Button>
              {isLinked && (
                <Button type="button" variant="outline" onClick={handleUnlink} disabled={unlinking || linking}>
                  {unlinking ? "Unlinking..." : "Unlink"}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Your cloud password is never stored in the POS database.</p>
          </form>
        </div>
      )}
    </div>
  );
};

export default CloudAccountSettingsCard;
