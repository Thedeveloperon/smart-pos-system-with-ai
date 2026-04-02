import { NextRequest, NextResponse } from "next/server";

const DEFAULT_BACKEND_API_URL = "http://127.0.0.1:5080";

function resolveBackendApiUrl() {
  const configured = process.env.SMARTPOS_BACKEND_API_URL?.trim();
  return configured || DEFAULT_BACKEND_API_URL;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const backendResponse = await fetch(`${resolveBackendApiUrl()}/api/license/public/payment-proof-upload`, {
    method: "POST",
    headers: {
      "Idempotency-Key": request.headers.get("Idempotency-Key")?.trim() || crypto.randomUUID(),
    },
    body: formData,
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
