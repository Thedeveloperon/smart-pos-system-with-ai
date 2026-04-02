import { beforeEach, describe, expect, it, vi } from "vitest";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

const activeLicenseStatusPayload = {
  state: "active",
  device_code: "device-a",
  blocked_actions: [],
  server_time: "2026-04-02T09:30:00.000Z",
  valid_until: "2026-04-02T09:45:00.000Z",
  grace_until: "2026-04-09T09:45:00.000Z",
  license_token: "fresh-token",
};

describe("license token replay recovery", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("refreshes token and retries mutation once when replay is detected", async () => {
    window.localStorage.setItem("smartpos-device-code", "device-a");
    window.localStorage.setItem("smartpos-license-token", "stale-token");

    let firstRequestIdempotencyKey = "";
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers ?? {});
        expect(headers.get("X-License-Token")).toBe("stale-token");
        expect(headers.get("X-Device-Code")).toBe("device-a");
        firstRequestIdempotencyKey = headers.get("Idempotency-Key") || "";
        expect(firstRequestIdempotencyKey).not.toBe("");
        return jsonResponse(
          {
            error: {
              code: "TOKEN_REPLAY_DETECTED",
              message: "license_token jti was rotated or revoked.",
            },
          },
          403
        );
      })
      .mockImplementationOnce(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers ?? {});
        // Token was cleared before recovery refresh call.
        expect(headers.get("X-License-Token")).toBeNull();
        return jsonResponse(activeLicenseStatusPayload);
      })
      .mockImplementationOnce(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers ?? {});
        expect(headers.get("X-License-Token")).toBe("fresh-token");
        expect(headers.get("Idempotency-Key")).toBe(firstRequestIdempotencyKey);
        return jsonResponse({
          cash_session_id: "cs-1",
          device_code: "device-a",
          cashier_name: "cashier",
          status: "active",
          opened_at: "2026-04-02T09:30:00.000Z",
          opening: {
            counts: [{ denomination: 100, quantity: 1 }],
            total: 100,
            submitted_by: "cashier",
            submitted_at: "2026-04-02T09:30:00.000Z",
          },
          cash_sales_total: 0,
          audit_log: [],
        });
      });

    vi.stubGlobal("fetch", fetchMock);

    const { openCashSession } = await import("@/lib/api");
    const session = await openCashSession([{ denomination: 100, quantity: 1 }], 100);
    expect(session.id).toBe("cs-1");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries license status fetch when replay is detected", async () => {
    window.localStorage.setItem("smartpos-device-code", "device-a");
    window.localStorage.setItem("smartpos-license-token", "stale-token");

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers ?? {});
        expect(headers.get("X-License-Token")).not.toBeNull();
        return jsonResponse(
          {
            error: {
              code: "TOKEN_REPLAY_DETECTED",
              message: "license_token jti was rotated or revoked.",
            },
          },
          403
        );
      })
      .mockImplementationOnce(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers ?? {});
        expect(headers.get("X-License-Token")).toBeNull();
        return jsonResponse(activeLicenseStatusPayload);
      });

    vi.stubGlobal("fetch", fetchMock);

    const { fetchLicenseStatus } = await import("@/lib/api");
    const status = await fetchLicenseStatus();
    expect(status.state).toBe("active");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
