import { NextRequest } from "next/server";
import { forwardUpstreamRequest } from "../../../_upstreamProxy";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: {
    requestId: string;
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  return forwardUpstreamRequest({
    request,
    backendPath: `/api/cloud/register/${encodeURIComponent(params.requestId)}${request.nextUrl.search}`,
    serviceName: "Cloud registration service",
    includeIdempotencyKey: false,
  });
}
