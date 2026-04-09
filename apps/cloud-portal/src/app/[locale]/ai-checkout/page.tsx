"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import { trackMarketingEvent } from "@/lib/marketingAnalytics";

const AiCheckoutStatusPollingIntervalMs = process.env.NODE_ENV === "test" ? 40 : 2500;
const AiCheckoutStatusPollingMaxAttempts = process.env.NODE_ENV === "test" ? 4 : 10;

type AiPaymentHistoryItemResponse = {
  payment_id: string;
  payment_status: string;
  payment_method: string;
  provider: string;
  credits: number;
  amount: number;
  currency: string;
  external_reference: string;
  created_at: string;
  completed_at?: string | null;
};

type AiPaymentHistoryResponse = {
  items: AiPaymentHistoryItemResponse[];
};

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
};

type CheckoutStatusState = "idle" | "loading" | "pending" | "succeeded" | "failed" | "error";

function parseErrorMessage(payload: unknown): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const candidate = payload as ApiErrorPayload;
  return candidate?.error?.message?.trim() || candidate?.message?.trim() || "Unable to check checkout status.";
}

async function parseApiPayload(response: Response): Promise<unknown> {
  const responseText = await response.text();
  if (!responseText.trim()) {
    return null;
  }

  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return responseText;
  }
}

function requireObjectPayload<T>(payload: unknown, errorMessage: string): T {
  if (!payload || typeof payload !== "object") {
    throw new Error(errorMessage);
  }

  return payload as T;
}

