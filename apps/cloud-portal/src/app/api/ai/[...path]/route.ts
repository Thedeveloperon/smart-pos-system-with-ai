import { NextRequest } from "next/server";
import { forwardUpstreamRequest } from "../../_upstreamProxy";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: {
    path?: string[];
  };
};

async function handle(request: NextRequest, { params }: RouteParams) {
  const path = (params.path || []).join("/");
  const query = request.nextUrl.search || "";

  return forwardUpstreamRequest({
    request,
    backendPath: `/api/ai/${path}${query}`,
    serviceName: "AI billing service",
  });
}

export async function GET(request: NextRequest, context: RouteParams) {
  return handle(request, context);
}

export async function POST(request: NextRequest, context: RouteParams) {
  return handle(request, context);
}
