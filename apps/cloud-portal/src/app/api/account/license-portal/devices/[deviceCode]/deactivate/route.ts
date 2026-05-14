import { NextRequest, NextResponse } from "next/server";
import { forwardAccountRequest } from "../../../../_proxy";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: {
    deviceCode: string;
  };
};

export async function POST(request: NextRequest, context: RouteParams) {
  const deviceCode = context.params.deviceCode?.trim();
  if (!deviceCode) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "deviceCode is required.",
        },
      },
      { status: 400 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  return forwardAccountRequest({
    request,
    backendPath: `/api/license/account/licenses/devices/${encodeURIComponent(deviceCode)}/deactivate`,
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}
