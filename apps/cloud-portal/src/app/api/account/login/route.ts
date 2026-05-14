import { NextRequest, NextResponse } from "next/server";
import { forwardAccountRequest } from "../_proxy";

export const dynamic = "force-dynamic";

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getNestedString(
  source: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const parts = key.split(".");
    let current: unknown = source;
    for (const part of parts) {
      if (!current || typeof current !== "object" || !(part in (current as Record<string, unknown>))) {
        current = null;
        break;
      }

      current = (current as Record<string, unknown>)[part];
    }

    const normalized = pickString(current);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function buildSyntheticAuthCookies(payload: Record<string, unknown>) {
  const token =
    getNestedString(payload, [
      "smartpos_auth",
      "auth_token",
      "token",
      "access_token",
      "session.token",
      "session.access_token",
      "data.token",
    ]) ?? null;
  if (!token) {
    return [] as string[];
  }

  const secure = process.env.NODE_ENV === "production";
  const cookieSuffix = `Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
  const cookies = [`smartpos_auth=${encodeURIComponent(token)}; ${cookieSuffix}`];

  const userId =
    getNestedString(payload, ["user_id", "user.id", "profile.id", "id"]) ?? null;
  if (userId) {
    cookies.push(`smartpos_user_id=${encodeURIComponent(userId)}; ${cookieSuffix}`);
  }

  return cookies;
}

async function attachSyntheticCookiesIfNeeded(response: Response) {
  const setCookie = response.headers.get("set-cookie");
  if (setCookie || !response.ok) {
    return response;
  }

  const bodyText = await response.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    const candidate = JSON.parse(bodyText) as unknown;
    parsed = candidate && typeof candidate === "object" ? (candidate as Record<string, unknown>) : null;
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return new NextResponse(bodyText, {
      status: response.status,
      headers: response.headers,
    });
  }

  const cookies = buildSyntheticAuthCookies(parsed);
  if (cookies.length === 0) {
    return new NextResponse(bodyText, {
      status: response.status,
      headers: response.headers,
    });
  }

  const headers = new Headers(response.headers);
  for (const cookie of cookies) {
    headers.append("Set-Cookie", cookie);
  }

  return new NextResponse(bodyText, {
    status: response.status,
    headers,
  });
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Request body must be valid JSON.",
        },
      },
      { status: 400 },
    );
  }

  const source = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const normalizedPayload = {
    username: typeof source.username === "string" ? source.username : "",
    password: typeof source.password === "string" ? source.password : "",
    mfa_code: typeof source.mfa_code === "string" ? source.mfa_code : undefined,
  };

  const body = JSON.stringify(normalizedPayload);
  const candidatePaths = ["/api/account/login", "/api/auth/login", "/auth/json-login"] as const;
  for (const backendPath of candidatePaths) {
    const upstreamResponse = await forwardAccountRequest({
      request,
      backendPath,
      method: "POST",
      contentType: "application/json",
      body,
      includeIdempotencyKey: false,
    });

    if (upstreamResponse.status === 404 || upstreamResponse.status === 405) {
      continue;
    }

    if (backendPath === "/auth/json-login") {
      return attachSyntheticCookiesIfNeeded(upstreamResponse);
    }

    return upstreamResponse;
  }

  return NextResponse.json(
    {
      error: {
        code: "LOGIN_ENDPOINT_UNAVAILABLE",
        message:
          "Configured backend does not expose a supported login endpoint. Expected '/api/auth/login', '/api/account/login', or '/auth/json-login'.",
      },
    },
    { status: 502 },
  );
}
