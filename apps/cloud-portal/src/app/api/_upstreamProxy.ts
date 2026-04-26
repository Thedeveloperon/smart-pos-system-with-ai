import { NextRequest, NextResponse } from "next/server";

const DEFAULT_BACKEND_API_URL = "http://127.0.0.1:5080";

type ForwardUpstreamOptions = {
  request: NextRequest;
  backendPath: string;
  serviceName: string;
  includeIdempotencyKey?: boolean;
};

function resolveBackendApiUrl() {
  const configured = process.env.SMARTPOS_BACKEND_API_URL?.trim();
  return (configured || DEFAULT_BACKEND_API_URL).replace(/\/+$/, "");
}

function isDefaultBackendUrlInProduction(backendApiUrl: string) {
  return process.env.NODE_ENV === "production" && backendApiUrl === DEFAULT_BACKEND_API_URL;
}

function resolveIdempotencyKey(request: NextRequest) {
  return request.headers.get("Idempotency-Key")?.trim() || crypto.randomUUID();
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

function getUpstreamErrorMessage(bodyText: string, serviceName: string) {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("<")) {
    return `${serviceName} returned a non-JSON error response.`;
  }

  return trimmed.length > 240 ? `${trimmed.slice(0, 237)}...` : trimmed;
}

export async function forwardUpstreamRequest(options: ForwardUpstreamOptions) {
  const backendApiUrl = resolveBackendApiUrl();
  const backendUrl = `${backendApiUrl}${options.backendPath}`;
  const method = options.request.method.toUpperCase();
  const shouldIncludeIdempotencyKey = options.includeIdempotencyKey ?? method !== "GET";

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

    const incomingContentType = options.request.headers.get("content-type");
    if (incomingContentType) {
      headers.set("content-type", incomingContentType);
    }

    const passthroughHeaders = [
      "accept",
      "x-pos-version",
      "x-license-token",
    ];
    for (const key of passthroughHeaders) {
      const value = options.request.headers.get(key);
      if (value) {
        headers.set(key, value);
      }
    }

    if (shouldIncludeIdempotencyKey) {
      headers.set("Idempotency-Key", resolveIdempotencyKey(options.request));
    }

    const body = method === "GET" || method === "HEAD" ? null : await options.request.arrayBuffer();

    const backendResponse = await fetch(backendUrl, {
      method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
    });

    const contentType = backendResponse.headers.get("content-type") || "application/json";
    const setCookie = backendResponse.headers.get("set-cookie");
    const contentDisposition = backendResponse.headers.get("content-disposition");

    if (backendResponse.ok && contentType.toLowerCase().includes("text/event-stream")) {
      const responseHeaders = new Headers();
      responseHeaders.set("Content-Type", contentType);
      responseHeaders.set("Cache-Control", "no-cache");
      responseHeaders.set("X-Accel-Buffering", "no");
      if (setCookie) {
        responseHeaders.set("Set-Cookie", setCookie);
      }

      if (contentDisposition) {
        responseHeaders.set("Content-Disposition", contentDisposition);
      }

      return new NextResponse(backendResponse.body, {
        status: backendResponse.status,
        headers: responseHeaders,
      });
    }

    const bodyText = await backendResponse.text();

    if (!bodyText.trim()) {
      if (backendResponse.ok) {
        return toErrorResponse(
          502,
          "UPSTREAM_EMPTY_RESPONSE",
          `${options.serviceName} returned an empty response.`,
        );
      }

      if (backendResponse.status === 401) {
        return toErrorResponse(
          401,
          "UPSTREAM_UNAUTHORIZED",
          `${options.serviceName} rejected authentication. Please sign in again.`,
        );
      }

      if (backendResponse.status === 403) {
        return toErrorResponse(
          403,
          "UPSTREAM_FORBIDDEN",
          `${options.serviceName} denied access. Your account may not have the required permissions.`,
        );
      }

      return toErrorResponse(
        backendResponse.status,
        "UPSTREAM_EMPTY_RESPONSE",
        `${options.serviceName} returned an empty error response.`,
      );
    }

    if (!backendResponse.ok && !contentType.toLowerCase().includes("application/json")) {
      const errorMessage = getUpstreamErrorMessage(bodyText, options.serviceName) || `${options.serviceName} request failed.`;
      return toErrorResponse(backendResponse.status, "UPSTREAM_ERROR", errorMessage);
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", contentType);
    if (setCookie) {
      responseHeaders.set("Set-Cookie", setCookie);
    }

    if (contentDisposition) {
      responseHeaders.set("Content-Disposition", contentDisposition);
    }

    return new NextResponse(bodyText, {
      status: backendResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(`${options.serviceName} proxy upstream request failed.`, {
      backendUrl,
      method,
      error: error instanceof Error ? error.message : String(error),
    });

    const configHint = isDefaultBackendUrlInProduction(backendApiUrl)
      ? " Set SMARTPOS_BACKEND_API_URL on the website service."
      : "";
    return toErrorResponse(
      502,
      "UPSTREAM_UNREACHABLE",
      `Unable to reach ${options.serviceName}.${configHint}`,
    );
  }
}
