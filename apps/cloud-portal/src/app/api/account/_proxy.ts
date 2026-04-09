import { NextRequest, NextResponse } from "next/server";

const DEFAULT_BACKEND_API_URL = "http://127.0.0.1:5080";

type ForwardAccountRequestOptions = {
  request: NextRequest;
  backendPath: string;
  method: "GET" | "POST";
  body?: BodyInit | null;
  contentType?: string;
  includeIdempotencyKey?: boolean;
};

function resolveBackendApiUrl() {
  const configured = process.env.SMARTPOS_BACKEND_API_URL?.trim();
  return (configured || DEFAULT_BACKEND_API_URL).replace(/\/+$/, "");
}

function resolveIdempotencyKey(request: NextRequest) {
  return request.headers.get("Idempotency-Key")?.trim() || crypto.randomUUID();
}

function isDefaultBackendUrlInProduction(backendApiUrl: string) {
  return process.env.NODE_ENV === "production" && backendApiUrl === DEFAULT_BACKEND_API_URL;
}

function toErrorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

function getUpstreamErrorMessage(bodyText: string) {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("<")) {
    return "Account service returned a non-JSON error response.";
  }

  return trimmed.length > 240 ? `${trimmed.slice(0, 237)}...` : trimmed;
}

export async function forwardAccountRequest(options: ForwardAccountRequestOptions) {
  const backendApiUrl = resolveBackendApiUrl();
  const backendUrl = `${backendApiUrl}${options.backendPath}`;

  try {
    const headers = new Headers();
    const incomingCookie = options.request.headers.get("cookie");
    if (incomingCookie) {
      headers.set("cookie", incomingCookie);
    }

    const incomingAuthorization = options.request.headers.get("authorization");
    if (incomingAuthorization) {
      headers.set("authorization", incomingAuthorization);
    }

    if (options.contentType) {
      headers.set("content-type", options.contentType);
    }

    if (options.includeIdempotencyKey ?? options.method !== "GET") {
      headers.set("Idempotency-Key", resolveIdempotencyKey(options.request));
    }

    const backendResponse = await fetch(backendUrl, {
      method: options.method,
      headers,
      body: options.body ?? null,
      cache: "no-store",
      redirect: "manual",
    });

    const contentType = backendResponse.headers.get("content-type") || "application/json";
    const setCookie = backendResponse.headers.get("set-cookie");
    const bodyText = await backendResponse.text();

    if (!bodyText.trim()) {
      if (backendResponse.ok) {
        return toErrorResponse(
          502,
          "UPSTREAM_EMPTY_RESPONSE",
          "Account service returned an empty response.",
        );
      }

      return toErrorResponse(
        backendResponse.status,
        "UPSTREAM_EMPTY_RESPONSE",
        "Account service returned an empty error response.",
      );
    }

    if (!backendResponse.ok && !contentType.toLowerCase().includes("application/json")) {
      const errorMessage = getUpstreamErrorMessage(bodyText) || "Account service request failed.";
      return toErrorResponse(backendResponse.status, "UPSTREAM_ERROR", errorMessage);
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", contentType);
    if (setCookie) {
      responseHeaders.set("Set-Cookie", setCookie);
    }

    return new NextResponse(bodyText, {
      status: backendResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Account proxy upstream request failed.", {
      backendUrl,
      error: error instanceof Error ? error.message : String(error),
    });

    const configHint = isDefaultBackendUrlInProduction(backendApiUrl)
      ? " Set SMARTPOS_BACKEND_API_URL on the website service."
      : "";
    return toErrorResponse(
      502,
      "UPSTREAM_UNREACHABLE",
      `Unable to reach account service.${configHint}`,
    );
  }
}
