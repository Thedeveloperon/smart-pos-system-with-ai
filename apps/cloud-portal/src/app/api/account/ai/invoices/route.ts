import { NextRequest, NextResponse } from "next/server";
import { forwardAccountRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

type OwnerAiInvoiceCreatePayload = {
  pack_code: string;
  note?: string;
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

function validateCreatePayload(payload: unknown): OwnerAiInvoiceCreatePayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const candidate = payload as Record<string, unknown>;
  const packCode = normalizeOptionalString(candidate.pack_code);
  if (!packCode) {
    throw new Error("pack_code is required.");
  }

  const note = normalizeOptionalString(candidate.note);
  if (note.length > 1000) {
    throw new Error("note must be 1000 characters or less.");
  }

  const requestPayload: OwnerAiInvoiceCreatePayload = {
    pack_code: packCode,
  };
  if (note) {
    requestPayload.note = note;
  }

  return requestPayload;
}

export async function GET(request: NextRequest) {
  const takeParam = request.nextUrl.searchParams.get("take")?.trim();
  const parsedTake = Number(takeParam);
  const normalizedTake = Number.isFinite(parsedTake)
    ? Math.max(1, Math.min(200, Math.trunc(parsedTake)))
    : 40;

  return forwardAccountRequest({
    request,
    backendPath: `/api/license/account/ai-credit-invoices?take=${normalizedTake}`,
    method: "GET",
    includeIdempotencyKey: false,
  });
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return toInvalidResponse("Request body must be valid JSON.");
  }

  let validatedPayload: OwnerAiInvoiceCreatePayload;
  try {
    validatedPayload = validateCreatePayload(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request body is invalid.";
    return toInvalidResponse(message);
  }

  return forwardAccountRequest({
    request,
    backendPath: "/api/license/account/ai-credit-invoices",
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify(validatedPayload),
  });
}
