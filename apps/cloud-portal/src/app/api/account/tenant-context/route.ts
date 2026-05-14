import { NextRequest, NextResponse } from "next/server";
import { forwardAccountRequest } from "../_proxy";

export const dynamic = "force-dynamic";

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function pickObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function resolveTenantPayload(payload: Record<string, unknown>) {
  const candidateObjects = [payload, pickObject(payload.user), pickObject(payload.profile)].filter(
    (item): item is Record<string, unknown> => item !== null,
  );

  for (const item of candidateObjects) {
    const shopCode =
      pickString(item.shop_code) ??
      pickString(item.shopCode) ??
      pickString(item.store_code) ??
      pickString(item.storeCode);
    if (!shopCode) {
      continue;
    }

    const shopId =
      pickString(item.shop_id) ??
      pickString(item.shopId) ??
      "00000000-0000-0000-0000-000000000000";
    const username =
      pickString(item.username) ??
      pickString(item.user_name) ??
      pickString(item.email) ??
      "";
    const fullName =
      pickString(item.full_name) ??
      pickString(item.fullName) ??
      pickString(item.name) ??
      "";
    const role = pickString(item.role) ?? "";

    return {
      shop_id: shopId,
      shop_code: shopCode,
      username,
      full_name: fullName,
      role,
    };
  }

  return null;
}

async function mapTenantResponseOrNull(response: Response) {
  if (!response.ok) {
    return null;
  }

  const bodyText = await response.clone().text();
  let parsed: Record<string, unknown> | null = null;
  try {
    const candidate = JSON.parse(bodyText) as unknown;
    parsed = pickObject(candidate);
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return null;
  }

  return resolveTenantPayload(parsed);
}

export async function GET(request: NextRequest) {
  const primary = await forwardAccountRequest({
    request,
    backendPath: "/api/account/tenant-context",
    method: "GET",
    includeIdempotencyKey: false,
  });
  if (primary.status !== 404 && primary.status !== 405) {
    return primary;
  }

  const licensePortalFallback = await forwardAccountRequest({
    request,
    backendPath: "/api/license/account/licenses",
    method: "GET",
    includeIdempotencyKey: false,
  });
  const mappedLicenseTenant = await mapTenantResponseOrNull(licensePortalFallback);
  if (mappedLicenseTenant) {
    return NextResponse.json(mappedLicenseTenant, { status: 200 });
  }

  if (licensePortalFallback.status !== 404 && licensePortalFallback.status !== 405) {
    return licensePortalFallback;
  }

  const userId = request.cookies.get("smartpos_user_id")?.value?.trim();
  if (!userId) {
    return primary;
  }

  const profileFallback = await forwardAccountRequest({
    request,
    backendPath: "/users/me",
    method: "GET",
    includeIdempotencyKey: false,
    extraHeaders: {
      "x-user-id": userId,
    },
  });
  const mappedProfileTenant = await mapTenantResponseOrNull(profileFallback);
  if (mappedProfileTenant) {
    return NextResponse.json(mappedProfileTenant, { status: 200 });
  }

  return profileFallback.status === 404 || profileFallback.status === 405 ? primary : profileFallback;
}
