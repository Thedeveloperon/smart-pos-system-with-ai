import { NextRequest, NextResponse } from "next/server";
import { forwardPaymentRequest } from "../../payment/_proxy";

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

  return forwardPaymentRequest({
    request,
    backendPath: "/api/license/public/download-track",
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}
