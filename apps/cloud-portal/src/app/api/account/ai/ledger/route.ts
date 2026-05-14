import { NextRequest } from "next/server";
import { forwardAccountRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const takeParam = request.nextUrl.searchParams.get("take")?.trim();
  const parsedTake = Number(takeParam);
  const normalizedTake = Number.isFinite(parsedTake)
    ? Math.max(1, Math.min(200, Math.trunc(parsedTake)))
    : 50;

  return forwardAccountRequest({
    request,
    backendPath: `/api/account/ai/ledger?take=${normalizedTake}`,
    method: "GET",
    includeIdempotencyKey: false,
  });
}
