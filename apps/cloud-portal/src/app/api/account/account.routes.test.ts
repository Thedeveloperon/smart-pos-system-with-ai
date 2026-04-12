import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as loginPost } from "@/app/api/account/login/route";
import { GET as meGet } from "@/app/api/account/me/route";
import { POST as logoutPost } from "@/app/api/account/logout/route";
import { GET as licensePortalGet } from "@/app/api/account/license-portal/route";
import { POST as deactivateDevicePost } from "@/app/api/account/license-portal/devices/[deviceCode]/deactivate/route";
import { GET as aiWalletGet } from "@/app/api/account/ai/wallet/route";
import { GET as aiCreditPacksGet } from "@/app/api/account/ai/credit-packs/route";
import { GET as aiLedgerGet } from "@/app/api/account/ai/ledger/route";
import { GET as aiPaymentsGet } from "@/app/api/account/ai/payments/route";
import { GET as aiPendingManualPaymentsGet } from "@/app/api/account/ai/payments/pending-manual/route";
import { POST as aiCheckoutPost } from "@/app/api/account/ai/payments/checkout/route";
import { POST as aiVerifyManualPaymentPost } from "@/app/api/account/ai/payments/verify/route";

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

function readHeaders(init?: RequestInit) {
  return new Headers((init?.headers ?? {}) as HeadersInit);
}

