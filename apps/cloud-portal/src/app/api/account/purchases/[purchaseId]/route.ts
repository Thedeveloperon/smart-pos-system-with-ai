import { NextRequest } from "next/server";
import { forwardAccountRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: {
    purchaseId: string;
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  return forwardAccountRequest({
    request,
    backendPath: `/api/account/purchases/${encodeURIComponent(params.purchaseId)}`,
    method: "GET",
    includeIdempotencyKey: false,
  });
}
