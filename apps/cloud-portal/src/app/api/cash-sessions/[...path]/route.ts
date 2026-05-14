import { NextRequest } from "next/server";
import { forwardUpstreamRequest } from "../../_upstreamProxy";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: {
    path?: string[];
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const path = (params.path || []).join("/");
  const query = request.nextUrl.search || "";
  const suffix = path ? `/${path}` : "";

  return forwardUpstreamRequest({
    request,
    backendPath: `/api/cash-sessions${suffix}${query}`,
    serviceName: "Cash session service",
    includeIdempotencyKey: false,
  });
}
