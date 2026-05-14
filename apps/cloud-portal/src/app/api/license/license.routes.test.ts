import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as downloadTrackPost } from "@/app/api/license/download-track/route";

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
}

describe("License API proxy routes", () => {
  const originalBackendApiUrl = process.env.SMARTPOS_BACKEND_API_URL;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.SMARTPOS_BACKEND_API_URL = "http://backend.test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (typeof originalBackendApiUrl === "string") {
      process.env.SMARTPOS_BACKEND_API_URL = originalBackendApiUrl;
      return;
    }

    delete process.env.SMARTPOS_BACKEND_API_URL;
  });

  it("download-track route returns 400 for invalid JSON", async () => {
    const request = new NextRequest("http://localhost/api/license/download-track", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{invalid-json",
    });

    const response = await downloadTrackPost(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Request body must be valid JSON.",
      },
    });
  });

  it("download-track route forwards payload to backend", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        tracked_at: "2026-04-07T00:00:00Z",
        source: "marketing_account_page",
        channel: "activation_key_copy",
      }),
    );

    const request = new NextRequest("http://localhost/api/license/download-track", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        activation_entitlement_key: "SPK-TEST-KEY-123456",
        source: "marketing_account_page",
        channel: "activation_key_copy",
      }),
    });

    const response = await downloadTrackPost(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      source: "marketing_account_page",
      channel: "activation_key_copy",
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://backend.test/api/license/public/download-track");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({
        activation_entitlement_key: "SPK-TEST-KEY-123456",
        source: "marketing_account_page",
        channel: "activation_key_copy",
      }),
    );

    const headers = new Headers((init.headers ?? {}) as HeadersInit);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("idempotency-key")).toBeTruthy();
  });
});
