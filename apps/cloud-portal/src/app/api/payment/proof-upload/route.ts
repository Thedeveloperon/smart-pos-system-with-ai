import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  void request;
  return NextResponse.json(
    {
      error: {
        code: "PAYMENT_PROOF_UPLOAD_DISABLED",
        message: "Payment slip uploads are disabled. Submit manual payments with reference number only.",
      },
    },
    { status: 410 },
  );
}
