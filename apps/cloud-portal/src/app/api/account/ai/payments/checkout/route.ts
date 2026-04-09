import { NextRequest, NextResponse } from "next/server";
import { forwardAccountRequest } from "../../../_proxy";

export const dynamic = "force-dynamic";

type CheckoutPayload = {
  pack_code: string;
  payment_method?: "card" | "cash" | "bank_deposit";
  bank_reference?: string;
  idempotency_key?: string;
};

function toInvalidResponse(message: string) {
  return NextResponse.json(
    {
      error: {
        code: "INVALID_REQUEST",
        message,
      },
    },
    { status: 400 },
  );
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validateCheckoutPayload(payload: unknown): CheckoutPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const candidate = payload as Record<string, unknown>;
  const packCode = normalizeOptionalString(candidate.pack_code);
  if (!packCode) {
    throw new Error("pack_code is required.");
  }

  const paymentMethodRaw = normalizeOptionalString(candidate.payment_method).toLowerCase();
  const paymentMethod = paymentMethodRaw
    ? (paymentMethodRaw as CheckoutPayload["payment_method"])
    : "card";
  if (!["card", "cash", "bank_deposit"].includes(paymentMethod)) {
    throw new Error("payment_method must be one of: card, cash, bank_deposit.");
  }

  const bankReference = normalizeOptionalString(candidate.bank_reference);
  const idempotencyKey = normalizeOptionalString(candidate.idempotency_key);
  if (bankReference.length > 160) {
    throw new Error("bank_reference must be 160 characters or less.");
  }

  if (paymentMethod === "cash" && !bankReference) {
    throw new Error("bank_reference is required for cash payments.");
  }

  if (paymentMethod === "bank_deposit") {
    if (!bankReference) {
      throw new Error("bank_reference is required for bank_deposit payments.");
    }
  }

  const requestPayload: CheckoutPayload = {
    pack_code: packCode,
    payment_method: paymentMethod,
  };

  if (bankReference) {
    requestPayload.bank_reference = bankReference;
  }

  if (idempotencyKey) {
    requestPayload.idempotency_key = idempotencyKey;
  }

  return requestPayload;
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return toInvalidResponse("Request body must be valid JSON.");
  }

  let validatedPayload: CheckoutPayload;
  try {
    validatedPayload = validateCheckoutPayload(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request body is invalid.";
    return toInvalidResponse(message);
  }

  return forwardAccountRequest({
    request,
    backendPath: "/api/ai/payments/checkout",
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify(validatedPayload),
  });
}
