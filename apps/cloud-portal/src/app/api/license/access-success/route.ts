import { NextRequest, NextResponse } from "next/server";
import { forwardPaymentGetRequest } from "../../payment/_proxy";

export async function GET(request: NextRequest) {
  const activationEntitlementKey = request.nextUrl.searchParams.get("activation_entitlement_key")?.trim();
  if (!activationEntitlementKey) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "activation_entitlement_key is required.",
        },
      },
      { status: 400 },
    );
  }

  const params = new URLSearchParams();
  params.set("activation_entitlement_key", activationEntitlementKey);

  return forwardPaymentGetRequest({
    request,
    backendPath: `/api/license/access/success?${params.toString()}`,
  });
}
