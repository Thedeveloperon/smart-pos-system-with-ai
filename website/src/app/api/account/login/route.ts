import { NextRequest, NextResponse } from "next/server";
import { forwardAccountRequest } from "../_proxy";

export const dynamic = "force-dynamic";

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

  return forwardAccountRequest({
    request,
    backendPath: "/api/auth/login",
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify(payload),
    includeIdempotencyKey: false,
  });
}
