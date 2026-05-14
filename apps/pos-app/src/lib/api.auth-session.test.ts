import { beforeEach, describe, expect, it, vi } from "vitest";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("auth session invalidation handling", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("dispatches an auth invalidation event when a protected request returns 401", async () => {
    window.localStorage.setItem("smartpos-device-code", "device-a");

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "AUTH_SESSION_UPGRADE_REQUIRED",
            message: "Cloud commerce session expired. Please sign in again.",
          },
        },
        401
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { AUTH_SESSION_INVALIDATED_EVENT, fetchCustomerLicensePortal } = await import("@/lib/api");
    const invalidationListener = vi.fn();
    window.addEventListener(AUTH_SESSION_INVALIDATED_EVENT, invalidationListener);

    await expect(fetchCustomerLicensePortal()).rejects.toMatchObject({
      status: 401,
      code: "AUTH_SESSION_UPGRADE_REQUIRED",
    });

    expect(invalidationListener).toHaveBeenCalledTimes(1);
    window.removeEventListener(AUTH_SESSION_INVALIDATED_EVENT, invalidationListener);
  });

  it("does not dispatch an auth invalidation event for AI relay re-link 401 responses", async () => {
    window.localStorage.setItem("smartpos-device-code", "device-a");

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "AI_CLOUD_RELAY_CONTEXT_RESOLUTION_FAILED",
            message: "Linked cloud account session expired. Re-link the cloud account and try again.",
          },
        },
        401
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { AUTH_SESSION_INVALIDATED_EVENT, fetchAiWallet } = await import("@/lib/api");
    const invalidationListener = vi.fn();
    window.addEventListener(AUTH_SESSION_INVALIDATED_EVENT, invalidationListener);

    await expect(fetchAiWallet()).rejects.toMatchObject({
      status: 401,
      code: "AI_CLOUD_RELAY_CONTEXT_RESOLUTION_FAILED",
    });

    expect(invalidationListener).not.toHaveBeenCalled();
    window.removeEventListener(AUTH_SESSION_INVALIDATED_EVENT, invalidationListener);
  });
});
