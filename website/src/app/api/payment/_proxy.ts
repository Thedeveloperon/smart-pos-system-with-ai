import { NextRequest, NextResponse } from "next/server";

const DEFAULT_BACKEND_API_URL = "http://127.0.0.1:5080";

type ForwardPaymentOptions = {
  request: NextRequest;
  backendPath: string;
  body?: BodyInit | null;
  contentType?: string;
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
    return "Payment service returned a non-JSON error response.";
  }

  return trimmed.length > 240 ? `${trimmed.slice(0, 237)}...` : trimmed;
}

export async function forwardPaymentRequest(options: ForwardPaymentOptions) {
  const backendApiUrl = resolveBackendApiUrl();
  const backendUrl = `${backendApiUrl}${options.backendPath}`;

  try {
    const headers: Record<string, string> = {
      "Idempotency-Key": resolveIdempotencyKey(options.request),
    };
    if (options.contentType) {
      headers["Content-Type"] = options.contentType;
    }

    const backendResponse = await fetch(backendUrl, {
      method: "POST",
      headers,
      body: options.body ?? null,
      cache: "no-store",
    });

    const contentType = backendResponse.headers.get("content-type") || "application/json";
    const bodyText = await backendResponse.text();

    if (!bodyText.trim()) {
      if (backendResponse.ok) {
        return toErrorResponse(
          502,
          "UPSTREAM_EMPTY_RESPONSE",
          "Payment service returned an empty response.",
        );
      }

      return toErrorResponse(
        backendResponse.status,
        "UPSTREAM_EMPTY_RESPONSE",
        "Payment service returned an empty error response.",
      );
    }

    if (!backendResponse.ok && !contentType.toLowerCase().includes("application/json")) {
      const errorMessage = getUpstreamErrorMessage(bodyText) || "Payment service request failed.";
      return toErrorResponse(backendResponse.status, "UPSTREAM_ERROR", errorMessage);
    }

    return new NextResponse(bodyText, {
      status: backendResponse.status,
      headers: {
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    console.error("Payment proxy upstream request failed.", {
      backendUrl,
      error: error instanceof Error ? error.message : String(error),
    });

    const configHint = isDefaultBackendUrlInProduction(backendApiUrl)
      ? " Set SMARTPOS_BACKEND_API_URL on the website service."
      : "";
    return toErrorResponse(
      502,
      "UPSTREAM_UNREACHABLE",
      `Unable to reach payment service.${configHint}`,
    );
  }
}
