import { NextRequest, NextResponse } from "next/server";
import { forwardPaymentRequest } from "../_proxy";

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

  return forwardPaymentRequest({
    request,
    backendPath: "/api/license/public/payment-request",
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}
