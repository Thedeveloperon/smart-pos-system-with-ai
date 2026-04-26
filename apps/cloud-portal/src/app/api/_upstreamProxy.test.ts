import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { forwardUpstreamRequest } from "./_upstreamProxy";

describe("forwardUpstreamRequest", () => {
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

  it("passes through streamed SSE responses without buffering", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response('data: {"type":"delta","delta":"Hello"}\n\n', {
        status: 202,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "set-cookie": "smartpos_auth=test-token; Path=/; HttpOnly",
          "content-disposition": "inline",
        },
      }),
    );

    const request = new NextRequest("http://localhost/api/ai/chat/sessions/abc/messages/stream", {
      method: "POST",
      headers: {
        cookie: "smartpos_auth=portal-token",
        authorization: "Bearer portal-token",
        "content-type": "application/json",
        accept: "text/event-stream",
        "x-pos-version": "1.0.0",
      },
      body: JSON.stringify({
        message: "hello",
      }),
    });

    const response = await forwardUpstreamRequest({
      request,
      backendPath: "/api/ai/chat/sessions/abc/messages/stream",
      serviceName: "AI relay",
    });

    expect(response.status).toBe(202);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(response.headers.get("set-cookie")).toContain("smartpos_auth=test-token");
    expect(response.headers.get("content-disposition")).toBe("inline");
    await expect(response.text()).resolves.toContain('"delta":"Hello"');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://backend.test/api/ai/chat/sessions/abc/messages/stream");
    expect(init.method).toBe("POST");
  });
});
