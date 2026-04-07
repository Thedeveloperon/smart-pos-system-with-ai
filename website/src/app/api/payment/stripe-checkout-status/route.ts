import { NextRequest, NextResponse } from "next/server";
import { forwardPaymentGetRequest } from "../_proxy";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id")?.trim();
  if (!sessionId) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "session_id is required.",
        },
      },
      { status: 400 },
    );
  }

  const params = new URLSearchParams();
  params.set("session_id", sessionId);

  return forwardPaymentGetRequest({
    request,
    backendPath: `/api/license/public/stripe/checkout-session-status?${params.toString()}`,
  });
}
