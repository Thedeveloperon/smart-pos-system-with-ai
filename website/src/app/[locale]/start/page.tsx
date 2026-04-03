"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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

type PaymentProofUploadResponse = {
  uploaded_at: string;
  proof_url: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  scan_status: string;
  scan_message?: string | null;
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

export default function StartPage() {
  const { locale } = useI18n();

  const [planCode, setPlanCode] = useState<PlanCode>("starter");
  const [shopName, setShopName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank_deposit");

  const [requestResult, setRequestResult] = useState<PaymentRequestResponse | null>(null);
  const [submitResult, setSubmitResult] = useState<PaymentSubmitResponse | null>(null);
  const [amountPaid, setAmountPaid] = useState("0");
  const [bankReference, setBankReference] = useState("");
  const [slipUrl, setSlipUrl] = useState("");
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [paymentNotes, setPaymentNotes] = useState("");

  const [requestError, setRequestError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [isUploadingProof, setIsUploadingProof] = useState(false);

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

  const handleRequestCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRequestError(null);
    setSubmitError(null);
    setSubmitResult(null);
    setIsSubmittingRequest(true);

    try {
      if (!contactEmail.trim() && !contactPhone.trim()) {
        throw new Error("Provide at least an email or phone number.");
      }

      const response = await fetch("/api/payment/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          shop_name: shopName,
          contact_name: contactName,
          contact_email: contactEmail || undefined,
          contact_phone: contactPhone || undefined,
          plan_code: planCode,
          payment_method: paymentMethod,
          locale,
          source: "website_pricing",
          notes: notes || undefined,
        }),
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

      let resolvedDepositSlipUrl = slipUrl.trim() || undefined;
      if (paymentProofFile) {
        setIsUploadingProof(true);
        try {
          const uploadFormData = new FormData();
          uploadFormData.append("file", paymentProofFile);
          const uploadResponse = await fetch("/api/payment/proof-upload", {
            method: "POST",
            headers: {
              "Idempotency-Key": crypto.randomUUID(),
            },
            body: uploadFormData,
          });

          const uploadPayload = await parseApiPayload(uploadResponse);
          if (!uploadResponse.ok) {
            throw new Error(parseErrorMessage(uploadPayload));
          }

          const uploaded = requireObjectPayload<PaymentProofUploadResponse>(
            uploadPayload,
            "Payment proof upload returned an empty response. Please try again.",
          );
          resolvedDepositSlipUrl = uploaded.proof_url;
          setSlipUrl(uploaded.proof_url);
          trackMarketingEvent("marketing_payment_proof_uploaded", {
            locale,
            scan_status: uploaded.scan_status,
            proof_url: uploaded.proof_url,
          });
        } finally {
          setIsUploadingProof(false);
        }
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
          bank_reference: bankReference || undefined,
          deposit_slip_url: resolvedDepositSlipUrl,
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
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <Link
          href={`/${locale}#pricing`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Pricing
        </Link>

        <section className="glass-card p-6 md:p-8">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Start SmartPOS</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Submit your shop details to generate a payment reference. After payment, submit proof for verification and license access.
          </p>

          <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleRequestCreate}>
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Plan</span>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
              <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Shop Name</span>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={shopName}
                onChange={(event) => setShopName(event.target.value)}
                placeholder="Nelu Grocery"
                required
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Contact Name</span>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                placeholder="Owner name"
                required
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Payment Method</span>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
              >
                <option value="bank_deposit">Bank Deposit</option>
                <option value="cash">Cash</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Email (optional)</span>
              <input
                type="email"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                placeholder="owner@shop.lk"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Phone (optional)</span>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                placeholder="+94..."
              />
            </label>

            <label className="space-y-1 md:col-span-2">
              <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Notes (optional)</span>
              <textarea
                className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Any billing details..."
              />
            </label>

            {requestError && <p className="text-sm text-destructive md:col-span-2">{requestError}</p>}

            <div className="md:col-span-2">
              <Button type="submit" variant="hero" disabled={isSubmittingRequest}>
                {isSubmittingRequest ? "Creating..." : "Create Payment Request"}
              </Button>
            </div>
          </form>
        </section>

        {requestResult && (
          <section className="glass-card p-6 md:p-8 space-y-4">
            <h2 className="text-xl font-semibold">Request Created</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Shop</p>
                <p className="mt-1 text-sm font-semibold">{requestResult.shop_name}</p>
                <p className="text-xs text-muted-foreground">{requestResult.shop_code}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Plan Mapping</p>
                <p className="mt-1 text-sm font-semibold">
                  {requestResult.marketing_plan_code} {"->"} {requestResult.internal_plan_code}
                </p>
              </div>
            </div>

            {!requestResult.requires_payment && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                {requestResult.instructions.message}
              </div>
            )}

            {requestResult.requires_payment && requestResult.invoice && (
              <>
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Invoice</p>
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
                      <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Amount Paid</span>
                      <input
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={amountPaid}
                        onChange={(event) => setAmountPaid(event.target.value)}
                        required
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Bank Reference</span>
                      <input
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={bankReference}
                        onChange={(event) => setBankReference(event.target.value)}
                        placeholder="Deposit/transfer reference"
                      />
                    </label>
                  </div>
                  <label className="space-y-1">
                    <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Slip URL (optional)</span>
                    <input
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={slipUrl}
                      onChange={(event) => setSlipUrl(event.target.value)}
                      placeholder="https://..."
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Upload Slip (optional)</span>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-primary"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setPaymentProofFile(file);
                      }}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Notes (optional)</span>
                    <textarea
                      className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={paymentNotes}
                      onChange={(event) => setPaymentNotes(event.target.value)}
                    />
                  </label>

                  {submitError && <p className="text-sm text-destructive">{submitError}</p>}
                  {isUploadingProof && (
                    <p className="text-sm text-muted-foreground">Uploading and scanning proof...</p>
                  )}

                  <Button type="submit" variant="hero" disabled={isSubmittingPayment || isUploadingProof}>
                    {isSubmittingPayment ? "Submitting..." : isUploadingProof ? "Uploading Proof..." : "Submit Payment Proof"}
                  </Button>
                </form>
              </>
            )}
          </section>
        )}

        {submitResult && (
          <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-emerald-100">
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
