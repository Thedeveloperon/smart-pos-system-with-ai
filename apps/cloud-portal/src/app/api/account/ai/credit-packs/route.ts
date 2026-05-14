import { NextRequest } from "next/server";
import { forwardAccountRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return forwardAccountRequest({
    request,
    backendPath: "/api/ai/credit-packs",
    method: "GET",
    includeIdempotencyKey: false,
  });
}
