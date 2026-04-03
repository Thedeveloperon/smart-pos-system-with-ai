import { NextRequest, NextResponse } from "next/server";
import { forwardPaymentRequest } from "../_proxy";

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Request body must be valid multipart/form-data.",
        },
      },
      { status: 400 },
    );
  }

  return forwardPaymentRequest({
    request,
    backendPath: "/api/license/public/payment-proof-upload",
    body: formData,
  });
}