describe("Account API proxy routes", () => {
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

  it("login route returns 400 for invalid JSON", async () => {
    const request = new NextRequest("http://localhost/api/account/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{invalid-json",
    });

    const response = await loginPost(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Request body must be valid JSON.",
      },
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("login route forwards payload to backend and propagates auth cookie", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse(
        {
          username: "owner",
          role: "owner",
        },
        {
          headers: {
            "set-cookie": "smartpos_auth=test-token; Path=/; HttpOnly",
          },
        },
      ),
    );

    const request = new NextRequest("http://localhost/api/account/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        username: "owner",
        password: "owner123",
        device_code: "MKTWEB-TEST",
      }),
    });

    const response = await loginPost(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      username: "owner",
      role: "owner",
    });
    expect(response.headers.get("set-cookie")).toContain("smartpos_auth=test-token");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://backend.test/api/auth/login");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({
        username: "owner",
        password: "owner123",
        device_code: "MKTWEB-TEST",
      }),
    );

    const headers = readHeaders(init);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("Idempotency-Key")).toBeNull();
  });

  it("login route falls back to legacy /api/account/login when /api/auth/login is unavailable", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        jsonResponse(
          {
            detail: "Not Found",
          },
          { status: 404 },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            username: "owner",
            role: "owner",
          },
          {
            headers: {
              "set-cookie": "smartpos_auth=test-token; Path=/; HttpOnly",
            },
          },
        ),
      );

    const request = new NextRequest("http://localhost/api/account/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        username: "owner",
        password: "owner123",
        device_code: "MKTWEB-TEST",
      }),
    });

    const response = await loginPost(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      username: "owner",
      role: "owner",
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const [firstUrl, firstInit] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    expect(firstUrl).toBe("http://backend.test/api/auth/login");
    expect(firstInit.method).toBe("POST");
    expect(firstInit.body).toBe(
      JSON.stringify({
        username: "owner",
        password: "owner123",
        device_code: "MKTWEB-TEST",
      }),
    );

    const [secondUrl, secondInit] = vi.mocked(global.fetch).mock.calls[1] as [string, RequestInit];
    expect(secondUrl).toBe("http://backend.test/api/account/login");
    expect(secondInit.method).toBe("POST");
    expect(secondInit.body).toBe(
      JSON.stringify({
        username: "owner",
        password: "owner123",
        device_code: "MKTWEB-TEST",
      }),
    );

    const secondHeaders = readHeaders(secondInit);
    expect(secondHeaders.get("content-type")).toBe("application/json");
    expect(secondHeaders.get("Idempotency-Key")).toBeNull();
  });

  it("session route forwards cookie to backend /api/auth/me", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        username: "manager",
        role: "manager",
        device_code: "MKTWEB-TEST",
      }),
    );

    const request = new NextRequest("http://localhost/api/account/me", {
      method: "GET",
      headers: {
        cookie: "smartpos_auth=session-token",
      },
    });

    const response = await meGet(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      username: "manager",
      role: "manager",
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://backend.test/api/auth/me");
    expect(init.method).toBe("GET");

    const headers = readHeaders(init);
    expect(headers.get("cookie")).toContain("smartpos_auth=session-token");
    expect(headers.get("Idempotency-Key")).toBeNull();
  });

  it("logout route forwards request to backend /api/auth/logout without idempotency header", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse(
        {
          message: "Logged out.",
        },
        {
          headers: {
            "set-cookie": "smartpos_auth=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/",
          },
        },
      ),
    );

    const request = new NextRequest("http://localhost/api/account/logout", {
      method: "POST",
      headers: {
        cookie: "smartpos_auth=session-token",
      },
    });

    const response = await logoutPost(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Logged out.",
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://backend.test/api/auth/logout");
    expect(init.method).toBe("POST");

    const headers = readHeaders(init);
    expect(headers.get("cookie")).toContain("smartpos_auth=session-token");
    expect(headers.get("Idempotency-Key")).toBeNull();
  });

  it("license-portal route forwards authenticated GET request", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        shop_code: "default",
        devices: [],
      }),
    );

    const request = new NextRequest("http://localhost/api/account/license-portal", {
      method: "GET",
      headers: {
        cookie: "smartpos_auth=session-token",
      },
    });

    const response = await licensePortalGet(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      shop_code: "default",
      devices: [],
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://backend.test/api/license/account/licenses");
    expect(init.method).toBe("GET");

    const headers = readHeaders(init);
    expect(headers.get("cookie")).toContain("smartpos_auth=session-token");
  });

  it("license-portal route propagates upstream forbidden response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: "FORBIDDEN",
            message: "Requires manager or owner role.",
          },
        },
        { status: 403 },
      ),
    );

    const request = new NextRequest("http://localhost/api/account/license-portal", {
      method: "GET",
      headers: {
        cookie: "smartpos_auth=session-token",
      },
    });

    const response = await licensePortalGet(request);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Requires manager or owner role.",
      },
    });
  });

  it("ai wallet and credit pack routes forward authenticated GET requests", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          available_credits: 420,
          updated_at: "2026-04-07T12:00:00Z",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              pack_code: "pack_100",
              credits: 100,
              price: 5,
              currency: "USD",
            },
          ],
        }),
      );

    const walletRequest = new NextRequest("http://localhost/api/account/ai/wallet", {
      method: "GET",
      headers: {
        cookie: "smartpos_auth=session-token",
      },
    });
    const walletResponse = await aiWalletGet(walletRequest);
    expect(walletResponse.status).toBe(200);

    const packsRequest = new NextRequest("http://localhost/api/account/ai/credit-packs", {
      method: "GET",
      headers: {
        cookie: "smartpos_auth=session-token",
      },
    });
    const packsResponse = await aiCreditPacksGet(packsRequest);
    expect(packsResponse.status).toBe(200);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const [walletUrl, walletInit] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    expect(walletUrl).toBe("http://backend.test/api/ai/wallet");
    expect(walletInit.method).toBe("GET");
    expect(readHeaders(walletInit).get("cookie")).toContain("smartpos_auth=session-token");
    expect(readHeaders(walletInit).get("Idempotency-Key")).toBeNull();

    const [packsUrl, packsInit] = vi.mocked(global.fetch).mock.calls[1] as [string, RequestInit];
    expect(packsUrl).toBe("http://backend.test/api/ai/credit-packs");
    expect(packsInit.method).toBe("GET");
    expect(readHeaders(packsInit).get("cookie")).toContain("smartpos_auth=session-token");
    expect(readHeaders(packsInit).get("Idempotency-Key")).toBeNull();
  });

  it("ai payments route normalizes take query and forwards authenticated GET request", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        items: [],
      }),
    );

    const request = new NextRequest("http://localhost/api/account/ai/payments?take=999", {
      method: "GET",
      headers: {
        cookie: "smartpos_auth=session-token",
      },
    });

    const response = await aiPaymentsGet(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [] });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://backend.test/api/ai/payments?take=100");
    expect(init.method).toBe("GET");
    expect(readHeaders(init).get("cookie")).toContain("smartpos_auth=session-token");
  });

  it("ai ledger route normalizes take query and forwards authenticated GET request", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        items: [],
      }),
    );

    const request = new NextRequest("http://localhost/api/account/ai/ledger?take=999", {
      method: "GET",
      headers: {
        cookie: "smartpos_auth=session-token",
      },
    });

    const response = await aiLedgerGet(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [] });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://backend.test/api/ai/ledger?take=200");
    expect(init.method).toBe("GET");
    expect(readHeaders(init).get("cookie")).toContain("smartpos_auth=session-token");
    expect(readHeaders(init).get("Idempotency-Key")).toBeNull();
  });

  it("ai pending manual payments route normalizes take query and forwards authenticated GET request", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        items: [],
      }),
    );

    const request = new NextRequest("http://localhost/api/account/ai/payments/pending-manual?take=999", {
      method: "GET",
      headers: {
        cookie: "smartpos_auth=session-token",
      },
    });

    const response = await aiPendingManualPaymentsGet(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [] });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://backend.test/api/ai/payments/pending-manual?take=200");
    expect(init.method).toBe("GET");
    expect(readHeaders(init).get("cookie")).toContain("smartpos_auth=session-token");
    expect(readHeaders(init).get("Idempotency-Key")).toBeNull();
  });

  it("ai payments verify route validates JSON and forwards with idempotency key", async () => {
    const invalidJsonRequest = new NextRequest("http://localhost/api/account/ai/payments/verify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{invalid-json",
    });

    const invalidJsonResponse = await aiVerifyManualPaymentPost(invalidJsonRequest);
    expect(invalidJsonResponse.status).toBe(400);
    await expect(invalidJsonResponse.json()).resolves.toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Request body must be valid JSON.",
      },
    });

    const invalidPayloadRequest = new NextRequest("http://localhost/api/account/ai/payments/verify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const invalidPayloadResponse = await aiVerifyManualPaymentPost(invalidPayloadRequest);
    expect(invalidPayloadResponse.status).toBe(400);
    await expect(invalidPayloadResponse.json()).resolves.toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Either payment_id or external_reference is required.",
      },
    });

    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        payment_status: "succeeded",
      }),
    );

    const request = new NextRequest("http://localhost/api/account/ai/payments/verify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "smartpos_auth=session-token",
      },
      body: JSON.stringify({
        payment_id: "11111111-1111-1111-1111-111111111111",
      }),
    });

    const response = await aiVerifyManualPaymentPost(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      payment_status: "succeeded",
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://backend.test/api/ai/payments/verify");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({
        payment_id: "11111111-1111-1111-1111-111111111111",
      }),
    );

    const headers = readHeaders(init);
    expect(headers.get("cookie")).toContain("smartpos_auth=session-token");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("Idempotency-Key")).toBeTruthy();
  });

  it("ai checkout route validates JSON and forwards with idempotency key", async () => {
    const invalidRequest = new NextRequest("http://localhost/api/account/ai/payments/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{invalid-json",
    });

    const invalidResponse = await aiCheckoutPost(invalidRequest);
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Request body must be valid JSON.",
      },
    });

    const missingPackRequest = new NextRequest("http://localhost/api/account/ai/payments/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        payment_method: "card",
      }),
    });
    const missingPackResponse = await aiCheckoutPost(missingPackRequest);
    expect(missingPackResponse.status).toBe(400);
    await expect(missingPackResponse.json()).resolves.toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "pack_code is required.",
      },
    });

    const invalidMethodRequest = new NextRequest("http://localhost/api/account/ai/payments/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        pack_code: "pack_100",
        payment_method: "wire",
      }),
    });
    const invalidMethodResponse = await aiCheckoutPost(invalidMethodRequest);
    expect(invalidMethodResponse.status).toBe(400);
    await expect(invalidMethodResponse.json()).resolves.toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "payment_method must be one of: card, cash, bank_deposit.",
      },
    });

    const missingCashReferenceRequest = new NextRequest("http://localhost/api/account/ai/payments/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        pack_code: "pack_100",
        payment_method: "cash",
      }),
    });
    const missingCashReferenceResponse = await aiCheckoutPost(missingCashReferenceRequest);
    expect(missingCashReferenceResponse.status).toBe(400);
    await expect(missingCashReferenceResponse.json()).resolves.toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "bank_reference is required for cash payments.",
      },
    });

    const missingBankDepositReferenceRequest = new NextRequest("http://localhost/api/account/ai/payments/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        pack_code: "pack_100",
        payment_method: "bank_deposit",
      }),
    });
    const missingBankDepositReferenceResponse = await aiCheckoutPost(missingBankDepositReferenceRequest);
    expect(missingBankDepositReferenceResponse.status).toBe(400);
    await expect(missingBankDepositReferenceResponse.json()).resolves.toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "bank_reference is required for bank_deposit payments.",
      },
    });

    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        payment_id: "11111111-1111-1111-1111-111111111111",
        payment_status: "pending",
        payment_method: "card",
      }),
    );

    const request = new NextRequest("http://localhost/api/account/ai/payments/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "smartpos_auth=session-token",
      },
      body: JSON.stringify({
        pack_code: "pack_100",
        payment_method: "card",
      }),
    });

    const response = await aiCheckoutPost(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      payment_status: "pending",
      payment_method: "card",
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://backend.test/api/ai/payments/checkout");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({
        pack_code: "pack_100",
        payment_method: "card",
      }),
    );

    const headers = readHeaders(init);
    expect(headers.get("cookie")).toContain("smartpos_auth=session-token");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("Idempotency-Key")).toBeTruthy();
  });

  it("device-deactivate route validates params and forwards with idempotency key", async () => {
    const invalidRequest = new NextRequest("http://localhost/api/account/license-portal/devices//deactivate", {
      method: "POST",
      body: JSON.stringify({ reason: "customer_self_service" }),
      headers: {
        "content-type": "application/json",
      },
    });

    const invalidResponse = await deactivateDevicePost(invalidRequest, {
      params: {
        deviceCode: "   ",
      },
    });
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "deviceCode is required.",
      },
    });

    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        status: "revoked",
      }),
    );

    const request = new NextRequest("http://localhost/api/account/license-portal/devices/DEV-001/deactivate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "smartpos_auth=session-token",
      },
      body: JSON.stringify({
        reason: "customer_self_service",
      }),
    });

    const response = await deactivateDevicePost(request, {
      params: {
        deviceCode: "DEV-001",
      },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "revoked",
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://backend.test/api/license/account/licenses/devices/DEV-001/deactivate");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ reason: "customer_self_service" }));

    const headers = readHeaders(init);
    expect(headers.get("cookie")).toContain("smartpos_auth=session-token");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("Idempotency-Key")).toBeTruthy();
  });
});
