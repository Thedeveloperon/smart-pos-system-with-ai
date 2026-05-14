import { NextRequest } from "next/server";
import { forwardUpstreamRequest } from "../_upstreamProxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.search || "";

  return forwardUpstreamRequest({
    request,
    backendPath: `/api/cash-sessions${query}`,
    serviceName: "Cash session service",
    includeIdempotencyKey: false,
  });
}