function normalizePaymentStatus(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

function toSentence(value?: string | null) {
  if (!value) {
    return "-";
  }

  return value.replaceAll("_", " ");
}

function isProcessingStatus(value?: string | null) {
  const normalized = normalizePaymentStatus(value);
  return (
    normalized === "processing" ||
    normalized === "pending" ||
    normalized === "pending_verification" ||
    normalized === "action_required"
  );
}

function isFailedStatus(value?: string | null) {
  const normalized = normalizePaymentStatus(value);
  return normalized === "failed" || normalized === "canceled" || normalized === "refunded";
}

function resolveStatusGuidance(value?: string | null) {
  const normalized = normalizePaymentStatus(value);
  if (!normalized) {
    return "Payment status is not available yet.";
  }

  switch (normalized) {
    case "succeeded":
      return "Payment completed successfully and credits are available.";
    case "pending":
    case "processing":
      return "Payment is still processing with the provider.";
    case "pending_verification":
      return "Manual payment is pending verification.";
    case "action_required":
      return "Additional payment action is required. Retry checkout from My Account.";
    case "failed":
      return "Payment failed. Retry from My Account or contact support.";
    case "canceled":
      return "Payment was canceled before completion.";
    case "refunded":
      return "Payment was refunded and credits were reversed.";
    default:
      return "Payment status updated. Open My Account for full details.";
  }
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatAmount(value?: number | null, currency = "USD") {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return `- ${currency}`;
  }

  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function formatCredits(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function resolveStateLabel(state: CheckoutStatusState, paymentStatus?: string | null) {
  if (state === "loading") {
    return "checking";
  }

  if (state === "pending" || state === "succeeded" || state === "failed") {
    return normalizePaymentStatus(paymentStatus) || state;
  }

  if (state === "error") {
    return "unavailable";
  }

  return "pending";
}

function resolveStatePillClass(state: CheckoutStatusState) {
  if (state === "succeeded") {
    return "bg-emerald-100 text-emerald-700 border-emerald-300";
  }

  if (state === "failed" || state === "error") {
    return "bg-red-100 text-red-700 border-red-300";
  }

  if (state === "loading" || state === "pending") {
    return "bg-amber-100 text-amber-700 border-amber-300";
  }

  return "bg-muted text-muted-foreground border-border";
}

export default function AiCheckoutPage() {
  const { locale } = useI18n();
  const [checkoutReference, setCheckoutReference] = useState("");
  const [checkoutPackCode, setCheckoutPackCode] = useState("");
  const [statusState, setStatusState] = useState<CheckoutStatusState>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [paymentItem, setPaymentItem] = useState<AiPaymentHistoryItemResponse | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = (params.get("reference") || "").trim();
    const pack = (params.get("pack") || "").trim();

    setCheckoutReference(reference);
    setCheckoutPackCode(pack);

    trackMarketingEvent("marketing_ai_checkout_returned", {
      locale,
      external_reference: reference || null,
      pack_code: pack || null,
    });
  }, [locale]);

  useEffect(() => {
    if (!checkoutReference) {
      setPaymentItem(null);
      setStatusState("error");
      setStatusError("Missing checkout reference. Restart AI top-up from My Account.");
      setStatusMessage(null);
      return;
    }

    let active = true;
    const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

    const syncCheckoutStatus = async () => {
      setStatusState("loading");
      setStatusError(null);
      setStatusMessage("Checking your AI payment status...");

      for (let attempt = 0; attempt < AiCheckoutStatusPollingMaxAttempts; attempt += 1) {
        if (!active) {
          return;
        }

        try {
          const response = await fetch("/api/account/ai/payments?take=100", {
            method: "GET",
            cache: "no-store",
          });
          const payload = await parseApiPayload(response);

          if (response.status === 401 || response.status === 403) {
            setPaymentItem(null);
            setStatusState("error");
            setStatusMessage("Your account session may have expired.");
            setStatusError("Sign in to your account to check this payment status.");
            return;
          }

          if (!response.ok) {
            throw new Error(parseErrorMessage(payload));
          }

          const history = requireObjectPayload<AiPaymentHistoryResponse>(
            payload,
            "Payment history response was empty.",
          );
          const targetReference = checkoutReference.toLowerCase();
          const matchedPayment = (history.items || []).find(
            (item) => (item.external_reference || "").trim().toLowerCase() === targetReference,
          );

          if (!matchedPayment) {
            setPaymentItem(null);
            setStatusState("pending");

            if (attempt < AiCheckoutStatusPollingMaxAttempts - 1) {
              setStatusMessage("Payment record is still being confirmed. Retrying...");
              await wait(AiCheckoutStatusPollingIntervalMs);
              continue;
            }

            setStatusMessage("Payment is still processing. Open My Account to continue tracking this checkout.");
            return;
          }

          setPaymentItem(matchedPayment);
          const normalizedStatus = normalizePaymentStatus(matchedPayment.payment_status);
          setStatusMessage(resolveStatusGuidance(normalizedStatus));

          if (normalizedStatus === "succeeded") {
            setStatusState("succeeded");
            return;
          }

          if (isFailedStatus(normalizedStatus)) {
            setStatusState("failed");
            return;
          }

          setStatusState("pending");
          if (isProcessingStatus(normalizedStatus) && attempt < AiCheckoutStatusPollingMaxAttempts - 1) {
            await wait(AiCheckoutStatusPollingIntervalMs);
            continue;
          }

          return;
        } catch (error) {
          if (!active) {
            return;
          }

          setPaymentItem(null);
          setStatusState("error");
          setStatusMessage(null);
          setStatusError(error instanceof Error ? error.message : "Unable to check checkout status.");
          return;
        }
      }
    };

    void syncCheckoutStatus();
    return () => {
      active = false;
    };
  }, [checkoutReference, refreshNonce]);

  const stateLabel = useMemo(
    () => toSentence(resolveStateLabel(statusState, paymentItem?.payment_status)),
    [paymentItem?.payment_status, statusState],
  );

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-4xl px-4 py-10 space-y-6">
        <Link href={`/${locale}/account`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to My Account
        </Link>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">AI Checkout Status</h1>
            <p className="text-sm text-muted-foreground">
              We are checking your payment return and matching it with your account wallet history.
            </p>
          </div>

          <div className="grid gap-2 text-sm">
            <p>
              Reference: <span className="font-mono">{checkoutReference || "-"}</span>
            </p>
            <p>
              Pack: <span className="font-medium">{checkoutPackCode || "-"}</span>
            </p>
            <p className="flex items-center gap-2">
              Current status:
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${resolveStatePillClass(statusState)}`}
              >
                {stateLabel}
              </span>
            </p>
          </div>

          {statusMessage && <p className="text-sm text-muted-foreground">{statusMessage}</p>}
          {statusError && <p className="text-sm text-destructive">{statusError}</p>}

          {paymentItem && (
            <div className="grid gap-2 rounded-xl border border-border/70 bg-muted/30 p-4 text-sm sm:grid-cols-2">
              <p>
                Credits: <span className="font-medium">{formatCredits(paymentItem.credits)}</span>
              </p>
              <p>
                Amount: <span className="font-medium">{formatAmount(paymentItem.amount, paymentItem.currency)}</span>
              </p>
              <p>
                Method: <span className="font-medium capitalize">{toSentence(paymentItem.payment_method)}</span>
              </p>
              <p>
                Provider: <span className="font-medium">{paymentItem.provider || "-"}</span>
              </p>
              <p>
                Created: <span className="font-medium">{formatDate(paymentItem.created_at)}</span>
              </p>
              <p>
                Completed: <span className="font-medium">{formatDate(paymentItem.completed_at || null)}</span>
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              onClick={() => {
                window.location.href = `/${locale}/account`;
              }}
            >
              Open My Account
            </Button>
            <Button
              variant="outline"
              disabled={statusState === "loading"}
              onClick={() => {
                setRefreshNonce((value) => value + 1);
              }}
            >
              Check Again
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}

