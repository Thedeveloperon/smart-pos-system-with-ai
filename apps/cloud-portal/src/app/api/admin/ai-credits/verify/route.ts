import { NextRequest, NextResponse } from "next/server";
import { forwardUpstreamRequest } from "../../../_upstreamProxy";

export const dynamic = "force-dynamic";

function toInvalidResponse(message: string) {
  return NextResponse.json(
    { error: { code: "INVALID_REQUEST", message } },
    { status: 400 },
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return toInvalidResponse("Request body must be valid JSON.");
  }

  if (!body || typeof body !== "object") {
    return toInvalidResponse("Request body must be a JSON object.");
  }

  const candidate = body as Record<string, unknown>;
  const paymentId =
    typeof candidate.payment_id === "string" ? candidate.payment_id.trim() : "";
  const externalReference =
    typeof candidate.external_reference === "string"
      ? candidate.external_reference.trim()
      : "";

  if (!paymentId && !externalReference) {
    return toInvalidResponse("Either payment_id or external_reference is required.");
  }

  const payload: Record<string, string> = {};
  if (paymentId) payload.payment_id = paymentId;
  if (externalReference) payload.external_reference = externalReference;

  // Construct a synthetic request so forwardUpstreamRequest reads our validated body.
  const syntheticRequest = new NextRequest(request.url, {
    method: "POST",
    headers: (() => {
      const headers = new Headers(request.headers);
      headers.set("content-type", "application/json");
      return headers;
    })(),
    body: JSON.stringify(payload),
  });

  return forwardUpstreamRequest({
    request: syntheticRequest,
    backendPath: "/api/ai/payments/verify",
    serviceName: "AI credit admin",
  });
}
