import { NextRequest, NextResponse } from "next/server";
import { forwardUpstreamRequest } from "../../../../_upstreamProxy";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: {
    invoiceId: string;
  };
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

export async function POST(request: NextRequest, context: RouteParams) {
  const invoiceId = context.params.invoiceId?.trim();
  if (!invoiceId) {
    return toInvalidResponse("invoiceId is required.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return toInvalidResponse("Request body must be valid JSON.");
  }

  if (!payload || typeof payload !== "object") {
    return toInvalidResponse("Request body must be a JSON object.");
  }

  const candidate = payload as Record<string, unknown>;
  const actorNote = typeof candidate.actor_note === "string"
    ? candidate.actor_note.trim()
    : "";
  if (!actorNote) {
    return toInvalidResponse("actor_note is required.");
  }

  const syntheticRequest = new NextRequest(request.url, {
    method: "POST",
    headers: (() => {
      const headers = new Headers(request.headers);
      headers.set("content-type", "application/json");
      return headers;
    })(),
    body: JSON.stringify({ actor_note: actorNote }),
  });

  return forwardUpstreamRequest({
    request: syntheticRequest,
    backendPath: `/api/admin/licensing/ai-credit-invoices/${encodeURIComponent(invoiceId)}/approve`,
    serviceName: "AI credit invoice admin",
  });
}
