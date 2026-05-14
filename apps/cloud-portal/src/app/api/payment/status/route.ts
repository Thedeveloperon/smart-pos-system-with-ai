import { NextRequest, NextResponse } from "next/server";
import { forwardPaymentGetRequest } from "../_proxy";

export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("order_id")?.trim();
  const invoiceNumber = request.nextUrl.searchParams.get("invoice_number")?.trim();

  if (!orderId && !invoiceNumber) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Either order_id or invoice_number is required.",
        },
      },
      { status: 400 },
    );
  }

  const params = new URLSearchParams();
  if (orderId) {
    params.set("order_id", orderId);
  }

  if (invoiceNumber) {
    params.set("invoice_number", invoiceNumber);
  }

  return forwardPaymentGetRequest({
    request,
    backendPath: `/api/license/public/ai-credit-order-status?${params.toString()}`,
  });
}
