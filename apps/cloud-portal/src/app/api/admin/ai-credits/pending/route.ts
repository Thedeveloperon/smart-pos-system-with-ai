import { NextRequest } from "next/server";
import { forwardUpstreamRequest } from "../../../../_upstreamProxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const takeParam = request.nextUrl.searchParams.get("take")?.trim();
  const parsedTake = Number(takeParam);
  const normalizedTake = Number.isFinite(parsedTake)
    ? Math.max(1, Math.min(200, Math.trunc(parsedTake)))
    : 80;

  return forwardUpstreamRequest({
    request,
    backendPath: `/api/ai/payments/pending-manual?take=${normalizedTake}`,
    serviceName: "AI credit admin",
  });
}
