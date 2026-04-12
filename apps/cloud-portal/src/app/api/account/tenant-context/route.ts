import { NextRequest } from "next/server";
import { forwardAccountRequest } from "../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return forwardAccountRequest({
    request,
    backendPath: "/api/account/tenant-context",
    method: "GET",
    includeIdempotencyKey: false,
  });
}
