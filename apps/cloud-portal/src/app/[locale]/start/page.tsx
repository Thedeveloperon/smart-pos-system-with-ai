"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import { trackMarketingEvent } from "@/lib/marketingAnalytics";

type PlanCode = "starter" | "pro" | "business";
type PaymentMethod = "cash" | "bank_deposit";

type PaymentRequestResponse = {
  generated_at: string;
  shop_code: string;
  shop_name: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  marketing_plan_code: PlanCode;
  internal_plan_code: string;
  requires_payment: boolean;
  amount_due: number;
  currency: string;
  next_step: string;
  invoice?: {
    invoice_id: string;
    invoice_number: string;
    status: string;
    due_at: string;
  } | null;
  instructions: {
    payment_method: PaymentMethod;
    message: string;
    reference_hint: string;
  };
  owner_username?: string | null;
  owner_account_state?: string | null;
};

type PaymentSubmitResponse = {
  processed_at: string;
  shop_code: string;
  invoice_id: string;
  invoice_number: string;
  invoice_status: string;
  payment_id: string;
  payment_status: string;
  message: string;
  next_step: string;
};

type StripeCheckoutSessionResponse = {
  created_at: string;
  shop_code: string;
  shop_name: string;
  marketing_plan_code: PlanCode;
  internal_plan_code: string;
  amount_due: number;
  currency: string;
  invoice: {
    invoice_id: string;
    invoice_number: string;
    status: string;
    due_at: string;
  };
  checkout_session_id: string;
  checkout_url: string;
  expires_at?: string | null;
  owner_username?: string | null;
  owner_account_state?: string | null;
};

type StripeCheckoutStatusResponse = {
  generated_at: string;
  checkout_session_id: string;
  checkout_status: string;
  checkout_payment_status: string;
  shop_code?: string | null;
  shop_name?: string | null;
  invoice?: {
    invoice_id: string;
    invoice_number: string;
    status: string;
    due_at: string;
  } | null;
  payment_status?: string | null;
  subscription_id?: string | null;
  subscription_status?: string | null;
  plan?: string | null;
  access_ready: boolean;
  stripe_event_hint?: string | null;
};

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

const isManualBillingFallbackEnabled = (() => {
  const configured = process.env.NEXT_PUBLIC_MARKETING_MANUAL_BILLING_FALLBACK_ENABLED;
  if (configured && configured.trim().length > 0) {
    return configured.trim().toLowerCase() === "true";
  }

  // Keep frontend default aligned with backend defaults:
  // production -> disabled, non-production -> enabled.
  return process.env.NODE_ENV !== "production";
})();

function normalizePlanCode(rawValue: string | null): PlanCode {
  const normalized = (rawValue || "").trim().toLowerCase();
  if (normalized === "pro" || normalized === "business") {
    return normalized;
  }

  return "starter";
}

function parseErrorMessage(payload: unknown): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const candidate = payload as ApiErrorPayload;
  return candidate?.error?.message?.trim() || "Request failed. Please try again.";
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

function toSentence(value?: string | null) {
  if (!value) {
    return "-";
  }

  return value.replaceAll("_", " ");
}

