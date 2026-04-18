"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { PageShell, SectionCard, StatusChip } from "@/components/portal/layout-primitives";
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
  registration_status?: string | null;
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

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

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
  const [shopAddress, setShopAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank_deposit");
  const [ownerUsername, setOwnerUsername] = useState("");
  const [ownerFullName, setOwnerFullName] = useState("");
  const [ownerAddress, setOwnerAddress] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerConfirmPassword, setOwnerConfirmPassword] = useState("");

  const [requestResult, setRequestResult] = useState<PaymentRequestResponse | null>(null);
  const [submitResult, setSubmitResult] = useState<PaymentSubmitResponse | null>(null);
  const [amountPaid, setAmountPaid] = useState("0");
  const [bankReference, setBankReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const [requestError, setRequestError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

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

    trackMarketingEvent("marketing_onboarding_viewed", {
      locale,
      plan_code: selectedPlan,
    });
  }, [locale]);

  const buildMarketingRequestPayload = () => {
    if (!shopAddress.trim()) {
      throw new Error("Shop address is required.");
    }

    if (!contactEmail.trim()) {
      throw new Error("Shop contact email is required.");
    }

    const normalizedOwnerUsername = ownerUsername.trim().toLowerCase();
    if (!normalizedOwnerUsername) {
      throw new Error("Owner username is required.");
    }

    const normalizedOwnerPassword = ownerPassword.trim();
    if (normalizedOwnerPassword.length < 8) {
      throw new Error("Owner password must be at least 8 characters.");
    }
    if (ownerConfirmPassword.trim() !== normalizedOwnerPassword) {
      throw new Error("Confirm password must match owner password.");
    }

    if (!ownerAddress.trim()) {
      throw new Error("Owner address is required.");
    }

    if (!ownerEmail.trim()) {
      throw new Error("Owner email is required.");
    }

    return {
      shop_name: shopName,
      shop_address: shopAddress.trim(),
      shop_contact_name: contactName,
      shop_contact_email: contactEmail.trim(),
      shop_contact_phone: contactPhone || undefined,
      contact_name: contactName,
      contact_email: contactEmail.trim(),
      contact_phone: contactPhone || undefined,
      plan_code: planCode,
      payment_method: paymentMethod,
      locale,
      source: "cloud_registration_v1",
      notes: notes || undefined,
      owner_username: normalizedOwnerUsername,
      owner_full_name: ownerFullName.trim() || contactName,
      owner_address: ownerAddress.trim(),
      owner_email: ownerEmail.trim(),
      owner_phone: ownerPhone.trim() || undefined,
      owner_password: normalizedOwnerPassword,
      confirm_password: ownerConfirmPassword.trim(),
    };
  };

  const handleRequestCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <PageShell className="flex-1 !min-h-0 pt-24 pb-4 md:pt-28 md:pb-6">
        <div className="mx-auto w-full max-w-5xl space-y-6">

          <SectionCard className="portal-hero space-y-2">
            <p className="portal-kicker">Owner Onboarding</p>
            <h1 className="text-2xl font-bold text-foreground md:text-3xl">Start SmartPOS</h1>
            <p className="text-sm text-muted-foreground">
              Create your shop owner account, then continue with trial or complete payment for paid plans.
            </p>

          {planCode !== "starter" && (
            <div className="mt-4 rounded-xl border border-info/35 bg-info/10 p-3 text-sm text-info">
              This rollout supports bank transfer/cash manual onboarding for paid plans.
            </div>
          )}

          <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleRequestCreate}>
            <div className="rounded-xl border border-border/70 bg-surface-muted p-4 md:col-span-2">
              <div className="mb-3">
                <p className="portal-kicker">Plan & Payment Setup</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
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
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-surface-muted p-4 md:col-span-2">
              <div className="mb-3">
                <p className="portal-kicker">Shop & Contact Information</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
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
                <label className="space-y-1 md:col-span-2">
                  <span className="portal-kicker">Shop Address</span>
                  <input
                    className="field-shell"
                    value={shopAddress}
                    onChange={(event) => setShopAddress(event.target.value)}
                    placeholder="No. 12, Main Street, Colombo"
                    required
                  />
                </label>
                <label className="space-y-1">
                  <span className="portal-kicker">Shop Contact Name</span>
                  <input
                    className="field-shell"
                    value={contactName}
                    onChange={(event) => setContactName(event.target.value)}
                    placeholder="Owner name"
                    required
                  />
                </label>
                <label className="space-y-1">
                  <span className="portal-kicker">Shop Contact Email</span>
                  <input
                    type="email"
                    className="field-shell"
                    value={contactEmail}
                    onChange={(event) => setContactEmail(event.target.value)}
                    placeholder="owner@shop.lk"
                    required
                  />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="portal-kicker">Shop Contact Phone (optional)</span>
                  <input
                    className="field-shell"
                    value={contactPhone}
                    onChange={(event) => setContactPhone(event.target.value)}
                    placeholder="+94..."
                  />
                </label>
                <label className="space-y-1">
                  <span className="portal-kicker">Owner Full Name</span>
                  <input
                    className="field-shell"
                    value={ownerFullName}
                    onChange={(event) => setOwnerFullName(event.target.value)}
                    placeholder="Shop Owner"
                    required
                  />
                </label>
                <label className="space-y-1">
                  <span className="portal-kicker">Owner Email</span>
                  <input
                    type="email"
                    className="field-shell"
                    value={ownerEmail}
                    onChange={(event) => setOwnerEmail(event.target.value)}
                    placeholder="owner.personal@shop.lk"
                    required
                  />
                </label>
                <label className="space-y-1">
                  <span className="portal-kicker">Owner Phone (optional)</span>
                  <input
                    className="field-shell"
                    value={ownerPhone}
                    onChange={(event) => setOwnerPhone(event.target.value)}
                    placeholder="+94..."
                  />
                </label>
                <label className="space-y-1">
                  <span className="portal-kicker">Owner Address</span>
                  <input
                    className="field-shell"
                    value={ownerAddress}
                    onChange={(event) => setOwnerAddress(event.target.value)}
                    placeholder="Owner residence address"
                    required
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
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-surface-muted p-4 md:col-span-2">
              <div className="mb-3">
                <p className="portal-kicker">Owner Account Credentials</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
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
                <label className="space-y-1">
                  <span className="portal-kicker">Confirm Password</span>
                  <input
                    type="password"
                    className="field-shell"
                    value={ownerConfirmPassword}
                    onChange={(event) => setOwnerConfirmPassword(event.target.value)}
                    placeholder="Re-enter owner password"
                    required
                  />
                </label>
              </div>
            </div>

            {requestError && <p className="text-sm text-destructive md:col-span-2">{requestError}</p>}

            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
              <Button type="submit" variant="hero" disabled={isSubmittingRequest}>
                {isSubmittingRequest ? "Creating..." : planCode === "starter" ? "Continue With Starter Plan" : "Pay by Bank Transfer / Cash"}
              </Button>
            </div>
          </form>
        </SectionCard>

          {requestResult && (
            <SectionCard>
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
                  Status:{" "}
                  <StatusChip tone="info">
                    {toSentence(requestResult.registration_status || requestResult.owner_account_state || "pending_review")}
                  </StatusChip>
                </p>
              </div>

            {!requestResult.requires_payment && (
              <div className="rounded-xl border border-success/35 bg-success/10 p-4 text-sm text-success">
                {requestResult.instructions.message}
              </div>
            )}

            {requestResult.requires_payment && requestResult.invoice && (
              <>
                <div className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-2">
                  <p className="portal-kicker">Invoice</p>
                  <p className="text-sm">Invoice Number: <span className="font-semibold">{requestResult.invoice.invoice_number}</span></p>
                  <p className="text-sm">
                    Invoice Status:{" "}
                    <StatusChip tone="warning">{toSentence(requestResult.invoice.status)}</StatusChip>
                  </p>
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

            </SectionCard>
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
      </PageShell>
      <Footer />
    </div>
  );
}
