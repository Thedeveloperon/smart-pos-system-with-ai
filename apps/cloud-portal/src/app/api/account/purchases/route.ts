import { NextRequest, NextResponse } from "next/server";
import { forwardAccountRequest } from "../_proxy";

export const dynamic = "force-dynamic";

type CloudPurchaseCreatePayload = {
  items: Array<{
    product_code: string;
    quantity?: number;
  }>;
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

function validateCreatePayload(payload: unknown): CloudPurchaseCreatePayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const candidate = payload as Record<string, unknown>;
  const rawItems = Array.isArray(candidate.items) ? candidate.items : [];
  if (rawItems.length === 0) {
    throw new Error("items must include at least one product.");
  }

  const items = rawItems.map((rawItem, index) => {
    if (!rawItem || typeof rawItem !== "object") {
      throw new Error(`items[${index}] must be an object.`);
    }

    const item = rawItem as Record<string, unknown>;
    const productCode = normalizeOptionalString(item.product_code);
    if (!productCode) {
      throw new Error(`items[${index}].product_code is required.`);
    }

    const quantityRaw = item.quantity;
    const quantityParsed = Number(quantityRaw);
    const quantity = Number.isFinite(quantityParsed) ? Math.trunc(quantityParsed) : 1;
    if (quantity < 1 || quantity > 100000) {
      throw new Error(`items[${index}].quantity must be between 1 and 100000.`);
    }

    return {
      product_code: productCode,
      quantity,
    };
  });

  const note = normalizeOptionalString(candidate.note);
  if (note.length > 1000) {
    throw new Error("note must be 1000 characters or less.");
  }

  const requestPayload: CloudPurchaseCreatePayload = { items };
  if (note) {
    requestPayload.note = note;
  }

  return requestPayload;
}

export async function GET(request: NextRequest) {
  const takeParam = request.nextUrl.searchParams.get("take")?.trim();
  const parsedTake = Number(takeParam);
  const normalizedTake = Number.isFinite(parsedTake)
    ? Math.max(1, Math.min(300, Math.trunc(parsedTake)))
    : 80;

  return forwardAccountRequest({
    request,
    backendPath: `/api/account/purchases?take=${normalizedTake}`,
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

  let validatedPayload: CloudPurchaseCreatePayload;
  try {
    validatedPayload = validateCreatePayload(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request body is invalid.";
    return toInvalidResponse(message);
  }

  return forwardAccountRequest({
    request,
    backendPath: "/api/account/purchases",
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify(validatedPayload),
  });
}
