import { NextRequest, NextResponse } from "next/server";

const DEFAULT_BACKEND_API_URL = "http://127.0.0.1:5080";

function resolveBackendApiUrl() {
  const configured = process.env.SMARTPOS_BACKEND_API_URL?.trim();
  return configured || DEFAULT_BACKEND_API_URL;
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Request body must be valid JSON.",
        },
      },
      { status: 400 },
    );
  }

  const backendResponse = await fetch(`${resolveBackendApiUrl()}/api/license/public/payment-submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": request.headers.get("Idempotency-Key")?.trim() || crypto.randomUUID(),
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const contentType = backendResponse.headers.get("content-type") || "application/json";
  const bodyText = await backendResponse.text();
  return new NextResponse(bodyText, {
    status: backendResponse.status,
    headers: {
      "Content-Type": contentType,
    },
  });
}
