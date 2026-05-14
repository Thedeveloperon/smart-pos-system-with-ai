import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AiPendingItem = {
  payment_id: string;
  target_username: string;
  target_full_name?: string | null;
  shop_name?: string | null;
  payment_method: string;
  credits: number;
  amount: number;
  currency: string;
  external_reference: string;
  submitted_reference?: string | null;
  created_at: string;
};

type StatusMessage = { type: "ok" | "err"; text: string };

function formatCredits(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatMoney(amount: number, currency: string) {
  return `${currency.toUpperCase()} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function toSentence(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const AiCreditVerificationPanel = () => {
  const [items, setItems] = useState<AiPendingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [referenceInput, setReferenceInput] = useState("");
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/admin/ai-credits/pending?take=80", {
        method: "GET",
        cache: "no-store",
      });
      const data = (await res.json()) as { items?: AiPendingItem[] };
      if (!res.ok) {
        setStatusMessage({
          type: "err",
          text: (data as { error?: { message?: string } })?.error?.message || "Failed to load pending AI credit payments.",
        });
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setStatusMessage({
        type: "err",
        text: err instanceof Error ? err.message : "Failed to load pending AI credit payments.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleVerify = useCallback(
    async (paymentId: string) => {
      setVerifyingId(paymentId);
      setStatusMessage(null);
      try {
        const res = await fetch("/api/admin/ai-credits/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_id: paymentId }),
        });
        const data = (await res.json()) as { payment_status?: string; error?: { message?: string } };
        if (!res.ok) {
          setStatusMessage({
            type: "err",
            text: data?.error?.message || "Verification failed.",
          });
          return;
        }
        const status = data.payment_status ?? "updated";
        setStatusMessage({
          type: "ok",
          text:
            status === "succeeded"
              ? "Payment verified — credits have been released to the shop wallet."
              : `Payment status updated: ${toSentence(status)}.`,
        });
        await load();
      } catch (err) {
        setStatusMessage({
          type: "err",
          text: err instanceof Error ? err.message : "Unexpected error during verification.",
        });
      } finally {
        setVerifyingId(null);
      }
    },
    [load],
  );

  const handleVerifyByReference = useCallback(async () => {
    const ref = referenceInput.trim();
    if (!ref) {
      setStatusMessage({ type: "err", text: "Enter a submitted or external reference." });
      return;
    }
    setStatusMessage(null);
    const normalizedRef = ref.toLowerCase();
    const match = items.find(
      (item) =>
        (item.external_reference || "").toLowerCase() === normalizedRef ||
        (item.submitted_reference || "").toLowerCase() === normalizedRef,
    );
    if (!match) {
      setStatusMessage({
        type: "err",
        text: "No pending payment matched this reference. Refresh and try again.",
      });
      return;
    }
    setReferenceInput("");
    await handleVerify(match.payment_id);
  }, [items, referenceInput, handleVerify]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold">AI Credit Payments — Pending Verification</h3>
          <Badge variant="secondary">{items.length} pending</Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {/* Reference search */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="text"
          value={referenceInput}
          onChange={(e) => {
            setReferenceInput(e.target.value);
            setStatusMessage(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleVerifyByReference();
          }}
          placeholder="Submitted ref or aicpay_... external ref"
          className="sm:flex-1"
        />
        <Button
          disabled={!!verifyingId || !referenceInput.trim()}
          onClick={() => void handleVerifyByReference()}
        >
          {verifyingId === "__by_reference__" ? "Verifying…" : "Verify by Reference"}
        </Button>
      </div>

      {/* Status message */}
      {statusMessage && (
        <p
          className={`text-sm font-medium ${
            statusMessage.type === "ok" ? "text-emerald-700" : "text-destructive"
          }`}
        >
          {statusMessage.text}
        </p>
      )}

      {/* Payment list */}
      {loading && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">No pending AI credit payments.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.payment_id}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">
                      {item.shop_name || "Unknown Shop"}
                    </p>
                    <Badge variant="outline" className="text-[11px]">
                      {toSentence(item.payment_method)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.target_username}
                    {item.target_full_name ? ` · ${item.target_full_name}` : ""}
                  </p>
                  <p className="text-sm font-medium">
                    {formatCredits(item.credits)} credits · {formatMoney(item.amount, item.currency)}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground font-mono">
                    {item.submitted_reference && (
                      <span>Ref: {item.submitted_reference}</span>
                    )}
                    <span className="text-muted-foreground/60">
                      Ext: {item.external_reference}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDate(item.created_at)}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!verifyingId}
                  onClick={() => void handleVerify(item.payment_id)}
                >
                  {verifyingId === item.payment_id ? "Verifying…" : "Verify"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AiCreditVerificationPanel;
