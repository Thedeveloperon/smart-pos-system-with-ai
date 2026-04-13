import { NextRequest } from "next/server";
import { forwardAccountRequest } from "../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search")?.trim();
  const takeParam = request.nextUrl.searchParams.get("take")?.trim();
  const parsedTake = Number(takeParam);
  const normalizedTake = Number.isFinite(parsedTake)
    ? Math.max(1, Math.min(300, Math.trunc(parsedTake)))
    : 100;

  const query = new URLSearchParams();
  query.set("take", normalizedTake.toString());
  if (search) {
    query.set("search", search);
  }

  return forwardAccountRequest({
    request,
    backendPath: `/api/account/products?${query.toString()}`,
    method: "GET",
    includeIdempotencyKey: false,
  });
}
