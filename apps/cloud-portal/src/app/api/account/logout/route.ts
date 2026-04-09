import { NextRequest } from "next/server";
import { forwardAccountRequest } from "../_proxy";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return forwardAccountRequest({
    request,
    backendPath: "/api/auth/logout",
    method: "POST",
    includeIdempotencyKey: false,
  });
}