export default function StartPage() {
  const { locale } = useI18n();

  const [planCode, setPlanCode] = useState<PlanCode>("starter");
  const [shopName, setShopName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank_deposit");
  const [ownerUsername, setOwnerUsername] = useState("");
  const [ownerFullName, setOwnerFullName] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");

  const [requestResult, setRequestResult] = useState<PaymentRequestResponse | null>(null);
  const [submitResult, setSubmitResult] = useState<PaymentSubmitResponse | null>(null);
  const [amountPaid, setAmountPaid] = useState("0");
  const [bankReference, setBankReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const [requestError, setRequestError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isCreatingStripeCheckout, setIsCreatingStripeCheckout] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [checkoutReturnState, setCheckoutReturnState] = useState<"none" | "success" | "cancel">("none");
  const [checkoutSessionId, setCheckoutSessionId] = useState("");
  const [stripeCheckoutStatus, setStripeCheckoutStatus] = useState<StripeCheckoutStatusResponse | null>(null);
  const [stripeCheckoutStatusError, setStripeCheckoutStatusError] = useState<string | null>(null);
  const [isCheckingStripeStatus, setIsCheckingStripeStatus] = useState(false);
  const hasTrackedCheckoutStatusRef = useRef(false);
  const hasTrackedCheckoutReadyRef = useRef(false);

  const planOptions = useMemo(
    () => [
      { code: "starter" as PlanCode, label: "Starter (Free)" },
      { code: "pro" as PlanCode, label: "Pro ($19)" },
      { code: "business" as PlanCode, label: "Business ($49)" },
    ],
    [],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selectedPlan = normalizePlanCode(params.get("plan"));
    setPlanCode(selectedPlan);

    const checkoutState = (params.get("checkout") || "").trim().toLowerCase();
    const sessionId = (params.get("session_id") || "").trim();
    if (checkoutState === "success" || checkoutState === "cancel") {
      setCheckoutReturnState(checkoutState);
      if (checkoutState === "success" && sessionId) {
        setCheckoutSessionId(sessionId);
      }

      trackMarketingEvent("marketing_stripe_checkout_returned", {
        locale,
        checkout_state: checkoutState,
        session_id: sessionId || null,
      });
    }

    if (checkoutState || sessionId) {
      params.delete("checkout");
      params.delete("session_id");
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    }

    trackMarketingEvent("marketing_onboarding_viewed", {
      locale,
      plan_code: selectedPlan,
    });
  }, [locale]);

  useEffect(() => {
    if (checkoutReturnState !== "success" || !checkoutSessionId) {
      return;
    }

    let active = true;
    let pollingTimer: ReturnType<typeof setInterval> | null = null;
    let stopTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchStatus = async () => {
      if (!active) {
        return;
      }

      try {
        const response = await fetch(
          `/api/payment/stripe-checkout-status?session_id=${encodeURIComponent(checkoutSessionId)}`,
          {
            method: "GET",
            cache: "no-store",
          },
        );

        const payload = await parseApiPayload(response);
        if (!response.ok) {
          throw new Error(parseErrorMessage(payload));
        }

        const data = requireObjectPayload<StripeCheckoutStatusResponse>(
          payload,
          "Stripe checkout status response was empty.",
        );
        if (!active) {
          return;
        }

        setStripeCheckoutStatus(data);
        setStripeCheckoutStatusError(null);

        if (!hasTrackedCheckoutStatusRef.current) {
          hasTrackedCheckoutStatusRef.current = true;
          trackMarketingEvent("marketing_stripe_checkout_status_loaded", {
            locale,
            checkout_session_id: data.checkout_session_id,
            checkout_status: data.checkout_status,
            checkout_payment_status: data.checkout_payment_status,
            invoice_status: data.invoice?.status || null,
            subscription_status: data.subscription_status || null,
            access_ready: data.access_ready,
          });
        }

        if (data.access_ready && !hasTrackedCheckoutReadyRef.current) {
          hasTrackedCheckoutReadyRef.current = true;
          trackMarketingEvent("marketing_stripe_checkout_access_ready", {
            locale,
            checkout_session_id: data.checkout_session_id,
            invoice_number: data.invoice?.invoice_number || null,
            subscription_status: data.subscription_status || null,
            plan: data.plan || null,
          });
        }

        const checkoutStatus = (data.checkout_status || "").trim().toLowerCase();
        const checkoutPaymentStatus = (data.checkout_payment_status || "").trim().toLowerCase();
        const invoiceStatus = (data.invoice?.status || "").trim().toLowerCase();
        const subscriptionStatus = (data.subscription_status || "").trim().toLowerCase();
        const shouldStopPolling =
          data.access_ready ||
          invoiceStatus === "paid" ||
          subscriptionStatus === "active" ||
          checkoutStatus === "expired" ||
          (checkoutStatus === "complete" && checkoutPaymentStatus === "unpaid");

        if (shouldStopPolling && pollingTimer) {
          clearInterval(pollingTimer);
          pollingTimer = null;
        }
      } catch (error) {
        if (!active) {
          return;
        }

        setStripeCheckoutStatusError(
          error instanceof Error ? error.message : "Unable to load Stripe checkout status.",
        );
      } finally {
        if (active) {
          setIsCheckingStripeStatus(false);
        }
      }
    };

    setIsCheckingStripeStatus(true);
    void fetchStatus();

    pollingTimer = setInterval(() => {
      void fetchStatus();
    }, 8000);

    stopTimer = setTimeout(() => {
      if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = null;
      }
    }, 60000);

    return () => {
      active = false;
      if (pollingTimer) {
        clearInterval(pollingTimer);
      }

      if (stopTimer) {
        clearTimeout(stopTimer);
      }
    };
  }, [checkoutReturnState, checkoutSessionId, locale]);

  const buildMarketingRequestPayload = () => {
    if (!contactEmail.trim() && !contactPhone.trim()) {
      throw new Error("Provide at least an email or phone number.");
    }

    const normalizedOwnerUsername = ownerUsername.trim().toLowerCase();
    if (!normalizedOwnerUsername) {
      throw new Error("Owner username is required.");
    }

    const normalizedOwnerPassword = ownerPassword.trim();
    if (normalizedOwnerPassword.length < 8) {
      throw new Error("Owner password must be at least 8 characters.");
    }

    return {
      shop_name: shopName,
      contact_name: contactName,
      contact_email: contactEmail || undefined,
      contact_phone: contactPhone || undefined,
      plan_code: planCode,
      payment_method: isManualBillingFallbackEnabled ? paymentMethod : "bank_deposit",
      locale,
      source: "website_pricing",
      notes: notes || undefined,
      owner_username: normalizedOwnerUsername,
      owner_full_name: ownerFullName.trim() || contactName,
      owner_password: normalizedOwnerPassword,
    };
  };

  const handleRequestCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isManualBillingFallbackEnabled && planCode !== "starter") {
      setRequestError("Manual cash/bank fallback is disabled. Use Stripe card checkout.");
      return;
    }

    setRequestError(null);
    setSubmitError(null);
    setSubmitResult(null);
    setIsSubmittingRequest(true);

    try {
      const requestPayload = buildMarketingRequestPayload();

      const response = await fetch("/api/payment/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(requestPayload),
      });

      const payload = await parseApiPayload(response);
      if (!response.ok) {
        throw new Error(parseErrorMessage(payload));
      }

      const data = requireObjectPayload<PaymentRequestResponse>(
        payload,
        "Payment service returned an empty response. Please try again.",
      );
      setRequestResult(data);
      setAmountPaid(String(data.amount_due || 0));
      setPaymentMethod(data.instructions?.payment_method || paymentMethod);
      trackMarketingEvent("marketing_payment_request_created", {
        locale,
        plan_code: data.marketing_plan_code,
        internal_plan_code: data.internal_plan_code,
        invoice_number: data.invoice?.invoice_number || null,
        requires_payment: data.requires_payment,
      });
    } catch (error) {
      setRequestResult(null);
      setRequestError(error instanceof Error ? error.message : "Unable to create payment request.");
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const handleStripeCheckout = async () => {
    setRequestError(null);
    setSubmitError(null);
    setIsCreatingStripeCheckout(true);
    try {
      const requestPayload = buildMarketingRequestPayload();
      const response = await fetch("/api/payment/stripe-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(requestPayload),
      });

      const payload = await parseApiPayload(response);
      if (!response.ok) {
        throw new Error(parseErrorMessage(payload));
      }

      const data = requireObjectPayload<StripeCheckoutSessionResponse>(
        payload,
        "Stripe checkout session response was empty.",
      );
      if (!data.checkout_url) {
        throw new Error("Stripe checkout URL was not returned.");
      }

      trackMarketingEvent("marketing_stripe_checkout_session_created", {
        locale,
        plan_code: data.marketing_plan_code,
        internal_plan_code: data.internal_plan_code,
        invoice_number: data.invoice?.invoice_number || null,
        checkout_session_id: data.checkout_session_id,
      });

      window.location.href = data.checkout_url;
    } catch (error) {
      setRequestError(
        `${error instanceof Error ? error.message : "Unable to start Stripe checkout."} You can continue with bank transfer/cash using payment request.`,
      );
    } finally {
      setIsCreatingStripeCheckout(false);
    }
  };

  const handlePaymentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requestResult?.invoice?.invoice_id) {
      setSubmitError("Create a payment request first.");
      return;
    }

    setSubmitError(null);
    setIsSubmittingPayment(true);
    try {
      const parsedAmount = Number(amountPaid);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw new Error("Enter a valid paid amount.");
      }

      const normalizedReference = bankReference.trim();
      if (!normalizedReference) {
        throw new Error(
          paymentMethod === "cash"
            ? "Reference number is required for cash payments."
            : "Bank reference is required for bank deposits."
        );
      }

      const response = await fetch("/api/payment/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          invoice_id: requestResult.invoice.invoice_id,
          payment_method: paymentMethod,
          amount: parsedAmount,
          currency: requestResult.currency,
          bank_reference: normalizedReference,
          contact_name: contactName || undefined,
          contact_email: contactEmail || undefined,
          contact_phone: contactPhone || undefined,
          notes: paymentNotes || undefined,
        }),
      });

      const payload = await parseApiPayload(response);
      if (!response.ok) {
        throw new Error(parseErrorMessage(payload));
      }

      const data = requireObjectPayload<PaymentSubmitResponse>(
        payload,
        "Payment submission returned an empty response. Please try again.",
      );
      setSubmitResult(data);
      trackMarketingEvent("marketing_payment_submitted", {
        locale,
        invoice_number: data.invoice_number,
        payment_id: data.payment_id,
        payment_status: data.payment_status,
      });
    } catch (error) {
      setSubmitResult(null);
      setSubmitError(error instanceof Error ? error.message : "Unable to submit payment.");
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  return (
    <main className="app-shell px-4 py-10 md:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <Link
          href={`/${locale}#pricing`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={16} />
          Back to Pricing
        </Link>

        <section className="portal-hero space-y-2">
          <p className="portal-kicker">Owner Onboarding</p>
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">Start SmartPOS</h1>
          <p className="text-sm text-muted-foreground">
            Create your shop owner account, then continue with trial or complete payment for paid plans.
          </p>

          {checkoutReturnState === "cancel" && (
            <div className="mt-4 rounded-xl border border-warning/35 bg-warning/15 p-3 text-sm text-warning-foreground">
              Stripe checkout was canceled. You can retry card payment
              {isManualBillingFallbackEnabled
                ? " or continue with manual payment request."
                : "."}
            </div>
          )}

          {!isManualBillingFallbackEnabled && (
            <div className="mt-4 rounded-xl border border-info/35 bg-info/10 p-3 text-sm text-info">
              Manual bank/cash fallback is disabled for this environment. Paid plans use Stripe card checkout.
            </div>
          )}
          {isManualBillingFallbackEnabled && planCode !== "starter" && (
            <div className="mt-4 rounded-xl border border-info/35 bg-info/10 p-3 text-sm text-info">
              Choose payment method: create a bank transfer/cash request now, or continue with Stripe card checkout.
            </div>
          )}

          {checkoutReturnState === "success" && (
            <div className="mt-4 space-y-1 rounded-xl border border-success/35 bg-success/10 p-3 text-sm text-success">
              <p className="font-semibold">Stripe checkout completed. Confirming payment status...</p>
              {isCheckingStripeStatus && (
                <p className="text-xs text-success/80">Checking live status from billing service...</p>
              )}
              {stripeCheckoutStatusError && (
                <p className="text-xs text-destructive">{stripeCheckoutStatusError}</p>
              )}
              {stripeCheckoutStatus && (
                <div className="space-y-1 text-xs">
                  <p>
                    Checkout: <span className="font-semibold capitalize">{toSentence(stripeCheckoutStatus.checkout_status)}</span>{" "}
                    / Payment:{" "}
                    <span className="font-semibold capitalize">{toSentence(stripeCheckoutStatus.checkout_payment_status)}</span>
                  </p>
                  {stripeCheckoutStatus.invoice && (
                    <p>
                      Invoice: <span className="font-semibold">{stripeCheckoutStatus.invoice.invoice_number}</span>{" "}
                      ({toSentence(stripeCheckoutStatus.invoice.status)})
                    </p>
                  )}
                  {stripeCheckoutStatus.subscription_status && (
                    <p>
                      Subscription:{" "}
                      <span className="font-semibold capitalize">{toSentence(stripeCheckoutStatus.subscription_status)}</span>
                      {stripeCheckoutStatus.plan ? ` (${stripeCheckoutStatus.plan})` : ""}
                    </p>
                  )}
                  <p className={stripeCheckoutStatus.access_ready ? "font-medium text-success" : "text-success/80"}>
                    {stripeCheckoutStatus.access_ready
                      ? "Payment confirmed and access is ready. You can continue activation in your POS app."
                      : "Payment is processing. If this takes more than a minute, refresh this page or contact support."}
                  </p>
                  {stripeCheckoutStatus.access_ready && (
                    <p className="text-success/90">
                      <Link href={`/${locale}/account`} className="underline underline-offset-2 font-medium">
                        Open My Account
                      </Link>{" "}
                      to view your license key and install options.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleRequestCreate}>
            <label className="space-y-1 md:col-span-2">
              <span className="portal-kicker">Plan</span>
              <select
                className="field-shell"
                value={planCode}
                onChange={(event) => setPlanCode(normalizePlanCode(event.target.value))}
              >
                {planOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 md:col-span-2">
              <span className="portal-kicker">Shop Name</span>
              <input
                className="field-shell"
                value={shopName}
                onChange={(event) => setShopName(event.target.value)}
                placeholder="Nelu Grocery"
                required
              />
            </label>

            <label className="space-y-1">
              <span className="portal-kicker">Contact Name</span>
              <input
                className="field-shell"
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                placeholder="Owner name"
                required
              />
            </label>

            {isManualBillingFallbackEnabled && (
              <label className="space-y-1">
                <span className="portal-kicker">Payment Method</span>
                <select
                  className="field-shell"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                >
                  <option value="bank_deposit">Bank Deposit</option>
                  <option value="cash">Cash</option>
                </select>
              </label>
            )}

            <label className="space-y-1">
              <span className="portal-kicker">Email (optional)</span>
              <input
                type="email"
                className="field-shell"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                placeholder="owner@shop.lk"
              />
            </label>

            <label className="space-y-1">
              <span className="portal-kicker">Phone (optional)</span>
              <input
                className="field-shell"
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                placeholder="+94..."
              />
            </label>

            <label className="space-y-1 md:col-span-2">
              <span className="portal-kicker">Notes (optional)</span>
              <textarea
                className="field-shell min-h-[96px] resize-y"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Any billing details..."
              />
            </label>

            <label className="space-y-1">
              <span className="portal-kicker">Owner Username</span>
              <input
                className="field-shell"
                value={ownerUsername}
                onChange={(event) => setOwnerUsername(event.target.value)}
                placeholder="shopowner"
                required
              />
            </label>

            <label className="space-y-1">
              <span className="portal-kicker">Owner Password</span>
              <input
                type="password"
                className="field-shell"
                value={ownerPassword}
                onChange={(event) => setOwnerPassword(event.target.value)}
                placeholder="At least 8 characters"
                required
              />
            </label>

            <label className="space-y-1 md:col-span-2">
              <span className="portal-kicker">Owner Full Name (optional)</span>
              <input
                className="field-shell"
                value={ownerFullName}
                onChange={(event) => setOwnerFullName(event.target.value)}
                placeholder="Shop Owner"
              />
            </label>

            {requestError && <p className="text-sm text-destructive md:col-span-2">{requestError}</p>}

            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
              {isManualBillingFallbackEnabled ? (
                <>
                  <Button type="submit" variant="hero" disabled={isSubmittingRequest || isCreatingStripeCheckout}>
                    {isSubmittingRequest ? "Creating..." : "Pay by Bank Transfer / Cash"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void handleStripeCheckout();
                    }}
                    disabled={isSubmittingRequest || isCreatingStripeCheckout || planCode === "starter"}
                  >
                    {isCreatingStripeCheckout ? "Redirecting to Stripe..." : "Pay with Card (Stripe)"}
                  </Button>
                </>
              ) : planCode === "starter" ? (
                <Button type="submit" variant="hero" disabled={isSubmittingRequest || isCreatingStripeCheckout}>
                  {isSubmittingRequest ? "Creating..." : "Continue With Starter Plan"}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="hero"
                  onClick={() => {
                    void handleStripeCheckout();
                  }}
                  disabled={isSubmittingRequest || isCreatingStripeCheckout}
                >
                  {isCreatingStripeCheckout ? "Redirecting to Stripe..." : "Pay with Card (Stripe)"}
                </Button>
              )}
            </div>
          </form>
        </section>

        {requestResult && (
          <section className="portal-surface space-y-4">
            <h2 className="text-xl font-semibold">Request Created</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-surface-muted p-3">
                <p className="portal-kicker">Shop</p>
                <p className="mt-1 text-sm font-semibold">{requestResult.shop_name}</p>
                <p className="text-xs text-muted-foreground">{requestResult.shop_code}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-surface-muted p-3">
                <p className="portal-kicker">Plan Mapping</p>
                <p className="mt-1 text-sm font-semibold">
                  {requestResult.marketing_plan_code} {"->"} {requestResult.internal_plan_code}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-1">
              <p className="portal-kicker">Owner Account</p>
              <p className="text-sm">
                Username: <span className="font-semibold">{requestResult.owner_username || ownerUsername || "-"}</span>
              </p>
              <p className="text-sm">
                Status: <span className="font-semibold">{toSentence(requestResult.owner_account_state || "created")}</span>
              </p>
            </div>

            {!requestResult.requires_payment && (
              <div className="rounded-xl border border-success/35 bg-success/10 p-4 text-sm text-success">
                {requestResult.instructions.message}
              </div>
            )}

            {requestResult.requires_payment && requestResult.invoice && isManualBillingFallbackEnabled && (
              <>
                <div className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-2">
                  <p className="portal-kicker">Invoice</p>
                  <p className="text-sm">Invoice Number: <span className="font-semibold">{requestResult.invoice.invoice_number}</span></p>
                  <p className="text-sm">Amount Due: <span className="font-semibold">{requestResult.amount_due} {requestResult.currency}</span></p>
                  <p className="text-sm">Due At: <span className="font-semibold">{formatDate(requestResult.invoice.due_at)}</span></p>
                  <p className="text-sm text-muted-foreground">{requestResult.instructions.message}</p>
                  <p className="text-sm text-muted-foreground">{requestResult.instructions.reference_hint}</p>
                </div>

                <form className="space-y-3" onSubmit={handlePaymentSubmit}>
                  <h3 className="text-base font-semibold">I Have Paid</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1">
                      <span className="portal-kicker">Amount Paid</span>
                      <input
                        className="field-shell"
                        value={amountPaid}
                        onChange={(event) => setAmountPaid(event.target.value)}
                        required
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="portal-kicker">Reference Number</span>
                      <input
                        className="field-shell"
                        value={bankReference}
                        onChange={(event) => setBankReference(event.target.value)}
                        placeholder={paymentMethod === "cash" ? "Cash receipt/reference number" : "Deposit reference"}
                        required
                      />
                    </label>
                  </div>
                  <label className="space-y-1">
                    <span className="portal-kicker">Notes (optional)</span>
                    <textarea
                      className="field-shell min-h-[96px] resize-y"
                      value={paymentNotes}
                      onChange={(event) => setPaymentNotes(event.target.value)}
                    />
                  </label>

                  {submitError && <p className="text-sm text-destructive">{submitError}</p>}

                  <Button type="submit" variant="hero" disabled={isSubmittingPayment}>
                    {isSubmittingPayment ? "Submitting..." : "Submit Payment Reference"}
                  </Button>
                </form>
              </>
            )}

            {requestResult.requires_payment && requestResult.invoice && !isManualBillingFallbackEnabled && (
              <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                Manual payment fallback is disabled. Use the Stripe card checkout button above for this plan.
              </div>
            )}
          </section>
        )}

        {submitResult && (
          <section className="rounded-xl border border-success/35 bg-success/10 p-6 text-success">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5" size={20} />
              <div>
                <p className="font-semibold">Payment Submitted</p>
                <p className="text-sm mt-1">{submitResult.message}</p>
                <p className="text-sm mt-2">Invoice: {submitResult.invoice_number}</p>
                <p className="text-sm">Payment ID: {submitResult.payment_id}</p>
                <p className="text-sm">Status: {submitResult.payment_status}</p>
              </div>
            </div>
          </section>
        )}

      </div>
    </main>
  );
}
