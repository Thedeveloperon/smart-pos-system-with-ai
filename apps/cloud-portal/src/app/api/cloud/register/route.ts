import { NextRequest } from "next/server";
import { forwardUpstreamRequest } from "../../_upstreamProxy";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return forwardUpstreamRequest({
    request,
    backendPath: "/api/cloud/register",
    serviceName: "Cloud registration service",
  });
}
