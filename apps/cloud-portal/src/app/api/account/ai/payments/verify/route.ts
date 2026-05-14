import { NextRequest, NextResponse } from "next/server";
import { forwardAccountRequest } from "../../../_proxy";

export const dynamic = "force-dynamic";

type VerifyPayload = {
  payment_id?: string;
  external_reference?: string;
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

function validateVerifyPayload(payload: unknown): VerifyPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const candidate = payload as Record<string, unknown>;
  const paymentId = normalizeOptionalString(candidate.payment_id);
  const externalReference = normalizeOptionalString(candidate.external_reference);

  if (!paymentId && !externalReference) {
    throw new Error("Either payment_id or external_reference is required.");
  }

  const requestPayload: VerifyPayload = {};
  if (paymentId) {
    requestPayload.payment_id = paymentId;
  }

  if (externalReference) {
    requestPayload.external_reference = externalReference;
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

  let validatedPayload: VerifyPayload;
  try {
    validatedPayload = validateVerifyPayload(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request body is invalid.";
    return toInvalidResponse(message);
  }

  return forwardAccountRequest({
    request,
    backendPath: "/api/ai/payments/verify",
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify(validatedPayload),
  });
}
